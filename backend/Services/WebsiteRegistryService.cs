using Admin.Api.Dtos;
using Admin.Api.Models;
using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Driver;

namespace Admin.Api.Services;

public sealed class WebsiteRegistryService
{
    private const string EcosystemBarCleanupMigrationId = "ecosystem-bar-cleanup-v1";
    private const string LocalizationDefaultsMigrationId = "website-localization-defaults-v1";
    private readonly IMongoCollection<WebsiteLink> _websites;
    private readonly IMongoCollection<RegistryMigrationMarker> _migrations;

    public WebsiteRegistryService(MongoDbService db)
    {
        _websites = db.GetCollection<WebsiteLink>("websites");
        _migrations = db.GetCollection<RegistryMigrationMarker>("_migrations");
    }

    public async Task EnsureIndexesAsync(CancellationToken ct = default)
    {
        await _websites.Indexes.CreateOneAsync(new CreateIndexModel<WebsiteLink>(
            Builders<WebsiteLink>.IndexKeys.Ascending(x => x.Key),
            new CreateIndexOptions { Unique = true }),
            cancellationToken: ct);
    }

    /// <summary>
    /// Makes sure the sites in the family are registered. Missing keys are added one by one rather than
    /// only seeding an empty collection: a site added to this list later (the portfolio was) would
    /// otherwise never appear, and analytics rejects visits from a key it doesn't know.
    ///
    /// Existing rows are left exactly as they are — the registry is editable on the Settings page, and a
    /// restart has no business undoing that.
    /// </summary>
    public async Task SeedDefaultsAsync(string blogUrl, string blogAdminUrl, string portfolioUrl,
        string studioUrl = "https://studio.keshavsingh.in",
        string socialUrl = "https://social.keshavsingh.in",
        string panchangUrl = "https://panchang.keshavsingh.in",
        CancellationToken ct = default)
    {
        var defaults = new List<WebsiteLink>
        {
            new()
            {
                Key = "portfolio",
                Name = "Portfolio",
                Url = NormalizeUrl(portfolioUrl, nameof(portfolioUrl)),
                SortOrder = 5,
                IsEnabled = true,
                Icon = "💼",
                Description = "Engineering portfolio, architecture resume, and project showcase.",
                ShowInEcosystemBar = false,
            },
            new()
            {
                Key = "blog",
                Name = "Content Blog",
                Url = NormalizeUrl(blogUrl, nameof(blogUrl)),
                SortOrder = 35,
                IsEnabled = true,
                Icon = "✍️",
                Description = "Deep-dive programming tutorials, cloud guides, and interview prep notes.",
                ShowInEcosystemBar = false,
            },
            new()
            {
                Key = "studio",
                Name = "Studio AI",
                Url = NormalizeUrl(studioUrl, nameof(studioUrl)),
                SortOrder = 10,
                IsEnabled = true,
                Icon = "🎬",
                Description = "Generate viral 2D/3D AI animated stories and YouTube shorts in minutes.",
                ShowInEcosystemBar = true,
            },
            new()
            {
                Key = "blog-admin",
                Name = "Blog Admin",
                Url = NormalizeUrl(blogAdminUrl, nameof(blogAdminUrl)),
                SortOrder = 45,
                IsEnabled = true,
                Icon = "📝",
                Description = "Editorial studio and GitHub-synced publishing console for blog articles.",
                ShowInEcosystemBar = false,
            },
            new()
            {
                Key = "social",
                Name = "Social Analytics",
                Url = NormalizeUrl(socialUrl, nameof(socialUrl)),
                SortOrder = 15,
                IsEnabled = true,
                Icon = "📊",
                Description = "Creator analytics, RPM earnings intelligence & traffic funnel engine.",
                ShowInEcosystemBar = true,
            },
            new()
            {
                Key = "panchang",
                Name = "Hindu Panchang",
                Url = NormalizeUrl(panchangUrl, nameof(panchangUrl)),
                SortOrder = 20,
                IsEnabled = true,
                Icon = "🕉️",
                Description = "Daily Vedic calendar, muhurats, spiritual video hub & Aaj Ka Itihaas.",
                ShowInEcosystemBar = true,
                DefaultLocale = "hi",
                EnabledLocales = ["en", "hi"],
                AllowVisitorLanguageSwitch = true,
                ShowLanguagePicker = true,
                ForceLocale = false,
            },
            new()
            {
                Key = "ghar-ledger",
                Name = "Ghar Ledger",
                Url = NormalizeUrl("https://ghar.keshavsingh.in", "gharLedgerUrl"),
                SortOrder = 25,
                IsEnabled = true,
                Icon = "🏠",
                Description = "Household vendor ledgers, milk/newspaper tracking & expense settlements.",
                ShowInEcosystemBar = false,
            },
            new()
            {
                Key = "pratiyogita",
                Name = "Pratiyogita",
                Url = NormalizeUrl("https://pratiyogita.keshavsingh.in", "pratiyogitaUrl"),
                SortOrder = 30,
                IsEnabled = true,
                Icon = "🏆",
                Description = "Community sports tournaments, live fixtures, leaderboards & news.",
                ShowInEcosystemBar = true,
            },
            new()
            {
                Key = "admin",
                Name = "Admin & SSO",
                Url = NormalizeUrl("https://admin.keshavsingh.in", "adminUrl"),
                SortOrder = 40,
                IsEnabled = true,
                Icon = "🛡️",
                Description = "Central identity provider, RBAC permissions, global config & audit portal.",
                ShowInEcosystemBar = false,
            }
        };

        var existing = (await _websites.Find(FilterDefinition<WebsiteLink>.Empty)
                .Project(x => x.Key).ToListAsync(ct))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var missing = defaults.Where(x => !existing.Contains(x.Key)).ToList();
        if (missing.Count > 0) await _websites.InsertManyAsync(missing, cancellationToken: ct);

        await ApplyOneTimeEcosystemBarCleanupAsync(ct);
        await ApplyOneTimeLocalizationDefaultsAsync(ct);
    }

    private async Task ApplyOneTimeLocalizationDefaultsAsync(CancellationToken ct)
    {
        var alreadyApplied = await _migrations.Find(x => x.Id == LocalizationDefaultsMigrationId).AnyAsync(ct);
        if (alreadyApplied) return;

        var all = await _websites.Find(FilterDefinition<WebsiteLink>.Empty).ToListAsync(ct);
        var now = DateTime.UtcNow;
        foreach (var item in all)
        {
            var isPanchang = string.Equals(item.Key, "panchang", StringComparison.OrdinalIgnoreCase);
            var defaultLocale = string.IsNullOrWhiteSpace(item.DefaultLocale)
                ? (isPanchang ? "hi" : "en")
                : NormalizeLocale(item.DefaultLocale);
            if (isPanchang && string.IsNullOrWhiteSpace(item.DefaultLocale))
                defaultLocale = "hi";

            var enabledLocales = NormalizeEnabledLocales(item.EnabledLocales, defaultLocale);
            var needsUpdate = string.IsNullOrWhiteSpace(item.DefaultLocale)
                || item.EnabledLocales is null
                || item.EnabledLocales.Count == 0;

            if (needsUpdate)
            {
                var update = Builders<WebsiteLink>.Update
                    .Set(x => x.DefaultLocale, defaultLocale)
                    .Set(x => x.EnabledLocales, enabledLocales)
                    .Set(x => x.AllowVisitorLanguageSwitch, item.AllowVisitorLanguageSwitch)
                    .Set(x => x.ShowLanguagePicker, item.ShowLanguagePicker)
                    .Set(x => x.UpdatedAt, now);
                await _websites.UpdateOneAsync(x => x.Id == item.Id, update, cancellationToken: ct);
            }
        }

        await _migrations.ReplaceOneAsync(
            x => x.Id == LocalizationDefaultsMigrationId,
            new RegistryMigrationMarker { Id = LocalizationDefaultsMigrationId, AppliedAtUtc = now },
            new ReplaceOptions { IsUpsert = true },
            ct);
    }

    private async Task ApplyOneTimeEcosystemBarCleanupAsync(CancellationToken ct)
    {
        var alreadyApplied = await _migrations.Find(x => x.Id == EcosystemBarCleanupMigrationId).AnyAsync(ct);
        if (alreadyApplied) return;

        var all = await _websites.Find(FilterDefinition<WebsiteLink>.Empty).ToListAsync(ct);
        var now = DateTime.UtcNow;
        foreach (var item in all)
        {
            if (item.ShowInEcosystemBar && IsInternalOrHiddenByDefaultWebsite(item.Key, item.Name, item.Url))
            {
                var update = Builders<WebsiteLink>.Update
                    .Set(x => x.ShowInEcosystemBar, false)
                    .Set(x => x.UpdatedAt, now);
                await _websites.UpdateOneAsync(x => x.Id == item.Id, update, cancellationToken: ct);
            }
        }

        await _migrations.ReplaceOneAsync(
            x => x.Id == EcosystemBarCleanupMigrationId,
            new RegistryMigrationMarker { Id = EcosystemBarCleanupMigrationId, AppliedAtUtc = now },
            new ReplaceOptions { IsUpsert = true },
            ct);
    }

    public static bool IsInternalOrHiddenByDefaultWebsite(string? key, string? name, string? url)
    {
        var k = (key ?? string.Empty).Trim().ToLowerInvariant();
        if (k is "blog" or "content-blog" or "blog-admin" or "admin" or "ghar-ledger" or "gharledger")
            return true;

        var n = (name ?? string.Empty).Trim().ToLowerInvariant();
        if (n is "blog" or "content blog" or "blog admin" or "admin & sso" or "ghar ledger")
            return true;

        var u = (url ?? string.Empty).Trim().TrimEnd('/').ToLowerInvariant();
        return u.Contains("ghar.keshavsingh.in", StringComparison.Ordinal)
            || u.Contains("ghar-ledger", StringComparison.Ordinal)
            || u.Contains("blog-admin", StringComparison.Ordinal)
            || u.EndsWith("://blog.keshavsingh.in", StringComparison.Ordinal)
            || u.EndsWith("://admin.keshavsingh.in", StringComparison.Ordinal)
            || u.EndsWith("://id.keshavsingh.in", StringComparison.Ordinal);
    }

    public async Task<IReadOnlyList<WebsiteLinkView>> ListAsync(CancellationToken ct = default)
    {
        var list = await _websites.Find(_ => true)
            .SortBy(x => x.SortOrder).ThenBy(x => x.Name)
            .ToListAsync(ct);
        return list.Select(Map).ToList();
    }

    public async Task<WebsiteLinkView> CreateAsync(UpsertWebsiteLinkRequest request, CancellationToken ct = default)
    {
        var key = NormalizeKey(request.Key);
        var defaultLocale = NormalizeLocale(request.DefaultLocale ?? (key == "panchang" ? "hi" : "en"));
        var enabledLocales = NormalizeEnabledLocales(request.EnabledLocales, defaultLocale);
        var entity = new WebsiteLink
        {
            Key = key,
            Name = request.Name.Trim(),
            Url = NormalizeUrl(request.Url, nameof(request.Url)),
            IsEnabled = request.IsEnabled,
            SortOrder = request.SortOrder,
            Icon = NormalizeIcon(request.Icon, key),
            Description = (request.Description ?? string.Empty).Trim(),
            ShowInEcosystemBar = request.ShowInEcosystemBar ?? true,
            DefaultLocale = defaultLocale,
            EnabledLocales = enabledLocales,
            AllowVisitorLanguageSwitch = request.AllowVisitorLanguageSwitch ?? true,
            ShowLanguagePicker = request.ShowLanguagePicker ?? true,
            ForceLocale = request.ForceLocale ?? false,
            UpdatedAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
        };

        await _websites.InsertOneAsync(entity, cancellationToken: ct);
        return Map(entity);
    }

    public async Task<WebsiteLinkView?> UpdateAsync(string id, UpsertWebsiteLinkRequest request, CancellationToken ct = default)
    {
        var key = NormalizeKey(request.Key);
        var now = DateTime.UtcNow;
        var existing = await _websites.Find(x => x.Id == id).FirstOrDefaultAsync(ct);
        if (existing is null) return null;

        var defaultLocale = NormalizeLocale(request.DefaultLocale ?? existing.DefaultLocale ?? (key == "panchang" ? "hi" : "en"));
        var enabledLocales = NormalizeEnabledLocales(request.EnabledLocales ?? existing.EnabledLocales, defaultLocale);

        var update = Builders<WebsiteLink>.Update
            .Set(x => x.Key, key)
            .Set(x => x.Name, request.Name.Trim())
            .Set(x => x.Url, NormalizeUrl(request.Url, nameof(request.Url)))
            .Set(x => x.IsEnabled, request.IsEnabled)
            .Set(x => x.SortOrder, request.SortOrder)
            .Set(x => x.Icon, NormalizeIcon(request.Icon, key))
            .Set(x => x.Description, (request.Description ?? string.Empty).Trim())
            .Set(x => x.ShowInEcosystemBar, request.ShowInEcosystemBar ?? existing.ShowInEcosystemBar)
            .Set(x => x.DefaultLocale, defaultLocale)
            .Set(x => x.EnabledLocales, enabledLocales)
            .Set(x => x.AllowVisitorLanguageSwitch, request.AllowVisitorLanguageSwitch ?? existing.AllowVisitorLanguageSwitch)
            .Set(x => x.ShowLanguagePicker, request.ShowLanguagePicker ?? existing.ShowLanguagePicker)
            .Set(x => x.ForceLocale, request.ForceLocale ?? existing.ForceLocale)
            .Set(x => x.UpdatedAt, now);

        var updated = await _websites.FindOneAndUpdateAsync(x => x.Id == id, update,
            new FindOneAndUpdateOptions<WebsiteLink> { ReturnDocument = ReturnDocument.After }, ct);

        return updated is null ? null : Map(updated);
    }

    public Task DeleteAsync(string id, CancellationToken ct = default) =>
        _websites.DeleteOneAsync(x => x.Id == id, ct);

    public async Task<IReadOnlyList<WebsiteLink>> ListEnabledAsync(CancellationToken ct = default)
        => await _websites.Find(x => x.IsEnabled).SortBy(x => x.SortOrder).ThenBy(x => x.Name).ToListAsync(ct);

    public async Task<IReadOnlyList<EcosystemWebsiteView>> ListEcosystemAsync(CancellationToken ct = default)
    {
        var enabled = await ListEnabledAsync(ct);
        return ProjectEcosystemLinks(enabled);
    }

    public static IReadOnlyList<EcosystemWebsiteView> ProjectEcosystemLinks(IEnumerable<WebsiteLink> enabled)
    {
        var seenUrls = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var seenNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var result = new List<EcosystemWebsiteView>();

        foreach (var x in enabled.Where(w => w.IsEnabled).OrderBy(w => w.SortOrder).ThenBy(w => w.Name))
        {
            var normalizedUrl = (x.Url ?? string.Empty).Trim().TrimEnd('/');
            var normalizedName = (x.Name ?? string.Empty).Trim();
            if ((!string.IsNullOrEmpty(normalizedUrl) && !seenUrls.Add(normalizedUrl))
                || (!string.IsNullOrEmpty(normalizedName) && !seenNames.Add(normalizedName)))
            {
                continue;
            }

            var defaultLocale = NormalizeLocale(x.DefaultLocale ?? (x.Key.Equals("panchang", StringComparison.OrdinalIgnoreCase) ? "hi" : "en"));
            var enabledLocales = NormalizeEnabledLocales(x.EnabledLocales, defaultLocale);

            result.Add(new EcosystemWebsiteView(
                x.Key,
                normalizedName,
                x.Url ?? string.Empty,
                ResolveIcon(x.Icon, x.Key),
                x.Description ?? string.Empty,
                x.SortOrder,
                x.ShowInEcosystemBar,
                x.UpdatedAt,
                defaultLocale,
                enabledLocales,
                x.AllowVisitorLanguageSwitch,
                x.ShowLanguagePicker,
                x.ForceLocale));
        }

        return result;
    }

    public async Task<EcosystemWebsiteView?> GetEcosystemSiteAsync(string siteKey, CancellationToken ct = default)
    {
        var normalized = (siteKey ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(normalized)) return null;
        var site = await _websites.Find(x => x.Key == normalized && x.IsEnabled).FirstOrDefaultAsync(ct);
        if (site is null) return null;
        var defaultLocale = NormalizeLocale(site.DefaultLocale ?? (site.Key.Equals("panchang", StringComparison.OrdinalIgnoreCase) ? "hi" : "en"));
        var enabledLocales = NormalizeEnabledLocales(site.EnabledLocales, defaultLocale);
        return new EcosystemWebsiteView(
            site.Key,
            site.Name,
            site.Url ?? string.Empty,
            ResolveIcon(site.Icon, site.Key),
            site.Description ?? string.Empty,
            site.SortOrder,
            site.ShowInEcosystemBar,
            site.UpdatedAt,
            defaultLocale,
            enabledLocales,
            site.AllowVisitorLanguageSwitch,
            site.ShowLanguagePicker,
            site.ForceLocale);
    }

    internal sealed class RegistryMigrationMarker
    {
        [BsonId]
        public string Id { get; set; } = string.Empty;
        public DateTime AppliedAtUtc { get; set; }
    }

    private static WebsiteLinkView Map(WebsiteLink x)
    {
        var defaultLocale = NormalizeLocale(x.DefaultLocale ?? (x.Key.Equals("panchang", StringComparison.OrdinalIgnoreCase) ? "hi" : "en"));
        var enabledLocales = NormalizeEnabledLocales(x.EnabledLocales, defaultLocale);
        return new WebsiteLinkView(
            x.Id,
            x.Key,
            x.Name,
            x.Url,
            x.IsEnabled,
            x.SortOrder,
            x.UpdatedAt,
            ResolveIcon(x.Icon, x.Key),
            x.Description ?? string.Empty,
            x.ShowInEcosystemBar,
            defaultLocale,
            enabledLocales,
            x.AllowVisitorLanguageSwitch,
            x.ShowLanguagePicker,
            x.ForceLocale);
    }

    public static string NormalizeLocale(string? locale)
    {
        var code = (locale ?? string.Empty).Trim().ToLowerInvariant();
        if (code.StartsWith("hi", StringComparison.Ordinal)) return "hi";
        if (code.StartsWith("en", StringComparison.Ordinal)) return "en";
        return string.IsNullOrWhiteSpace(code) ? "en" : code;
    }

    public static List<string> NormalizeEnabledLocales(IEnumerable<string>? locales, string defaultLocale)
    {
        var result = new List<string>();
        if (locales is not null)
        {
            foreach (var raw in locales)
            {
                var norm = NormalizeLocale(raw);
                if (!result.Contains(norm, StringComparer.OrdinalIgnoreCase))
                    result.Add(norm);
            }
        }
        if (result.Count == 0)
        {
            result.Add("en");
            result.Add("hi");
        }
        var def = NormalizeLocale(defaultLocale);
        if (!result.Contains(def, StringComparer.OrdinalIgnoreCase))
            result.Insert(0, def);
        return result;
    }

    private static string NormalizeIcon(string? icon, string key) =>
        string.IsNullOrWhiteSpace(icon) ? DefaultIconForKey(key) : icon.Trim();

    private static string ResolveIcon(string? icon, string key) =>
        string.IsNullOrWhiteSpace(icon) ? DefaultIconForKey(key) : icon.Trim();

    private static string DefaultIconForKey(string key) => key.ToLowerInvariant() switch
    {
        "studio" => "🎬",
        "social" or "social-analytics" => "📊",
        "panchang" or "hindu-panchang" => "🕉️",
        "ghar-ledger" => "🏠",
        "pratiyogita" => "🏆",
        "blog" or "content-blog" => "✍️",
        "admin" => "🛡️",
        "portfolio" => "💼",
        "blog-admin" => "📝",
        _ => "🌐",
    };

    private static string NormalizeKey(string key)
    {
        var trimmed = key.Trim().ToLowerInvariant();
        if (trimmed.Length < 2 || trimmed.Length > 40)
            throw new ArgumentException("Key must be 2-40 chars.");

        foreach (var ch in trimmed)
        {
            if (!char.IsLetterOrDigit(ch) && ch != '-' && ch != '_')
                throw new ArgumentException("Key can contain only a-z, 0-9, '-' and '_'.");
        }

        return trimmed;
    }

    private static string NormalizeUrl(string value, string field)
    {
        var url = value.Trim();
        if (url.Length == 0) throw new ArgumentException($"{field} cannot be empty.");
        if (!Uri.TryCreate(url, UriKind.Absolute, out var u))
            throw new ArgumentException($"{field} must be a valid URL.");

        var isLocalhost = u.Host == "localhost";
        if (u.Scheme != Uri.UriSchemeHttps && !(isLocalhost && u.Scheme == Uri.UriSchemeHttp))
            throw new ArgumentException($"{field} must use https.");

        var onFamily = isLocalhost || u.Host == "keshavsingh.in"
            || u.Host.EndsWith(".keshavsingh.in", StringComparison.OrdinalIgnoreCase);
        if (!onFamily) throw new ArgumentException($"{field} must be a keshavsingh.in address.");

        return u.GetLeftPart(UriPartial.Path).TrimEnd('/');
    }
}
