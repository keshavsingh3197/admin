using Admin.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Admin.Api.Controllers;

/// <summary>
/// The actual short link: GET /s/{code} 302s to the stored target URL. Anonymous by necessity — anyone
/// who received the link, not just signed-in admins, has to be able to follow it. Unknown or expired
/// codes answer 404, never a redirect to the API's own root, so a scraped link can't be fingerprinted.
/// </summary>
[ApiController]
[Route("s")]
[AllowAnonymous]
[EnableRateLimiting("shortlink-redirect")]
public class ShortLinkRedirectController : ControllerBase
{
    private readonly ShortLinkService _shortLinks;

    public ShortLinkRedirectController(ShortLinkService shortLinks) => _shortLinks = shortLinks;

    [HttpGet("{code}")]
    public async Task<IActionResult> Resolve(string code)
    {
        var target = await _shortLinks.ResolveAndRecordHitAsync(code);
        return target is null ? NotFound() : Redirect(target);
    }
}
