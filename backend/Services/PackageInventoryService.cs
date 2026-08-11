using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Xml.Linq;
using Admin.Api.Dtos;
using Microsoft.Extensions.Caching.Memory;

namespace Admin.Api.Services;

/// <summary>
/// Scans every workspace repo's .csproj/package.json for `KeshavSingh.*`/`@keshavsingh3197/*` packages
/// (producers) and who references them (consumers), then cross-checks each against the version actually
/// published on GitHub Packages.
///
/// GitHub-only by design (no local-disk scanning): the production host never has a sibling-repo
/// checkout, so a "works on my machine, not on Render" path here is a bug waiting to happen. Discovery
/// uses the GitHub API exclusively — Git Trees (`recursive=1`) finds every manifest file in each repo,
/// then the Contents API fetches each one's body — driven by a token configured on the Settings screen
/// (or PackageInventory:GitHubToken / PACKAGES_READ_TOKEN as a fallback). Every failed call (bad token,
/// wrong repo/branch, rate limit) is recorded in <see cref="PackageInventoryDto.Diagnostics"/> instead of
/// being silently swallowed, so a misconfiguration shows up on the Packages screen instead of just an
/// empty list.
/// </summary>
public sealed class PackageInventoryService
{
    private static readonly HashSet<string> ExcludedDirectories = new(StringComparer.OrdinalIgnoreCase)
    {
        ".git", ".angular", "bin", "obj", "node_modules", "dist", "artifacts"
    };

    /// <summary>
    /// Repos scanned via the GitHub API, as "owner/repo" — NOT all the same owner (the portfolio lives
    /// under a separate GitHub org/user than the rest). Override with PackageInventory:Repositories
    /// (comma-separated "owner/repo" entries) if the workspace layout changes.
    /// </summary>
    private static readonly string[] DefaultRepositories =
    {
        "keshavsingh3197/admin",
        "keshavsingh3197/content-blog",
        "keshavsingh3197/ghar-ledger",
        "keshavsingh3197/shared-security",
        "keshavsingh3197/KeshavSingh-Packages-Nosql",
        "keshavsingh3197/KeshavSingh-Packages-Realtime",
        "keshavsingh3197/KeshavSingh-Packages-Core",
        "keshavsingh3197/KeshavSingh-Packages-Files",
        "keshavsingh3197/KeshavSingh-Packages-Finance",
        "keshavsingh3197/KeshavSingh-Packages-Localization",
        "keshavsingh3197/KeshavSingh-Packages-Web",
        "keshavsingh3197/KeshavSingh-Packages-WebUi",
        "open-for-everyone/Omkr.WebApp.Portfolio",
    };

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly IMemoryCache _cache;
    private readonly SettingsService _settings;

    public PackageInventoryService(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        IMemoryCache cache,
        SettingsService settings)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _cache = cache;
        _settings = settings;
    }

    public async Task<PackageInventoryDto> GetAsync(bool refresh, CancellationToken cancellationToken)
    {
        const string cacheKey = "package-inventory";
        if (!refresh && _cache.TryGetValue(cacheKey, out PackageInventoryDto? cached) && cached is not null)
            return cached;

        var token = ResolveGitHubToken();
        if (string.IsNullOrWhiteSpace(token))
        {
            return new PackageInventoryDto(DateTimeOffset.UtcNow, false, [],
                ["No GitHub token is configured — add one on Settings \u2192 Package inventory (GitHub), " +
                 "or set PackageInventory:GitHubToken / PACKAGES_READ_TOKEN."]);
        }

        var diagnostics = new List<string>();
        var (producers, consumers) = await DiscoverViaGitHubAsync(token, diagnostics, cancellationToken);
        var packages = new List<PackageInventoryItemDto>();

        foreach (var producer in producers.Values.OrderBy(x => x.Ecosystem).ThenBy(x => x.Name))
        {
            var publishedVersion = await GetPublishedVersionAsync(producer, token, diagnostics, cancellationToken);
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

        if (packages.Count == 0 && diagnostics.Count == 0)
            diagnostics.Add("No KeshavSingh.*/@keshavsingh3197/* manifests were found in any configured repo.");

        var result = new PackageInventoryDto(DateTimeOffset.UtcNow, true, packages, diagnostics);
        _cache.Set(cacheKey, result, TimeSpan.FromMinutes(15));
        return result;
    }

    /// <summary>Settings-screen token first (live, no redeploy needed), then appsettings/env fallbacks.</summary>
    private string? ResolveGitHubToken() =>
        _settings.GitHubPackagesToken is { Length: > 0 } fromSettings
            ? fromSettings
            : _configuration["PackageInventory:GitHubToken"] ?? _configuration["PACKAGES_READ_TOKEN"];

    private string[] ResolveRepositories()
    {
        var configured = _configuration.GetSection("PackageInventory:Repositories").Get<string[]>();
        return configured is { Length: > 0 } ? configured : DefaultRepositories;
    }

    /// <summary>
    /// Finds every producer/consumer manifest across all configured repos using the GitHub API only —
    /// no local checkout required, so this works the same in production as it does locally.
    /// </summary>
    private async Task<(Dictionary<string, Producer> Producers, List<Consumer> Consumers)> DiscoverViaGitHubAsync(
        string token, List<string> diagnostics, CancellationToken cancellationToken)
    {
        var producers = new Dictionary<string, Producer>(StringComparer.OrdinalIgnoreCase);
        var manifestBodies = new List<(string Repository, string Path, string Content)>();

        foreach (var repository in ResolveRepositories())
        {
            var parts = repository.Split('/', 2);
            if (parts.Length != 2) { diagnostics.Add($"{repository}: not a valid \"owner/repo\" entry."); continue; }
            var (owner, repo) = (parts[0], parts[1]);

            var defaultBranch = await GetDefaultBranchAsync(owner, repo, token, diagnostics, cancellationToken);
            if (defaultBranch is null) continue;

            var paths = await GetManifestPathsAsync(owner, repo, defaultBranch, token, diagnostics, cancellationToken);
            foreach (var path in paths)
            {
                var content = await GetFileContentAsync(owner, repo, path, defaultBranch, token, diagnostics, cancellationToken);
                if (content is not null) manifestBodies.Add((repository, path, content));
            }
        }

        foreach (var (repository, path, content) in manifestBodies.Where(x => x.Path.EndsWith(".csproj", StringComparison.OrdinalIgnoreCase)))
        {
            var producer = ParseCsprojProducer(content, repository);
            if (producer is not null) producers[$"nuget:{producer.Name}"] = producer;
        }
        foreach (var (repository, path, content) in manifestBodies.Where(x => x.Path.EndsWith("package.json", StringComparison.OrdinalIgnoreCase)))
        {
            var producer = ParsePackageJsonProducer(content, repository);
            if (producer is not null) producers[$"npm:{producer.Name}"] = producer;
        }

        var known = producers.Keys.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var consumers = new List<Consumer>();
        foreach (var (repository, path, content) in manifestBodies)
        {
            var projectName = path.EndsWith("package.json", StringComparison.OrdinalIgnoreCase)
                ? $"{repository}/{(Path.GetDirectoryName(path.Replace('\\', '/'))?.Replace('\\', '/') is { Length: > 0 } dir ? dir : ".")}"
                : $"{repository}/{path.Replace('\\', '/')}";
            consumers.AddRange(path.EndsWith(".csproj", StringComparison.OrdinalIgnoreCase)
                ? ParseCsprojConsumers(content, projectName, known)
                : ParsePackageJsonConsumers(content, projectName, known));
        }

        return (producers, consumers);
    }

    private async Task<string?> GetDefaultBranchAsync(string owner, string repo, string token, List<string> diagnostics, CancellationToken cancellationToken)
    {
        using var request = CreateGitHubRequest(HttpMethod.Get, $"https://api.github.com/repos/{owner}/{repo}", token);
        try
        {
            using var response = await _httpClientFactory.CreateClient().SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                diagnostics.Add($"{owner}/{repo}: could not read repo info ({DescribeStatus(response.StatusCode)}).");
                return null;
            }
            using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
            var branch = document.RootElement.TryGetProperty("default_branch", out var b) ? b.GetString() : null;
            if (branch is null) diagnostics.Add($"{owner}/{repo}: repo info had no default_branch.");
            return branch;
        }
        catch (HttpRequestException ex) { diagnostics.Add($"{owner}/{repo}: repo info request failed ({ex.Message})."); return null; }
        catch (JsonException) { diagnostics.Add($"{owner}/{repo}: repo info response was not valid JSON."); return null; }
    }

    private async Task<IReadOnlyList<string>> GetManifestPathsAsync(string owner, string repo, string branch, string token, List<string> diagnostics, CancellationToken cancellationToken)
    {
        using var request = CreateGitHubRequest(HttpMethod.Get,
            $"https://api.github.com/repos/{owner}/{repo}/git/trees/{Uri.EscapeDataString(branch)}?recursive=1", token);
        try
        {
            using var response = await _httpClientFactory.CreateClient().SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                diagnostics.Add($"{owner}/{repo}: could not list files ({DescribeStatus(response.StatusCode)}).");
                return [];
            }
            using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
            if (!document.RootElement.TryGetProperty("tree", out var tree)) return [];

            return tree.EnumerateArray()
                .Where(entry => entry.TryGetProperty("type", out var type) && type.GetString() == "blob")
                .Select(entry => entry.TryGetProperty("path", out var path) ? path.GetString() : null)
                .Where(path => path is not null &&
                    (path.EndsWith(".csproj", StringComparison.OrdinalIgnoreCase) || path.EndsWith("package.json", StringComparison.OrdinalIgnoreCase)) &&
                    !path.Split('/').Any(segment => ExcludedDirectories.Contains(segment)))
                .Select(path => path!)
                .ToArray();
        }
        catch (HttpRequestException ex) { diagnostics.Add($"{owner}/{repo}: file listing request failed ({ex.Message})."); return []; }
        catch (JsonException) { diagnostics.Add($"{owner}/{repo}: file listing response was not valid JSON."); return []; }
    }

    private async Task<string?> GetFileContentAsync(string owner, string repo, string path, string branch, string token, List<string> diagnostics, CancellationToken cancellationToken)
    {
        using var request = CreateGitHubRequest(HttpMethod.Get,
            $"https://api.github.com/repos/{owner}/{repo}/contents/{Uri.EscapeDataString(path).Replace("%2F", "/")}?ref={Uri.EscapeDataString(branch)}", token);
        try
        {
            using var response = await _httpClientFactory.CreateClient().SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                diagnostics.Add($"{owner}/{repo}/{path}: could not read file ({DescribeStatus(response.StatusCode)}).");
                return null;
            }
            using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
            if (!document.RootElement.TryGetProperty("content", out var contentElement)) return null;
            var base64 = contentElement.GetString()?.Replace("\n", string.Empty);
            return string.IsNullOrEmpty(base64) ? null : System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(base64));
        }
        catch (HttpRequestException ex) { diagnostics.Add($"{owner}/{repo}/{path}: file request failed ({ex.Message})."); return null; }
        catch (JsonException) { diagnostics.Add($"{owner}/{repo}/{path}: file response was not valid JSON."); return null; }
        catch (FormatException) { diagnostics.Add($"{owner}/{repo}/{path}: file content was not valid base64."); return null; }
    }

    /// <summary>A short, non-sensitive reason for a failed call — never echoes the token or response body.</summary>
    private static string DescribeStatus(HttpStatusCode status) => status switch
    {
        HttpStatusCode.Unauthorized => "401 Unauthorized — the GitHub token is missing/invalid",
        HttpStatusCode.Forbidden => "403 Forbidden — token lacks access, or the GitHub API rate limit was hit",
        HttpStatusCode.NotFound => "404 Not Found — wrong repo/branch/path, or the token can't see a private repo",
        _ => $"HTTP {(int)status}",
    };

    private static HttpRequestMessage CreateGitHubRequest(HttpMethod method, string url, string token)
    {
        var request = new HttpRequestMessage(method, url);
        request.Headers.UserAgent.ParseAdd("KeshavSingh-Admin-PackageInventory/1.0");
        request.Headers.Accept.ParseAdd("application/vnd.github+json");
        if (!string.IsNullOrWhiteSpace(token))
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return request;
    }

    private static Producer? ParseCsprojProducer(string content, string repository)
    {
        try
        {
            var document = XDocument.Parse(content);
            var packageId = document.Descendants("PackageId").Select(x => x.Value.Trim()).FirstOrDefault();
            var version = document.Descendants("Version").Select(x => x.Value.Trim()).FirstOrDefault();
            return !string.IsNullOrWhiteSpace(packageId) && packageId.StartsWith("KeshavSingh.", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(version)
                ? new Producer("nuget", packageId, version, repository)
                : null;
        }
        catch (Exception) { return null; }
    }

    private static Producer? ParsePackageJsonProducer(string content, string repository)
    {
        try
        {
            using var document = JsonDocument.Parse(content);
            var json = document.RootElement;
            if (!json.TryGetProperty("name", out var nameElement) || !json.TryGetProperty("version", out var versionElement))
                return null;
            var name = nameElement.GetString();
            var version = versionElement.GetString();
            return name?.StartsWith("@keshavsingh3197/", StringComparison.OrdinalIgnoreCase) == true && !string.IsNullOrWhiteSpace(version)
                ? new Producer("npm", name, version, repository)
                : null;
        }
        catch (JsonException) { return null; }
    }

    private static IEnumerable<Consumer> ParseCsprojConsumers(string content, string project, HashSet<string> known)
    {
        try
        {
            var document = XDocument.Parse(content);
            foreach (var reference in document.Descendants("PackageReference"))
            {
                var name = reference.Attribute("Include")?.Value;
                var version = reference.Attribute("Version")?.Value ?? reference.Element("Version")?.Value;
                if (name is not null && version is not null && known.Contains($"nuget:{name}"))
                    yield return new Consumer("nuget", name, version, project);
            }
        }
        finally { }
    }

    private static IEnumerable<Consumer> ParsePackageJsonConsumers(string content, string project, HashSet<string> known)
    {
        JsonDocument document;
        try { document = JsonDocument.Parse(content); }
        catch (JsonException) { yield break; }
        using (document)
        {
            foreach (var sectionName in new[] { "dependencies", "devDependencies", "peerDependencies" })
            {
                if (!document.RootElement.TryGetProperty(sectionName, out var section)) continue;
                foreach (var dependency in section.EnumerateObject())
                    if (known.Contains($"npm:{dependency.Name}"))
                        yield return new Consumer("npm", dependency.Name, dependency.Value.GetString() ?? string.Empty, project);
            }
        }
    }

    private async Task<string?> GetPublishedVersionAsync(Producer producer, string? token, List<string> diagnostics, CancellationToken cancellationToken)
    {
        var owner = _configuration["PackageInventory:GitHubOwner"] ?? "keshavsingh3197";
        var packageName = producer.Name;
        var url = $"https://api.github.com/users/{Uri.EscapeDataString(owner)}/packages/{producer.Ecosystem}/{Uri.EscapeDataString(packageName)}/versions?per_page=100";
        using var request = CreateGitHubRequest(HttpMethod.Get, url, token ?? string.Empty);

        try
        {
            using var response = await _httpClientFactory.CreateClient().SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                diagnostics.Add($"{packageName}: could not read published versions ({DescribeStatus(response.StatusCode)}).");
                return null;
            }
            using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
            return document.RootElement.EnumerateArray()
                .Select(x => x.TryGetProperty("name", out var name) ? name.GetString() : null)
                .FirstOrDefault(x => !string.IsNullOrWhiteSpace(x) && !x.Contains('-', StringComparison.Ordinal));
        }
        catch (HttpRequestException ex) { diagnostics.Add($"{packageName}: published-versions request failed ({ex.Message})."); return null; }
        catch (JsonException) { diagnostics.Add($"{packageName}: published-versions response was not valid JSON."); return null; }
    }

    private static bool VersionMatches(string constraint, string version) =>
        constraint.Trim().TrimStart('^', '~', '=', 'v').Equals(version.Trim().TrimStart('v'), StringComparison.OrdinalIgnoreCase);

    private sealed record Producer(string Ecosystem, string Name, string Version, string Repository);
    private sealed record Consumer(string Ecosystem, string Name, string Version, string Project);
}