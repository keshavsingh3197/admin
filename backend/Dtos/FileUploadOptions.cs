namespace Admin.Api.Dtos;

/// <summary>
/// Boundary limits for file uploads, bound from the <c>"FileUpload"</c> config section.
/// Broader than the blog's image-only allowlist because these are personal documents
/// (PDFs, images, plain text), but still a strict allowlist — unknown types are rejected.
/// </summary>
public sealed class FileUploadOptions
{
    public const string Section = "FileUpload";

    public long MaxFileBytes { get; set; } = 10 * 1024 * 1024; // 10 MB

    public string[] AllowedContentTypes { get; set; } =
    {
        "image/png",
        "image/jpeg",
        "image/gif",
        "image/webp",
        "application/pdf",
        "text/plain",
        "text/csv",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
}
