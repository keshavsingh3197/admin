using System.Text.RegularExpressions;
using Admin.Api.Dtos;
using Admin.Api.Models;
using Admin.Api.Services;
using KeshavSingh.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Admin.Api.Controllers;

/// <summary>Manage short links. Public resolution/redirect lives at <see cref="ShortLinkRedirectController"/>.</summary>
[ApiController]
[Route("api/shortlinks")]
[Authorize] // Default-deny, same as Notes — a family utility, not scoped per-user.
[RequirePagePermission("page.shortLinks")]
public partial class ShortLinksController : ControllerBase
{
    private readonly ShortLinkService _shortLinks;

    public ShortLinksController(ShortLinkService shortLinks) => _shortLinks = shortLinks;

    [HttpGet]
    public async Task<ActionResult<List<ShortLink>>> GetAll() =>
        Ok(await _shortLinks.GetAllAsync());

    [HttpGet("{id}")]
    public async Task<ActionResult<ShortLink>> GetById(string id)
    {
        var link = await _shortLinks.GetByIdAsync(id);
        return link is null ? NotFound() : Ok(link);
    }

    [HttpPost]
    public async Task<ActionResult<ShortLink>> Create([FromBody] CreateShortLinkRequest req)
    {
        if (!ShortLinkService.IsValidTargetUrl(req.TargetUrl))
            return BadRequest("Target must be an absolute http:// or https:// URL.");

        if (!string.IsNullOrWhiteSpace(req.Code) && !CodePattern().IsMatch(req.Code))
            return BadRequest("Code must be 3-32 letters, numbers, hyphens or underscores.");

        try
        {
            var created = await _shortLinks.CreateAsync(req.TargetUrl, req.Code, req.ExpiresAt);
            return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(ex.Message);
        }
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(string id, [FromBody] UpdateShortLinkRequest req)
    {
        if (!ShortLinkService.IsValidTargetUrl(req.TargetUrl))
            return BadRequest("Target must be an absolute http:// or https:// URL.");

        var updated = await _shortLinks.UpdateAsync(id, req.TargetUrl, req.ExpiresAt);
        return updated ? NoContent() : NotFound();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id) =>
        await _shortLinks.DeleteAsync(id) ? NoContent() : NotFound();

    [GeneratedRegex("^[A-Za-z0-9_-]{3,32}$")]
    private static partial Regex CodePattern();
}
