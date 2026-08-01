using Admin.Api.Dtos;
using Admin.Api.Models;
using Admin.Api.Services;
using KeshavSingh.Auth;
using KeshavSingh.Core;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Admin.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize] // Default-deny: every file is personal data — no anonymous access, ever.
public class FilesController : ControllerBase
{
    private readonly FileService _files;
    private readonly FileUploadOptions _opts;
    private readonly ILogger<FilesController> _logger;

    public FilesController(FileService files, IOptions<FileUploadOptions> opts, ILogger<FilesController> logger)
    {
        _files = files;
        _opts = opts.Value;
        _logger = logger;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<UserFileDto>>> List()
    {
        var files = await _files.ListAsync(User.GetUserId());
        return Ok(files.Select(Map).ToList());
    }

    [HttpPost]
    [RequestSizeLimit(15 * 1024 * 1024)]
    public async Task<ActionResult<UserFileDto>> Upload(IFormFile file)
    {
        // Validate at the boundary with an allowlist of type and size.
        if (file is null || file.Length == 0)
            return BadRequest(new { error = "No file was uploaded." });
        if (file.Length > _opts.MaxFileBytes)
            return BadRequest(new { error = $"File exceeds the {_opts.MaxFileBytes / 1024 / 1024} MB limit." });
        if (!_opts.AllowedContentTypes.Contains(file.ContentType))
            return BadRequest(new { error = "Unsupported file type." });

        await using var stream = file.OpenReadStream();
        var saved = await _files.SaveAsync(
            User.GetUserId(),
            stream,
            Path.GetFileName(file.FileName), // Display only; stripped of any path.
            file.ContentType,
            file.Length);

        _logger.LogInformation("User {UserId} uploaded file {FileId} ({Size} bytes).",
            User.GetUserId(), saved.Id, saved.Size);
        return CreatedAtAction(nameof(Download), new { id = saved.Id }, Map(saved));
    }

    /// <summary>
    /// Streams the bytes to the owner (or an admin). Returns 404 — not 403 — when the file
    /// belongs to another user, so the response never confirms someone else's file exists.
    /// </summary>
    [HttpGet("{id}/download")]
    public async Task<IActionResult> Download(string id)
    {
        var file = await _files.GetAccessibleAsync(User.GetUserId(), id, User.IsInRole(Roles.Admin));
        if (file is null) return NotFound();

        var stream = await _files.OpenAsync(file);
        if (stream is null)
        {
            // Metadata exists but the blob is gone — fail closed rather than 200 with no body.
            _logger.LogWarning("File {FileId} metadata present but blob missing from store.", id);
            return NotFound();
        }

        // Personal data — keep it out of shared/proxy caches.
        Response.Headers.CacheControl = "no-store";
        return File(stream, file.ContentType, file.FileName);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id)
    {
        var deleted = await _files.DeleteAsync(User.GetUserId(), id, User.IsInRole(Roles.Admin));
        return deleted ? NoContent() : NotFound();
    }

    private static UserFileDto Map(UserFile f) =>
        new(f.Id!, f.FileName, f.ContentType, f.Size, f.CreatedAt);
}
