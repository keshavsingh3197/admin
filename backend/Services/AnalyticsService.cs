using Admin.Api.Dtos;
using Admin.Api.Models;
using MongoDB.Driver;

namespace Admin.Api.Services;

public sealed class AnalyticsService
{
    private readonly SettingsService _settings;
    private readonly WebsiteRegistryService _websites;
    private readonly WebsiteVisitService _visits;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IMongoCollection<User> _users;
    private readonly IMongoCollection<RefreshToken> _refreshTokens;
    private readonly IMongoCollection<Note> _notes;
    private readonly IMongoCollection<LoginAudit> _audit;

    public AnalyticsService(
        SettingsService settings,
        WebsiteRegistryService websites,
        WebsiteVisitService visits,
        MongoDbService db,
        IHttpClientFactory httpClientFactory)
    {
        _settings = settings;
        _websites = websites;
        _visits = visits;
        _httpClientFactory = httpClientFactory;
        _users = db.GetCollection<User>("users");
        _refreshTokens = db.GetCollection<RefreshToken>("refresh_tokens");
        _notes = db.GetCollection<Note>("notes");
        _audit = db.GetCollection<LoginAudit>("audit");
    }

    public async Task<IReadOnlyList<WebsiteOptionDto>> GetWebsitesAsync(string adminBaseUrl, CancellationToken ct)
    {
        var config = _settings.ToPublicConfig();
        var websites = new List<WebsiteOptionDto>
        {
            new("admin", string.IsNullOrWhiteSpace(config.SiteTitle) ? "Admin" : config.SiteTitle, adminBaseUrl.TrimEnd('/')),
        };

        var configured = await _websites.ListEnabledAsync(ct);
        websites.AddRange(configured.Select(x => new WebsiteOptionDto(x.Key, x.Name, x.Url)));

        return websites
            .GroupBy(x => x.Key, StringComparer.OrdinalIgnoreCase)
            .Select(g => g.First())
            .ToList();
    }

    public async Task<WebsiteDashboardDto?> GetDashboardAsync(string websiteKey, string adminBaseUrl, CancellationToken ct)
    {
        var websites = await GetWebsitesAsync(adminBaseUrl, ct);
        var website = websites.FirstOrDefault(x => x.Key.Equals(websiteKey, StringComparison.OrdinalIgnoreCase));
        if (website is null) return null;

        var status = await CheckWebsiteAsync(website.Url, ct);
        var metrics = await BuildMetricsAsync(website.Key, ct);
        var details = await BuildDetailsAsync(website.Key, ct);
        return new WebsiteDashboardDto(website, status, metrics, details);
    }

    private async Task<WebsiteMetricsDto> BuildMetricsAsync(string websiteKey, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var last24h = now.AddHours(-24);

        var totalUsers = await _users.CountDocumentsAsync(u => !u.IsDeleted, cancellationToken: ct);
        var activeUsers = await _users.CountDocumentsAsync(u => !u.IsDeleted && u.IsActive, cancellationToken: ct);
        var activeSessions = await _refreshTokens.CountDocumentsAsync(r => r.RevokedAt == null && r.ExpiresAt > now, cancellationToken: ct);
        var totalNotes = await _notes.CountDocumentsAsync(_ => true, cancellationToken: ct);
        var successLogins = await _audit.CountDocumentsAsync(a => a.Success && a.Timestamp >= last24h, cancellationToken: ct);
        var failedLogins = await _audit.CountDocumentsAsync(a => !a.Success && a.Timestamp >= last24h, cancellationToken: ct);
        var (visits, uniqueVisitors) = await _visits.GetVisitCountsAsync(websiteKey, last24h, ct);

        return new WebsiteMetricsDto(
            totalUsers,
            activeUsers,
            activeSessions,
            totalNotes,
            successLogins,
            failedLogins,
            visits,
            uniqueVisitors);
    }

    private Task<WebsiteDetailsDto> BuildDetailsAsync(string websiteKey, CancellationToken ct)
    {
        var last24h = DateTime.UtcNow.AddHours(-24);
        return _visits.BuildDetailsAsync(websiteKey, last24h, ct);
    }

    private async Task<WebsiteStatusDto> CheckWebsiteAsync(string url, CancellationToken ct)
    {
        var checkedAt = DateTime.UtcNow;
        try
        {
            var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(6);

            var started = DateTime.UtcNow;
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            var duration = (long)Math.Max(0, (DateTime.UtcNow - started).TotalMilliseconds);

            return new WebsiteStatusDto(
                IsReachable: response.IsSuccessStatusCode,
                StatusCode: (int)response.StatusCode,
                ResponseMs: duration,
                CheckedAtUtc: checkedAt
            );
        }
        catch
        {
            return new WebsiteStatusDto(
                IsReachable: false,
                StatusCode: null,
                ResponseMs: null,
                CheckedAtUtc: checkedAt
            );
        }
    }
}
