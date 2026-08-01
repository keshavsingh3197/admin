using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Admin.Api.Models;

/// <summary>The caller's resolved level of access to a folder (and, by inheritance, its contents).</summary>
public enum FolderAccess { None = 0, Viewer = 1, Editor = 2, Owner = 3 }

/// <summary>Allowed share subject kinds. A share targets either one user or a whole group.</summary>
public static class ShareSubjectType
{
    public const string User = "user";
    public const string Group = "group";
    public static bool IsValid(string? v) => v is User or Group;
}

/// <summary>Allowed share levels — these are per-folder levels, distinct from the global app Roles.</summary>
public static class FolderShareLevel
{
    public const string Viewer = "viewer";
    public const string Editor = "editor";
    public static bool IsValid(string? v) => v is Viewer or Editor;
    public static FolderAccess ToAccess(string level) => level == Editor ? FolderAccess.Editor : FolderAccess.Viewer;
    public static string FromAccess(FolderAccess a) => a switch
    {
        FolderAccess.Owner => "owner",
        FolderAccess.Editor => Editor,
        FolderAccess.Viewer => Viewer,
        _ => "none",
    };
}

/// <summary>A grant of access on a folder to another subject (a user or a group).</summary>
public sealed class FolderShare
{
    [BsonElement("subjectType")] public string SubjectType { get; set; } = ShareSubjectType.User;
    [BsonElement("subjectId")] public string SubjectId { get; set; } = string.Empty;
    [BsonElement("level")] public string Level { get; set; } = FolderShareLevel.Viewer;
}

/// <summary>
/// A folder in a user's document tree. Owned by the root creator; may be shared with other users or
/// groups. Shares cascade down to descendant folders and to the documents inside — access is resolved
/// by walking the ancestor chain (see <c>FolderService.ResolveAccessAsync</c>). Personal data by
/// default: a folder is visible only to its owner unless explicitly shared.
/// </summary>
public sealed class Folder
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    /// <summary>The tree owner (subfolders inherit the parent's owner so a tree has a single owner).</summary>
    [BsonElement("ownerUserId")] public string OwnerUserId { get; set; } = string.Empty;

    [BsonElement("name")] public string Name { get; set; } = string.Empty;

    /// <summary>Parent folder id; null means a root folder in the owner's space.</summary>
    [BsonElement("parentId")]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? ParentId { get; set; }

    [BsonElement("shares")] public List<FolderShare> Shares { get; set; } = new();

    [BsonElement("createdAt")] public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    [BsonElement("updatedAt")] public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
