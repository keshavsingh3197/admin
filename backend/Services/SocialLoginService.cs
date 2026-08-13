using System.Net.Http.Headers;
using System.Text.Json;

namespace Admin.Api.Services;

/// <summary>
/// The provider-specific half of social sign-in: where to send the browser, how to turn the returned
/// <c>code</c> into a token, and how to read a <em>verified</em> email address from that provider.
/// Everything else (state, the single redirect URI, the link-only account policy, mandatory 2FA) is
/// provider-agnostic and lives in <see cref="OAuthStateService"/> / the auth engine.
///
/// Adding a provider means adding one entry to <see cref="Providers"/> plus its email lookup — no new
/// endpoint and no new redirect URI to register anywhere.
/// </summary>
public sealed class SocialLoginService
{
    public const string GitHub = "github";
    public const string LinkedIn = "linkedin";

    private readonly SettingsService _settings;
    private readonly IHttpClientFactory _httpClientFactory;

    public SocialLoginService(SettingsService settings, IHttpClientFactory httpClientFactory)
    {
        _settings = settings;
        _httpClientFactory = httpClientFactory;
    }

    private static readonly IReadOnlyDictionary<string, ProviderEndpoints> Providers =
        new Dictionary<string, ProviderEndpoints>(StringComparer.OrdinalIgnoreCase)
        {
            [GitHub] = new(
                "GitHub",
                "https://github.com/login/oauth/authorize",
                "https://github.com/login/oauth/access_token",
                "read:user user:email"),
            // LinkedIn is OpenID Connect: the same authorization-code exchange, then a standard
            // /userinfo call instead of a provider-specific email endpoint.
            [LinkedIn] = new(
                "LinkedIn",
                "https://www.linkedin.com/oauth/v2/authorization",
                "https://www.linkedin.com/oauth/v2/accessToken",
                "openid profile email"),
        };

    public static bool IsKnownProvider(string? provider) =>
        provider is not null && Providers.ContainsKey(provider);

    public static string DisplayName(string provider) =>
        Providers.TryGetValue(provider, out var endpoints) ? endpoints.DisplayName : provider;

    /// <summary>Which providers an Admin has both configured (client ID + secret) and switched on.
    /// The login screen renders exactly this list, so a provider that cannot work is never offered.</summary>
    public IReadOnlyList<SocialProviderStatus> EnabledProviders() =>
        [.. Providers.Keys.Select(key => new SocialProviderStatus(key, DisplayName(key), IsUsable(key))).Where(x => x.Enabled)];

    public bool IsUsable(string provider) =>
        provider.Equals(GitHub, StringComparison.OrdinalIgnoreCase)
            ? _settings.GitHubSocialLoginEnabled && Credentials(provider) is not null
            : provider.Equals(LinkedIn, StringComparison.OrdinalIgnoreCase)
                && _settings.LinkedInSocialLoginEnabled && Credentials(provider) is not null;

    /// <summary>The full-page URL to send the browser to. `redirectUri` is the single registered
    /// callback (see <see cref="OAuthStateService.CallbackUrl"/>), identical for every provider and
    /// every flow; `scope` overrides the sign-in scopes for a non-sign-in flow (the Packages screen
    /// asks the same GitHub OAuth App for `read:packages`, not for an email address).</summary>
    public string? BuildAuthorizeUrl(string provider, string redirectUri, string state, string? scope = null)
    {
        if (!Providers.TryGetValue(provider, out var endpoints)) return null;
        if (Credentials(provider) is not { } credentials) return null;

        return endpoints.AuthorizeUrl
            + $"?client_id={Uri.EscapeDataString(credentials.ClientId)}"
            + "&response_type=code"
            + $"&scope={Uri.EscapeDataString(scope ?? endpoints.Scope)}"
            + $"&redirect_uri={Uri.EscapeDataString(redirectUri)}"
            + $"&state={Uri.EscapeDataString(state)}";
    }

    /// <summary>Exchanges the authorization code for an access token. Returns null on any failure —
    /// the caller turns that into a plain-language message, never a provider error body.</summary>
    public async Task<string?> ExchangeCodeAsync(string provider, string code, string redirectUri, CancellationToken ct)
    {
        if (!Providers.TryGetValue(provider, out var endpoints)) return null;
        if (Credentials(provider) is not { } credentials) return null;

        using var request = new HttpRequestMessage(HttpMethod.Post, endpoints.TokenUrl);
        request.Headers.Accept.ParseAdd("application/json");
        request.Content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["client_id"] = credentials.ClientId,
            ["client_secret"] = credentials.ClientSecret,
            ["code"] = code,
            ["redirect_uri"] = redirectUri,
        });

        try
        {
            using var response = await _httpClientFactory.CreateClient().SendAsync(request, ct);
            using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
            return document.RootElement.TryGetProperty("access_token", out var token) ? token.GetString() : null;
        }
        catch (Exception ex) when (ex is HttpRequestException or JsonException) { return null; }
    }

    /// <summary>The account's <em>verified</em> email address — never an unverified one, because it is
    /// the only thing linking this sign-in to an existing account.</summary>
    public Task<string?> FetchVerifiedEmailAsync(string provider, string accessToken, CancellationToken ct) =>
        provider.Equals(LinkedIn, StringComparison.OrdinalIgnoreCase)
            ? FetchLinkedInEmailAsync(accessToken, ct)
            : FetchGitHubEmailAsync(accessToken, ct);

    /// <summary>GitHub's `email` on `/user` can be null or unverified, so read `/user/emails` and take
    /// the address that is both primary and verified.</summary>
    private async Task<string?> FetchGitHubEmailAsync(string accessToken, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "https://api.github.com/user/emails");
        request.Headers.UserAgent.ParseAdd("KeshavSingh-Admin-SocialLogin/1.0");
        request.Headers.Accept.ParseAdd("application/vnd.github+json");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        try
        {
            using var response = await _httpClientFactory.CreateClient().SendAsync(request, ct);
            if (!response.IsSuccessStatusCode) return null;
            using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
            foreach (var entry in document.RootElement.EnumerateArray())
            {
                var verified = entry.TryGetProperty("verified", out var v) && v.GetBoolean();
                var primary = entry.TryGetProperty("primary", out var p) && p.GetBoolean();
                if (verified && primary && entry.TryGetProperty("email", out var e)) return e.GetString();
            }
            return null;
        }
        catch (Exception ex) when (ex is HttpRequestException or JsonException) { return null; }
    }

    /// <summary>LinkedIn's OIDC userinfo. `email_verified` must be true — an unverified address would
    /// let anyone who can claim it sign in as that account.</summary>
    private async Task<string?> FetchLinkedInEmailAsync(string accessToken, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "https://api.linkedin.com/v2/userinfo");
        request.Headers.Accept.ParseAdd("application/json");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        try
        {
            using var response = await _httpClientFactory.CreateClient().SendAsync(request, ct);
            if (!response.IsSuccessStatusCode) return null;
            using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
            var root = document.RootElement;
            if (!root.TryGetProperty("email", out var email)) return null;
            var verified = root.TryGetProperty("email_verified", out var flag)
                && (flag.ValueKind == JsonValueKind.True
                    || (flag.ValueKind == JsonValueKind.String && bool.TryParse(flag.GetString(), out var parsed) && parsed));
            return verified ? email.GetString() : null;
        }
        catch (Exception ex) when (ex is HttpRequestException or JsonException) { return null; }
    }

    private (string ClientId, string ClientSecret)? Credentials(string provider)
    {
        var (id, secret) = provider.Equals(LinkedIn, StringComparison.OrdinalIgnoreCase)
            ? (_settings.LinkedInOAuthClientId, _settings.LinkedInOAuthClientSecret)
            : (_settings.GitHubOAuthClientId, _settings.GitHubOAuthClientSecret);
        return string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(secret) ? null : (id, secret!);
    }

    private sealed record ProviderEndpoints(string DisplayName, string AuthorizeUrl, string TokenUrl, string Scope);
}

/// <summary>One sign-in button for the login screen: the provider key to POST back, and its label.</summary>
public sealed record SocialProviderStatus(string Key, string DisplayName, bool Enabled);
