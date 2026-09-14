using Admin.Api.Models;
using KeshavSingh.Security;
using MongoDB.Driver;

namespace Admin.Api.Services;

/// <summary>
/// Service managing family mobile devices, real-time GPS tracking, lost mode controls,
/// QR pairing sessions, mobile users, contacts sync, calls, chat, and app versioning in a dedicated MongoDB database (FamSphereDb).
/// </summary>
public sealed class FamilyDeviceService
{
    private readonly IMongoDatabase _famDb;
    private readonly IMongoCollection<FamDevice> _devices;
    private readonly IMongoCollection<FamLocation> _locations;
    private readonly IMongoCollection<FamAuditLog> _auditLogs;
    private readonly IMongoCollection<FamQrSession> _qrSessions;
    private readonly IMongoCollection<User> _adminUsers; // Central user identity
    private readonly IMongoCollection<FamContact> _contacts;
    private readonly IMongoCollection<FamCallRecord> _calls;
    private readonly IMongoCollection<FamChatMessage> _messages;
    private readonly IMongoCollection<FamAppVersionConfig> _appConfig;
    private readonly FamilyHubService _familyHub;
    private readonly PasswordHasher _passwords;
    private readonly JwtService _jwt;
    private readonly ILogger<FamilyDeviceService> _logger;

    public FamilyDeviceService(
        MongoDbService mongo,
        FamilyHubService familyHub,
        PasswordHasher passwords,
        JwtService jwt,
        ILogger<FamilyDeviceService> logger)
    {
        // Dedicated MongoDB database "FamSphereDb" for all mobile application data
        _famDb = mongo.Database.Client.GetDatabase("FamSphereDb");

        // Generic prefixed collections: Fam_*
        _devices = _famDb.GetCollection<FamDevice>("Fam_Devices");
        _locations = _famDb.GetCollection<FamLocation>("Fam_Locations");
        _auditLogs = _famDb.GetCollection<FamAuditLog>("Fam_AuditLogs");
        _qrSessions = _famDb.GetCollection<FamQrSession>("Fam_QrSessions");
        _contacts = _famDb.GetCollection<FamContact>("Fam_Contacts");
        _calls = _famDb.GetCollection<FamCallRecord>("Fam_Calls");
        _messages = _famDb.GetCollection<FamChatMessage>("Fam_Messages");
        _appConfig = _famDb.GetCollection<FamAppVersionConfig>("Fam_AppConfig");

        // Central users collection from AdminDb
        _adminUsers = mongo.Database.GetCollection<User>("users");

        _familyHub = familyHub;
        _passwords = passwords;
        _jwt = jwt;
        _logger = logger;

        // Ensure background indices
        _ = Task.Run(EnsureIndexesAsync);
    }

    private async Task EnsureIndexesAsync()
    {
        try
        {
            var deviceIndex = new CreateIndexModel<FamDevice>(
                Builders<FamDevice>.IndexKeys.Ascending(d => d.DeviceId),
                new CreateIndexOptions { Unique = true });
            await _devices.Indexes.CreateOneAsync(deviceIndex);

            var locationIndex = new CreateIndexModel<FamLocation>(
                Builders<FamLocation>.IndexKeys
                    .Ascending(l => l.DeviceId)
                    .Descending(l => l.RecordedAt));
            await _locations.Indexes.CreateOneAsync(locationIndex);

            var qrIndex = new CreateIndexModel<FamQrSession>(
                Builders<FamQrSession>.IndexKeys.Ascending(q => q.SessionCode),
                new CreateIndexOptions { Unique = true });
            await _qrSessions.Indexes.CreateOneAsync(qrIndex);

            var userEmailIndex = new CreateIndexModel<FamUser>(
                Builders<FamUser>.IndexKeys.Ascending(u => u.Email),
                new CreateIndexOptions { Unique = true });
            await _famUsers.Indexes.CreateOneAsync(userEmailIndex);

            var contactIndex = new CreateIndexModel<FamContact>(
                Builders<FamContact>.IndexKeys
                    .Ascending(c => c.FamilyId)
                    .Ascending(c => c.Name));
            await _contacts.Indexes.CreateOneAsync(contactIndex);

            var callIndex = new CreateIndexModel<FamCallRecord>(
                Builders<FamCallRecord>.IndexKeys
                    .Ascending(c => c.FamilyId)
                    .Descending(c => c.Timestamp));
            await _calls.Indexes.CreateOneAsync(callIndex);

            var msgIndex = new CreateIndexModel<FamChatMessage>(
                Builders<FamChatMessage>.IndexKeys
                    .Ascending(m => m.FamilyId)
                    .Descending(m => m.Timestamp));
            await _messages.Indexes.CreateOneAsync(msgIndex);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Index creation for FamSphereDb collections had non-fatal issue.");
        }
    }

    /// <summary>
    /// Registers or updates a mobile device's specifications and battery health.
    /// </summary>
    public async Task<FamDevice> RegisterOrUpdateDeviceAsync(string userId, FamDeviceRegisterRequest req)
    {
        var (familyId, _) = await _familyHub.ResolveFamilyScopeAsync(userId);

        var existing = await _devices.Find(d => d.DeviceId == req.DeviceId).FirstOrDefaultAsync();
        var now = DateTime.UtcNow;

        if (existing is null)
        {
            var newDevice = new FamDevice
            {
                DeviceId = req.DeviceId,
                FamilyId = familyId,
                UserId = userId,
                DeviceName = req.DeviceName,
                Brand = req.Brand,
                Model = req.Model,
                OsName = req.OsName,
                OsVersion = req.OsVersion,
                AppVersion = req.AppVersion,
                BatteryLevel = req.BatteryLevel,
                IsCharging = req.IsCharging,
                RegisteredAt = now,
                LastActiveAt = now
            };

            await _devices.InsertOneAsync(newDevice);

            await LogSecurityEventAsync(
                familyId: familyId,
                userId: userId,
                deviceId: req.DeviceId,
                eventType: "DeviceRegistered",
                severity: "Info",
                details: $"New device registered: {req.Brand} {req.Model} ({req.OsName} {req.OsVersion})");

            return newDevice;
        }

        existing.FamilyId = familyId;
        existing.UserId = userId;
        existing.DeviceName = req.DeviceName;
        existing.Brand = req.Brand;
        existing.Model = req.Model;
        existing.OsName = req.OsName;
        existing.OsVersion = req.OsVersion;
        existing.AppVersion = req.AppVersion;
        existing.BatteryLevel = req.BatteryLevel;
        existing.IsCharging = req.IsCharging;
        existing.LastActiveAt = now;

        await _devices.ReplaceOneAsync(d => d.DeviceId == req.DeviceId, existing);
        return existing;
    }

    /// <summary>
    /// Ingests a new GPS location reading, updates device's last known position, and stores historical breadcrumb.
    /// </summary>
    public async Task<FamLocation> RecordLocationAsync(string userId, FamLocationReportRequest req)
    {
        var (familyId, _) = await _familyHub.ResolveFamilyScopeAsync(userId);
        var now = DateTime.UtcNow;

        var device = await _devices.Find(d => d.DeviceId == req.DeviceId).FirstOrDefaultAsync();
        var isLost = device?.IsLost ?? false;

        var location = new FamLocation
        {
            DeviceId = req.DeviceId,
            FamilyId = familyId,
            UserId = userId,
            Latitude = req.Latitude,
            Longitude = req.Longitude,
            Altitude = req.Altitude,
            Accuracy = req.Accuracy,
            Speed = req.Speed,
            BatteryLevel = req.BatteryLevel,
            Address = req.Address,
            IsLostPing = isLost,
            RecordedAt = now
        };

        await _locations.InsertOneAsync(location);

        if (device is not null)
        {
            device.LastActiveAt = now;
            if (req.BatteryLevel.HasValue)
            {
                device.BatteryLevel = req.BatteryLevel.Value;
            }
            if (req.IsCharging.HasValue)
            {
                device.IsCharging = req.IsCharging.Value;
            }

            device.LastLocation = new FamLocationSnapshot
            {
                Latitude = req.Latitude,
                Longitude = req.Longitude,
                Altitude = req.Altitude,
                Accuracy = req.Accuracy,
                Speed = req.Speed,
                Address = req.Address,
                RecordedAt = now
            };

            await _devices.ReplaceOneAsync(d => d.DeviceId == req.DeviceId, device);
        }

        // Low battery alert log if under 15% and discharging
        if (req.BatteryLevel is <= 15 && req.IsCharging == false)
        {
            await LogSecurityEventAsync(
                familyId: familyId,
                userId: userId,
                deviceId: req.DeviceId,
                eventType: "BatteryCritical",
                severity: "Warning",
                details: $"Device battery critically low at {req.BatteryLevel}%");
        }

        return location;
    }

    /// <summary>
    /// Lists all devices enrolled in the user's family circle.
    /// </summary>
    public async Task<IReadOnlyList<FamDevice>> GetFamilyDevicesAsync(string userId)
    {
        var (familyId, _) = await _familyHub.ResolveFamilyScopeAsync(userId);
        return await _devices.Find(d => d.FamilyId == familyId).ToListAsync();
    }

    /// <summary>
    /// Retrieves historical location breadcrumbs for a specific device.
    /// </summary>
    public async Task<IReadOnlyList<FamLocation>> GetDeviceHistoryAsync(string userId, string deviceId, int hours = 24)
    {
        var (familyId, _) = await _familyHub.ResolveFamilyScopeAsync(userId);
        var since = DateTime.UtcNow.AddHours(-Math.Clamp(hours, 1, 168)); // up to 7 days

        return await _locations.Find(l => l.DeviceId == deviceId && l.FamilyId == familyId && l.RecordedAt >= since)
            .SortByDescending(l => l.RecordedAt)
            .Limit(300)
            .ToListAsync();
    }

    /// <summary>
    /// Toggles Lost Mode for a device (triggers alerts, custom message, and high-frequency tracking).
    /// </summary>
    public async Task<FamDevice?> SetLostModeAsync(string userId, string deviceId, FamLostModeRequest req)
    {
        var (familyId, _) = await _familyHub.ResolveFamilyScopeAsync(userId);
        var device = await _devices.Find(d => d.DeviceId == deviceId && d.FamilyId == familyId).FirstOrDefaultAsync();

        if (device is null) return null;

        device.IsLost = req.IsLost;
        device.LostMessage = req.LostMessage;
        device.LastActiveAt = DateTime.UtcNow;

        await _devices.ReplaceOneAsync(d => d.DeviceId == deviceId, device);

        await LogSecurityEventAsync(
            familyId: familyId,
            userId: userId,
            deviceId: deviceId,
            eventType: req.IsLost ? "MarkedLost" : "LostModeDeactivated",
            severity: req.IsLost ? "Critical" : "Info",
            details: req.IsLost
                ? $"Device marked as LOST! Recovery message: '{req.LostMessage}'"
                : "Device marked as recovered/found.");

        return device;
    }

    /// <summary>
    /// Retrieves paginated security and tracking audit logs for the family.
    /// </summary>
    public async Task<IReadOnlyList<FamAuditLog>> GetAuditLogsAsync(string userId, int limit = 50)
    {
        var (familyId, _) = await _familyHub.ResolveFamilyScopeAsync(userId);
        return await _auditLogs.Find(l => l.FamilyId == familyId)
            .SortByDescending(l => l.Timestamp)
            .Limit(Math.Clamp(limit, 10, 200))
            .ToListAsync();
    }

    /// <summary>
    /// Creates an ephemeral QR pairing session token.
    /// </summary>
    public async Task<FamQrSession> CreateQrSessionAsync(string userId, FamCreateQrRequest req)
    {
        var (familyId, _) = await _familyHub.ResolveFamilyScopeAsync(userId);
        var code = $"FAM-{Guid.NewGuid():N}"[..16].ToUpperInvariant();
        var now = DateTime.UtcNow;

        var session = new FamQrSession
        {
            SessionCode = code,
            PayloadType = req.PayloadType,
            PayloadData = req.PayloadData,
            FamilyId = familyId,
            CreatedByUserId = userId,
            CreatedAt = now,
            ExpiresAt = now.AddMinutes(Math.Clamp(req.ExpirationMinutes, 1, 60)),
            IsUsed = false
        };

        await _qrSessions.InsertOneAsync(session);

        await LogSecurityEventAsync(
            familyId: familyId,
            userId: userId,
            deviceId: null,
            eventType: "QrGenerated",
            severity: "Info",
            details: $"Generated QR pairing token of type '{req.PayloadType}', valid for {req.ExpirationMinutes} min.");

        return session;
    }

    /// <summary>
    /// Validates and redeems a scanned QR token.
    /// </summary>
    public async Task<FamQrVerifyResult> VerifyQrSessionAsync(string userId, FamVerifyQrRequest req)
    {
        var (familyId, _) = await _familyHub.ResolveFamilyScopeAsync(userId);
        var session = await _qrSessions.Find(q => q.SessionCode == req.SessionCode).FirstOrDefaultAsync();

        if (session is null)
        {
            return new FamQrVerifyResult(false, "Invalid QR code. Session not found.", null, null);
        }

        if (session.IsUsed)
        {
            return new FamQrVerifyResult(false, "This QR code has already been redeemed.", null, null);
        }

        if (DateTime.UtcNow > session.ExpiresAt)
        {
            return new FamQrVerifyResult(false, "This QR code has expired.", null, null);
        }

        session.IsUsed = true;
        session.UsedByDeviceId = req.DeviceId;
        await _qrSessions.ReplaceOneAsync(q => q.Id == session.Id, session);

        await LogSecurityEventAsync(
            familyId: familyId,
            userId: userId,
            deviceId: req.DeviceId,
            eventType: "QrScanned",
            severity: "Info",
            details: $"QR token successfully scanned and redeemed by device {req.DeviceId}. Type: {session.PayloadType}");

        return new FamQrVerifyResult(true, "QR code verified successfully.", session.PayloadType, session.PayloadData);
    }

    private async Task LogSecurityEventAsync(
        string familyId,
        string userId,
        string? deviceId,
        string eventType,
        string severity,
        string details)
    {
        try
        {
            var log = new FamAuditLog
            {
                FamilyId = familyId,
                UserId = userId,
                DeviceId = deviceId,
                EventType = eventType,
                Severity = severity,
                Details = details,
                Timestamp = DateTime.UtcNow
            };
            await _auditLogs.InsertOneAsync(log);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to persist security audit log.");
        }
    }

    /// <summary>
    /// Permanently wipes all devices, location history, and QR sessions belonging to a user (Google Play data deletion compliance).
    /// </summary>
    public async Task DeleteAllUserDataAsync(string userId)
    {
        var (familyId, _) = await _familyHub.ResolveFamilyScopeAsync(userId);
        var devices = await _devices.Find(d => d.FamilyId == familyId).ToListAsync();
        var deviceIds = devices.Select(d => d.DeviceId).ToList();

        if (deviceIds.Count > 0)
        {
            await _locations.DeleteManyAsync(l => deviceIds.Contains(l.DeviceId));
            await _devices.DeleteManyAsync(d => deviceIds.Contains(d.DeviceId));
        }

        await _qrSessions.DeleteManyAsync(q => q.FamilyId == familyId);

        await LogSecurityEventAsync(
            familyId: familyId,
            userId: userId,
            deviceId: null,
            eventType: "UserDataDeleted",
            severity: "Warning",
            details: $"User {userId} permanently deleted all family tracking data, location history, and {deviceIds.Count} devices.");

        _logger.LogInformation("Wiped all family tracking data for user {UserId}", userId);
    }

    /// <summary>
    /// Logs a public web-initiated deletion request (Google Play data deletion URL compliance).
    /// </summary>
    public async Task QueueDataDeletionAsync(string email, string? reason)
    {
        await LogSecurityEventAsync(
            familyId: "PUBLIC_REQUEST",
            userId: email,
            deviceId: null,
            eventType: "PublicDeletionRequested",
            severity: "Warning",
            details: $"Public data deletion requested for email: {email}. Reason: {reason ?? "Self-service web request"}.");

        _logger.LogInformation("Public data deletion requested for {Email}", email);
    }

    // ==========================================
    // Mobile User Management (FamSphereDb.Fam_Users)
    // ==========================================

    /// <summary>
    /// Provisions a dedicated MobileUser account directly in AdminDb.
    /// If user already exists, updates password and adds MobileUser role.
    /// </summary>
    public async Task<MobileUserDto> ProvisionMobileUserAsync(ProvisionMobileUserRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var username = string.IsNullOrWhiteSpace(request.Username) ? null : request.Username.Trim().ToLowerInvariant();

        var existing = await _adminUsers.Find(u => u.Email == email || (username != null && u.Username == username)).FirstOrDefaultAsync();
        if (existing is not null)
        {
            existing.DisplayName = string.IsNullOrWhiteSpace(request.DisplayName) ? existing.DisplayName : request.DisplayName.Trim();
            existing.PasswordHash = _passwords.Hash(request.Password);
            if (!existing.Roles.Contains("MobileUser"))
            {
                existing.Roles.Add("MobileUser");
            }
            existing.MustChangePassword = false; // Mobile app doesn't support "change password on first login"
            await _adminUsers.ReplaceOneAsync(u => u.Id == existing.Id, existing);
            return new MobileUserDto(existing.Id, existing.Email, existing.Username, existing.DisplayName, existing.PhoneNumber, existing.Roles, true, DateTime.UtcNow); // CreatedAt not stored natively in same way, but mock it
        }

        var newUser = new User
        {
            Email = email,
            Username = username,
            DisplayName = string.IsNullOrWhiteSpace(request.DisplayName) ? "Mobile User" : request.DisplayName.Trim(),
            PasswordHash = _passwords.Hash(request.Password),
            Roles = new List<string> { "MobileUser" },
            MustChangePassword = false,
        };

        await _adminUsers.InsertOneAsync(newUser);
        return new MobileUserDto(newUser.Id, newUser.Email, newUser.Username, newUser.DisplayName, newUser.PhoneNumber, newUser.Roles, true, DateTime.UtcNow);
    }

    /// <summary>
    /// Lists all accounts from AdminDb that have the MobileUser role (or Admin role).
    /// </summary>
    public async Task<IReadOnlyList<MobileUserDto>> ListMobileUsersAsync()
    {
        var users = await _adminUsers.Find(u => u.Roles.Contains("MobileUser") || u.Roles.Contains("Admin"))
            .ToListAsync();

        return users.Select(u => new MobileUserDto(
            u.Id,
            u.Email,
            u.Username,
            u.DisplayName,
            u.PhoneNumber,
            u.Roles,
            true,
            DateTime.UtcNow)).ToList();
    }

    /// <summary>
    /// Removes the MobileUser role from an account, or deletes the account if it has no other roles.
    /// </summary>
    public async Task<bool> DeleteMobileUserAsync(string userId)
    {
        var user = await _adminUsers.Find(u => u.Id == userId).FirstOrDefaultAsync();
        if (user == null) return false;

        user.Roles.Remove("MobileUser");
        if (user.Roles.Count == 0)
        {
            // If they have no other roles, delete the account entirely
            var result = await _adminUsers.DeleteOneAsync(u => u.Id == userId);
            return result.DeletedCount > 0;
        }
        else
        {
            // Otherwise just save the updated roles
            await _adminUsers.ReplaceOneAsync(u => u.Id == userId, user);
            return true;
        }
    }

    // ==========================================
    // Contacts Sync & Management (Fam_Contacts)
    // ==========================================

    public async Task<IReadOnlyList<FamContact>> SyncContactsAsync(string userId, SyncContactsRequest req)
    {
        var (familyId, _) = await _familyHub.ResolveFamilyScopeAsync(userId);
        var contacts = req.Contacts.Select(c => new FamContact
        {
            UserId = userId,
            FamilyId = familyId,
            Name = c.Name,
            PhoneNumbers = c.PhoneNumbers ?? new(),
            Emails = c.Emails ?? new(),
            Company = c.Company,
            SyncedAt = DateTime.UtcNow
        }).ToList();

        // Refresh user's contacts
        await _contacts.DeleteManyAsync(c => c.UserId == userId);
        if (contacts.Count > 0)
        {
            await _contacts.InsertManyAsync(contacts);
        }

        return contacts;
    }

    public async Task<IReadOnlyList<FamContact>> ListContactsAsync(string userId)
    {
        var (familyId, _) = await _familyHub.ResolveFamilyScopeAsync(userId);
        return await _contacts.Find(c => c.FamilyId == familyId)
            .SortBy(c => c.Name)
            .ToListAsync();
    }

    // ==========================================
    // Audio / Video Call Logging (Fam_Calls)
    // ==========================================

    public async Task<FamCallRecord> LogCallAsync(string userId, LogCallRequest req)
    {
        var (familyId, _) = await _familyHub.ResolveFamilyScopeAsync(userId);
        var call = new FamCallRecord
        {
            UserId = userId,
            FamilyId = familyId,
            DeviceId = req.DeviceId,
            CallType = req.CallType,
            TargetNameOrPhone = req.TargetNameOrPhone,
            DurationSeconds = req.DurationSeconds,
            Status = req.Status,
            Timestamp = DateTime.UtcNow
        };
        await _calls.InsertOneAsync(call);
        return call;
    }

    public async Task<IReadOnlyList<FamCallRecord>> ListCallsAsync(string userId, int limit = 50)
    {
        var (familyId, _) = await _familyHub.ResolveFamilyScopeAsync(userId);
        return await _calls.Find(c => c.FamilyId == familyId)
            .SortByDescending(c => c.Timestamp)
            .Limit(limit)
            .ToListAsync();
    }

    // ==========================================
    // Family Chat / Messaging (Fam_Messages)
    // ==========================================

    public async Task<FamChatMessage> SendMessageAsync(string userId, SendChatMessageRequest req, string senderName)
    {
        var (familyId, _) = await _familyHub.ResolveFamilyScopeAsync(userId);
        var msg = new FamChatMessage
        {
            UserId = userId,
            FamilyId = familyId,
            SenderName = senderName,
            MessageText = req.MessageText,
            MessageType = req.MessageType ?? "Text",
            Timestamp = DateTime.UtcNow
        };
        await _messages.InsertOneAsync(msg);
        return msg;
    }

    public async Task<IReadOnlyList<FamChatMessage>> GetMessagesAsync(string userId, int limit = 100)
    {
        var (familyId, _) = await _familyHub.ResolveFamilyScopeAsync(userId);
        return await _messages.Find(m => m.FamilyId == familyId)
            .SortByDescending(m => m.Timestamp)
            .Limit(limit)
            .ToListAsync();
    }

    // ==========================================
    // App Versioning & In-App Google Play Updates
    // ==========================================

    public async Task<AppVersionCheckResponse> CheckAppVersionAsync(int clientVersionCode)
    {
        var config = await _appConfig.Find(c => c.Id == "famsphere_app_version").FirstOrDefaultAsync();
        if (config is null)
        {
            config = new FamAppVersionConfig();
            await _appConfig.InsertOneAsync(config);
        }

        var updateAvailable = config.LatestVersionCode > clientVersionCode;
        var isMandatory = updateAvailable && (clientVersionCode < config.MinSupportedVersionCode || config.IsMandatory);
        var marketUrl = "market://details?id=in.keshavsingh.famsphere";

        return new AppVersionCheckResponse(
            config.LatestVersionName,
            config.LatestVersionCode,
            config.MinSupportedVersionCode,
            updateAvailable,
            isMandatory,
            config.ReleaseNotes,
            config.PlayStoreUrl,
            marketUrl);
    }

    public async Task<FamAppVersionConfig> GetAppVersionConfigAsync()
    {
        var config = await _appConfig.Find(c => c.Id == "famsphere_app_version").FirstOrDefaultAsync();
        if (config is null)
        {
            config = new FamAppVersionConfig();
            await _appConfig.InsertOneAsync(config);
        }
        return config;
    }

    public async Task<FamAppVersionConfig> UpdateAppVersionConfigAsync(UpdateAppVersionConfigRequest req)
    {
        var config = new FamAppVersionConfig
        {
            Id = "famsphere_app_version",
            LatestVersionName = req.LatestVersionName,
            LatestVersionCode = req.LatestVersionCode,
            MinSupportedVersionCode = req.MinSupportedVersionCode,
            IsMandatory = req.IsMandatory,
            ReleaseNotes = req.ReleaseNotes,
            PlayStoreUrl = req.PlayStoreUrl,
            UpdatedAt = DateTime.UtcNow
        };

        await _appConfig.ReplaceOneAsync(c => c.Id == config.Id, config, new ReplaceOptions { IsUpsert = true });
        return config;
    }
}

