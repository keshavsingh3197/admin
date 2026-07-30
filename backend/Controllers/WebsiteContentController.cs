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
    public async Task<ActionResult<IReadOnlyList<WebsiteContentView>>> List([FromQuery] string? siteKey, CancellationToken ct)
        => Ok(await _content.ListAsync(siteKey, ct));

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

    [HttpGet("public/{siteKey}/{contentKey}")]
    [AllowAnonymous]
    public async Task<ActionResult<PublicWebsiteContentView>> Public(string siteKey, string contentKey, CancellationToken ct)
    {
        try
        {
            var item = await _content.GetPublicAsync(siteKey, contentKey, ct);
            return item is null ? NotFound() : Ok(item);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }
}
