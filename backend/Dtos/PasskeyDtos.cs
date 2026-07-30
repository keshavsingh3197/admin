using System.Text.Json;
using System.Text.Json.Nodes;

namespace Admin.Api.Dtos;

/// <summary>Begin-registration result: an opaque handle plus the options the browser passes to
/// <c>navigator.credentials.create()</c>. The handle is echoed back on complete.
///
/// Options is carried as a raw <see cref="JsonNode"/> produced by Fido2's own <c>ToJson()</c>, NOT
/// the typed object — the app's global camelCase + JsonStringEnumConverter would otherwise rewrite
/// WebAuthn's numeric COSE alg (-7) to "ES256" and "public-key" to "PublicKey", which the browser
/// rejects with "Operation is not supported".</summary>
public sealed record PasskeyRegisterBeginResponse(string Handle, JsonNode Options);

/// <summary>Complete-registration body: the handle, an optional user-supplied device name, and the
/// authenticator's attestation response.
///
/// <c>Response</c> is kept as a raw <see cref="JsonElement"/> and deserialized by Fido2's own types
/// in the service — NOT bound by MVC, whose global JsonStringEnumConverter can't read Fido2's
/// "public-key" enum value ("could not be converted to PublicKeyCredentialType").</summary>
public sealed record PasskeyRegisterCompleteRequest(
    string Handle, string? Name, JsonElement Response);

/// <summary>Begin-login result: an opaque handle plus the options for
/// <c>navigator.credentials.get()</c>. Usernameless, so no credential list is disclosed. Options is
/// raw Fido2 <c>ToJson()</c> for the same reason as the registration response above.</summary>
public sealed record PasskeyLoginBeginResponse(string Handle, JsonNode Options);

/// <summary>Complete-login body: the handle and the authenticator's assertion response (raw
/// <see cref="JsonElement"/>, deserialized by Fido2 in the service — see the registration DTO).</summary>
public sealed record PasskeyLoginCompleteRequest(
    string Handle, JsonElement Response);

/// <summary>A passkey as shown on the security screen. No key material is exposed.</summary>
public sealed record PasskeyListItem(
    string Id, string? Name, bool IsBackedUp, DateTime CreatedAt, DateTime? LastUsedAt);

/// <summary>Step-up confirmation for removing a passkey: the account password is re-verified.</summary>
public sealed record PasskeyRemoveRequest(string Password);
