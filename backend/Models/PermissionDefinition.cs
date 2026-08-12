using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
namespace Admin.Api.Models;
public sealed class PermissionDefinition
{
    [BsonId, BsonRepresentation(BsonType.ObjectId)] public string Id { get; set; } = ObjectId.GenerateNewId().ToString();
    public string Key { get; set; } = string.Empty;
    public string Scope { get; set; } = "admin"; // admin | site
    public string Category { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public bool IsSystem { get; set; } = true;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
