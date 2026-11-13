using Admin.Api.Dtos;
using Admin.Api.Services;
using KeshavSingh.Core;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Admin.Api.Controllers;

/// <summary>
/// Admin-only CRUD for the central ecosystem Creator Channels & Social Profiles registry.
/// Consumers receive enabled channels via <c>GET /api/config</c> and <c>GET /api/config/channels</c>.
/// </summary>
[ApiController]
[Route("api/settings/channels")]
[Authorize(Roles = Roles.Admin)]
public sealed class CreatorChannelsController : ControllerBase
{
    private readonly CreatorChannelService _channels;
    private readonly AdminAuditService _audit;

    public CreatorChannelsController(CreatorChannelService channels, AdminAuditService audit)
    {
        _channels = channels;
        _audit = audit;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<CreatorChannelView>>> List(CancellationToken ct) =>
        Ok(await _channels.ListAsync(ct));

    [HttpPost]
    public async Task<ActionResult<CreatorChannelView>> Create(
        [FromBody] UpsertCreatorChannelRequest request, CancellationToken ct)
    {
        try
        {
            var created = await _channels.CreateAsync(request, ct);
            await _audit.RecordAsync(AdminAuditEvents.SettingsChanged, "creator-channel",
                $"Created creator channel '{created.Key}' ({created.Platform})", ct: ct);
            return Created($"/api/settings/channels/{created.Id}", created);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (MongoDB.Driver.MongoWriteException ex)
            when (ex.WriteError.Category == MongoDB.Driver.ServerErrorCategory.DuplicateKey)
        {
            return Conflict(new { error = $"A channel with key '{request.Key}' already exists." });
        }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<CreatorChannelView>> Update(
        string id, [FromBody] UpsertCreatorChannelRequest request, CancellationToken ct)
    {
        try
        {
            var updated = await _channels.UpdateAsync(id, request, ct);
            if (updated is null) return NotFound();
            await _audit.RecordAsync(AdminAuditEvents.SettingsChanged, "creator-channel",
                $"Updated creator channel '{updated.Key}' ({updated.Platform})", ct: ct);
            return Ok(updated);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (MongoDB.Driver.MongoWriteException ex)
            when (ex.WriteError.Category == MongoDB.Driver.ServerErrorCategory.DuplicateKey)
        {
            return Conflict(new { error = $"A channel with key '{request.Key}' already exists." });
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id, CancellationToken ct)
    {
        await _channels.DeleteAsync(id, ct);
        await _audit.RecordAsync(AdminAuditEvents.SettingsChanged, "creator-channel",
            $"Deleted creator channel {id}", ct: ct);
        return NoContent();
    }

    [HttpPost("resolve-youtube")]
    public async Task<ActionResult<ResolvedYouTubeChannelResponse>> ResolveYouTube(
        [FromBody] ResolveYouTubeChannelRequest request, CancellationToken ct)
    {
        try
        {
            var resolved = await _channels.ResolveYouTubeAsync(request.HandleOrUrl, ct);
            return Ok(resolved);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }
}
