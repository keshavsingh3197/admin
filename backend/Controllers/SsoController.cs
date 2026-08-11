using System.Text.Json;
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
    private const string GitHubCallbackPath = "/api/sso/social/github/callback";
    private static readonly TimeSpan SocialStateLifetime = TimeSpan.FromMinutes(10);

    private readonly AuthEngine _auth;
    private readonly IAuthSettings _settings;
    private readonly SsoCookieOptions _cookie;
    private readonly TwoFactorDeviceService _twoFactorDevices;
    private readonly SettingsService _appSettings;
    private readonly DataProtector _protector;
    private readonly IHttpClientFactory _httpClientFactory;

    public SsoController(
        AuthEngine auth,
        IAuthSettings settings,
        IOptions<SsoCookieOptions> cookie,
        TwoFactorDeviceService twoFactorDevices,
        SettingsService appSettings,
        DataProtector protector,
        IHttpClientFactory httpClientFactory)
    {
        _auth = auth;
        _settings = settings;
        _cookie = cookie.Value;
        _twoFactorDevices = twoFactorDevices;
        _appSettings = appSettings;
        _protector = protector;
        _httpClientFactory = httpClientFactory;
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

    /// <summary>
    /// Social sign-in, step 1: returns the GitHub authorize URL to navigate the whole page to (never
    /// call this like a normal fetch/XHR result — a redirect to github.com can't carry a bearer token,
    /// which is also why step 2 below is anonymous and uses a self-contained signed <c>state</c> instead).
    /// Link-only (see <see cref="AuthEngine.AuthenticateSocialAsync"/>): this never creates an account.
    /// </summary>
    [HttpPost("social/github/start")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public ActionResult<GitHubSocialStartResponse> StartGitHubSocialLogin(GitHubSocialStartRequest request)
    {
        var clientId = _appSettings.GitHubOAuthClientId;
        if (string.IsNullOrWhiteSpace(clientId))
            return BadRequest(new { error = "Social sign-in with GitHub isn't configured yet." });

        var origin = ResolveTrustedOrigin();
        if (origin is null)
            return BadRequest(new { error = "Could not determine where to return you to after GitHub." });

        var redirectUri = $"{Request.Scheme}://{Request.Host}{GitHubCallbackPath}";
        var state = _protector.Encrypt(JsonSerializer.Serialize(new SocialStatePayload(
            Guid.NewGuid().ToString("N"), origin, redirectUri, request.AppKey ?? "", DateTimeOffset.UtcNow)));

        var authorizeUrl = "https://github.com/login/oauth/authorize"
            + $"?client_id={Uri.EscapeDataString(clientId)}"
            + "&scope=" + Uri.EscapeDataString("read:user user:email")
            + $"&redirect_uri={Uri.EscapeDataString(redirectUri)}"
            + $"&state={Uri.EscapeDataString(state)}";

        return Ok(new GitHubSocialStartResponse(authorizeUrl));
    }

    /// <summary>
    /// Social sign-in, step 2: GitHub redirects the browser back here with a `code`. Exchanges it,
    /// reads the account's verified primary email from GitHub, then applies the exact same link-only,
    /// mandatory-2FA policy as any other social login (see <see cref="AuthEngine.AuthenticateSocialAsync"/>).
    /// Always ends in a redirect back to the SPA's login page — either with a `twoFactorToken` (the
    /// SPA's existing 2FA screen takes it from there, unchanged, via the existing `/api/sso/2fa/verify`)
    /// or a `socialError` reason. Never a JSON error body — there is no script on this page to read one.
    /// </summary>
    [HttpGet("social/github/callback")]
    [AllowAnonymous]
    public async Task<IActionResult> GitHubSocialCallback(
        [FromQuery] string? code, [FromQuery] string? state, [FromQuery] string? error, CancellationToken ct)
    {
        var payload = TryDecodeSocialState(state);
        if (payload is null) return BadRequest("Invalid or expired sign-in request. Go back and try again.");

        if (!string.IsNullOrEmpty(error) || string.IsNullOrWhiteSpace(code))
            return Redirect($"{payload.Origin}/login?socialError={Uri.EscapeDataString("Sign-in with GitHub was cancelled.")}");

        var clientId = _appSettings.GitHubOAuthClientId;
        var clientSecret = _appSettings.GitHubOAuthClientSecret;
        if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
            return Redirect($"{payload.Origin}/login?socialError={Uri.EscapeDataString("Social sign-in isn't configured.")}");

        var accessToken = await ExchangeGitHubCodeAsync(clientId, clientSecret, code, payload.RedirectUri, ct);
        var email = accessToken is null ? null : await FetchVerifiedGitHubEmailAsync(accessToken, ct);
        if (email is null)
            return Redirect($"{payload.Origin}/login?socialError={Uri.EscapeDataString("Could not read a verified email from your GitHub account.")}");

        try
        {
            var result = await _auth.AuthenticateSocialAsync(email, payload.AppKey);
            return Redirect($"{payload.Origin}/login"
                + $"?twoFactorToken={Uri.EscapeDataString(result.TwoFactorToken!)}"
                + $"&emailFallback={result.EmailFallbackAvailable}"
                + $"&smsFallback={result.SmsFallbackAvailable}"
                + $"&whatsAppFallback={result.WhatsAppFallbackAvailable}");
        }
        catch (AuthException ex)
        {
            return Redirect($"{payload.Origin}/login?socialError={Uri.EscapeDataString(ex.Message)}");
        }
    }
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

    /// <summary>Only ever redirect back to a *.keshavsingh.in origin (or localhost in dev) — mirrors
    /// GitHubOAuthController's identical check for the Packages-inventory OAuth flow.</summary>
    private string? ResolveTrustedOrigin()
    {
        var raw = Request.Headers["Origin"].FirstOrDefault()
            ?? (Request.Headers["Referer"].FirstOrDefault() is { } referer && Uri.TryCreate(referer, UriKind.Absolute, out var refUri)
                ? refUri.GetLeftPart(UriPartial.Authority)
                : null);
        if (raw is null || !Uri.TryCreate(raw, UriKind.Absolute, out var uri)) return null;

        var isLocalhost = uri.Host == "localhost";
        if (uri.Scheme != Uri.UriSchemeHttps && !(isLocalhost && uri.Scheme == Uri.UriSchemeHttp)) return null;
        var onFamily = isLocalhost || uri.Host == "keshavsingh.in" || uri.Host.EndsWith(".keshavsingh.in", StringComparison.OrdinalIgnoreCase);
        return onFamily ? uri.GetLeftPart(UriPartial.Authority) : null;
    }

    private SocialStatePayload? TryDecodeSocialState(string? state)
    {
        if (string.IsNullOrWhiteSpace(state)) return null;
        try
        {
            var payload = JsonSerializer.Deserialize<SocialStatePayload>(_protector.Decrypt(state));
            if (payload is null || DateTimeOffset.UtcNow - payload.IssuedAt > SocialStateLifetime) return null;
            return payload;
        }
        catch (Exception) { return null; } // Wrong/rotated key, tampered value, malformed JSON — reject, don't throw.
    }

    private async Task<string?> ExchangeGitHubCodeAsync(string clientId, string clientSecret, string code, string redirectUri, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://github.com/login/oauth/access_token");
        request.Headers.Accept.ParseAdd("application/json");
        request.Content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["client_id"] = clientId,
            ["client_secret"] = clientSecret,
            ["code"] = code,
            ["redirect_uri"] = redirectUri,
        });

        try
        {
            using var response = await _httpClientFactory.CreateClient().SendAsync(request, ct);
            using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
            return document.RootElement.TryGetProperty("access_token", out var tokenElement) ? tokenElement.GetString() : null;
        }
        catch (Exception ex) when (ex is HttpRequestException or JsonException) { return null; }
    }

    /// <summary>The account's verified primary email — never an unverified one, and never guessed from
    /// the public profile (GitHub's `email` field on `/user` can be null or unverified).</summary>
    private async Task<string?> FetchVerifiedGitHubEmailAsync(string accessToken, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "https://api.github.com/user/emails");
        request.Headers.UserAgent.ParseAdd("KeshavSingh-Admin-SocialLogin/1.0");
        request.Headers.Accept.ParseAdd("application/vnd.github+json");
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);

        try
        {
            using var response = await _httpClientFactory.CreateClient().SendAsync(request, ct);
            if (!response.IsSuccessStatusCode) return null;
            using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
            foreach (var entry in document.RootElement.EnumerateArray())
            {
                var verified = entry.TryGetProperty("verified", out var v) && v.GetBoolean();
                var primary = entry.TryGetProperty("primary", out var p) && p.GetBoolean();
                if (verified && primary && entry.TryGetProperty("email", out var e))
                    return e.GetString();
            }
            return null;
        }
        catch (Exception ex) when (ex is HttpRequestException or JsonException) { return null; }
    }

    private sealed record SocialStatePayload(string Nonce, string Origin, string RedirectUri, string AppKey, DateTimeOffset IssuedAt);
}

/// <summary>The GitHub authorize URL to navigate the whole page to (a full-page redirect, not an XHR).</summary>
public sealed record GitHubSocialStartResponse(string AuthorizeUrl);

/// <summary>Which site is signing the user in — same meaning as <see cref="LoginRequest.AppKey"/>.</summary>
public sealed record GitHubSocialStartRequest(string? AppKey);
 