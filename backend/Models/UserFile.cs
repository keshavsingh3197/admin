using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Admin.Api.Models;

/// <summary>
/// Metadata for a private file owned by a single user. The bytes live in the configured object
/// store under <see cref="StoredName"/> (a random key); this document is the only link between a
/// user and their blob. Every read/delete is scoped by <see cref="OwnerUserId"/> — these are
/// personal data and are never public.
/// </summary>
public class UserFile
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    /// <summary>The owning user's id (JWT subject). All queries filter on this.</summary>
    [BsonElement("ownerUserId")]
    public string OwnerUserId { get; set; } = string.Empty;

    /// <summary>Sanitised original filename, for display/download only — never used as a path.</summary>
    [BsonElement("fileName")]
    public string FileName { get; set; } = string.Empty;

    /// <summary>Random, unguessable object-store key. Contains no user input.</summary>
    [BsonElement("storedName")]
    public string StoredName { get; set; } = string.Empty;

    [BsonElement("contentType")]
    public string ContentType { get; set; } = string.Empty;

    [BsonElement("size")]
    public long Size { get; set; }

    [BsonElement("createdAt")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
