namespace Admin.Api.Dtos;

/// <summary>What the Files list/upload endpoints return to the client. No storage URL is exposed;
/// bytes are fetched only through the authenticated <c>GET /api/files/{id}/download</c> endpoint.</summary>
public sealed record UserFileDto(
    string Id,
    string FileName,
    string ContentType,
    long Size,
    DateTime CreatedAt,
    string? FolderId);
