using System.Security.Cryptography;
using System.Text;
using Admin.Api.Dtos;
using Admin.Api.Models;
using MongoDB.Driver;

namespace Admin.Api.Services;

public sealed class WebsiteVisitService
{
    private readonly IMongoCollection<WebsiteVisit> _visits;
    private readonly SettingsService _settings;

    public WebsiteVisitService(MongoDbService db, SettingsService settings)
    {
        _visits = db.GetCollection<WebsiteVisit>("website_visits");
        _settings = settings;
    }

    public async Task EnsureIndexesAsync(CancellationToken ct = default)
    {
        await _visits.Indexes.CreateManyAsync(new[]
        {
            new CreateIndexModel<WebsiteVisit>(Builders<WebsiteVisit>.IndexKeys.Ascending(x => x.WebsiteKey).Descending(x => x.Timestamp)),
            new CreateIndexModel<WebsiteVisit>(Builders<WebsiteVisit>.IndexKeys.Descending(x => x.Timestamp)),
        }, ct);
    }

    public async Task TrackAsync(string websiteKey, string? path, string? referrer, string country, string visitorKey, CancellationToken ct = default)
    {
        var visit = new WebsiteVisit
        {
            WebsiteKey = websiteKey,
            Path = NormalizePath(path),
            Country = string.IsNullOrWhiteSpace(country) ? "Unknown" : country.Trim().ToUpperInvariant(),
            Referrer = string.IsNullOrWhiteSpace(referrer) ? null : referrer.Trim(),
            VisitorKey = visitorKey,
            Timestamp = DateTime.UtcNow,
        };

        await _visits.InsertOneAsync(visit, cancellationToken: ct);
    }

    public async Task<(long visits, long uniqueVisitors)> GetVisitCountsAsync(string websiteKey, DateTime since, CancellationToken ct)
    {
        var filter = Builders<WebsiteVisit>.Filter.And(
            Builders<WebsiteVisit>.Filter.Eq(x => x.WebsiteKey, websiteKey),
            Builders<WebsiteVisit>.Filter.Gte(x => x.Timestamp, since));

        var visits = await _visits.CountDocumentsAsync(filter, cancellationToken: ct);
        var uniqueVisitors = await _visits.Distinct<string>(nameof(WebsiteVisit.VisitorKey), filter).ToListAsync(ct);
        return (visits, uniqueVisitors.LongCount());
    }

    public async Task<WebsiteDetailsDto> BuildDetailsAsync(string websiteKey, DateTime since, CancellationToken ct)
    {
        var filter = Builders<WebsiteVisit>.Filter.And(
            Builders<WebsiteVisit>.Filter.Eq(x => x.WebsiteKey, websiteKey),
            Builders<WebsiteVisit>.Filter.Gte(x => x.Timestamp, since));

        var recent = await _visits.Find(filter)
            .SortByDescending(x => x.Timestamp)
            .Limit(20)
            .ToListAsync(ct);

        var topCountries = await _visits.Aggregate()
            .Match(filter)
            .Group(x => x.Country, g => new CountryMetricDto(g.Key, g.Count()))
            .SortByDescending(x => x.Visits)
            .Limit(8)
            .ToListAsync(ct);

        var topPages = await _visits.Aggregate()
            .Match(filter)
            .Group(x => x.Path, g => new PageMetricDto(g.Key, g.Count()))
            .SortByDescending(x => x.Visits)
            .Limit(8)
            .ToListAsync(ct);

        return new WebsiteDetailsDto(
            topCountries,
            topPages,
            recent.Select(x => new VisitDetailDto(x.Path, x.Country, x.Referrer, x.Timestamp, x.VisitorKey)).ToList());
    }

    public async Task<long> CleanupOldAsync(CancellationToken ct = default)
    {
        var cutoff = DateTime.UtcNow.AddDays(-_settings.AnalyticsRetentionDays);
        var result = await _visits.DeleteManyAsync(x => x.Timestamp < cutoff, ct);
        return result.DeletedCount;
    }

    public static string BuildVisitorKey(string? ip, string? userAgent)
    {
        var source = $"{ip ?? ""}|{userAgent ?? ""}";
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(source));
        return Convert.ToHexString(bytes)[..16];
    }

    private static string NormalizePath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path)) return "/";
        var cleaned = path.Trim();
        if (!cleaned.StartsWith('/')) cleaned = "/" + cleaned;
        return cleaned.Length > 200 ? cleaned[..200] : cleaned;
    }
}
