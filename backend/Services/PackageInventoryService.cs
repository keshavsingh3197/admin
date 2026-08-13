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
///
/// Only the repositories explicitly chosen on the Settings screen are scanned — that selection lives
/// in the settings document, so it survives restarts and is never re-picked. A scan never enumerates
/// the whole account: that is dozens of pointless Git Trees calls against the API rate limit, and it
/// fills the screen with repos that have nothing to do with these packages.
/// </summary>
public sealed class PackageInventoryService
{
    private static readonly HashSet<string> ExcludedDirectories = new(StringComparer.OrdinalIgnoreCase)
    {
        ".git", ".angular", "bin", "obj", "node_modules", "dist", "artifacts"
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

        var repositories = SettingsService.NormalizePackageInventoryRepositories(_settings.PackageInventoryRepositories);
        if (repositories.Count == 0)
        {
            return new PackageInventoryDto(DateTimeOffset.UtcNow, true, [],
                ["No repositories are selected — choose which ones to scan on Settings → Package inventory (GitHub)."]);
        }

        var diagnostics = new List<string>();
        var (producers, consumers) = await DiscoverViaGitHubAsync(repositories, token, diagnostics, cancellationToken);
        var packages = new List<PackageInventoryItemDto>();

        foreach (var producer in producers.Values.OrderBy(x => x.Ecosystem).ThenBy(x => x.Name))
        {
            var publishedVersions = await GetPublishedVersionsAsync(producer, token, diagnostics, cancellationToken);
            var versionSummary = SummarizePublishedVersions(publishedVersions);
            var packageConsumers = consumers
                .Where(x => x.Ecosystem == producer.Ecosystem && x.Name.Equals(producer.Name, StringComparison.OrdinalIgnoreCase))
                .Select(x => new PackageConsumerDto(x.Project, x.Version, VersionMatches(x.Version, producer.Version)))
                .OrderBy(x => x.Project)
                .ToArray();

            var status = packageConsumers.Any(x => !x.IsCurrent)
                ? "upgrade-required"
                : versionSummary.PublishedVersions.Count == 0 || !VersionMatches(versionSummary.PublishedVersions[0], producer.Version)
                    ? "publish-required"
                    : "current";

            packages.Add(new PackageInventoryItemDto(
                producer.Ecosystem,
                producer.Name,
                producer.Version,
                versionSummary.PublishedVersions.FirstOrDefault(),
                versionSummary.PublishedVersions,
                versionSummary.LatestTag,
                versionSummary.Tags,
                producer.Repository,
                status,
                packageConsumers));
        }

        if (packages.Count == 0 && diagnostics.Count == 0)
            diagnostics.Add("No KeshavSingh.*/@keshavsingh3197/* manifests were found in any selected repo.");

        var result = new PackageInventoryDto(DateTimeOffset.UtcNow, true, packages, diagnostics);
        _cache.Set(cacheKey, result, TimeSpan.FromMinutes(15));
        return result;
    }

    /// <summary>Settings-screen token first (live, no redeploy needed), then appsettings/env fallbacks.</summary>
    private string? ResolveGitHubToken() =>
        _settings.GitHubPackagesToken is { Length: > 0 } fromSettings
            ? fromSettings
            : _configuration["PackageInventory:GitHubToken"] ?? _configuration["PACKAGES_READ_TOKEN"];

    /// <summary>
    /// Every repository the configured token can see, newest-touched first — the candidate list the
    /// Settings screen searches to choose what to scan. This is the ONLY place the full account is
    /// enumerated; a scan itself never does (see <see cref="GetAsync"/>).
    /// </summary>
    public async Task<IReadOnlyList<string>> ListAvailableRepositoriesAsync(CancellationToken ct)
    {
        var token = ResolveGitHubToken();
        if (string.IsNullOrWhiteSpace(token)) return [];

        var names = new List<string>();
        // Paged rather than a single page-of-100: an account with more repos than that would silently
        // lose the tail, and a picker that can't offer a repo is indistinguishable from a broken one.
        for (var page = 1; page <= 10; page++)
        {
            using var request = CreateGitHubRequest(HttpMethod.Get,
                $"https://api.github.com/user/repos?affiliation=owner,organization_member&sort=pushed&per_page=100&page={page}", token);
            try
            {
                using var response = await _httpClientFactory.CreateClient().SendAsync(request, ct);
                if (!response.IsSuccessStatusCode) break;
                using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
                var batch = doc.RootElement.EnumerateArray()
                    .Select(x => x.TryGetProperty("full_name", out var n) ? n.GetString() : null)
                    .Where(x => !string.IsNullOrWhiteSpace(x))
                    .Cast<string>()
                    .ToArray();
                names.AddRange(batch);
                if (batch.Length < 100) break;
            }
            catch (Exception ex) when (ex is HttpRequestException or JsonException) { break; }
        }
        return names;
    }

    /// <summary>
    /// Finds every producer/consumer manifest across the selected repos using the GitHub API only —
    /// no local checkout required, so this works the same in production as it does locally.
    /// </summary>
    private async Task<(Dictionary<string, Producer> Producers, List<Consumer> Consumers)> DiscoverViaGitHubAsync(
        IReadOnlyList<string> repositories, string token, List<string> diagnostics, CancellationToken cancellationToken)
    {
        var producers = new Dictionary<string, Producer>(StringComparer.OrdinalIgnoreCase);
        var manifestBodies = new List<(string Repository, string Path, string Content)>();

        foreach (var repository in repositories)
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
            var producer = ParseCsprojProducer(content, $"{repository}/{path}", repository, diagnostics);
            if (producer is not null) producers[$"nuget:{producer.Name}"] = producer;
        }
        foreach (var (repository, path, content) in manifestBodies.Where(x => x.Path.EndsWith("package.json", StringComparison.OrdinalIgnoreCase)))
        {
            var producer = ParsePackageJsonProducer(content, $"{repository}/{path}", repository, diagnostics);
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
                ? ParseCsprojConsumers(content, projectName, known, diagnostics)
                : ParsePackageJsonConsumers(content, projectName, known, diagnostics));
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

    private static Producer? ParseCsprojProducer(string content, string label, string repository, List<string> diagnostics)
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
        catch (Exception ex) { diagnostics.Add($"{label}: not valid XML, skipped ({ex.GetType().Name})."); return null; }
    }

    private static Producer? ParsePackageJsonProducer(string content, string label, string repository, List<string> diagnostics)
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
        catch (JsonException ex) { diagnostics.Add($"{label}: not valid JSON, skipped ({ex.Message})."); return null; }
    }

    private static IEnumerable<Consumer> ParseCsprojConsumers(string content, string project, HashSet<string> known, List<string> diagnostics)
    {
        // Iterator methods can't `yield return` inside a try with a catch, so the parse (the part that
        // can actually throw) is isolated in its own try/catch that yield-breaks on failure; the walk
        // below it is unprotected but can't throw once `document` parsed successfully.
        XDocument? document = null;
        try { document = XDocument.Parse(content); }
        catch (Exception ex) { diagnostics.Add($"{project}: not valid XML, skipped ({ex.GetType().Name})."); }
        if (document is null) yield break;

        foreach (var reference in document.Descendants("PackageReference"))
        {
            var name = reference.Attribute("Include")?.Value;
            var version = reference.Attribute("Version")?.Value ?? reference.Element("Version")?.Value;
            if (name is not null && version is not null && known.Contains($"nuget:{name}"))
                yield return new Consumer("nuget", name, version, project);
        }
    }

    private static IEnumerable<Consumer> ParsePackageJsonConsumers(string content, string project, HashSet<string> known, List<string> diagnostics)
    {
        JsonDocument? document = null;
        try { document = JsonDocument.Parse(content); }
        catch (JsonException ex) { diagnostics.Add($"{project}: not valid JSON, skipped ({ex.Message})."); }
        if (document is null) yield break;
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

    /// <summary>
    /// The newest stable version published for this package. The owner comes from the repo that
    /// produces it — packages are not all under one account — and GitHub splits the packages API by
    /// account type, so a user-scoped miss is retried as an organisation.
    /// </summary>
    private async Task<IReadOnlyList<string>> GetPublishedVersionsAsync(Producer producer, string? token, List<string> diagnostics, CancellationToken cancellationToken)
    {
        var owner = producer.Repository.Split('/')[0];
        foreach (var scope in new[] { "users", "orgs" })
        {
            var url = $"https://api.github.com/{scope}/{Uri.EscapeDataString(owner)}/packages/{producer.Ecosystem}/{Uri.EscapeDataString(producer.Name)}/versions?per_page=100";
            using var request = CreateGitHubRequest(HttpMethod.Get, url, token ?? string.Empty);

            try
            {
                using var response = await _httpClientFactory.CreateClient().SendAsync(request, cancellationToken);
                if (!response.IsSuccessStatusCode)
                {
                    if (response.StatusCode == HttpStatusCode.NotFound && scope == "users") continue;
                    diagnostics.Add($"{producer.Name}: could not read published versions ({DescribeStatus(response.StatusCode)}).");
                    return Array.Empty<string>();
                }
                using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
                return document.RootElement.EnumerateArray()
                    .Select(x => x.TryGetProperty("name", out var name) ? name.GetString() : null)
                    .Where(x => !string.IsNullOrWhiteSpace(x))
                    .Select(x => x!)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .OrderByDescending(x => x, StringComparer.OrdinalIgnoreCase)
                    .ToArray();
            }
            catch (HttpRequestException ex) { diagnostics.Add($"{producer.Name}: published-versions request failed ({ex.Message})."); return Array.Empty<string>(); }
            catch (JsonException) { diagnostics.Add($"{producer.Name}: published-versions response was not valid JSON."); return Array.Empty<string>(); }
        }
        return Array.Empty<string>();
    }

    private static PackageInventoryVersionSummary SummarizePublishedVersions(IReadOnlyList<string> publishedVersions)
    {
        var distinct = publishedVersions
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .Select(v => v.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Where(v => !v.Equals("latest", StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(v => v, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var stable = distinct
            .Where(v => !v.Contains('-', StringComparison.Ordinal))
            .ToArray();

        var latestTag = stable.FirstOrDefault();
        var tags = latestTag is null ? Array.Empty<string>() : new[] { latestTag };

        return new PackageInventoryVersionSummary(stable, latestTag, tags);
    }

    private static bool VersionMatches(string constraint, string version) =>
        constraint.Trim().TrimStart('^', '~', '=', 'v').Equals(version.Trim().TrimStart('v'), StringComparison.OrdinalIgnoreCase);

    private sealed record Producer(string Ecosystem, string Name, string Version, string Repository);
    private sealed record Consumer(string Ecosystem, string Name, string Version, string Project);
}
