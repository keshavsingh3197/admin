using Admin.Api.Models;
using MongoDB.Driver;

namespace Admin.Api.Services;

public sealed class SessionRetentionService
{
    private readonly IMongoCollection<RefreshToken> _tokens;
    private readonly SettingsService _settings;

    public SessionRetentionService(MongoDbService db, SettingsService settings)
    {
        _tokens = db.GetCollection<RefreshToken>("refresh_tokens");
        _settings = settings;
    }

    public async Task<long> CleanupAsync(CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var cutoff = now.AddDays(-_settings.RefreshTokenRetentionDays);

        var filter = Builders<RefreshToken>.Filter.Or(
            Builders<RefreshToken>.Filter.And(
                Builders<RefreshToken>.Filter.Ne(x => x.RevokedAt, null),
                Builders<RefreshToken>.Filter.Lt(x => x.RevokedAt, cutoff)
            ),
            Builders<RefreshToken>.Filter.And(
                Builders<RefreshToken>.Filter.Eq(x => x.RevokedAt, null),
                Builders<RefreshToken>.Filter.Lt(x => x.ExpiresAt, cutoff)
            ));

        var result = await _tokens.DeleteManyAsync(filter, ct);
        return result.DeletedCount;
    }
}
