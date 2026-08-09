using Admin.Api.Dtos;
using KeshavSingh.Auth;
using KeshavSingh.Auth.Abstractions;
using KeshavSingh.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Admin.Api.Controllers;

/// <summary>
/// Self-service session management (<c>/api/sessions/*</c>) — "1 site, 1 session" is enforced at
/// login time (see <c>SsoController</c>), but a signed-in user can also come here to see every
/// active session across every *.keshavsingh.in app and revoke any of them by hand, the same way
/// GitHub's "Sessions" settings page works.
/// </summary>
[ApiController]
[Route("api/sessions")]
[Authorize]
public sealed class SessionsController : ControllerBase
{
    private readonly IRefreshTokenStore _tokens;
    private readonly SsoCookieOptions _cookie;

    public SessionsController(IRefreshTokenStore tokens, IOptions<SsoCookieOptions> cookie)
    {
        _tokens = tokens;
        _cookie = cookie.Value;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<SessionListItemDto>>> List()
    {
        var userId = User.GetUserId();
        var sessions = await _tokens.ListAllActiveForUserAsync(userId);

        // The cookie identifies which listed session is "this browser, right now" — best-effort
        // (an expired/rotated cookie just means nothing is flagged current).
        var presented = Request.Cookies[_cookie.CookieName];
        var currentHash = string.IsNullOrEmpty(presented) ? null : TokenHasher.Hash(presented);

        return Ok(sessions.Select(s => new SessionListItemDto(
            s.Id, s.AppKey, s.DeviceLabel, s.CreatedAt, s.ExpiresAt,
            IsCurrent: currentHash is not null && currentHash == HashOf(s))).ToList());
    }

    /// <summary>Revokes one of the caller's own sessions. Revoking the current one signs it out
    /// immediately on next use \u2014 same as clicking Sign out from that browser.</summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> Revoke(string id)
    {
        var userId = User.GetUserId();
        var sessions = await _tokens.ListAllActiveForUserAsync(userId);
        if (!sessions.Any(s => s.Id == id))
            return NotFound(); // Not yours (or already gone) \u2014 don't reveal which.

        await _tokens.RevokeManyAsync(new[] { id });
        return NoContent();
    }

    // TokenHash isn't exposed on the record's public surface by name here to avoid a footgun
    // elsewhere, but this controller is trusted to compare it for the "is this my browser" badge.
    private static string HashOf(RefreshTokenRecord r) => r.TokenHash;
}
