using System.Text.Json;
using Admin.Api.Dtos;
using Admin.Api.Models;
using Admin.Api.Services;
using KeshavSingh.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Admin.Api.Controllers;

/// <summary>
/// "Connect to GitHub" — an OAuth App alternative to pasting a PAT into Settings for the Packages
/// screen. A classic GitHub OAuth App token carries the same scopes (`read:packages`, `repo`) a PAT
/// does and is accepted by the same GitHub REST endpoints, so a completed flow here writes into the
/// exact same encrypted field <see cref="PackageInventoryService"/> already reads — this only changes
/// how the token is obtained, not how it's stored or used.
///
/// Two steps, because a redirect to github.com can't carry this app's bearer token:
///  1. <see cref="Start"/> — a normal authenticated XHR from the Settings screen. Returns the GitHub
///     authorize URL to navigate the whole page to (never called via HttpClient/fetch).
///  2. <see cref="Callback"/> — GitHub redirects the browser back here with a `code`; anonymous by
///     necessity (no bearer header on a browser redirect), so the state is instead a self-contained,
///     tamper-proof, time-limited token (AES-GCM via <see cref="DataProtector"/>) minted in step 1 —
///     forging one without the server's data key is infeasible, and a stale one (>10 min) is rejected.
/// </summary>
[ApiController]
[Route("api/settings/github")]
public sealed class GitHubOAuthController : ControllerBase
{
    private const string CallbackPath = "/api/settings/github/oauth/callback";
    private static readonly TimeSpan StateLifetime = TimeSpan.FromMinutes(10);

    private readonly SettingsService _settings;
    private readonly DataProtector _protector;
    private readonly IHttpClientFactory _httpClientFactory;

    public GitHubOAuthController(SettingsService settings, DataProtector protector, IHttpClientFactory httpClientFactory)
    {
        _settings = settings;
        _protector = protector;
        _httpClientFactory = httpClientFactory;
    }

    [HttpPost("oauth/start")]
    [Authorize(Roles = Roles.Admin)]
    public ActionResult<GitHubOAuthStartResponse> Start()
    {
        var clientId = _settings.GitHubOAuthClientId;
        if (string.IsNullOrWhiteSpace(clientId))
            return BadRequest(new { error = "Set a GitHub OAuth Client ID on this screen first." });

        var origin = ResolveTrustedOrigin();
        if (origin is null)
            return BadRequest(new { error = "Could not determine where to return you to after GitHub." });

        var redirectUri = $"{Request.Scheme}://{Request.Host}{CallbackPath}";
        var state = _protector.Encrypt(JsonSerializer.Serialize(new StatePayload(
            Guid.NewGuid().ToString("N"), origin, redirectUri, DateTimeOffset.UtcNow)));

        var authorizeUrl = "https://github.com/login/oauth/authorize"
            + $"?client_id={Uri.EscapeDataString(clientId)}"
            + "&scope=" + Uri.EscapeDataString("read:packages repo")
            + $"&redirect_uri={Uri.EscapeDataString(redirectUri)}"
            + $"&state={Uri.EscapeDataString(state)}";

        return Ok(new GitHubOAuthStartResponse(authorizeUrl));
    }

    [HttpGet("oauth/callback")]
    [AllowAnonymous]
    public async Task<IActionResult> Callback([FromQuery] string? code, [FromQuery] string? state,
        [FromQuery] string? error, CancellationToken ct)
    {
        StatePayload? payload = TryDecodeState(state);
        // No verified origin to bounce back to — the only safe move is a bare error, not a redirect.
        if (payload is null) return BadRequest("Invalid or expired request. Start the connection again from Settings.");

        if (!string.IsNullOrEmpty(error) || string.IsNullOrWhiteSpace(code))
            return Redirect($"{payload.Origin}/settings?github=error");

        var clientId = _settings.GitHubOAuthClientId;
        var clientSecret = _settings.GitHubOAuthClientSecret;
        if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
            return Redirect($"{payload.Origin}/settings?github=error");

        using var request = new HttpRequestMessage(HttpMethod.Post, "https://github.com/login/oauth/access_token");
        request.Headers.Accept.ParseAdd("application/json");
        request.Content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["client_id"] = clientId,
            ["client_secret"] = clientSecret,
            ["code"] = code,
            ["redirect_uri"] = payload.RedirectUri,
        });

        try
        {
            using var response = await _httpClientFactory.CreateClient().SendAsync(request, ct);
            using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
            var accessToken = document.RootElement.TryGetProperty("access_token", out var tokenElement)
                ? tokenElement.GetString()
                : null;
            if (string.IsNullOrWhiteSpace(accessToken))
                return Redirect($"{payload.Origin}/settings?github=error");

            await _settings.ApplyGitHubOAuthTokenAsync(accessToken);
            return Redirect($"{payload.Origin}/settings?github=connected");
        }
        catch (Exception ex) when (ex is HttpRequestException or JsonException)
        {
            return Redirect($"{payload.Origin}/settings?github=error");
        }
    }

    /// <summary>Only ever redirect back to a *.keshavsingh.in origin (or localhost in dev) — the
    /// Origin/Referer header on the authenticated /start call, allowlisted the same way every other
    /// launcher URL in this app is (see SettingsService.ValidateLauncherUrl).</summary>
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

    private StatePayload? TryDecodeState(string? state)
    {
        if (string.IsNullOrWhiteSpace(state)) return null;
        try
        {
            var payload = JsonSerializer.Deserialize<StatePayload>(_protector.Decrypt(state));
            if (payload is null || DateTimeOffset.UtcNow - payload.IssuedAt > StateLifetime) return null;
            return payload;
        }
        catch (Exception) { return null; } // Wrong/rotated key, tampered value, malformed JSON — reject, don't throw.
    }

    private sealed record StatePayload(string Nonce, string Origin, string RedirectUri, DateTimeOffset IssuedAt);
}
