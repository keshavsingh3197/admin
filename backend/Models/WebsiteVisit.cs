using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Admin.Api.Models;

public sealed class WebsiteVisit
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();

    public string WebsiteKey { get; set; } = string.Empty;
    public string Path { get; set; } = "/";
    public string Country { get; set; } = "Unknown";
    public string VisitorKey { get; set; } = string.Empty;
    public string? Referrer { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}
