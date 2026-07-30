using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Admin.Api.Models;

/// <summary>
/// A registered WebAuthn/FIDO2 passkey. Stored in its own collection (not embedded on the user)
/// so a discoverable "usernameless" sign-in can look a credential up by its id across all users.
/// None of this is secret: the stored <see cref="PublicKey"/> only verifies signatures, it cannot
/// produce them, and the private key never leaves the authenticator.
/// </summary>
public sealed class PasskeyCredential
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();

    public string UserId { get; set; } = string.Empty;

    /// <summary>Base64url of the raw credential id — the lookup key on assertion.</summary>
    public string CredentialId { get; set; } = string.Empty;

    /// <summary>COSE public key used to verify assertion signatures.</summary>
    public byte[] PublicKey { get; set; } = Array.Empty<byte>();

    /// <summary>User handle presented at registration (the account's stable id bytes).</summary>
    public byte[] UserHandle { get; set; } = Array.Empty<byte>();

    /// <summary>Signature counter; must not go backwards (clone-detection).</summary>
    public long SignCount { get; set; }

    /// <summary>Friendly label the user gives the device ("MacBook Touch ID").</summary>
    public string? Name { get; set; }

    [BsonRepresentation(BsonType.String)]
    public Guid AaGuid { get; set; }

    public string[] Transports { get; set; } = Array.Empty<string>();
    public bool IsBackedUp { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastUsedAt { get; set; }
}
