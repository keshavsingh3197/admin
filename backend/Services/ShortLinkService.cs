using Admin.Api.Models;
using MongoDB.Driver;
using System.Security.Cryptography;

namespace Admin.Api.Services;

/// <summary>
/// Short links: a random (or caller-chosen) code that 302s to a full target URL — see
/// <see cref="Controllers.ShortLinkRedirectController"/> for the public /s/{code} endpoint.
/// </summary>
public sealed class ShortLinkService
{
    // No 0/O/1/l/I — avoids characters that look alike when a code is read aloud or hand-typed.
    private const string CodeAlphabet = "23456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
    private const int CodeLength = 7;
    private const int MaxCodeGenerationAttempts = 5;

    private readonly IMongoCollection<ShortLink> _links;

    public ShortLinkService(MongoDbService db)
    {
        _links = db.GetCollection<ShortLink>("short_links");
    }

    public async Task EnsureIndexesAsync(CancellationToken ct = default)
    {
        await _links.Indexes.CreateOneAsync(new CreateIndexModel<ShortLink>(
            Builders<ShortLink>.IndexKeys.Ascending(x => x.Code),
            new CreateIndexOptions { Unique = true }),
            cancellationToken: ct);
    }

    public async Task<List<ShortLink>> GetAllAsync(CancellationToken ct = default) =>
        await _links.Find(_ => true).SortByDescending(x => x.CreatedAt).ToListAsync(ct);

    public async Task<ShortLink?> GetByIdAsync(string id, CancellationToken ct = default) =>
        await _links.Find(x => x.Id == id).FirstOrDefaultAsync(ct);

    private async Task<ShortLink?> GetByCodeAsync(string code, CancellationToken ct = default) =>
        await _links.Find(x => x.Code == code).FirstOrDefaultAsync(ct);

    /// <summary>Only absolute http/https URLs are accepted — blocks javascript:/data: and similar
    /// schemes an open redirect could otherwise be abused with.</summary>
    public static bool IsValidTargetUrl(string url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var parsed)
        && (parsed.Scheme == Uri.UriSchemeHttp || parsed.Scheme == Uri.UriSchemeHttps);

    /// <exception cref="InvalidOperationException">The requested custom code is already taken, or no
    /// unique code could be generated.</exception>
    public async Task<ShortLink> CreateAsync(
        string targetUrl, string? customCode, DateTime? expiresAt, CancellationToken ct = default)
    {
        var link = new ShortLink { TargetUrl = targetUrl, ExpiresAt = expiresAt, CreatedAt = DateTime.UtcNow };

        if (!string.IsNullOrWhiteSpace(customCode))
        {
            link.Code = customCode;
            try
            {
                await _links.InsertOneAsync(link, cancellationToken: ct);
                return link;
            }
            catch (MongoWriteException e) when (e.WriteError?.Category == ServerErrorCategory.DuplicateKey)
            {
                throw new InvalidOperationException("That code is already taken.");
            }
        }

        for (var attempt = 0; attempt < MaxCodeGenerationAttempts; attempt++)
        {
            link.Code = GenerateCode();
            try
            {
                await _links.InsertOneAsync(link, cancellationToken: ct);
                return link;
            }
            catch (MongoWriteException e) when (e.WriteError?.Category == ServerErrorCategory.DuplicateKey)
            {
                // Collision on the unique index — vanishingly rare at this alphabet/length. Just retry.
            }
        }

        throw new InvalidOperationException("Could not generate a unique short code. Please try again.");
    }

    public async Task<bool> UpdateAsync(string id, string targetUrl, DateTime? expiresAt, CancellationToken ct = default)
    {
        var update = Builders<ShortLink>.Update
            .Set(x => x.TargetUrl, targetUrl)
            .Set(x => x.ExpiresAt, expiresAt);
        var result = await _links.UpdateOneAsync(x => x.Id == id, update, cancellationToken: ct);
        return result.IsAcknowledged && result.MatchedCount > 0;
    }

    public async Task<bool> DeleteAsync(string id, CancellationToken ct = default)
    {
        var result = await _links.DeleteOneAsync(x => x.Id == id, ct);
        return result.IsAcknowledged && result.DeletedCount > 0;
    }

    /// <summary>Resolves a code to its target for the redirect and records the hit, or null if the code
    /// is unknown or has expired.</summary>
    public async Task<string?> ResolveAndRecordHitAsync(string code, CancellationToken ct = default)
    {
        var link = await GetByCodeAsync(code, ct);
        if (link is null) return null;
        if (link.ExpiresAt is { } expiry && expiry <= DateTime.UtcNow) return null;

        var update = Builders<ShortLink>.Update
            .Inc(x => x.Clicks, 1)
            .Set(x => x.LastAccessedAt, DateTime.UtcNow);
        await _links.UpdateOneAsync(x => x.Id == link.Id, update, cancellationToken: ct);
        return link.TargetUrl;
    }

    private static string GenerateCode()
    {
        Span<char> buffer = stackalloc char[CodeLength];
        for (var i = 0; i < CodeLength; i++)
            buffer[i] = CodeAlphabet[RandomNumberGenerator.GetInt32(CodeAlphabet.Length)];
        return new string(buffer);
    }
}
