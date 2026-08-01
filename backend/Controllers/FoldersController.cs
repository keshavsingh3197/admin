using Admin.Api.Dtos;
using Admin.Api.Models;
using Admin.Api.Services;
using KeshavSingh.Auth;
using KeshavSingh.Core;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Admin.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize] // Default-deny: every folder is personal data. Denials return 404 (never 403) — anti-IDOR.
public class FoldersController : ControllerBase
{
    private readonly FolderService _folders;
    private readonly FileService _files;

    public FoldersController(FolderService folders, FileService files)
    {
        _folders = folders;
        _files = files;
    }

    private Task<Caller> CallerAsync() =>
        _folders.BuildCallerAsync(User.GetUserId(), User.IsInRole(Roles.Admin));

    /// <summary>Lists a folder's contents (or the root: the caller's own items + "shared with me").</summary>
    [HttpGet("browse")]
    public async Task<ActionResult<BrowseView>> Browse([FromQuery] string? parentId)
    {
        var caller = await CallerAsync();

        if (parentId is null)
        {
            var rootFolders = await _folders.ListChildFoldersAsync(null, caller);
            var rootFiles = await _files.ListDtosInFolderAsync(null, caller);
            var shared = await _folders.ListSharedRootsAsync(caller);
            return Ok(new BrowseView(null, "owner", Array.Empty<BreadcrumbItem>(), rootFolders, rootFiles, shared));
        }

        var (folder, access) = await _folders.GetWithAccessAsync(parentId, caller);
        if (folder is null || access == FolderAccess.None) return NotFound();

        var folders = await _folders.ListChildFoldersAsync(parentId, caller);
        var files = await _files.ListDtosInFolderAsync(parentId, caller);
        var breadcrumb = await _folders.BuildBreadcrumbAsync(folder);
        return Ok(new BrowseView(parentId, FolderShareLevel.FromAccess(access), breadcrumb, folders, files, Array.Empty<FolderDto>()));
    }

    [HttpPost]
    public async Task<ActionResult<FolderDto>> Create([FromBody] CreateFolderRequest req)
    {
        try
        {
            var created = await _folders.CreateAsync(req, await CallerAsync());
            return created is null ? NotFound() : Ok(created);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Rename(string id, [FromBody] RenameFolderRequest req)
    {
        try
        {
            return await _folders.RenameAsync(id, req.Name, await CallerAsync()) ? NoContent() : NotFound();
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id) =>
        await _folders.DeleteRecursiveAsync(id, await CallerAsync()) ? NoContent() : NotFound();

    // ---- Sharing (owner only) ----

    [HttpGet("{id}/shares")]
    public async Task<ActionResult<IReadOnlyList<FolderShareDto>>> ListShares(string id)
    {
        var (folder, access) = await _folders.GetWithAccessAsync(id, await CallerAsync());
        if (folder is null || access < FolderAccess.Owner) return NotFound();
        return Ok(await _folders.ListSharesAsync(folder));
    }

    [HttpPost("{id}/shares")]
    public async Task<IActionResult> AddShare(string id, [FromBody] ShareRequest req)
    {
        var (folder, access) = await _folders.GetWithAccessAsync(id, await CallerAsync());
        if (folder is null || access < FolderAccess.Owner) return NotFound();
        return await _folders.AddShareAsync(folder, req)
            ? NoContent()
            : BadRequest(new { error = "Invalid share target or level." });
    }

    [HttpDelete("{id}/shares")]
    public async Task<IActionResult> RemoveShare(string id, [FromQuery] string subjectType, [FromQuery] string subjectId)
    {
        var (folder, access) = await _folders.GetWithAccessAsync(id, await CallerAsync());
        if (folder is null || access < FolderAccess.Owner) return NotFound();
        await _folders.RemoveShareAsync(folder, subjectType, subjectId);
        return NoContent();
    }
}
