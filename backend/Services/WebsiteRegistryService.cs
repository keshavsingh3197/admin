using Admin.Api.Dtos;
using Admin.Api.Models;
using MongoDB.Driver;

namespace Admin.Api.Services;

public sealed class WebsiteRegistryService
{
    private readonly IMongoCollection<WebsiteLink> _websites;

    public WebsiteRegistryService(MongoDbService db)
    {
        _websites = db.GetCollection<WebsiteLink>("websites");
    }

    public async Task EnsureIndexesAsync(CancellationToken ct = default)
    {
        await _websites.Indexes.CreateOneAsync(new CreateIndexModel<WebsiteLink>(
            Builders<WebsiteLink>.IndexKeys.Ascending(x => x.Key),
            new CreateIndexOptions { Unique = true }),
            cancellationToken: ct);
    }

    public async Task SeedDefaultsAsync(string blogUrl, string blogAdminUrl, CancellationToken ct = default)
    {
        if (await _websites.Find(FilterDefinition<WebsiteLink>.Empty).AnyAsync(ct)) return;

        var defaults = new List<WebsiteLink>
        {
            new()
            {
                Key = "blog",
                Name = "Blog",
                Url = NormalizeUrl(blogUrl, nameof(blogUrl)),
                SortOrder = 10,
                IsEnabled = true,
            },
            new()
            {
                Key = "blog-admin",
                Name = "Blog Admin",
                Url = NormalizeUrl(blogAdminUrl, nameof(blogAdminUrl)),
                SortOrder = 20,
                IsEnabled = true,
            }
        };

        await _websites.InsertManyAsync(defaults, cancellationToken: ct);
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
        var entity = new WebsiteLink
        {
            Key = NormalizeKey(request.Key),
            Name = request.Name.Trim(),
            Url = NormalizeUrl(request.Url, nameof(request.Url)),
            IsEnabled = request.IsEnabled,
            SortOrder = request.SortOrder,
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

        var update = Builders<WebsiteLink>.Update
            .Set(x => x.Key, key)
            .Set(x => x.Name, request.Name.Trim())
            .Set(x => x.Url, NormalizeUrl(request.Url, nameof(request.Url)))
            .Set(x => x.IsEnabled, request.IsEnabled)
            .Set(x => x.SortOrder, request.SortOrder)
            .Set(x => x.UpdatedAt, now);

        var updated = await _websites.FindOneAndUpdateAsync(x => x.Id == id, update,
            new FindOneAndUpdateOptions<WebsiteLink> { ReturnDocument = ReturnDocument.After }, ct);

        return updated is null ? null : Map(updated);
    }

    public Task DeleteAsync(string id, CancellationToken ct = default) =>
        _websites.DeleteOneAsync(x => x.Id == id, ct);

    public async Task<IReadOnlyList<WebsiteLink>> ListEnabledAsync(CancellationToken ct = default)
        => await _websites.Find(x => x.IsEnabled).SortBy(x => x.SortOrder).ThenBy(x => x.Name).ToListAsync(ct);

    private static WebsiteLinkView Map(WebsiteLink x) =>
        new(x.Id, x.Key, x.Name, x.Url, x.IsEnabled, x.SortOrder, x.UpdatedAt);

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
