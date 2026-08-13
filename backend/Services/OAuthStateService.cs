using System.Text.Json;
using KeshavSingh.Security;

namespace Admin.Api.Services;

/// <summary>
/// Everything the OAuth flows share: the ONE redirect URI every provider is registered with, and the
/// signed, self-contained <c>state</c> that carries the rest of the request through the round-trip.
///
/// <para>Providers (GitHub, LinkedIn) match <c>redirect_uri</c> against what was registered for the
/// application, so it must be a single stable URL — not "whatever host this request happened to
/// arrive on". Reaching the same API through <c>id.keshavsingh.in</c> instead of the registered host
/// is exactly what produces GitHub's "The redirect_uri is not associated with this application".
/// <see cref="CallbackUrl"/> is therefore built from the configured canonical base URL, and every
/// flow lands on the same <see cref="CallbackPath"/>; where the user actually goes afterwards comes
/// out of the state, never out of a second registered URL.</para>
///
/// <para>The state is AES-GCM encrypted via <see cref="DataProtector"/> and time-limited: forging one
/// without the server's data key is infeasible, and a stale one (&gt;10 min) is rejected.</para>
/// </summary>
public sealed class OAuthStateService
{
    /// <summary>The single callback path registered with every OAuth provider, for every flow.</summary>
    public const string CallbackPath = "/api/oauth/callback";

    private static readonly TimeSpan StateLifetime = TimeSpan.FromMinutes(10);

    private readonly DataProtector _protector;
    private readonly SettingsService _settings;

    public OAuthStateService(DataProtector protector, SettingsService settings)
    {
        _protector = protector;
        _settings = settings;
    }

    /// <summary>
    /// The exact value to register as the provider's authorization callback URL. Prefers the
    /// canonical base URL from Settings; falls back to the current request's own origin so a fresh
    /// deployment (or localhost) still works before that setting is filled in.
    /// </summary>
    public string CallbackUrl(HttpRequest request)
    {
        var configured = _settings.OAuthCallbackBaseUrl;
        var origin = string.IsNullOrWhiteSpace(configured)
            ? $"{request.Scheme}://{request.Host}"
            : configured.TrimEnd('/');
        return origin + CallbackPath;
    }

    public string Encode(OAuthState state) => _protector.Encrypt(JsonSerializer.Serialize(state));

    public OAuthState? TryDecode(string? state)
    {
        if (string.IsNullOrWhiteSpace(state)) return null;
        try
        {
            var payload = JsonSerializer.Deserialize<OAuthState>(_protector.Decrypt(state));
            if (payload is null || DateTimeOffset.UtcNow - payload.IssuedAt > StateLifetime) return null;
            return payload;
        }
        catch (Exception) { return null; } // Wrong/rotated key, tampered value, malformed JSON — reject, don't throw.
    }

    /// <summary>Where to send the browser once the provider hands control back: the origin of the
    /// screen that started the flow, taken from Origin/Referer on the (authenticated or rate-limited)
    /// start call and allowlisted to the keshavsingh.in family.</summary>
    public static string? ResolveTrustedOrigin(HttpRequest request)
    {
        var raw = request.Headers["Origin"].FirstOrDefault()
            ?? (request.Headers["Referer"].FirstOrDefault() is { } referer && Uri.TryCreate(referer, UriKind.Absolute, out var refUri)
                ? refUri.GetLeftPart(UriPartial.Authority)
                : null);
        if (raw is null || !Uri.TryCreate(raw, UriKind.Absolute, out var uri)) return null;
        return IsFamilyUrl(raw) ? uri.GetLeftPart(UriPartial.Authority) : null;
    }

    /// <summary>Absolute https (or http://localhost in dev) on the keshavsingh.in family — the same
    /// allowlist the login page applies client-side to <c>?return=</c>. Allowlist, not denylist:
    /// these values become redirect targets, so anything else is rejected outright.</summary>
    public static bool IsFamilyUrl(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || !Uri.TryCreate(value, UriKind.Absolute, out var uri)) return false;
        var isLocalhost = uri.Host == "localhost";
        if (uri.Scheme != Uri.UriSchemeHttps && !(isLocalhost && uri.Scheme == Uri.UriSchemeHttp)) return false;
        return isLocalhost || uri.Host == "keshavsingh.in"
            || uri.Host.EndsWith(".keshavsingh.in", StringComparison.OrdinalIgnoreCase);
    }
}

/// <summary>
/// What the single callback needs to finish a flow it did not start.
/// <paramref name="Purpose"/> selects the branch (<c>social</c> sign-in vs connecting a GitHub
/// packages token), <paramref name="Provider"/> the OAuth provider, and <paramref name="Origin"/> /
/// <paramref name="ReturnUrl"/> where the browser ends up — the reason a single registered redirect
/// URI can still serve every site in the family.
/// </summary>
public sealed record OAuthState(
    string Nonce,
    string Purpose,
    string Provider,
    string Origin,
    string RedirectUri,
    string AppKey,
    string? ReturnUrl,
    DateTimeOffset IssuedAt)
{
    public const string SocialLoginPurpose = "social";
    public const string PackagesTokenPurpose = "packages";
}
