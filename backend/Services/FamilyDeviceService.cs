using Admin.Api.Models;
using MongoDB.Driver;

namespace Admin.Api.Services;

/// <summary>
/// Service managing family mobile devices, real-time GPS tracking, lost mode controls,
/// QR pairing sessions, and security audit logs in a dedicated MongoDB database (FamSphereDb).
/// </summary>
public sealed class FamilyDeviceService
{
    private readonly IMongoDatabase _famDb;
    private readonly IMongoCollection<FamDevice> _devices;
    private readonly IMongoCollection<FamLocation> _locations;
    private readonly IMongoCollection<FamAuditLog> _auditLogs;
    private readonly IMongoCollection<FamQrSession> _qrSessions;
    private readonly FamilyHubService _familyHub;
    private readonly ILogger<FamilyDeviceService> _logger;

    public FamilyDeviceService(
        MongoDbService mongo,
        FamilyHubService familyHub,
        ILogger<FamilyDeviceService> logger)
    {
        // Use dedicated MongoDB database "FamSphereDb" as requested
        _famDb = mongo.Database.Client.GetDatabase("FamSphereDb");

        // Generic prefixed collections: Fam_*
        _devices = _famDb.GetCollection<FamDevice>("Fam_Devices");
        _locations = _famDb.GetCollection<FamLocation>("Fam_Locations");
        _auditLogs = _famDb.GetCollection<FamAuditLog>("Fam_AuditLogs");
        _qrSessions = _famDb.GetCollection<FamQrSession>("Fam_QrSessions");

        _familyHub = familyHub;
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
}

