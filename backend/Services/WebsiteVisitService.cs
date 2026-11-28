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

    public async Task<EcosystemOverviewDto> GetEcosystemOverviewAsync(
        IReadOnlyList<WebsiteOptionDto> websites,
        CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var since7d = now.Date.AddDays(-6);
        var since24h = now.AddHours(-24);

        var visits7d = await _visits
            .Find(Builders<WebsiteVisit>.Filter.Gte(x => x.Timestamp, since7d))
            .ToListAsync(ct);

        var visits24h = visits7d.Where(x => x.Timestamp >= since24h).ToList();

        var total24h = visits24h.LongCount();
        var unique24h = visits24h.Select(x => x.VisitorKey).Distinct(StringComparer.Ordinal).LongCount();
        var total7d = visits7d.LongCount();
        var unique7d = visits7d.Select(x => x.VisitorKey).Distinct(StringComparer.Ordinal).LongCount();

        var bySite7d = visits7d.GroupBy(x => x.WebsiteKey, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);
        var bySite24h = visits24h.GroupBy(x => x.WebsiteKey, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);

        var knownKeys = new HashSet<string>(websites.Select(w => w.Key), StringComparer.OrdinalIgnoreCase);
        var allSiteEntries = websites.ToList();
        foreach (var key in bySite7d.Keys)
        {
            if (!knownKeys.Contains(key))
                allSiteEntries.Add(new WebsiteOptionDto(key, key, ""));
        }

        var siteRanks = allSiteEntries
            .Select(site =>
            {
                bySite24h.TryGetValue(site.Key, out var list24);
                bySite7d.TryGetValue(site.Key, out var list7);
                list24 ??= new List<WebsiteVisit>();
                list7 ??= new List<WebsiteVisit>();
                return new WebsiteTrafficRankDto(
                    site.Key,
                    site.Name,
                    site.Url,
                    list24.LongCount(),
                    list24.Select(v => v.VisitorKey).Distinct(StringComparer.Ordinal).LongCount(),
                    list7.LongCount(),
                    list7.Select(v => v.VisitorKey).Distinct(StringComparer.Ordinal).LongCount());
            })
            .OrderByDescending(x => x.Visits7d)
            .ThenByDescending(x => x.Visits24h)
            .ThenBy(x => x.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var topSite = siteRanks.FirstOrDefault(x => x.Visits7d > 0) ?? siteRanks.FirstOrDefault();

        var topPages = visits7d
            .GroupBy(x => (Key: x.WebsiteKey.ToLowerInvariant(), Path: x.Path))
            .Select(g => new EcosystemPageMetricDto(g.Key.Key, g.Key.Path, g.LongCount()))
            .OrderByDescending(x => x.Visits)
            .Take(15)
            .ToList();

        var topCountries = visits7d
            .GroupBy(x => x.Country)
            .Select(g => new CountryMetricDto(g.Key, g.LongCount()))
            .OrderByDescending(x => x.Visits)
            .Take(10)
            .ToList();

        var dailyTrend = Enumerable.Range(0, 7)
            .Select(offset =>
            {
                var day = since7d.AddDays(offset);
                var dayVisits = visits7d.Where(x => x.Timestamp.Date == day).ToList();
                return new DailyTrafficPointDto(
                    day.ToString("yyyy-MM-dd"),
                    dayVisits.LongCount(),
                    dayVisits.Select(v => v.VisitorKey).Distinct(StringComparer.Ordinal).LongCount());
            })
            .ToList();

        return new EcosystemOverviewDto(
            total24h,
            unique24h,
            total7d,
            unique7d,
            topSite?.WebsiteKey,
            topSite?.Name,
            siteRanks,
            topPages,
            topCountries,
            dailyTrend,
            now);
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
