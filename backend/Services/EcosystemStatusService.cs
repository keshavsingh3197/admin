using System.Diagnostics;
using Microsoft.Extensions.Caching.Memory;

namespace Admin.Api.Services;

public sealed record ServiceStatusItemDto(
    string Key,
    string Name,
    string Category,
    string Url,
    string ProbeUrl,
    string Status,
    int? HttpStatus,
    long? LatencyMs,
    string? Note
);

public sealed record EcosystemStatusReportDto(
    string OverallStatus,
    int HealthyCount,
    int DegradedCount,
    int DownCount,
    int TotalCount,
    DateTime CheckedAtUtc,
    IReadOnlyList<ServiceStatusItemDto> Services
);

/// <summary>
/// Probes all public frontend websites and Cloud Run backend APIs concurrently with a 60-second
/// cache so public status pages stay fast without causing unnecessary Cloud Run traffic.
/// </summary>
public sealed class EcosystemStatusService
{
    private const string CacheKey = "ecosystem_public_status_v1";

    private sealed record ProbeTarget(
        string Key,
        string Name,
        string Category,
        string DisplayUrl,
        string ProbeUrl,
        bool AcceptNotFound = false);

    private static readonly IReadOnlyList<ProbeTarget> Targets =
    [
        // Backends (Google Cloud Run)
        new("admin-api", "Identity & Admin API", "backend", "https://id.keshavsingh.in", "https://id.keshavsingh.in/health"),
        new("panchang-api", "Hindu Panchang API", "backend", "https://panchang-api.keshavsingh.in", "https://panchang-api.keshavsingh.in/api/panchang/config"),
        new("pratiyogita-api", "Pratiyogita API", "backend", "https://pratiyogita-api.keshavsingh.in", "https://pratiyogita-api.keshavsingh.in/health"),
        new("ghar-api", "Ghar Ledger API", "backend", "https://ghar-api.keshavsingh.in", "https://ghar-api.keshavsingh.in/health"),
        new("social-api", "Social Analytics API", "backend", "https://social-api.keshavsingh.in", "https://social-api.keshavsingh.in/health"),
        new("blog-api", "Content Blog API", "backend", "https://blog-api.keshavsingh.in", "https://blog-api.keshavsingh.in/health"),
        new("emitra-api", "eMitra Customer API", "backend", "https://emitra-api.keshavsingh.in", "https://emitra-api.keshavsingh.in/", AcceptNotFound: true),
        new("bill-api", "Bill Generator API", "backend", "https://bill-api.keshavsingh.in", "https://bill-api.keshavsingh.in/", AcceptNotFound: true),

        // Frontends (GitHub Pages / Static Hosting)
        new("keshav-hub", "Keshav Hub (Main Portal)", "frontend", "https://keshavsingh.in", "https://keshavsingh.in/"),
        new("admin-web", "Admin & SSO Console", "frontend", "https://admin.keshavsingh.in", "https://admin.keshavsingh.in/"),
        new("panchang-web", "Hindu Panchang Web", "frontend", "https://panchang.keshavsingh.in", "https://panchang.keshavsingh.in/"),
        new("pratiyogita-web", "Pratiyogita Web", "frontend", "https://pratiyogita.keshavsingh.in", "https://pratiyogita.keshavsingh.in/"),
        new("ghar-web", "Ghar Ledger Web", "frontend", "https://ghar.keshavsingh.in", "https://ghar.keshavsingh.in/"),
        new("social-web", "SocialPulse Analytics Web", "frontend", "https://social.keshavsingh.in", "https://social.keshavsingh.in/"),
        new("blog-web", "Engineering Blog Web", "frontend", "https://blog.keshavsingh.in", "https://blog.keshavsingh.in/")
    ];

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IMemoryCache _cache;

    public EcosystemStatusService(IHttpClientFactory httpClientFactory, IMemoryCache cache)
    {
        _httpClientFactory = httpClientFactory;
        _cache = cache;
    }

    public async Task<EcosystemStatusReportDto> GetStatusAsync(bool forceRefresh, CancellationToken ct)
    {
        if (!forceRefresh && _cache.TryGetValue(CacheKey, out EcosystemStatusReportDto? cached) && cached is not null)
            return cached;

        var tasks = Targets.Select(t => ProbeAsync(t, ct));
        var results = await Task.WhenAll(tasks);

        var healthy = results.Count(r => r.Status == "operational");
        var degraded = results.Count(r => r.Status == "degraded");
        var down = results.Count(r => r.Status == "down");

        var overall = down == results.Length
            ? "outage"
            : (down > 0 || degraded > 0) ? "degraded" : "operational";

        var report = new EcosystemStatusReportDto(
            overall,
            healthy,
            degraded,
            down,
            results.Length,
            DateTime.UtcNow,
            results);

        _cache.Set(CacheKey, report, TimeSpan.FromSeconds(60));
        return report;
    }

    private async Task<ServiceStatusItemDto> ProbeAsync(ProbeTarget target, CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();
        try
        {
            var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(6);
            using var req = new HttpRequestMessage(HttpMethod.Get, target.ProbeUrl);
            req.Headers.UserAgent.ParseAdd("KeshavEcosystemMonitor/1.0");

            using var resp = await client.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
            sw.Stop();

            var code = (int)resp.StatusCode;
            var isOk = (code >= 200 && code < 400) || (target.AcceptNotFound && code == 404);
            var status = isOk
                ? (sw.ElapsedMilliseconds > 3500 ? "degraded" : "operational")
                : (code >= 500 ? "down" : "degraded");

            var note = target.AcceptNotFound && code == 404
                ? "TLS & routing active"
                : (sw.ElapsedMilliseconds > 3500 && isOk ? "High latency (cold start)" : null);

            return new ServiceStatusItemDto(
                target.Key,
                target.Name,
                target.Category,
                target.DisplayUrl,
                target.ProbeUrl,
                status,
                code,
                sw.ElapsedMilliseconds,
                note);
        }
        catch (Exception ex)
        {
            sw.Stop();
            return new ServiceStatusItemDto(
                target.Key,
                target.Name,
                target.Category,
                target.DisplayUrl,
                target.ProbeUrl,
                "down",
                null,
                sw.ElapsedMilliseconds,
                ex is TaskCanceledException ? "Request timed out" : "Unreachable");
        }
    }
}
