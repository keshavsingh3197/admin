using Admin.Api.Dtos;
using Admin.Api.Models;
using Admin.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Admin.Api.Controllers;

[ApiController]
[Route("api/website-content")]
public sealed class WebsiteContentController : ControllerBase
{
    private readonly WebsiteContentService _content;

    public WebsiteContentController(WebsiteContentService content)
    {
        _content = content;
    }

    [HttpGet]
    [Authorize(Roles = Roles.Editor + "," + Roles.Admin)]
    public async Task<ActionResult<IReadOnlyList<WebsiteContentView>>> List([FromQuery] string? siteKey,
        [FromQuery] string? locale, CancellationToken ct)
    {
        try { return Ok(await _content.ListAsync(siteKey, locale, ct)); }
        catch (ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
    }

    [HttpPut]
    [Authorize(Roles = Roles.Editor + "," + Roles.Admin)]
    public async Task<ActionResult<WebsiteContentView>> Upsert(UpsertWebsiteContentRequest request, CancellationToken ct)
    {
        try
        {
            return Ok(await _content.UpsertAsync(request, ct));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Delete(string id, CancellationToken ct)
    {
        await _content.DeleteAsync(id, ct);
        return NoContent();
    }

    /// <summary>
    /// What a public site reads. <c>locale</c> selects the language; an unknown or disabled code
    /// resolves to the default rather than failing, and a key with no row for that language falls back
    /// down the locale's chain. The response says which language was actually served.
    /// </summary>
    [HttpGet("public/{siteKey}/{contentKey}")]
    [AllowAnonymous]
    public async Task<ActionResult<PublicWebsiteContentView>> Public(string siteKey, string contentKey,
        [FromQuery] string? locale, CancellationToken ct)
    {
        try
        {
            var item = await _content.GetPublicAsync(siteKey, contentKey, locale, ct);
            if (item is null) return NotFound();
            Response.Headers.CacheControl = "public, max-age=60";
            Response.Headers.ContentLanguage = item.Locale;
            Response.Headers.Vary = "Accept-Language";
            return Ok(item);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }
}
