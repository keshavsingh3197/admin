using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Admin.Api.Models;

/// <summary>
/// A user-defined role: a named bundle of permission-catalog keys plus website access. Distinct
/// from the fixed <see cref="Roles"/> (Admin/Editor/Viewer), which remain the actual API
/// authorization mechanism. Custom roles gate pages/features in the UI and can be assigned
/// directly to a user or via a <see cref="Group"/>.
/// </summary>
public sealed class CustomRole
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();

    /// <summary>Unique slug, e.g. "content-editor".</summary>
    public string Key { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }

    /// <summary>Keys from <see cref="PermissionCatalog"/>.</summary>
    public List<string> Permissions { get; set; } = new();

    /// <summary>Website registry keys this role can access, or ["*"] for all websites.</summary>
    public List<string> WebsiteAccess { get; set; } = new();

    /// <summary>Seeded built-in role (admin/editor/viewer) — read-only via the API.</summary>
    public bool IsSystem { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
