using System.Text.Json;
using System.Xml.Linq;
using Admin.Api.Dtos;
using Microsoft.Extensions.Caching.Memory;

namespace Admin.Api.Services;

public sealed class PackageInventoryService
{
    private static readonly HashSet<string> ExcludedDirectories = new(StringComparer.OrdinalIgnoreCase)
    {
        ".git", ".angular", "bin", "obj", "node_modules", "dist", "artifacts"
    };

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly IHostEnvironment _environment;
    private readonly IMemoryCache _cache;

    public PackageInventoryService(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        IHostEnvironment environment,
        IMemoryCache cache)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _environment = environment;
        _cache = cache;
    }

    public async Task<PackageInventoryDto> GetAsync(bool refresh, CancellationToken cancellationToken)
    {
        const string cacheKey = "package-inventory";
        if (!refresh && _cache.TryGetValue(cacheKey, out PackageInventoryDto? cached) && cached is not null)
            return cached;

        var workspaceRoot = ResolveWorkspaceRoot();
        if (workspaceRoot is null)
            return new PackageInventoryDto(DateTimeOffset.UtcNow, false, []);

        var producers = DiscoverProducers(workspaceRoot);
        var consumers = DiscoverConsumers(workspaceRoot, producers.Keys);
        var packages = new List<PackageInventoryItemDto>();

        foreach (var producer in producers.Values.OrderBy(x => x.Ecosystem).ThenBy(x => x.Name))
        {
            var publishedVersion = await GetPublishedVersionAsync(producer, cancellationToken);
            var packageConsumers = consumers
                .Where(x => x.Ecosystem == producer.Ecosystem && x.Name.Equals(producer.Name, StringComparison.OrdinalIgnoreCase))
                .Select(x => new PackageConsumerDto(x.Project, x.Version, VersionMatches(x.Version, producer.Version)))
                .OrderBy(x => x.Project)
                .ToArray();

            var status = packageConsumers.Any(x => !x.IsCurrent)
                ? "upgrade-required"
                : publishedVersion is null || !VersionMatches(publishedVersion, producer.Version)
                    ? "publish-required"
                    : "current";

            packages.Add(new PackageInventoryItemDto(
                producer.Ecosystem,
                producer.Name,
                producer.Version,
                publishedVersion,
                producer.Repository,
                status,
                packageConsumers));
        }

        var result = new PackageInventoryDto(DateTimeOffset.UtcNow, true, packages);
        _cache.Set(cacheKey, result, TimeSpan.FromMinutes(15));
        return result;
    }

    private string? ResolveWorkspaceRoot()
    {
        var configured = _configuration["PackageInventory:WorkspaceRoot"];
        if (!string.IsNullOrWhiteSpace(configured) && Directory.Exists(configured))
            return Path.GetFullPath(configured);

        var directory = new DirectoryInfo(_environment.ContentRootPath);
        while (directory is not null)
        {
            if (Directory.Exists(Path.Combine(directory.FullName, "admin")) &&
                Directory.Exists(Path.Combine(directory.FullName, "shared-security")))
                return directory.FullName;
            directory = directory.Parent;
        }

        return null;
    }

    private static Dictionary<string, Producer> DiscoverProducers(string root)
    {
        var producers = new Dictionary<string, Producer>(StringComparer.OrdinalIgnoreCase);
        foreach (var file in EnumerateFiles(root, "*.csproj"))
        {
            try
            {
                var document = XDocument.Load(file);
                var packageId = document.Descendants("PackageId").Select(x => x.Value.Trim()).FirstOrDefault();
                var version = document.Descendants("Version").Select(x => x.Value.Trim()).FirstOrDefault();
                if (!string.IsNullOrWhiteSpace(packageId) && packageId.StartsWith("KeshavSingh.", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(version))
                    producers[$"nuget:{packageId}"] = new Producer("nuget", packageId, version, RepositoryName(root, file));
            }
            catch (Exception) when (File.Exists(file)) { }
        }

        foreach (var file in EnumerateFiles(root, "package.json"))
        {
            try
            {
                using var document = JsonDocument.Parse(File.ReadAllText(file));
                var json = document.RootElement;
                if (!json.TryGetProperty("name", out var nameElement) || !json.TryGetProperty("version", out var versionElement))
                    continue;
                var name = nameElement.GetString();
                var version = versionElement.GetString();
                if (name?.StartsWith("@keshavsingh3197/", StringComparison.OrdinalIgnoreCase) == true && !string.IsNullOrWhiteSpace(version))
                    producers[$"npm:{name}"] = new Producer("npm", name, version, RepositoryName(root, file));
            }
            catch (JsonException) { }
        }

        return producers;
    }

    private static List<Consumer> DiscoverConsumers(string root, IEnumerable<string> producerKeys)
    {
        var known = producerKeys.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var consumers = new List<Consumer>();
        foreach (var file in EnumerateFiles(root, "*.csproj"))
        {
            try
            {
                var document = XDocument.Load(file);
                foreach (var reference in document.Descendants("PackageReference"))
                {
                    var name = reference.Attribute("Include")?.Value;
                    var version = reference.Attribute("Version")?.Value ?? reference.Element("Version")?.Value;
                    if (name is not null && version is not null && known.Contains($"nuget:{name}"))
                        consumers.Add(new Consumer("nuget", name, version, ProjectName(root, file)));
                }
            }
            catch (Exception) when (File.Exists(file)) { }
        }

        foreach (var file in EnumerateFiles(root, "package.json"))
        {
            try
            {
                using var document = JsonDocument.Parse(File.ReadAllText(file));
                foreach (var sectionName in new[] { "dependencies", "devDependencies", "peerDependencies" })
                {
                    if (!document.RootElement.TryGetProperty(sectionName, out var section)) continue;
                    foreach (var dependency in section.EnumerateObject())
                        if (known.Contains($"npm:{dependency.Name}"))
                            consumers.Add(new Consumer("npm", dependency.Name, dependency.Value.GetString() ?? string.Empty, ProjectName(root, file)));
                }
            }
            catch (JsonException) { }
        }

        return consumers;
    }

    private async Task<string?> GetPublishedVersionAsync(Producer producer, CancellationToken cancellationToken)
    {
        var owner = _configuration["PackageInventory:GitHubOwner"] ?? "keshavsingh3197";
        var packageName = producer.Name;
        var url = $"https://api.github.com/users/{Uri.EscapeDataString(owner)}/packages/{producer.Ecosystem}/{Uri.EscapeDataString(packageName)}/versions?per_page=100";
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.UserAgent.ParseAdd("KeshavSingh-Admin-PackageInventory/1.0");
        request.Headers.Accept.ParseAdd("application/vnd.github+json");
        var token = _configuration["PackageInventory:GitHubToken"] ?? _configuration["PACKAGES_READ_TOKEN"];
        if (!string.IsNullOrWhiteSpace(token))
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

        try
        {
            using var response = await _httpClientFactory.CreateClient().SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode) return null;
            using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
            return document.RootElement.EnumerateArray()
                .Select(x => x.TryGetProperty("name", out var name) ? name.GetString() : null)
                .FirstOrDefault(x => !string.IsNullOrWhiteSpace(x) && !x.Contains('-', StringComparison.Ordinal));
        }
        catch (HttpRequestException) { return null; }
        catch (JsonException) { return null; }
    }

    private static IEnumerable<string> EnumerateFiles(string root, string pattern)
    {
        var pending = new Stack<string>();
        pending.Push(root);
        while (pending.TryPop(out var directory))
        {
            IEnumerable<string> files;
            IEnumerable<string> directories;
            try
            {
                files = Directory.EnumerateFiles(directory, pattern, SearchOption.TopDirectoryOnly);
                directories = Directory.EnumerateDirectories(directory, "*", SearchOption.TopDirectoryOnly);
            }
            catch (UnauthorizedAccessException) { continue; }
            foreach (var file in files) yield return file;
            foreach (var child in directories)
                if (!ExcludedDirectories.Contains(Path.GetFileName(child))) pending.Push(child);
        }
    }

    private static bool VersionMatches(string constraint, string version) =>
        constraint.Trim().TrimStart('^', '~', '=', 'v').Equals(version.Trim().TrimStart('v'), StringComparison.OrdinalIgnoreCase);

    private static string RepositoryName(string root, string file) =>
        Path.GetRelativePath(root, file).Split(Path.DirectorySeparatorChar)[0];

    private static string ProjectName(string root, string file)
    {
        var relative = Path.GetRelativePath(root, file);
        return relative.EndsWith("package.json", StringComparison.OrdinalIgnoreCase)
            ? Path.GetDirectoryName(relative)?.Replace('\\', '/') ?? relative
            : relative.Replace('\\', '/');
    }

    private sealed record Producer(string Ecosystem, string Name, string Version, string Repository);
    private sealed record Consumer(string Ecosystem, string Name, string Version, string Project);
}