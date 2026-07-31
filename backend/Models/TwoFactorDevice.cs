using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Admin.Api.Models;

public sealed class TwoFactorDevice
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();

    public string UserId { get; set; } = string.Empty;
    public string Name { get; set; } = "Authenticator";
    public string DeviceType { get; set; } = "Authenticator App";
    public string? CreatedFromOrigin { get; set; }
    public string? CreatedFromDevice { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastUsedAt { get; set; }
}
