using Admin.Api.Dtos;
using Admin.Api.Models;
using Admin.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Admin.Api.Controllers;

/// <summary>Runtime auth-security settings for the identity provider (Admin only).</summary>
[ApiController]
[Route("api/settings")]
[Authorize(Roles = Roles.Admin)]
public sealed class SettingsController : ControllerBase
{
    private readonly SettingsService _settings;
    private readonly WebsiteRegistryService _websites;
    private readonly ApplicationMetricsService _applicationMetrics;

    public SettingsController(SettingsService settings, WebsiteRegistryService websites, ApplicationMetricsService applicationMetrics)
    {
        _settings = settings;
        _websites = websites;
        _applicationMetrics = applicationMetrics;
    }

    [HttpGet]
    public ActionResult<SettingsView> Get() => Ok(_settings.ToView());

    [HttpPut]
    public async Task<ActionResult<SettingsView>> Update(UpdateSettingsRequest request)
    {
        try
        {
            return Ok(await _settings.ApplyAsync(request));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpGet("websites")]
    public async Task<ActionResult<IReadOnlyList<WebsiteLinkView>>> ListWebsites(CancellationToken ct)
        => Ok(await _websites.ListAsync(ct));

    [HttpPost("websites")]
    public async Task<ActionResult<WebsiteLinkView>> CreateWebsite(UpsertWebsiteLinkRequest request, CancellationToken ct)
    {
        try
        {
            var created = await _websites.CreateAsync(request, ct);
            return CreatedAtAction(nameof(ListWebsites), new { id = created.Id }, created);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpGet("websites/{key}/metrics")]
    public async Task<ActionResult<ApplicationMetricsDto>> GetWebsiteMetrics(string key, CancellationToken ct)
    {
        var website = (await _websites.ListAsync(ct)).FirstOrDefault(item =>
            item.Key.Equals(key, StringComparison.OrdinalIgnoreCase));
        return website is null ? NotFound() : Ok(await _applicationMetrics.GetAsync(website.Key, ct));
    }

    [HttpPut("websites/{id}")]
    public async Task<ActionResult<WebsiteLinkView>> UpdateWebsite(string id, UpsertWebsiteLinkRequest request, CancellationToken ct)
    {
        try
        {
            var updated = await _websites.UpdateAsync(id, request, ct);
            return updated is null ? NotFound() : Ok(updated);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpDelete("websites/{id}")]
    public async Task<IActionResult> DeleteWebsite(string id, CancellationToken ct)
    {
        await _websites.DeleteAsync(id, ct);
        return NoContent();
    }
}
