using Admin.Api.Auth;
using Admin.Api.Services;
using KeshavSingh.Auth;
using KeshavSingh.Auth.Abstractions;
using KeshavSingh.Auth.Dtos;
using KeshavSingh.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace Admin.Api.Controllers;

/// <summary>
/// The single-sign-on surface (<c>/api/sso/*</c>). Wraps the shared <see cref="AuthEngine"/> so the
/// rotating refresh token is delivered ONLY as an HttpOnly, cross-subdomain cookie — never in a
/// response body — while the short-lived access token is returned in the body for the SPA to hold
/// in memory.
///
/// This makes admin the identity provider for every <c>*.keshavsingh.in</c> site: the user signs in
/// once here, and each sibling app silently exchanges the shared cookie for an access token via
/// <c>POST /api/sso/session</c>. The bearer-based <c>/api/auth/*</c> surface from the package stays
/// available for authenticated self-service (2FA enrollment, password change).
/// </summary>
[ApiController]
[Route("api/sso")]
public sealed class SsoController : ControllerBase
{
    private readonly AuthEngine _auth;
    private readonly IAuthSettings _settings;
    private readonly SsoCookieOptions _cookie;
    private readonly TwoFactorDeviceService _twoFactorDevices;

    public SsoController(
        AuthEngine auth,
        IAuthSettings settings,
        IOptions<SsoCookieOptions> cookie,
        TwoFactorDeviceService twoFactorDevices)
    {
        _auth = auth;
        _settings = settings;
        _cookie = cookie.Value;
        _twoFactorDevices = twoFactorDevices;
    }

    /// <summary>Step 1: verify email + password. Sets the SSO cookie, or returns a 2FA challenge.</summary>
    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<ActionResult<SsoLoginResponse>> Login(LoginRequest request)
    {
        var result = await _auth.LoginAsync(request);

        // 2FA required — hand back the step token; no cookie, no access token yet.
        if (result.TwoFactorRequired || result.Tokens is null)
            return Ok(new SsoLoginResponse(
                TwoFactorRequired: true,
                TwoFactorToken: result.TwoFactorToken,
                EmailFallbackAvailable: result.EmailFallbackAvailable,
                SmsFallbackAvailable: result.SmsFallbackAvailable,
                Session: null));

        return Ok(new SsoLoginResponse(false, null, false, false, IssueSession(result.Tokens)));
    }

    /// <summary>Step 2: verify a TOTP, email, SMS, or backup code and establish the session.</summary>
    [HttpPost("2fa/verify")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<ActionResult<SsoSessionResponse>> VerifyTwoFactor(TwoFactorVerifyRequest request)
    {
        var tokens = await _auth.VerifyTwoFactorAsync(request);

        if (request.Method == TwoFactorMethod.Totp)
        {
            await _twoFactorDevices.MarkUsedAsync(tokens.User.Id);
        }

        return Ok(IssueSession(tokens));
    }

    /// <summary>Sends the email-fallback OTP for a pending two-factor session.</summary>
    [HttpPost("2fa/email/send")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> SendEmailOtp(SendEmailOtpRequest request)
    {
        await _auth.SendEmailOtpAsync(request);
        return Accepted(); // Do not reveal whether the mailbox exists.
    }

    /// <summary>Sends the SMS-fallback OTP for a pending two-factor session.</summary>
    [HttpPost("2fa/sms/send")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> SendSmsOtp(SendSmsOtpRequest request)
    {
        await _auth.SendSmsOtpAsync(request);
        return Accepted(); // Do not reveal whether a phone number is on file.
    }

    /// <summary>
    /// Silent SSO: exchange the shared refresh cookie for a fresh access token, rotating the cookie.
    /// Every app calls this on load. A missing / expired / already-rotated cookie yields 401 (with
    /// the stale cookie cleared) so the SPA fails closed and routes to the login page.
    /// </summary>
    [HttpPost("session")]
    [AllowAnonymous]
    public async Task<ActionResult<SsoSessionResponse>> Session()
    {
        var refreshToken = Request.Cookies[_cookie.CookieName];
        if (string.IsNullOrEmpty(refreshToken))
            return Unauthorized(new { error = "No active session." });

        try
        {
            return Ok(IssueSession(await _auth.RefreshAsync(refreshToken)));
        }
        catch (AuthException)
        {
            // Token no longer valid — clear it so the client can't wedge in a refresh loop.
            Response.Cookies.Delete(_cookie.CookieName, _cookie.BuildDeleteOptions());
            throw;
        }
    }

    /// <summary>Global sign-out: revoke the presented refresh token and clear the SSO cookie.</summary>
    [HttpPost("logout")]
    [AllowAnonymous]
    public async Task<IActionResult> Logout()
    {
        var refreshToken = Request.Cookies[_cookie.CookieName];
        if (!string.IsNullOrEmpty(refreshToken))
        {
            // userId is only used for the audit entry here; revocation is by the token's hash.
            var userId = User.Identity?.IsAuthenticated == true ? User.GetUserId() : string.Empty;
            await _auth.LogoutAsync(userId, refreshToken);
        }

        Response.Cookies.Delete(_cookie.CookieName, _cookie.BuildDeleteOptions());
        return NoContent();
    }

    // ---- Helpers ----

    /// <summary>Writes the rotating refresh token to the SSO cookie; returns the in-body session.</summary>
    private SsoSessionResponse IssueSession(AuthTokens tokens)
    {
        var expires = DateTimeOffset.UtcNow.AddDays(_settings.RefreshTokenDays);
        Response.Cookies.Append(_cookie.CookieName, tokens.RefreshToken, _cookie.BuildWriteOptions(expires));
        return new SsoSessionResponse(tokens.AccessToken, tokens.AccessTokenExpiresAt, tokens.User);
    }
}
 