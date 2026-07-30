using Microsoft.AspNetCore.Http;

namespace Admin.Api.Auth;

/// <summary>
/// Bindable options (config section "Sso") for the cross-subdomain single-sign-on cookie that
/// carries the rotating refresh token. The cookie is the ONLY place the refresh token lives on
/// the client — it is never returned in a response body and is <see cref="HttpOnly"/> so no
/// script (on any origin) can read it.
///
/// In production the cookie is scoped to the parent domain (e.g. ".keshavsingh.in") so every
/// sibling site (admin.keshavsingh.in, git.keshavsingh.in, …) sends it and can silently obtain
/// an access token from this identity provider. In development leave <see cref="Domain"/> empty
/// and <see cref="Secure"/> false so it works over http://localhost.
/// </summary>
public sealed class SsoCookieOptions
{
    public const string Section = "Sso";

    /// <summary>Cookie name. Kept opaque; not security-sensitive.</summary>
    public string CookieName { get; set; } = "ks_sso";

    /// <summary>
    /// Cookie Domain. Set to the leading-dot parent domain in production (".keshavsingh.in").
    /// Empty/null pins the cookie to the current host — the correct behaviour for localhost.
    /// </summary>
    public string? Domain { get; set; }

    /// <summary>Send only over TLS. Must be true in production; false for http://localhost.</summary>
    public bool Secure { get; set; } = true;

    /// <summary>
    /// SameSite mode. "Lax" is correct here: all apps share the registrable domain, so
    /// cross-subdomain requests are same-site and the cookie is sent (with CORS credentials).
    /// </summary>
    public SameSiteMode SameSite { get; set; } = SameSiteMode.Lax;

    /// <summary>Builds the write options for the refresh cookie (adds the token's lifetime).</summary>
    public CookieOptions BuildWriteOptions(DateTimeOffset expiresAt) => new()
    {
        HttpOnly = true,
        Secure = Secure,
        SameSite = SameSite,
        Path = "/",
        Domain = string.IsNullOrWhiteSpace(Domain) ? null : Domain,
        Expires = expiresAt,
        IsEssential = true, // Auth cookie — not subject to non-essential consent gating.
    };

    /// <summary>Builds the delete options; attributes must match the write options to clear it.</summary>
    public CookieOptions BuildDeleteOptions() => new()
    {
        HttpOnly = true,
        Secure = Secure,
        SameSite = SameSite,
        Path = "/",
        Domain = string.IsNullOrWhiteSpace(Domain) ? null : Domain,
    };
}
