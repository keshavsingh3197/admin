namespace Admin.Api.Auth;

/// <summary>
/// Bindable options (config section "WebAuthn") for FIDO2 passkeys.
///
/// <para><see cref="RelyingPartyId"/> must be a registrable-domain suffix of every origin that runs
/// the passkey ceremonies. Using the parent domain ("keshavsingh.in") means a passkey works across
/// every sibling app (admin., id., …) — the same reason the SSO cookie is scoped to the parent.</para>
///
/// <para><see cref="Origins"/> is the exact allowlist of browser origins the WebAuthn library will
/// accept in clientDataJSON. Only origins that actually run <c>navigator.credentials</c> (the login
/// and security pages) belong here — never a wildcard.</para>
/// </summary>
public sealed class WebAuthnOptions
{
    public const string Section = "WebAuthn";

    public string RelyingPartyId { get; set; } = "localhost";
    public string RelyingPartyName { get; set; } = "Keshav Singh ID";
    public List<string> Origins { get; set; } = new();

    /// <summary>Minutes a begun registration/assertion challenge stays valid.</summary>
    public int ChallengeMinutes { get; set; } = 5;
}
