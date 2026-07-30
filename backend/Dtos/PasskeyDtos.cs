using Fido2NetLib;

namespace Admin.Api.Dtos;

/// <summary>Begin-registration result: an opaque handle plus the options the browser passes to
/// <c>navigator.credentials.create()</c>. The handle is echoed back on complete.</summary>
public sealed record PasskeyRegisterBeginResponse(string Handle, CredentialCreateOptions Options);

/// <summary>Complete-registration body: the handle, an optional user-supplied device name, and the
/// authenticator's attestation response.</summary>
public sealed record PasskeyRegisterCompleteRequest(
    string Handle, string? Name, AuthenticatorAttestationRawResponse Response);

/// <summary>Begin-login result: an opaque handle plus the options for
/// <c>navigator.credentials.get()</c>. Usernameless, so no credential list is disclosed.</summary>
public sealed record PasskeyLoginBeginResponse(string Handle, AssertionOptions Options);

/// <summary>Complete-login body: the handle and the authenticator's assertion response.</summary>
public sealed record PasskeyLoginCompleteRequest(
    string Handle, AuthenticatorAssertionRawResponse Response);

/// <summary>A passkey as shown on the security screen. No key material is exposed.</summary>
public sealed record PasskeyListItem(
    string Id, string? Name, bool IsBackedUp, DateTime CreatedAt, DateTime? LastUsedAt);

/// <summary>Step-up confirmation for removing a passkey: the account password is re-verified.</summary>
public sealed record PasskeyRemoveRequest(string Password);
