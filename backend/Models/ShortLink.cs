using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Admin.Api.Models;

public class ShortLink
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    /// <summary>The path segment after /s/ — either generated or a caller-chosen custom code. Unique.</summary>
    [BsonElement("code")]
    public string Code { get; set; } = string.Empty;

    [BsonElement("targetUrl")]
    public string TargetUrl { get; set; } = string.Empty;

    [BsonElement("clicks")]
    public long Clicks { get; set; }

    [BsonElement("createdAt")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [BsonElement("lastAccessedAt")]
    public DateTime? LastAccessedAt { get; set; }

    /// <summary>Optional. Once past this instant the redirect answers 404 instead of resolving.</summary>
    [BsonElement("expiresAt")]
    public DateTime? ExpiresAt { get; set; }
}
