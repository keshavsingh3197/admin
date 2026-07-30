using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Admin.Api.Models;

/// <summary>
/// A short-lived, single-use WebAuthn challenge held between the "begin" and "complete" halves of
/// a registration or assertion. Persisted (rather than kept in memory) so it survives across app
/// instances, and consumed exactly once. The opaque <see cref="Handle"/> is what the client echoes
/// back; the ceremony options — including the random challenge the signature is bound to — live in
/// <see cref="OptionsJson"/> server-side and are never trusted from the client.
/// </summary>
public sealed class WebAuthnChallenge
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();

    /// <summary>Opaque random handle returned to the client and echoed back on complete.</summary>
    public string Handle { get; set; } = string.Empty;

    /// <summary>"register" or "assert".</summary>
    public string Purpose { get; set; } = string.Empty;

    /// <summary>Set for registration (the authenticated user); null for usernameless assertion.</summary>
    public string? UserId { get; set; }

    /// <summary>The Fido2 options serialized via <c>ToJson()</c>.</summary>
    public string OptionsJson { get; set; } = string.Empty;

    public DateTime ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
