using Admin.Api.Models;
using Admin.Api.Services;
using KeshavSingh.Auth.Abstractions;
using MongoDB.Driver;

namespace Admin.Api.Auth;

/// <summary>Backs the auth engine's refresh-token store with this app's Mongo collection.</summary>
public sealed class MongoRefreshTokenStore : IRefreshTokenStore
{
    private readonly IMongoCollection<RefreshToken> _tokens;
    private readonly SettingsService _settings;

    public MongoRefreshTokenStore(MongoDbService db, SettingsService settings)
    {
        _tokens = db.GetCollection<RefreshToken>("refresh_tokens");
        _settings = settings;
    }

    public async Task AddAsync(RefreshTokenRecord token, CancellationToken ct = default)
    {
        if (_settings.EnforceSingleSessionPerUser)
        {
            await _tokens.UpdateManyAsync(
                r => r.UserId == token.UserId && r.RevokedAt == null,
                Builders<RefreshToken>.Update.Set(r => r.RevokedAt, DateTime.UtcNow),
                cancellationToken: ct);
        }

        await _tokens.InsertOneAsync(new RefreshToken
        {
            UserId = token.UserId,
            TokenHash = token.TokenHash,
            ExpiresAt = token.ExpiresAt,
        }, cancellationToken: ct);
    }

    public async Task<RefreshTokenRecord?> FindByHashAsync(string tokenHash, CancellationToken ct = default)
    {
        var r = await _tokens.Find(x => x.TokenHash == tokenHash).FirstOrDefaultAsync(ct);
        return r is null ? null : new RefreshTokenRecord
        {
            Id = r.Id,
            UserId = r.UserId,
            TokenHash = r.TokenHash,
            ExpiresAt = r.ExpiresAt,
            CreatedAt = r.CreatedAt,
            RevokedAt = r.RevokedAt,
        };
    }

    public Task RevokeAsync(RefreshTokenRecord token, CancellationToken ct = default) =>
        _tokens.UpdateOneAsync(r => r.Id == token.Id,
            Builders<RefreshToken>.Update.Set(r => r.RevokedAt, DateTime.UtcNow), cancellationToken: ct);

    public Task RevokeByHashAsync(string tokenHash, CancellationToken ct = default) =>
        _tokens.UpdateManyAsync(r => r.TokenHash == tokenHash && r.RevokedAt == null,
            Builders<RefreshToken>.Update.Set(r => r.RevokedAt, DateTime.UtcNow), cancellationToken: ct);

    public Task RevokeAllForUserAsync(string userId, CancellationToken ct = default) =>
        _tokens.UpdateManyAsync(r => r.UserId == userId && r.RevokedAt == null,
            Builders<RefreshToken>.Update.Set(r => r.RevokedAt, DateTime.UtcNow), cancellationToken: ct);
}
