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

    public AnalyticsController(AnalyticsService analytics)
    {
        _analytics = analytics;
    }

    [HttpGet("websites")]
    public ActionResult<IReadOnlyList<WebsiteOptionDto>> Websites()
    {
        var adminBaseUrl = $"{Request.Scheme}://{Request.Host}";
        return Ok(_analytics.GetWebsites(adminBaseUrl));
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
}
