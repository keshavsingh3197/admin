using Admin.Api.Dtos;
using Admin.Api.Models;
using MongoDB.Driver;

namespace Admin.Api.Services;

public sealed class WebsiteContentService
{
    private readonly IMongoCollection<WebsiteContent> _content;

    public WebsiteContentService(MongoDbService db)
    {
        _content = db.GetCollection<WebsiteContent>("website_content");
    }

    public async Task EnsureIndexesAsync(CancellationToken ct = default)
    {
        await _content.Indexes.CreateOneAsync(
            new CreateIndexModel<WebsiteContent>(
                Builders<WebsiteContent>.IndexKeys
                    .Ascending(x => x.SiteKey)
                    .Ascending(x => x.ContentKey),
                new CreateIndexOptions { Unique = true }),
            cancellationToken: ct);
    }

    public async Task<IReadOnlyList<WebsiteContentView>> ListAsync(string? siteKey, CancellationToken ct = default)
    {
        var filter = string.IsNullOrWhiteSpace(siteKey)
            ? Builders<WebsiteContent>.Filter.Empty
            : Builders<WebsiteContent>.Filter.Eq(x => x.SiteKey, NormalizeKey(siteKey, nameof(siteKey)));

        var list = await _content.Find(filter)
            .SortBy(x => x.SiteKey)
            .ThenBy(x => x.ContentKey)
            .ToListAsync(ct);

        return list.Select(Map).ToList();
    }

    public async Task<WebsiteContentView> UpsertAsync(UpsertWebsiteContentRequest request, CancellationToken ct = default)
    {
        var siteKey = NormalizeKey(request.SiteKey, nameof(request.SiteKey));
        var contentKey = NormalizeKey(request.ContentKey, nameof(request.ContentKey));
        var payload = NormalizePayload(request.PayloadJson);
        var now = DateTime.UtcNow;

        var existing = await _content.Find(x => x.SiteKey == siteKey && x.ContentKey == contentKey)
            .FirstOrDefaultAsync(ct);

        if (existing is null)
        {
            var created = new WebsiteContent
            {
                SiteKey = siteKey,
                ContentKey = contentKey,
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

    public async Task<PublicWebsiteContentView?> GetPublicAsync(string siteKey, string contentKey, CancellationToken ct = default)
    {
        var site = NormalizeKey(siteKey, nameof(siteKey));
        var key = NormalizeKey(contentKey, nameof(contentKey));

        var item = await _content.Find(x => x.SiteKey == site && x.ContentKey == key && x.IsPublished)
            .FirstOrDefaultAsync(ct);

        return item is null
            ? null
            : new PublicWebsiteContentView(item.SiteKey, item.ContentKey, item.PayloadJson, item.Version, item.UpdatedAt);
    }

    private static WebsiteContentView Map(WebsiteContent x) =>
        new(x.Id, x.SiteKey, x.ContentKey, x.PayloadJson, x.IsPublished, x.Version, x.UpdatedAt);

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
