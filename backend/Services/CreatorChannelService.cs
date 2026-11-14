using System.Net;
using System.Text.RegularExpressions;
using Admin.Api.Dtos;
using Admin.Api.Models;
using MongoDB.Driver;

namespace Admin.Api.Services;

public sealed partial class CreatorChannelService
{
    private static readonly HashSet<string> AllowedPlatforms = new(StringComparer.OrdinalIgnoreCase)
    {
        "YouTube", "Instagram", "Facebook", "GitHub", "LinkedIn", "X", "Website"
    };

    private const string PanchangChannelCleanupMigrationId = "panchang-channel-cleanup-v1";
    private readonly IMongoCollection<CreatorChannel> _channels;
    private readonly IMongoCollection<WebsiteRegistryService.RegistryMigrationMarker> _migrations;
    private readonly IHttpClientFactory _httpFactory;

    public CreatorChannelService(MongoDbService db, IHttpClientFactory httpFactory)
    {
        _channels = db.GetCollection<CreatorChannel>("creator_channels");
        _migrations = db.GetCollection<WebsiteRegistryService.RegistryMigrationMarker>("_migrations");
        _httpFactory = httpFactory;
    }

    public async Task EnsureIndexesAsync(CancellationToken ct = default)
    {
        await _channels.Indexes.CreateOneAsync(new CreateIndexModel<CreatorChannel>(
            Builders<CreatorChannel>.IndexKeys.Ascending(x => x.Key),
            new CreateIndexOptions { Unique = true }),
            cancellationToken: ct);
    }

    /// <summary>
    /// Seeds initial creator channels only when the collection is empty so an Admin always
    /// stays in complete control from the Admin UI thereafter.
    /// </summary>
    public async Task SeedDefaultsAsync(CancellationToken ct = default)
    {
        if (await _channels.CountDocumentsAsync(FilterDefinition<CreatorChannel>.Empty, cancellationToken: ct) > 0)
        {
            await ApplyOneTimePanchangChannelCleanupAsync(ct);
            return;
        }

        var now = DateTime.UtcNow;
        var defaults = new List<CreatorChannel>
        {
            new()
            {
                Key = "keshavsinghworld",
                Name = "Keshav Singh World",
                Handle = "@keshavsinghworld",
                Platform = "YouTube",
                Url = "https://www.youtube.com/@keshavsinghworld",
                Niche = "Tech, Engineering & Ecosystem",
                Tagline = "Official creator channel for engineering, AI tools, and digital products.",
                Description = "Deep dives, software tutorials, architecture walkthroughs, and updates across the keshavsingh.in ecosystem.",
                Hashtags = ["keshavsinghworld", "KeshavSingh", "AnimStudio"],
                Tags = ["keshav singh world", "keshavsinghworld", "keshav singh", "tech", "dotnet", "ai"],
                IsPrimary = true,
                IsEnabled = true,
                ShowInAnalytics = true,
                ShowInPanchang = false,
                ShowInStudio = true,
                ShowInFooter = true,
                SortOrder = 10,
                CreatedAt = now,
                UpdatedAt = now,
            },
            new()
            {
                Key = "omkarshivbhakti",
                Name = "Omkar Shiv Bhakti",
                Handle = "@OmkarShivBhakti",
                Platform = "YouTube",
                Url = "https://www.youtube.com/@OmkarShivBhakti",
                Niche = "Devotional 3D Animations & Sanatan Culture",
                Tagline = "Devotional 3D Animations",
                Description = "Sacred Shiv Bhakti katha, mantra, Aaj Ka Itihaas, and 3D devotional animations crafted with AnimStudio.",
                EngineName = "AnimStudio",
                VisualsCredit = "Omkar Shiv Bhakti 3D Devotional Animations",
                Hashtags = ["OmkarShivBhakti", "AnimStudio", "KeshavSingh", "SanatanDharma"],
                Tags = ["omkar shiv bhakti", "omkar shiv", "AnimStudio", "omkr", "keshav singh", "bhakti"],
                RetiredHandles = ["OMKR"],
                RetiredUrls = ["youtube.com/@omkr-shiv"],
                IsPrimary = false,
                IsEnabled = true,
                ShowInAnalytics = true,
                ShowInPanchang = true,
                ShowInStudio = true,
                ShowInFooter = true,
                SortOrder = 20,
                CreatedAt = now,
                UpdatedAt = now,
            },
            new()
            {
                Key = "github-keshavsingh3197",
                Name = "GitHub",
                Handle = "keshavsingh3197",
                Platform = "GitHub",
                Url = "https://github.com/keshavsingh3197",
                Niche = "Open Source & Architecture",
                Tagline = "Open-source repositories and shared ecosystem packages.",
                Description = "Source code and modular .NET / Angular packages powering keshavsingh.in.",
                IsPrimary = false,
                IsEnabled = true,
                ShowInAnalytics = false,
                ShowInPanchang = false,
                ShowInStudio = true,
                ShowInFooter = true,
                SortOrder = 30,
                CreatedAt = now,
                UpdatedAt = now,
            },
        };

        await _channels.InsertManyAsync(defaults, cancellationToken: ct);
    }

    private async Task ApplyOneTimePanchangChannelCleanupAsync(CancellationToken ct)
    {
        var alreadyApplied = await _migrations.Find(x => x.Id == PanchangChannelCleanupMigrationId).AnyAsync(ct);
        if (alreadyApplied) return;

        var channels = await _channels.Find(FilterDefinition<CreatorChannel>.Empty).ToListAsync(ct);
        var now = DateTime.UtcNow;
        foreach (var channel in channels)
        {
            if (channel.ShowInPanchang && IsExcludedFromPanchangByDefault(channel.Key, channel.Handle, channel.Name))
            {
                var update = Builders<CreatorChannel>.Update
                    .Set(x => x.ShowInPanchang, false)
                    .Set(x => x.UpdatedAt, now);
                await _channels.UpdateOneAsync(x => x.Id == channel.Id, update, cancellationToken: ct);
            }
        }

        await _migrations.ReplaceOneAsync(
            x => x.Id == PanchangChannelCleanupMigrationId,
            new WebsiteRegistryService.RegistryMigrationMarker { Id = PanchangChannelCleanupMigrationId, AppliedAtUtc = now },
            new ReplaceOptions { IsUpsert = true },
            ct);
    }

    public static bool IsExcludedFromPanchangByDefault(string? key, string? handle, string? name)
    {
        var k = (key ?? string.Empty).Trim().ToLowerInvariant();
        var h = (handle ?? string.Empty).Trim().TrimStart('@').ToLowerInvariant();
        var n = (name ?? string.Empty).Trim().ToLowerInvariant();
        return k == "keshavsinghworld" || h == "keshavsinghworld" || n == "keshav singh world";
    }

    public async Task<IReadOnlyList<CreatorChannelView>> ListAsync(CancellationToken ct = default)
    {
        var list = await _channels.Find(_ => true)
            .SortBy(x => x.SortOrder).ThenBy(x => x.Name)
            .ToListAsync(ct);
        return list.Select(Map).ToList();
    }

    public async Task<IReadOnlyList<CreatorChannelPublicView>> ListPublicAsync(string? app = null, CancellationToken ct = default)
    {
        var list = await _channels.Find(x => x.IsEnabled)
            .SortBy(x => x.SortOrder).ThenBy(x => x.Name)
            .ToListAsync(ct);

        IEnumerable<CreatorChannel> filtered = list;
        if (!string.IsNullOrWhiteSpace(app))
        {
            filtered = app.Trim().ToLowerInvariant() switch
            {
                "studio" => list.Where(x => x.ShowInStudio),
                "panchang" => list.Where(x => x.ShowInPanchang),
                "social" or "analytics" => list.Where(x => x.ShowInAnalytics),
                "footer" => list.Where(x => x.ShowInFooter),
                _ => list
            };
        }

        return filtered.Select(MapPublic).ToList();
    }

    public async Task<CreatorChannelView> CreateAsync(UpsertCreatorChannelRequest request, CancellationToken ct = default)
    {
        var entity = NormalizeEntity(new CreatorChannel(), request);
        entity.CreatedAt = DateTime.UtcNow;
        entity.UpdatedAt = DateTime.UtcNow;
        await _channels.InsertOneAsync(entity, cancellationToken: ct);
        return Map(entity);
    }

    public async Task<CreatorChannelView?> UpdateAsync(string id, UpsertCreatorChannelRequest request, CancellationToken ct = default)
    {
        var existing = await _channels.Find(x => x.Id == id).FirstOrDefaultAsync(ct);
        if (existing is null) return null;

        var entity = NormalizeEntity(existing, request);
        entity.UpdatedAt = DateTime.UtcNow;
        await _channels.ReplaceOneAsync(x => x.Id == id, entity, cancellationToken: ct);
        return Map(entity);
    }

    public Task DeleteAsync(string id, CancellationToken ct = default) =>
        _channels.DeleteOneAsync(x => x.Id == id, ct);

    /// <summary>
    /// Resolves a public YouTube handle or channel URL (e.g. @keshavsinghworld) into its live UC... channel ID,
    /// canonical URL, title, description, and Atom/RSS feed URL without requiring any API key.
    /// </summary>
    public async Task<ResolvedYouTubeChannelResponse> ResolveYouTubeAsync(string handleOrUrl, CancellationToken ct = default)
    {
        var target = BuildYouTubeTargetUrl(handleOrUrl);
        using var client = _httpFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(12);
        using var req = new HttpRequestMessage(HttpMethod.Get, target);
        req.Headers.TryAddWithoutValidation("User-Agent", "Mozilla/5.0 (compatible; KeshavEcosystemBot/1.0)");
        req.Headers.TryAddWithoutValidation("Accept-Language", "en-US,en;q=0.9");

        using var res = await client.SendAsync(req, ct);
        if (!res.IsSuccessStatusCode)
            throw new InvalidOperationException($"YouTube returned HTTP {(int)res.StatusCode} for {target}.");

        var html = await res.Content.ReadAsStringAsync(ct);
        var channelId = ExtractChannelId(html)
            ?? throw new InvalidOperationException("Could not find YouTube channel ID (UC...) on that channel page.");

        var title = ExtractMeta(html, "og:title")
            ?? ExtractTitle(html)
            ?? channelId;
        var canonical = ExtractCanonical(html) ?? $"https://www.youtube.com/channel/{channelId}";
        var desc = ExtractMeta(html, "og:description") ?? ExtractMetaName(html, "description") ?? string.Empty;
        var normalizedHandle = ExtractHandleFromInputOrUrl(handleOrUrl, canonical);

        return new ResolvedYouTubeChannelResponse(
            channelId,
            WebUtility.HtmlDecode(title).Trim(),
            normalizedHandle,
            canonical,
            WebUtility.HtmlDecode(desc).Trim(),
            $"https://www.youtube.com/feeds/videos.xml?channel_id={channelId}");
    }

    public static CreatorChannel NormalizeEntity(CreatorChannel target, UpsertCreatorChannelRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            throw new ArgumentException("Channel name is required.");

        target.Key = NormalizeKey(request.Key);
        target.Name = request.Name.Trim();
        target.Handle = (request.Handle ?? string.Empty).Trim();
        target.Platform = NormalizePlatform(request.Platform);
        target.ChannelId = (request.ChannelId ?? string.Empty).Trim();
        target.Url = NormalizeExternalUrl(request.Url, nameof(request.Url));
        target.Niche = (request.Niche ?? string.Empty).Trim();
        target.Tagline = (request.Tagline ?? string.Empty).Trim();
        target.Description = (request.Description ?? string.Empty).Trim();
        target.EngineName = (request.EngineName ?? string.Empty).Trim();
        target.VisualsCredit = (request.VisualsCredit ?? string.Empty).Trim();
        target.Hashtags = CleanList(request.Hashtags, trimLeadingHash: true);
        target.Tags = CleanList(request.Tags, trimLeadingHash: true);
        target.RetiredHandles = CleanList(request.RetiredHandles, trimLeadingHash: false);
        target.RetiredUrls = CleanList(request.RetiredUrls, trimLeadingHash: false);
        target.IsPrimary = request.IsPrimary;
        target.IsEnabled = request.IsEnabled;
        target.ShowInAnalytics = request.ShowInAnalytics;
        target.ShowInPanchang = request.ShowInPanchang;
        target.ShowInStudio = request.ShowInStudio;
        target.ShowInFooter = request.ShowInFooter;
        target.SortOrder = request.SortOrder;
        return target;
    }

    public static string NormalizeKey(string key)
    {
        var trimmed = (key ?? string.Empty).Trim().ToLowerInvariant();
        if (trimmed.Length < 2 || trimmed.Length > 50)
            throw new ArgumentException("Key must be 2-50 characters.");
        foreach (var ch in trimmed)
        {
            if (!char.IsLetterOrDigit(ch) && ch != '-' && ch != '_')
                throw new ArgumentException("Key can contain only a-z, 0-9, '-' and '_'.");
        }
        return trimmed;
    }

    public static string NormalizePlatform(string? platform)
    {
        var trimmed = (platform ?? string.Empty).Trim();
        if (trimmed.Length == 0) return "YouTube";
        var match = AllowedPlatforms.FirstOrDefault(p => p.Equals(trimmed, StringComparison.OrdinalIgnoreCase));
        if (match is null)
            throw new ArgumentException("Platform must be YouTube, Instagram, Facebook, GitHub, LinkedIn, X, or Website.");
        return match;
    }

    public static string NormalizeExternalUrl(string value, string field)
    {
        var raw = (value ?? string.Empty).Trim();
        if (raw.Length == 0) throw new ArgumentException($"{field} cannot be empty.");
        if (!Uri.TryCreate(raw, UriKind.Absolute, out var uri))
            throw new ArgumentException($"{field} must be a valid URL.");

        var isLocal = uri.IsLoopback;
        if (uri.Scheme != Uri.UriSchemeHttps && !(isLocal && uri.Scheme == Uri.UriSchemeHttp))
            throw new ArgumentException($"{field} must use https.");
        if (!string.IsNullOrEmpty(uri.UserInfo) || uri.AbsoluteUri.IndexOfAny(['<', '>']) >= 0)
            throw new ArgumentException($"{field} contains disallowed characters.");

        return uri.AbsoluteUri.TrimEnd('/');
    }

    public static string BuildYouTubeTargetUrl(string handleOrUrl)
    {
        var raw = (handleOrUrl ?? string.Empty).Trim();
        if (raw.Length == 0) throw new ArgumentException("Enter a YouTube @handle, channel ID, or URL.");

        if (!raw.Contains("://", StringComparison.Ordinal))
        {
            if (Regex.IsMatch(raw, "^UC[A-Za-z0-9_-]{22}$"))
                return $"https://www.youtube.com/channel/{raw}";
            var handle = raw.StartsWith('@') ? raw : $"@{raw.TrimStart('@')}";
            if (!Regex.IsMatch(handle, @"^@[\p{L}\p{M}\p{N}._-]+$"))
                throw new ArgumentException("Invalid YouTube handle.");
            return $"https://www.youtube.com/{handle}";
        }

        if (!Uri.TryCreate(raw, UriKind.Absolute, out var uri)
            || uri.Scheme != Uri.UriSchemeHttps
            || (!uri.Host.Equals("www.youtube.com", StringComparison.OrdinalIgnoreCase)
                && !uri.Host.Equals("youtube.com", StringComparison.OrdinalIgnoreCase)
                && !uri.Host.Equals("m.youtube.com", StringComparison.OrdinalIgnoreCase)))
        {
            throw new ArgumentException("YouTube URL must be https://www.youtube.com/...");
        }

        return uri.GetLeftPart(UriPartial.Path).TrimEnd('/');
    }

    private static List<string> CleanList(IEnumerable<string>? items, bool trimLeadingHash)
    {
        if (items is null) return [];
        var list = new List<string>();
        foreach (var raw in items)
        {
            var val = (raw ?? string.Empty).Trim();
            if (trimLeadingHash) val = val.TrimStart('#');
            if (val.Length == 0 || val.IndexOfAny(['<', '>', '\r', '\n']) >= 0) continue;
            if (!list.Contains(val, StringComparer.OrdinalIgnoreCase)) list.Add(val);
        }
        return list;
    }

    private static string? ExtractChannelId(string html)
    {
        var canonicalMatch = CanonicalChannelRegex().Match(html);
        if (canonicalMatch.Success) return canonicalMatch.Groups[1].Value;
        var metaMatch = ExternalIdJsonRegex().Match(html);
        return metaMatch.Success ? metaMatch.Groups[1].Value : null;
    }

    private static string? ExtractCanonical(string html)
    {
        var match = CanonicalTagRegex().Match(html);
        return match.Success ? match.Groups[1].Value : null;
    }

    private static string? ExtractMeta(string html, string property)
    {
        var match = Regex.Match(html,
            $@"<meta\s+property=""{Regex.Escape(property)}""\s+content=""([^""]+)""",
            RegexOptions.IgnoreCase);
        return match.Success ? match.Groups[1].Value : null;
    }

    private static string? ExtractMetaName(string html, string name)
    {
        var match = Regex.Match(html,
            $@"<meta\s+name=""{Regex.Escape(name)}""\s+content=""([^""]+)""",
            RegexOptions.IgnoreCase);
        return match.Success ? match.Groups[1].Value : null;
    }

    private static string? ExtractTitle(string html)
    {
        var match = TitleTagRegex().Match(html);
        if (!match.Success) return null;
        return match.Groups[1].Value.Replace(" - YouTube", "", StringComparison.OrdinalIgnoreCase).Trim();
    }

    private static string ExtractHandleFromInputOrUrl(string input, string canonical)
    {
        var raw = (input ?? string.Empty).Trim();
        var atIdx = raw.IndexOf('@');
        if (atIdx >= 0)
        {
            var candidate = raw[atIdx..].Split(['/', '?', '#'], StringSplitOptions.RemoveEmptyEntries)[0];
            if (candidate.Length > 1) return candidate;
        }
        var cIdx = canonical.IndexOf('@');
        if (cIdx >= 0)
            return canonical[cIdx..].Split(['/', '?', '#'], StringSplitOptions.RemoveEmptyEntries)[0];
        return raw;
    }

    private static CreatorChannelView Map(CreatorChannel x) => new(
        x.Id, x.Key, x.Name, x.Handle, x.Platform, x.ChannelId, x.Url,
        x.Niche, x.Tagline, x.Description, x.EngineName, x.VisualsCredit,
        x.Hashtags, x.Tags, x.RetiredHandles, x.RetiredUrls,
        x.IsPrimary, x.IsEnabled, x.ShowInAnalytics, x.ShowInPanchang, x.ShowInStudio, x.ShowInFooter,
        x.SortOrder, x.UpdatedAt);

    private static CreatorChannelPublicView MapPublic(CreatorChannel x) => new(
        x.Key, x.Name, x.Handle, x.Platform, x.ChannelId, x.Url,
        x.Niche, x.Tagline, x.Description, x.EngineName, x.VisualsCredit,
        x.Hashtags, x.Tags, x.RetiredHandles, x.RetiredUrls,
        x.IsPrimary, x.ShowInAnalytics, x.ShowInPanchang, x.ShowInStudio, x.ShowInFooter,
        x.SortOrder, x.UpdatedAt);

    [GeneratedRegex(@"https://www\.youtube\.com/channel/(UC[A-Za-z0-9_-]{22})", RegexOptions.IgnoreCase)]
    private static partial Regex CanonicalChannelRegex();

    [GeneratedRegex(@"""externalId""\s*:\s*""(UC[A-Za-z0-9_-]{22})""")]
    private static partial Regex ExternalIdJsonRegex();

    [GeneratedRegex(@"<link\s+rel=""canonical""\s+href=""([^""]+)""", RegexOptions.IgnoreCase)]
    private static partial Regex CanonicalTagRegex();

    [GeneratedRegex(@"<title>([^<]+)</title>", RegexOptions.IgnoreCase)]
    private static partial Regex TitleTagRegex();
}
