using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Admin.Api.Models;

public sealed class DatabaseBackup
{
    [BsonId, BsonRepresentation(BsonType.ObjectId)] public string Id { get; set; } = ObjectId.GenerateNewId().ToString();
    public string StorageKey { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string CreatedByUserId { get; set; } = string.Empty;
}
