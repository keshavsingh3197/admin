using Admin.Api.Models;
using Admin.Api.Services;
using KeshavSingh.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Admin.Api.Controllers;

/// <summary>
/// Dedicated API surface for the KeshavMobileApp (FamSphere) and Admin Family Hub.
/// Allows synchronizing chores, tasks, shared events, confidential credentials/vault,
/// family circle contacts, and broadcasting emergency SOS notifications.
/// All endpoints are secured with OAuth2 Bearer token authentication.
/// </summary>
[ApiController]
[Route("api/family")]
[Authorize]
public sealed class FamilyHubController : ControllerBase
{
    private readonly FamilyHubService _familyHub;
    private readonly ILogger<FamilyHubController> _logger;

    public FamilyHubController(FamilyHubService familyHub, ILogger<FamilyHubController> logger)
    {
        _familyHub = familyHub;
        _logger = logger;
    }

    /// <summary>
    /// Fetches the latest consolidated family hub state (tasks, events, vault items, members).
    /// </summary>
    [HttpGet("state")]
    public async Task<ActionResult<FamilyHubState>> GetState()
    {
        var userId = User.GetUserId();
        var state = await _familyHub.GetStateAsync(userId);
        return Ok(state);
    }

    /// <summary>
    /// Synchronizes changes from mobile to MongoDB and returns the updated state.
    /// </summary>
    [HttpPost("sync")]
    public async Task<ActionResult<FamilyHubState>> Sync([FromBody] FamilySyncRequest request)
    {
        var userId = User.GetUserId();
        var updatedState = await _familyHub.SyncAsync(userId, request);
        return Ok(updatedState);
    }

    /// <summary>
    /// Logs and registers an emergency SOS alert triggered from the mobile application.
    /// </summary>
    [HttpPost("sos/broadcast")]
    public async Task<IActionResult> BroadcastSos([FromBody] FamilySosAlertRequest request)
    {
        var userId = User.GetUserId();
        await _familyHub.LogSosAlertAsync(userId, request);
        return Ok(new { success = true, message = "Emergency SOS alert logged and dispatched." });
    }

    /// <summary>
    /// Deletes a specific family task.
    /// </summary>
    [HttpDelete("tasks/{id}")]
    public async Task<IActionResult> DeleteTask(string id)
    {
        var userId = User.GetUserId();
        var deleted = await _familyHub.DeleteTaskAsync(userId, id);
        return deleted ? NoContent() : NotFound();
    }

    /// <summary>
    /// Deletes a specific calendar event.
    /// </summary>
    [HttpDelete("events/{id}")]
    public async Task<IActionResult> DeleteEvent(string id)
    {
        var userId = User.GetUserId();
        var deleted = await _familyHub.DeleteEventAsync(userId, id);
        return deleted ? NoContent() : NotFound();
    }

    /// <summary>
    /// Deletes a specific vault item.
    /// </summary>
    [HttpDelete("vault/{id}")]
    public async Task<IActionResult> DeleteVault(string id)
    {
        var userId = User.GetUserId();
        var deleted = await _familyHub.DeleteVaultItemAsync(userId, id);
        return deleted ? NoContent() : NotFound();
    }

    /// <summary>
    /// Deletes a family member profile.
    /// </summary>
    [HttpDelete("members/{id}")]
    public async Task<IActionResult> DeleteMember(string id)
    {
        var userId = User.GetUserId();
        var deleted = await _familyHub.DeleteMemberAsync(userId, id);
        return deleted ? NoContent() : NotFound();
    }
}

