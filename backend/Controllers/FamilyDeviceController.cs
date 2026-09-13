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
    private readonly IMongoCollection<User> _users;
    private readonly IMongoCollection<RefreshToken> _tokens;
    private readonly PasswordHasher _passwords;
    private readonly AdminAuditService _audit;
    private readonly ILogger<FamilyDeviceController> _logger;

    public FamilyDeviceController(
        FamilyDeviceService deviceService,
        MongoDbService mongo,
        PasswordHasher passwords,
        AdminAuditService audit,
        ILogger<FamilyDeviceController> logger)
    {
        _deviceService = deviceService;
        _users = mongo.Database.GetCollection<User>("users");
        _tokens = mongo.Database.GetCollection<RefreshToken>("refresh_tokens");
        _passwords = passwords;
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
    /// Admin: Lists all accounts that have the MobileUser role (e.g. Google Play Reviewer or mobile fleet accounts).
    /// </summary>
    [HttpGet("admin/mobile-users")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<IReadOnlyList<MobileUserDto>>> ListMobileUsers()
    {
        var users = await _users.Find(u => !u.IsDeleted && u.Roles.Contains("MobileUser"))
            .SortByDescending(u => u.CreatedAt)
            .ToListAsync();

        var dtos = users.Select(u => new MobileUserDto(
            u.Id,
            u.Email,
            u.Username,
            u.DisplayName,
            u.Roles,
            u.IsActive,
            u.CreatedAt)).ToList();

        return Ok(dtos);
    }

    /// <summary>
    /// Admin: Provisions a dedicated MobileUser account directly in the database without hardcoding credentials in git.
    /// Reviewer accounts start active with MustChangePassword = false and TwoFactorEnabled = false.
    /// </summary>
    [HttpPost("admin/provision-mobile-user")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<MobileUserDto>> ProvisionMobileUser([FromBody] ProvisionMobileUserRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
            return BadRequest(new { error = "Email is required." });
        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 8)
            return BadRequest(new { error = "Password must be at least 8 characters." });

        var email = request.Email.Trim().ToLowerInvariant();
        var username = string.IsNullOrWhiteSpace(request.Username) ? null : request.Username.Trim().ToLowerInvariant();

        if (await _users.Find(u => u.Email == email && !u.IsDeleted).AnyAsync())
            return Conflict(new { error = "A user with that email already exists." });
        if (username is not null && await _users.Find(u => u.Username == username && !u.IsDeleted).AnyAsync())
            return Conflict(new { error = "That username is already taken." });

        var user = new User
        {
            Email = email,
            Username = username,
            DisplayName = string.IsNullOrWhiteSpace(request.DisplayName) ? "Mobile User" : request.DisplayName.Trim(),
            PasswordHash = _passwords.Hash(request.Password),
            Roles = new List<string> { "MobileUser" },
            CustomRoleKeys = new List<string>(), // Zero admin portal grants
            MustChangePassword = false, // Critical: Mobile testers/reviewers must not be blocked by password reset
            TwoFactorEnabled = false,   // Critical: Direct sign in without 2FA challenge
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

        await _users.InsertOneAsync(user);
        await _audit.RecordAsync(AdminAuditEvents.UserCreated, email, "Provisioned MobileUser account with mobile-only access.");

        var dto = new MobileUserDto(
            user.Id,
            user.Email,
            user.Username,
            user.DisplayName,
            user.Roles,
            user.IsActive,
            user.CreatedAt);

        return Ok(dto);
    }

    /// <summary>
    /// Admin: Deletes a MobileUser account and revokes active sessions.
    /// </summary>
    [HttpDelete("admin/mobile-users/{userId}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> DeleteMobileUser(string userId)
    {
        var user = await _users.Find(u => u.Id == userId && !u.IsDeleted).FirstOrDefaultAsync();
        if (user is null) return NotFound();

        if (!user.Roles.Contains("MobileUser"))
            return BadRequest(new { error = "Only accounts with the MobileUser role can be deleted from here." });

        await _users.UpdateOneAsync(u => u.Id == userId, Builders<User>.Update
            .Set(u => u.IsDeleted, true)
            .Set(u => u.IsActive, false)
            .Set(u => u.UpdatedAt, DateTime.UtcNow));

        await _tokens.UpdateManyAsync(r => r.UserId == userId && r.RevokedAt == null,
            Builders<RefreshToken>.Update.Set(r => r.RevokedAt, DateTime.UtcNow));

        await _audit.RecordAsync(AdminAuditEvents.UserDeleted, userId, $"Deleted MobileUser {user.Email}.");
        return NoContent();
    }
}

