using Admin.Api.Models;
using Admin.Api.Services;
using KeshavSingh.Auth;
using KeshavSingh.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;

namespace Admin.Api.Controllers;

/// <summary>
/// Controller for mobile device fleet management, live GPS tracking, lost device recovery,
/// QR pairing sessions, mobile reviewer account provisioning, and security audit logs in the FamSphere ecosystem.
/// </summary>
[ApiController]
[Route("api/family")]
[Authorize]
public sealed class FamilyDeviceController : ControllerBase
{
    private readonly FamilyDeviceService _deviceService;
    private readonly AdminAuditService _audit;
    private readonly ILogger<FamilyDeviceController> _logger;

    public FamilyDeviceController(
        FamilyDeviceService deviceService,
        AdminAuditService audit,
        ILogger<FamilyDeviceController> logger)
    {
        _deviceService = deviceService;
        _audit = audit;
        _logger = logger;
    }

    /// <summary>
    /// Registers or updates device specs (model, brand, OS, battery, app version).
    /// </summary>
    [HttpPost("device/register")]
    public async Task<ActionResult<FamDevice>> RegisterDevice([FromBody] FamDeviceRegisterRequest request)
    {
        var userId = User.GetUserId();
        var device = await _deviceService.RegisterOrUpdateDeviceAsync(userId, request);
        return Ok(device);
    }

    /// <summary>
    /// Ingests live GPS location, speed, accuracy, and updates the device's battery status.
    /// </summary>
    [HttpPost("device/location")]
    public async Task<ActionResult<FamLocation>> ReportLocation([FromBody] FamLocationReportRequest request)
    {
        var userId = User.GetUserId();
        var loc = await _deviceService.RecordLocationAsync(userId, request);
        return Ok(loc);
    }

    /// <summary>
    /// Lists all enrolled family mobile devices with their latest location and battery status.
    /// </summary>
    [HttpGet("device/list")]
    public async Task<ActionResult<IReadOnlyList<FamDevice>>> ListDevices()
    {
        var userId = User.GetUserId();
        var devices = await _deviceService.GetFamilyDevicesAsync(userId);
        return Ok(devices);
    }

    /// <summary>
    /// Retrieves historical GPS breadcrumb history for a device (default last 24h, max 7 days).
    /// </summary>
    [HttpGet("device/{deviceId}/history")]
    public async Task<ActionResult<IReadOnlyList<FamLocation>>> GetDeviceHistory(string deviceId, [FromQuery] int hours = 24)
    {
        var userId = User.GetUserId();
        var history = await _deviceService.GetDeviceHistoryAsync(userId, deviceId, hours);
        return Ok(history);
    }

    /// <summary>
    /// Sets or removes Lost Mode on a device.
    /// </summary>
    [HttpPost("device/{deviceId}/lost-mode")]
    public async Task<ActionResult<FamDevice>> SetLostMode(string deviceId, [FromBody] FamLostModeRequest request)
    {
        var userId = User.GetUserId();
        var updated = await _deviceService.SetLostModeAsync(userId, deviceId, request);
        if (updated is null)
        {
            return NotFound(new { error = "Device not found in your family circle." });
        }
        return Ok(updated);
    }

    /// <summary>
    /// Returns security and location audit logs for the family.
    /// </summary>
    [HttpGet("device/audit-logs")]
    public async Task<ActionResult<IReadOnlyList<FamAuditLog>>> GetAuditLogs([FromQuery] int limit = 50)
    {
        var userId = User.GetUserId();
        var logs = await _deviceService.GetAuditLogsAsync(userId, limit);
        return Ok(logs);
    }

    /// <summary>
    /// Generates an ephemeral QR pairing session code.
    /// </summary>
    [HttpPost("qr/create")]
    public async Task<ActionResult<FamQrSession>> CreateQrSession([FromBody] FamCreateQrRequest request)
    {
        var userId = User.GetUserId();
        var session = await _deviceService.CreateQrSessionAsync(userId, request);
        return Ok(session);
    }

    /// <summary>
    /// Verifies and redeems a scanned QR code.
    /// </summary>
    [HttpPost("qr/verify")]
    public async Task<ActionResult<FamQrVerifyResult>> VerifyQrSession([FromBody] FamVerifyQrRequest request)
    {
        var userId = User.GetUserId();
        var result = await _deviceService.VerifyQrSessionAsync(userId, request);
        if (!result.Success)
        {
            return BadRequest(result);
        }
        return Ok(result);
    }

    /// <summary>
    /// Self-service data and account wipe: permanently deletes user devices, location breadcrumbs,
    /// and logs a final audit event (Google Play Store Data Safety & Deletion requirement).
    /// </summary>
    [HttpDelete("device/user-data")]
    public async Task<IActionResult> DeleteUserData()
    {
        var userId = User.GetUserId();
        await _deviceService.DeleteAllUserDataAsync(userId);
        return Ok(new { message = "All family tracking data and registered devices have been permanently deleted." });
    }

    /// <summary>
    /// Public Data Deletion Request (Google Play compliance): allows users to submit a deletion request
    /// via a public web URL without needing to reinstall the app.
    /// </summary>
    [HttpPost("data-deletion-request")]
    [AllowAnonymous]
    public async Task<IActionResult> SubmitDataDeletionRequest([FromBody] DataDeletionPublicRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
        {
            return BadRequest(new { error = "Email address is required." });
        }

        await _deviceService.QueueDataDeletionAsync(request.Email.Trim().ToLowerInvariant(), request.Reason);
        return Ok(new { message = "Your data deletion request has been received and will be processed within 24 hours." });
    }

    /// <summary>
    /// Authenticates a mobile application user against FamSphereDb.Fam_Users and issues a 30-day JWT bearer token.
    /// </summary>
    [HttpPost("auth/login")]
    [AllowAnonymous]
    public async Task<ActionResult<MobileLoginResponse>> AuthenticateMobile([FromBody] MobileLoginRequest request)
    {
        var response = await _deviceService.AuthenticateMobileUserAsync(request);
        if (!response.Success)
        {
            return BadRequest(response);
        }
        return Ok(response);
    }

    /// <summary>
    /// Admin: Lists all accounts that have the MobileUser role from FamSphereDb.Fam_Users.
    /// </summary>
    [HttpGet("admin/mobile-users")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<IReadOnlyList<MobileUserDto>>> ListMobileUsers()
    {
        var users = await _deviceService.ListMobileUsersAsync();
        return Ok(users);
    }

    /// <summary>
    /// Admin: Provisions a dedicated MobileUser account directly in FamSphereDb.Fam_Users without hardcoding credentials in git.
    /// Automatically resurrects/updates if the user already exists to eliminate E11000 duplicate key error.
    /// </summary>
    [HttpPost("admin/provision-mobile-user")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<MobileUserDto>> ProvisionMobileUser([FromBody] ProvisionMobileUserRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
            return BadRequest(new { error = "Email is required." });
        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 8)
            return BadRequest(new { error = "Password must be at least 8 characters." });

        var dto = await _deviceService.ProvisionMobileUserAsync(request);
        await _audit.RecordAsync(AdminAuditEvents.UserCreated, request.Email, "Provisioned MobileUser account in FamSphereDb.");
        return Ok(dto);
    }

    /// <summary>
    /// Admin: Deletes a MobileUser account completely from FamSphereDb.Fam_Users.
    /// </summary>
    [HttpDelete("admin/mobile-users/{userId}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> DeleteMobileUser(string userId)
    {
        var success = await _deviceService.DeleteMobileUserAsync(userId);
        if (!success) return NotFound(new { error = "Mobile user not found." });

        await _audit.RecordAsync(AdminAuditEvents.UserDeleted, userId, "Deleted MobileUser from FamSphereDb.");
        return NoContent();
    }

    // ==========================================
    // Contacts Sync & Management
    // ==========================================

    [HttpPost("contacts/sync")]
    public async Task<ActionResult<IReadOnlyList<FamContact>>> SyncContacts([FromBody] SyncContactsRequest request)
    {
        var userId = User.GetUserId();
        var contacts = await _deviceService.SyncContactsAsync(userId, request);
        return Ok(contacts);
    }

    [HttpGet("contacts/list")]
    public async Task<ActionResult<IReadOnlyList<FamContact>>> ListContacts()
    {
        var userId = User.GetUserId();
        var contacts = await _deviceService.ListContactsAsync(userId);
        return Ok(contacts);
    }

    // ==========================================
    // Audio / Video Calling
    // ==========================================

    [HttpPost("calls/log")]
    public async Task<ActionResult<FamCallRecord>> LogCall([FromBody] LogCallRequest request)
    {
        var userId = User.GetUserId();
        var record = await _deviceService.LogCallAsync(userId, request);
        return Ok(record);
    }

    [HttpGet("calls/history")]
    public async Task<ActionResult<IReadOnlyList<FamCallRecord>>> ListCalls([FromQuery] int limit = 50)
    {
        var userId = User.GetUserId();
        var calls = await _deviceService.ListCallsAsync(userId, limit);
        return Ok(calls);
    }

    // ==========================================
    // Family Chat / Messaging
    // ==========================================

    [HttpPost("chat/send")]
    public async Task<ActionResult<FamChatMessage>> SendChatMessage([FromBody] SendChatMessageRequest request)
    {
        var userId = User.GetUserId();
        var senderName = User.Identity?.Name ?? "Family Member";
        var msg = await _deviceService.SendMessageAsync(userId, request, senderName);
        return Ok(msg);
    }

    [HttpGet("chat/messages")]
    public async Task<ActionResult<IReadOnlyList<FamChatMessage>>> GetChatMessages([FromQuery] int limit = 100)
    {
        var userId = User.GetUserId();
        var messages = await _deviceService.GetMessagesAsync(userId, limit);
        return Ok(messages);
    }

    // ==========================================
    // In-App Version Check & Admin Configuration
    // ==========================================

    [HttpGet("app/version-check")]
    [AllowAnonymous]
    public async Task<ActionResult<AppVersionCheckResponse>> CheckAppVersion([FromQuery] int versionCode = 0)
    {
        var result = await _deviceService.CheckAppVersionAsync(versionCode);
        return Ok(result);
    }

    [HttpGet("admin/app-version")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<FamAppVersionConfig>> GetAppVersionConfig()
    {
        var config = await _deviceService.GetAppVersionConfigAsync();
        return Ok(config);
    }

    [HttpPost("admin/app-version")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<FamAppVersionConfig>> UpdateAppVersionConfig([FromBody] UpdateAppVersionConfigRequest request)
    {
        var config = await _deviceService.UpdateAppVersionConfigAsync(request);
        return Ok(config);
    }
}

