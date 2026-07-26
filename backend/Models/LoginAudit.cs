using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Admin.Api.Models;

/// <summary>Security audit event. Never stores passwords, tokens, or other personal data.</summary>
public sealed class LoginAudit
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();

    public string? UserId { get; set; }
    public string Email { get; set; } = string.Empty;
    public string Event { get; set; } = string.Empty;        // See KeshavSingh.Auth AuthEvents.
    public bool Success { get; set; }
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}
