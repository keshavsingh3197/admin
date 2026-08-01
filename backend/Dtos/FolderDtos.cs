namespace Admin.Api.Dtos;

/// <summary>A folder in a browse listing. ShareCount is only meaningful to the owner.</summary>
public sealed record FolderDto(string Id, string Name, string? ParentId, int ShareCount, DateTime CreatedAt);

/// <summary>A single share on a folder, with the subject's resolved display name for the UI.</summary>
public sealed record FolderShareDto(string SubjectType, string SubjectId, string SubjectName, string Level);

public sealed record BreadcrumbItem(string Id, string Name);

/// <summary>
/// The contents of one folder (or the root), plus the caller's access level there. At the root,
/// <see cref="SharedWithMe"/> lists folders others have shared with the caller; inside a folder it is empty.
/// </summary>
public sealed record BrowseView(
    string? FolderId,
    string MyAccess,                          // "owner" | "editor" | "viewer"
    IReadOnlyList<BreadcrumbItem> Breadcrumb,
    IReadOnlyList<FolderDto> Folders,
    IReadOnlyList<UserFileDto> Files,
    IReadOnlyList<FolderDto> SharedWithMe);

public sealed record CreateFolderRequest(string Name, string? ParentId);
public sealed record RenameFolderRequest(string Name);
public sealed record ShareRequest(string SubjectType, string SubjectId, string Level);
public sealed record MoveFileRequest(string? FolderId);
