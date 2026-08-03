using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Admin.Api.Models;

/// <summary>
/// A user group: a named collection of members that inherits the permissions and website access
/// of its assigned <see cref="CustomRole"/> keys. Membership is stored here (not on the user
/// document) so group CRUD and membership changes stay isolated to one collection.
/// </summary>
public sealed class Group
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();

    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }

    /// <summary>CustomRole.Key values granted to every member of this group.</summary>
    public List<string> RoleKeys { get; set; } = new();

    public List<string> MemberUserIds { get; set; } = new();

    /// <summary>
    /// When true, members can see each other in the chat directory even if their individual
    /// <c>ChatVisibility</c> is set to "family" (as opposed to "everyone"). A user may belong to more
    /// than one family-circle group; sharing membership in any one of them is enough.
    /// </summary>
    public bool IsFamilyCircle { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
