using Admin.Api.Dtos;
using Admin.Api.Services;
using KeshavSingh.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Admin.Api.Controllers;

/// <summary>
/// "Connect to GitHub" — an OAuth App alternative to pasting a PAT into Settings for the Packages
/// screen. A classic GitHub OAuth App token carries the same scopes (`read:packages`, `repo`) a PAT
/// does and is accepted by the same GitHub REST endpoints, so a completed flow writes into the exact
/// same encrypted field <see cref="PackageInventoryService"/> already reads — this only changes how
/// the token is obtained, not how it's stored or used.
///
/// Only the start of the flow lives here: it is a normal authenticated XHR from the Settings screen
/// that returns the GitHub authorize URL to navigate the whole page to (never fetched). GitHub then
/// returns the browser to the one shared <see cref="OAuthController.Callback"/> — the same registered
/// redirect URI social sign-in uses, because an OAuth App has exactly one.
/// </summary>
[ApiController]
[Route("api/settings/github")]
public sealed class GitHubOAuthController : ControllerBase
{
    /// <summary>What the Packages inventory needs from the token: read published packages, plus repo
    /// access so manifests in private repos are readable. Sign-in scopes are irrelevant here.</summary>
    private const string PackagesScope = "read:packages repo";

    private readonly SettingsService _settings;
    private readonly OAuthStateService _state;
    private readonly SocialLoginService _oauth;

    public GitHubOAuthController(SettingsService settings, OAuthStateService state, SocialLoginService oauth)
    {
        _settings = settings;
        _state = state;
        _oauth = oauth;
    }

    [HttpPost("oauth/start")]
    [Authorize(Roles = Roles.Admin)]
    public ActionResult<GitHubOAuthStartResponse> Start()
    {
        if (string.IsNullOrWhiteSpace(_settings.GitHubOAuthClientId))
            return BadRequest(new { error = "Set a GitHub OAuth Client ID on this screen first." });

        var origin = OAuthStateService.ResolveTrustedOrigin(Request);
        if (origin is null)
            return BadRequest(new { error = "Could not determine where to return you to after GitHub." });

        var redirectUri = _state.CallbackUrl(Request);
        var state = _state.Encode(new OAuthState(Guid.NewGuid().ToString("N"), OAuthState.PackagesTokenPurpose,
            SocialLoginService.GitHub, origin, redirectUri, AppKey: "", ReturnUrl: null, DateTimeOffset.UtcNow));

        var authorizeUrl = _oauth.BuildAuthorizeUrl(SocialLoginService.GitHub, redirectUri, state, PackagesScope);
        return authorizeUrl is null
            ? BadRequest(new { error = "Set a GitHub OAuth Client ID and Client Secret on this screen first." })
            : Ok(new GitHubOAuthStartResponse(authorizeUrl));
    }
}
