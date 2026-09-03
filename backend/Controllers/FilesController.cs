using Admin.Api.Dtos;
using Admin.Api.Services;
using KeshavSingh.Auth;
using KeshavSingh.Core;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Admin.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize] // Default-deny: every document is personal data. Denials return 404 (never 403) — anti-IDOR.
[RequirePagePermission("page.files")]
public class FilesController : ControllerBase
{
    private readonly FileService _files;
    private readonly FolderService _folders;
    private readonly FileUploadOptions _opts;
    private readonly ILogger<FilesController> _logger;

    public FilesController(FileService files, FolderService folders, IOptions<FileUploadOptions> opts, ILogger<FilesController> logger)
    {
        _files = files;
        _folders = folders;
        _opts = opts.Value;
        _logger = logger;
    }

    private Task<Caller> CallerAsync() =>
        _folders.BuildCallerAsync(User.GetUserId(), User.IsInRole(Roles.Admin));

    /// <summary>Uploads a document into <c>folderId</c> (omitted = the caller's private root).</summary>
    [HttpPost]
    [RequestSizeLimit(15 * 1024 * 1024)]
    public async Task<ActionResult<UserFileDto>> Upload([FromForm] string? folderId, IFormFile file)
    {
        // Validate at the boundary with an allowlist of type and size.
        if (file is null || file.Length == 0)
            return BadRequest(new { error = "No file was uploaded." });
        if (file.Length > _opts.MaxFileBytes)
            return BadRequest(new { error = $"File exceeds the {_opts.MaxFileBytes / 1024 / 1024} MB limit." });
        if (!_opts.AllowedContentTypes.Contains(file.ContentType))
            return BadRequest(new { error = "Unsupported file type." });

        var caller = await CallerAsync();
        await using var stream = file.OpenReadStream();

        // The declared Content-Type is chosen by whoever is uploading, so on its own the allowlist
        // above checks a value the caller controls. Sniff the leading bytes and store what the file
        // ACTUALLY is: that is the type served back on download, so it is what a browser would act on.
        var detected = await FileSignature.DetectAsync(stream, file.ContentType);
        if (detected is null)
            return BadRequest(new { error = "That file's contents don't match its type." });
        if (!_opts.AllowedContentTypes.Contains(detected))
            return BadRequest(new { error = "Unsupported file type." });

        var saved = await _files.SaveAsync(
            caller, stream, Path.GetFileName(file.FileName), detected, file.Length, NormalizeFolderId(folderId));

        // Null = no Editor rights on the target folder → 404 (don't confirm the folder exists).
        if (saved is null) return NotFound();

        _logger.LogInformation("User {UserId} uploaded file {FileId} ({Size} bytes) to folder {FolderId}.",
            caller.UserId, saved.Id, saved.Size, saved.FolderId ?? "(root)");
        return CreatedAtAction(nameof(Download), new { id = saved.Id }, saved);
    }

    /// <summary>Streams the bytes to anyone with Viewer+ access; 404 otherwise (anti-IDOR).</summary>
    [HttpGet("{id}/download")]
    public async Task<IActionResult> Download(string id)
    {
        var file = await _files.GetForReadAsync(id, await CallerAsync());
        if (file is null) return NotFound();

        var stream = await _files.OpenAsync(file);
        if (stream is null)
        {
            _logger.LogWarning("File {FileId} metadata present but blob missing from store.", id);
            return NotFound();
        }

        Response.Headers.CacheControl = "no-store"; // Personal data — keep out of shared/proxy caches.
        return File(stream, file.ContentType, file.FileName);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id) =>
        await _files.DeleteAsync(id, await CallerAsync()) ? NoContent() : NotFound();

    [HttpPut("{id}/move")]
    public async Task<IActionResult> Move(string id, [FromBody] MoveFileRequest req) =>
        await _files.MoveAsync(id, NormalizeFolderId(req.FolderId), await CallerAsync()) ? NoContent() : NotFound();

    private static string? NormalizeFolderId(string? folderId) =>
        string.IsNullOrWhiteSpace(folderId) ? null : folderId;
}
