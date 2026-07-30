using Admin.Api.Models;
using KeshavSingh.Auth.Abstractions;
using KeshavSingh.Auth.Dtos;
using KeshavSingh.Security;
using Microsoft.Extensions.Options;

namespace Admin.Api.Auth;

/// <summary>
/// Issues an SSO session for a user who has already been authenticated by a means the shared
/// <c>AuthEngine</c> does not itself perform (here: a verified passkey assertion).
///
/// It deliberately reuses the SAME building blocks the engine composes for password login —
/// <see cref="JwtService"/> for the access token and <see cref="IRefreshTokenStore"/> +
/// <see cref="TokenHasher"/> for the rotating refresh token — so the resulting refresh cookie is
/// indistinguishable from an engine-issued one and is validated/rotated by the existing
/// <c>POST /api/sso/session</c> path. This is composition of the blessed primitives, not a
/// re-implementation of token crypto.
/// </summary>
public sealed class SessionMinter
{
    private readonly JwtService _jwt;
    private readonly IRefreshTokenStore _refreshTokens;
    private readonly IAuthSettings _settings;
    private readonly SsoCookieOptions _cookie;

    public SessionMinter(
        JwtService jwt,
        IRefreshTokenStore refreshTokens,
        IAuthSettings settings,
        IOptions<SsoCookieOptions> cookie)
    {
        _jwt = jwt;
        _refreshTokens = refreshTokens;
        _settings = settings;
        _cookie = cookie.Value;
    }

    /// <summary>
    /// Mints an access + refresh token pair for <paramref name="user"/>, persists the refresh
    /// record, writes the HttpOnly SSO cookie to <paramref name="response"/>, and returns the
    /// in-body session (access token + profile; never the refresh token).
    /// </summary>
    public async Task<SsoSessionResponse> IssueAsync(User user, HttpResponse response, CancellationToken ct = default)
    {
        var (accessToken, accessTokenExpiresAt) = _jwt.CreateAccessToken(
            new JwtSubject(user.Id, user.Email, user.DisplayName, user.Roles), _settings.AccessTokenMinutes);

        // Opaque refresh token: only its hash is stored, exactly as the engine does at login.
        var refreshToken = TokenHasher.NewOpaqueToken();
        await _refreshTokens.AddAsync(new RefreshTokenRecord
        {
            UserId = user.Id,
            TokenHash = TokenHasher.Hash(refreshToken),
            ExpiresAt = _jwt.RefreshTokenExpiry(_settings.RefreshTokenDays),
        }, ct);

        var expires = DateTimeOffset.UtcNow.AddDays(_settings.RefreshTokenDays);
        response.Cookies.Append(_cookie.CookieName, refreshToken, _cookie.BuildWriteOptions(expires));

        var profile = new UserProfile(
            user.Id, user.Email, user.Username, user.DisplayName,
            user.Roles.ToList(), user.TwoFactorEnabled, user.MustChangePassword);

        return new SsoSessionResponse(accessToken, accessTokenExpiresAt, profile);
    }
}
