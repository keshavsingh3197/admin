using Admin.Api.Services;
using KeshavSingh.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Admin.Api.Controllers;

/// <summary>
/// The ONE OAuth redirect endpoint for this whole identity provider — the single URL registered as
/// the authorization callback with GitHub, LinkedIn, and anything added later.
///
/// <para>Providers match <c>redirect_uri</c> against what the application registered, and a GitHub
/// OAuth App has exactly one callback URL. Giving each flow its own endpoint (or letting the URL
/// follow whichever host the request arrived on) is what produces "The redirect_uri is not associated
/// with this application". So every flow starts by minting a signed <see cref="OAuthState"/> and
/// sends the provider here; this endpoint reads the state to learn what the flow was for and which
/// site the person came from, and redirects them back there.</para>
///
/// <para>Anonymous by necessity — a browser redirect from github.com/linkedin.com carries no bearer
/// token — which is why the state is tamper-proof and time-limited rather than a lookup key, and why
/// every response is a redirect to an allowlisted origin rather than a JSON error body (there is no
/// script on this page to read one).</para>
/// </summary>
[ApiController]
[Route("api/oauth")]
[AllowAnonymous]
public sealed class OAuthController : ControllerBase
{
    private readonly OAuthStateService _state;
    private readonly SocialLoginService _social;
    private readonly SettingsService _settings;
    private readonly AuthEngine _auth;

    public OAuthController(OAuthStateService state, SocialLoginService social, SettingsService settings, AuthEngine auth)
    {
        _state = state;
        _social = social;
        _settings = settings;
        _auth = auth;
    }

    [HttpGet("callback")]
    public async Task<IActionResult> Callback(
        [FromQuery] string? code, [FromQuery] string? state, [FromQuery] string? error, CancellationToken ct)
    {
        var payload = _state.TryDecode(state);
        // No verified origin to bounce back to — the only safe move is a bare error, not a redirect.
        if (payload is null) return BadRequest("Invalid or expired request. Go back and start again.");

        return payload.Purpose == OAuthState.PackagesTokenPurpose
            ? await CompletePackagesTokenAsync(payload, code, error, ct)
            : await CompleteSocialLoginAsync(payload, code, error, ct);
    }

    /// <summary>
    /// Social sign-in: exchange the code, read a verified email from the provider, then apply the
    /// exact same link-only, mandatory-2FA policy as any other social login (see
    /// <see cref="AuthEngine.AuthenticateSocialAsync"/> — this never creates an account). Ends on the
    /// originating site's login page with either a 2FA step token (its existing 2FA screen takes over,
    /// unchanged) or a plain-language reason.
    /// </summary>
    private async Task<IActionResult> CompleteSocialLoginAsync(OAuthState payload, string? code, string? error, CancellationToken ct)
    {
        var providerName = SocialLoginService.DisplayName(payload.Provider);
        if (!string.IsNullOrEmpty(error) || string.IsNullOrWhiteSpace(code))
            return SocialError(payload, $"Sign-in with {providerName} was cancelled.");
        if (!_social.IsUsable(payload.Provider))
            return SocialError(payload, $"Sign-in with {providerName} is not available.");

        var accessToken = await _social.ExchangeCodeAsync(payload.Provider, code, payload.RedirectUri, ct);
        var email = accessToken is null ? null : await _social.FetchVerifiedEmailAsync(payload.Provider, accessToken, ct);
        if (email is null)
            return SocialError(payload, $"Could not read a verified email address from your {providerName} account.");

        try
        {
            var result = await _auth.AuthenticateSocialAsync(email, payload.AppKey);
            var returnParam = payload.ReturnUrl is null ? "" : $"&return={Uri.EscapeDataString(payload.ReturnUrl)}";
            return Redirect($"{payload.Origin}/login"
                + $"?twoFactorToken={Uri.EscapeDataString(result.TwoFactorToken!)}"
                + $"&emailFallback={result.EmailFallbackAvailable}"
                + $"&smsFallback={result.SmsFallbackAvailable}"
                + $"&whatsAppFallback={result.WhatsAppFallbackAvailable}"
                + returnParam);
        }
        catch (AuthException ex)
        {
            return SocialError(payload, ex.Message);
        }
    }

    /// <summary>
    /// "Connect to GitHub" for the Packages screen: the resulting token is written into the exact
    /// same encrypted field a pasted PAT goes into, so this only changes how the token is obtained.
    /// </summary>
    private async Task<IActionResult> CompletePackagesTokenAsync(OAuthState payload, string? code, string? error, CancellationToken ct)
    {
        if (!string.IsNullOrEmpty(error) || string.IsNullOrWhiteSpace(code))
            return Redirect($"{payload.Origin}/settings?github=error");

        var accessToken = await _social.ExchangeCodeAsync(payload.Provider, code, payload.RedirectUri, ct);
        if (accessToken is null) return Redirect($"{payload.Origin}/settings?github=error");

        await _settings.ApplyGitHubOAuthTokenAsync(accessToken);
        return Redirect($"{payload.Origin}/settings?github=connected");
    }

    private RedirectResult SocialError(OAuthState payload, string message) =>
        Redirect($"{payload.Origin}/login?socialError={Uri.EscapeDataString(message)}");
}
