using Admin.Api.Dtos;
using Admin.Api.Models;
using MongoDB.Driver;

namespace Admin.Api.Services;

/// <summary>
/// JSON content blocks served to the public sites, one row per site + key + locale. A public read
/// resolves the requested language through the locale's fallback chain, so a page never renders empty
/// just because one block hasn't been translated yet.
/// </summary>
public sealed class WebsiteContentService
{
    private const string LocaleIndexName = "site_content_locale_unique";

    private readonly IMongoCollection<WebsiteContent> _content;
    private readonly LocaleService _locales;

    public WebsiteContentService(MongoDbService db, LocaleService locales)
    {
        _content = db.GetCollection<WebsiteContent>("website_content");
        _locales = locales;
    }

    public async Task EnsureIndexesAsync(CancellationToken ct = default)
    {
        // Rows predate the locale column: give them the default language before the unique index that
        // includes it goes on, otherwise two untagged rows would collide on an empty locale.
        await _content.UpdateManyAsync(
            Builders<WebsiteContent>.Filter.Or(
                Builders<WebsiteContent>.Filter.Exists(x => x.Locale, false),
                Builders<WebsiteContent>.Filter.Eq(x => x.Locale, string.Empty)),
            Builders<WebsiteContent>.Update.Set(x => x.Locale, _locales.DefaultCode),
            cancellationToken: ct);

        // The old index was unique on (SiteKey, ContentKey) — that would now forbid a translation.
        try { await _content.Indexes.DropOneAsync("SiteKey_1_ContentKey_1", ct); }
        catch (MongoCommandException) { /* Already gone, or never existed on this database. */ }

        await _content.Indexes.CreateOneAsync(
            new CreateIndexModel<WebsiteContent>(
                Builders<WebsiteContent>.IndexKeys
                    .Ascending(x => x.SiteKey)
                    .Ascending(x => x.ContentKey)
                    .Ascending(x => x.Locale),
                new CreateIndexOptions { Unique = true, Name = LocaleIndexName }),
            cancellationToken: ct);
    }

    public async Task<IReadOnlyList<WebsiteContentView>> ListAsync(string? siteKey, string? locale,
        CancellationToken ct = default)
    {
        var filters = new List<FilterDefinition<WebsiteContent>>();
        if (!string.IsNullOrWhiteSpace(siteKey))
            filters.Add(Builders<WebsiteContent>.Filter.Eq(x => x.SiteKey, NormalizeKey(siteKey, nameof(siteKey))));
        if (!string.IsNullOrWhiteSpace(locale))
            filters.Add(Builders<WebsiteContent>.Filter.Eq(x => x.Locale, LocaleService.NormalizeCode(locale)));

        var filter = filters.Count == 0
            ? Builders<WebsiteContent>.Filter.Empty
            : Builders<WebsiteContent>.Filter.And(filters);

        var list = await _content.Find(filter)
            .SortBy(x => x.SiteKey)
            .ThenBy(x => x.ContentKey)
            .ThenBy(x => x.Locale)
            .ToListAsync(ct);

        return list.Select(Map).ToList();
    }

    public async Task<WebsiteContentView> UpsertAsync(UpsertWebsiteContentRequest request, CancellationToken ct = default)
    {
        var siteKey = NormalizeKey(request.SiteKey, nameof(request.SiteKey));
        var contentKey = NormalizeKey(request.ContentKey, nameof(request.ContentKey));
        var locale = ResolveWritableLocale(request.Locale);
        var payload = NormalizePayload(request.PayloadJson);
        var now = DateTime.UtcNow;

        var existing = await _content
            .Find(x => x.SiteKey == siteKey && x.ContentKey == contentKey && x.Locale == locale)
            .FirstOrDefaultAsync(ct);

        if (existing is null)
        {
            var created = new WebsiteContent
            {
                SiteKey = siteKey,
                ContentKey = contentKey,
                Locale = locale,
                PayloadJson = payload,
                IsPublished = request.IsPublished,
                Version = 1,
                CreatedAt = now,
                UpdatedAt = now,
            };
            await _content.InsertOneAsync(created, cancellationToken: ct);
            return Map(created);
        }

        var update = Builders<WebsiteContent>.Update
            .Set(x => x.PayloadJson, payload)
            .Set(x => x.IsPublished, request.IsPublished)
            .Set(x => x.UpdatedAt, now)
            .Set(x => x.Version, existing.Version + 1);

        var saved = await _content.FindOneAndUpdateAsync(
            x => x.Id == existing.Id,
            update,
            new FindOneAndUpdateOptions<WebsiteContent> { ReturnDocument = ReturnDocument.After },
            ct);

        return Map(saved ?? existing);
    }

    public Task DeleteAsync(string id, CancellationToken ct = default) =>
        _content.DeleteOneAsync(x => x.Id == id, ct);

    /// <summary>
    /// Resolves a published block for the requested language, walking the locale's fallback chain
    /// (e.g. <c>hi</c> → <c>en</c>) so a partially translated site still renders. Returns null only
    /// when no language has a published row for this key.
    /// </summary>
    public async Task<PublicWebsiteContentView?> GetPublicAsync(string siteKey, string contentKey,
        string? requestedLocale, CancellationToken ct = default)
    {
        var site = NormalizeKey(siteKey, nameof(siteKey));
        var key = NormalizeKey(contentKey, nameof(contentKey));
        var requested = _locales.Resolve(requestedLocale);
        var chain = _locales.FallbackChain(requested);

        // One query for every candidate language, then pick by chain order — avoids a round trip per
        // fallback step.
        var candidates = await _content
            .Find(Builders<WebsiteContent>.Filter.And(
                Builders<WebsiteContent>.Filter.Eq(x => x.SiteKey, site),
                Builders<WebsiteContent>.Filter.Eq(x => x.ContentKey, key),
                Builders<WebsiteContent>.Filter.Eq(x => x.IsPublished, true),
                Builders<WebsiteContent>.Filter.In(x => x.Locale, chain)))
            .ToListAsync(ct);

        if (candidates.Count == 0) return null;

        foreach (var code in chain)
        {
            var match = candidates.FirstOrDefault(c => c.Locale.Equals(code, StringComparison.OrdinalIgnoreCase));
            if (match is not null)
                return new PublicWebsiteContentView(match.SiteKey, match.ContentKey, match.Locale, requested,
                    match.PayloadJson, match.Version, match.UpdatedAt);
        }

        return null;
    }

    private static WebsiteContentView Map(WebsiteContent x) =>
        new(x.Id, x.SiteKey, x.ContentKey, x.Locale, x.PayloadJson, x.IsPublished, x.Version, x.UpdatedAt);

    /// <summary>
    /// Content may be authored for any REGISTERED locale, including a disabled one (so a translation
    /// can be prepared before the language goes live). An unregistered code is rejected.
    /// </summary>
    private string ResolveWritableLocale(string? requested)
    {
        if (string.IsNullOrWhiteSpace(requested)) return _locales.DefaultCode;
        var code = LocaleService.NormalizeCode(requested);
        if (_locales.Find(code) is null) throw new ArgumentException($"Locale '{code}' is not registered.");
        return code;
    }

    private static string NormalizePayload(string payload)
    {
        if (string.IsNullOrWhiteSpace(payload)) throw new ArgumentException("PayloadJson cannot be empty.");
        try
        {
            _ = System.Text.Json.JsonDocument.Parse(payload);
            return payload;
        }
        catch (Exception)
        {
            throw new ArgumentException("PayloadJson must be valid JSON.");
        }
    }

    private static string NormalizeKey(string value, string field)
    {
        var trimmed = value.Trim().ToLowerInvariant();
        if (trimmed.Length < 2 || trimmed.Length > 64)
            throw new ArgumentException($"{field} must be 2-64 chars.");

        foreach (var ch in trimmed)
        {
            if (!char.IsLetterOrDigit(ch) && ch != '-' && ch != '_')
                throw new ArgumentException($"{field} can contain only a-z, 0-9, '-' and '_'.");
        }

        return trimmed;
    }
}
