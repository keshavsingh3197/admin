using Admin.Api.Dtos;
using Admin.Api.Models;
using Admin.Api.Services;
using KeshavSingh.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Admin.Api.Controllers;

/// <summary>
/// Roles, groups, and permission-catalog management. Custom roles/groups gate pages and website
/// access shown in the UI; the fixed Admin/Editor/Viewer roles remain the enforced API boundary,
/// so managing this data still requires Admin.
/// </summary>
[ApiController]
[Route("api/rbac")]
[Authorize]
public sealed class RbacController : ControllerBase
{
    private readonly CustomRoleService _roles;
    private readonly GroupService _groups;
    private readonly PermissionsService _permissions;

    public RbacController(CustomRoleService roles, GroupService groups, PermissionsService permissions)
    {
        _roles = roles;
        _groups = groups;
        _permissions = permissions;
    }

    /// <summary>The caller's own effective permissions/website access — used to gate nav/UI.</summary>
    [HttpGet("permissions/me")]
    public async Task<ActionResult<EffectiveAccessDto>> Me(CancellationToken ct) =>
        Ok(await _permissions.GetEffectiveAccessAsync(User.GetUserId(), ct));

    [HttpGet("permissions/catalog")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<PermissionCatalogResponse>> Catalog(CancellationToken ct) =>
        Ok(await _permissions.GetCatalogAsync(ct));

    /// <summary>Previews the merged page/website access a set of role keys would grant — used by
    /// the Groups UI to show what a group currently gives its members.</summary>
    [HttpGet("permissions/preview")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<EffectiveAccessDto>> Preview([FromQuery] string roleKeys, CancellationToken ct)
    {
        var keys = (roleKeys ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .ToHashSet(StringComparer.Ordinal);
        return Ok(await _permissions.ComputeAccessAsync(keys, isAdmin: false, ct));
    }

    // ---- Roles ----

    [HttpGet("roles")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<IReadOnlyList<CustomRoleView>>> ListRoles(CancellationToken ct) =>
        Ok(await _roles.ListAsync(ct));

    [HttpPost("roles")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<CustomRoleView>> CreateRole(UpsertCustomRoleRequest request, CancellationToken ct)
    {
        try { return Ok(await _roles.CreateAsync(request, ct)); }
        catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPut("roles/{id}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<CustomRoleView>> UpdateRole(string id, UpsertCustomRoleRequest request, CancellationToken ct)
    {
        try
        {
            var updated = await _roles.UpdateAsync(id, request, ct);
            return updated is null ? NotFound() : Ok(updated);
        }
        catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpDelete("roles/{id}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> DeleteRole(string id, CancellationToken ct)
    {
        try
        {
            await _roles.DeleteAsync(id, ct);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    // ---- Groups ----

    [HttpGet("groups")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<IReadOnlyList<GroupView>>> ListGroups(CancellationToken ct) =>
        Ok(await _groups.ListAsync(ct));

    [HttpPost("groups")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<GroupView>> CreateGroup(UpsertGroupRequest request, CancellationToken ct)
    {
        try { return Ok(await _groups.CreateAsync(request, ct)); }
        catch (ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
    }

    [HttpPut("groups/{id}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<GroupView>> UpdateGroup(string id, UpsertGroupRequest request, CancellationToken ct)
    {
        try
        {
            var updated = await _groups.UpdateAsync(id, request, ct);
            return updated is null ? NotFound() : Ok(updated);
        }
        catch (ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
    }

    [HttpDelete("groups/{id}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> DeleteGroup(string id, CancellationToken ct)
    {
        await _groups.DeleteAsync(id, ct);
        return NoContent();
    }

    [HttpPost("groups/{id}/members")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<GroupView>> AddMember(string id, GroupMemberRequest request, CancellationToken ct)
    {
        try
        {
            var updated = await _groups.AddMemberAsync(id, request.UserId, ct);
            return updated is null ? NotFound() : Ok(updated);
        }
        catch (ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
    }

    [HttpDelete("groups/{id}/members/{userId}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<GroupView>> RemoveMember(string id, string userId, CancellationToken ct)
    {
        var updated = await _groups.RemoveMemberAsync(id, userId, ct);
        return updated is null ? NotFound() : Ok(updated);
    }
}
