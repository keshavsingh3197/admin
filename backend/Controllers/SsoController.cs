using Admin.Api.Auth;
using Admin.Api.Services;
using KeshavSingh.Auth;
using KeshavSingh.Auth.Abstractions;
using KeshavSingh.Auth.Dtos;
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
    private readonly SocialLoginService _social;
    private readonly OAuthStateService _state;

    public SsoController(
        AuthEngine auth,
        IAuthSettings settings,
        IOptions<SsoCookieOptions> cookie,
        TwoFactorDeviceService twoFactorDevices,
        SocialLoginService social,
        OAuthStateService state)
    {
        _auth = auth;
        _settings = settings;
        _cookie = cookie.Value;
        _twoFactorDevices = twoFactorDevices;
        _social = social;
        _state = state;
    }

    /// <summary>Step 1: verify email + password. Sets the SSO cookie, or returns a 2FA challenge
    /// or a session-conflict prompt (another session already active for this same site).</summary>
    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<ActionResult<SsoLoginResponse>> Login(LoginRequest request)
    {
        var result = await _auth.LoginAsync(request, DeviceLabel());

        // 2FA required — hand back the step token; no cookie, no access token yet.
        if (result.TwoFactorRequired)
            return Ok(new SsoLoginResponse(
                TwoFactorRequired: true,
                TwoFactorToken: result.TwoFactorToken,
                EmailFallbackAvailable: result.EmailFallbackAvailable,
                SmsFallbackAvailable: result.SmsFallbackAvailable,
                WhatsAppFallbackAvailable: result.WhatsAppFallbackAvailable,
                Session: null));

        // Another session already active for this site — ask before removing anything.
        if (result.RequiresSessionConfirmation)
            return Ok(new SsoLoginResponse(
                false, null, false, false, false, Session: null,
                RequiresSessionConfirmation: true,
                SessionConfirmationTicket: result.SessionConfirmationTicket,
                ConflictingSessions: result.ConflictingSessions));

        return Ok(new SsoLoginResponse(false, null, false, false, false, IssueSession(result.Tokens!)));
    }

    /// <summary>Which social providers the login screen should offer — only the ones an Admin has
    /// both configured and switched on in Settings. Anonymous: the login page needs it before there
    /// is any session, and it reveals nothing beyond which buttons to draw.</summary>
    [HttpGet("social/providers")]
    [AllowAnonymous]
    public ActionResult<IReadOnlyList<SocialProviderStatus>> SocialProviders() => Ok(_social.EnabledProviders());

    /// <summary>
    /// Social sign-in, step 1: returns the provider's authorize URL to navigate the whole page to
    /// (never call this like a normal fetch/XHR result — a redirect to github.com/linkedin.com can't
    /// carry a bearer token, which is also why the callback is anonymous and uses a self-contained
    /// signed <c>state</c> instead). Step 2 is the shared <see cref="OAuthController.Callback"/> —
    /// one registered redirect URI for every provider and every site.
    /// Link-only (see <see cref="AuthEngine.AuthenticateSocialAsync"/>): this never creates an account.
    /// </summary>
    [HttpPost("social/{provider}/start")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public ActionResult<SocialStartResponse> StartSocialLogin(string provider, SocialStartRequest request)
    {
        if (!SocialLoginService.IsKnownProvider(provider))
            return BadRequest(new { error = "Unknown sign-in provider." });
        if (!_social.IsUsable(provider))
            return BadRequest(new { error = $"Sign-in with {SocialLoginService.DisplayName(provider)} isn't enabled." });

        var origin = OAuthStateService.ResolveTrustedOrigin(Request);
        if (origin is null)
            return BadRequest(new { error = "Could not determine where to return you to afterwards." });

        // The site that sent the user here to sign in (ghar-ledger, content-blog, ...) — carried
        // through the whole provider round-trip so `finish()` on the login page can bounce back to it
        // afterwards, same as a plain password login's `?return=` already does. Family-allowlisted the
        // same way `LoginComponent.isAllowedExternal` does client-side (defence in depth either way).
        var returnUrl = OAuthStateService.IsFamilyUrl(request.ReturnUrl) ? request.ReturnUrl : null;

        var redirectUri = _state.CallbackUrl(Request);
        var state = _state.Encode(new OAuthState(Guid.NewGuid().ToString("N"), OAuthState.SocialLoginPurpose,
            provider.ToLowerInvariant(), origin, redirectUri, request.AppKey ?? "", returnUrl, DateTimeOffset.UtcNow));

        var authorizeUrl = _social.BuildAuthorizeUrl(provider, redirectUri, state);
        return authorizeUrl is null
            ? BadRequest(new { error = $"Sign-in with {SocialLoginService.DisplayName(provider)} isn't configured yet." })
            : Ok(new SocialStartResponse(authorizeUrl));
    }

    /// <summary>Second factor. Ends the login the same way step 1 does — including the case where
    /// another session is already active for this same site (then it's a conflict prompt too).</summary>
    [HttpPost("2fa/verify")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<ActionResult<SsoLoginResponse>> VerifyTwoFactor(TwoFactorVerifyRequest request)
    {
        var result = await _auth.VerifyTwoFactorAsync(request, DeviceLabel());

        if (result.RequiresSessionConfirmation)
            return Ok(new SsoLoginResponse(
                false, null, false, false, false, Session: null,
                RequiresSessionConfirmation: true,
                SessionConfirmationTicket: result.SessionConfirmationTicket,
                ConflictingSessions: result.ConflictingSessions));

        if (request.Method == TwoFactorMethod.Totp)
        {
            await _twoFactorDevices.MarkUsedAsync(result.Tokens!.User.Id);
        }

        return Ok(new SsoLoginResponse(false, null, false, false, false, IssueSession(result.Tokens!)));
    }

    /// <summary>Answers a session-conflict prompt: removes whichever other sessions on this same
    /// site the user chose (or all of them), then finishes the login and sets the SSO cookie.</summary>
    [HttpPost("session/confirm")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<ActionResult<SsoSessionResponse>> ConfirmSession(SessionConfirmRequest request)
    {
        var result = await _auth.ConfirmSessionAsync(request, DeviceLabel());
        return Ok(IssueSession(result.Tokens!));
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

    /// <summary>Sends the WhatsApp-fallback OTP for a pending two-factor session.</summary>
    [HttpPost("2fa/whatsapp/send")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> SendWhatsAppOtp(SendWhatsAppOtpRequest request)
    {
        await _auth.SendWhatsAppOtpAsync(request);
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

    /// <summary>Best-effort "Chrome on Windows" label for the session-conflict picker.</summary>
    private string? DeviceLabel() => DeviceLabelHelper.FromUserAgent(Request.Headers.UserAgent.ToString());

    /// <summary>Writes the rotating refresh token to the SSO cookie; returns the in-body session.</summary>
    private SsoSessionResponse IssueSession(AuthTokens tokens)
    {
        var expires = DateTimeOffset.UtcNow.AddDays(_settings.RefreshTokenDays);
        Response.Cookies.Append(_cookie.CookieName, tokens.RefreshToken, _cookie.BuildWriteOptions(expires));
        return new SsoSessionResponse(tokens.AccessToken, tokens.AccessTokenExpiresAt, tokens.User);
    }

}

/// <summary>The provider's authorize URL to navigate the whole page to (a full-page redirect, not an XHR).</summary>
public sealed record SocialStartResponse(string AuthorizeUrl);

/// <summary>Which site is signing the user in — same meaning as <see cref="LoginRequest.AppKey"/> —
/// and, if the user arrived here via another site's own redirect, where to send them back afterwards.</summary>
public sealed record SocialStartRequest(string? AppKey, string? ReturnUrl);
 