using KeshavSingh.Auth.Dtos;

namespace Admin.Api.Auth;

/// <summary>
/// The session body returned to a SPA: the short-lived access token (held in memory) plus the
/// user profile. The refresh token is deliberately absent — it is delivered only as the HttpOnly
/// SSO cookie.
/// </summary>
public sealed record SsoSessionResponse(string AccessToken, DateTime AccessTokenExpiresAt, UserProfile User);

/// <summary>
/// Result of the password step: either a two-factor challenge (no session yet) or an established
/// <see cref="Session"/> (with the SSO cookie already set).
/// </summary>
public sealed record SsoLoginResponse(
    bool TwoFactorRequired,
    string? TwoFactorToken,
    bool EmailFallbackAvailable,
    bool SmsFallbackAvailable,
    SsoSessionResponse? Session);
