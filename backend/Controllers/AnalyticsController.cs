using Admin.Api.Dtos;
using Admin.Api.Models;
using Admin.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Admin.Api.Controllers;

[ApiController]
[Route("api/analytics")]
[Authorize(Roles = Roles.Admin)]
public sealed class AnalyticsController : ControllerBase
{
    private readonly AnalyticsService _analytics;
    private readonly WebsiteVisitService _visits;

    public AnalyticsController(AnalyticsService analytics, WebsiteVisitService visits)
    {
        _analytics = analytics;
        _visits = visits;
    }

    [HttpGet("websites")]
    public async Task<ActionResult<IReadOnlyList<WebsiteOptionDto>>> Websites(CancellationToken ct)
    {
        var adminBaseUrl = $"{Request.Scheme}://{Request.Host}";
        return Ok(await _analytics.GetWebsitesAsync(adminBaseUrl, ct));
    }

    [HttpGet("dashboard/{websiteKey}")]
    public async Task<ActionResult<WebsiteDashboardDto>> Dashboard(string websiteKey, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(websiteKey))
            return BadRequest(new { error = "websiteKey is required." });

        var adminBaseUrl = $"{Request.Scheme}://{Request.Host}";
        var dashboard = await _analytics.GetDashboardAsync(websiteKey, adminBaseUrl, ct);
        return dashboard is null
            ? NotFound(new { error = $"Unknown website key '{websiteKey}'." })
            : Ok(dashboard);
    }

    [HttpPost("visit")]
    [AllowAnonymous]
    public async Task<IActionResult> TrackVisit(TrackVisitRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.WebsiteKey))
            return BadRequest(new { error = "websiteKey is required." });

        var adminBaseUrl = $"{Request.Scheme}://{Request.Host}";
        var websites = await _analytics.GetWebsitesAsync(adminBaseUrl, ct);
        if (!websites.Any(x => x.Key.Equals(request.WebsiteKey, StringComparison.OrdinalIgnoreCase)))
            return BadRequest(new { error = "Unknown websiteKey." });

        var country = GetCountryCode(Request);
        var ip = Request.Headers.TryGetValue("X-Forwarded-For", out var forwarded)
            ? forwarded.ToString().Split(',')[0].Trim()
            : HttpContext.Connection.RemoteIpAddress?.ToString();
        var visitorKey = WebsiteVisitService.BuildVisitorKey(ip, Request.Headers.UserAgent.ToString());

        await _visits.TrackAsync(request.WebsiteKey.Trim().ToLowerInvariant(), request.Path, request.Referrer, country, visitorKey, ct);
        return Accepted();
    }

    private static string GetCountryCode(HttpRequest request)
    {
        var candidates = new[] { "CF-IPCountry", "X-Country-Code", "X-AppEngine-Country" };
        foreach (var key in candidates)
        {
            if (request.Headers.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value))
                return value.ToString().Trim().ToUpperInvariant();
        }

        return "Unknown";
    }
}
