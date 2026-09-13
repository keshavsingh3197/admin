using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Admin.Api.Models;

/// <summary>
/// Represents a mobile device installed with the FamSphere application.
/// Stored in MongoDB collection "Fam_Devices" in database "FamSphereDb".
/// </summary>
public sealed class FamDevice
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = string.Empty;

    [BsonElement("deviceId")]
    public string DeviceId { get; set; } = string.Empty;

    [BsonElement("familyId")]
    public string FamilyId { get; set; } = string.Empty;

    [BsonElement("userId")]
    public string UserId { get; set; } = string.Empty;

    [BsonElement("deviceName")]
    public string DeviceName { get; set; } = string.Empty;

    [BsonElement("brand")]
    public string Brand { get; set; } = string.Empty;

    [BsonElement("model")]
    public string Model { get; set; } = string.Empty;

    [BsonElement("osName")]
    public string OsName { get; set; } = string.Empty;

    [BsonElement("osVersion")]
    public string OsVersion { get; set; } = string.Empty;

    [BsonElement("appVersion")]
    public string AppVersion { get; set; } = string.Empty;

    [BsonElement("batteryLevel")]
    public int BatteryLevel { get; set; }

    [BsonElement("isCharging")]
    public bool IsCharging { get; set; }

    [BsonElement("isLost")]
    public bool IsLost { get; set; }

    [BsonElement("lostMessage")]
    public string? LostMessage { get; set; }

    [BsonElement("registeredAt")]
    public DateTime RegisteredAt { get; set; } = DateTime.UtcNow;

    [BsonElement("lastActiveAt")]
    public DateTime LastActiveAt { get; set; } = DateTime.UtcNow;

    [BsonElement("lastLocation")]
    public FamLocationSnapshot? LastLocation { get; set; }
}

/// <summary>
/// Snapshot of the latest location attached directly to the device document.
/// </summary>
public sealed class FamLocationSnapshot
{
    [BsonElement("latitude")]
    public double Latitude { get; set; }

    [BsonElement("longitude")]
    public double Longitude { get; set; }

    [BsonElement("altitude")]
    public double? Altitude { get; set; }

    [BsonElement("accuracy")]
    public double? Accuracy { get; set; }

    [BsonElement("speed")]
    public double? Speed { get; set; }

    [BsonElement("address")]
    public string? Address { get; set; }

    [BsonElement("recordedAt")]
    public DateTime RecordedAt { get; set; }
}

/// <summary>
/// Historical breadcrumb location record.
/// Stored in MongoDB collection "Fam_Locations" in database "FamSphereDb".
/// </summary>
public sealed class FamLocation
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = string.Empty;

    [BsonElement("deviceId")]
    public string DeviceId { get; set; } = string.Empty;

    [BsonElement("familyId")]
    public string FamilyId { get; set; } = string.Empty;

    [BsonElement("userId")]
    public string UserId { get; set; } = string.Empty;

    [BsonElement("latitude")]
    public double Latitude { get; set; }

    [BsonElement("longitude")]
    public double Longitude { get; set; }

    [BsonElement("altitude")]
    public double? Altitude { get; set; }

    [BsonElement("accuracy")]
    public double? Accuracy { get; set; }

    [BsonElement("speed")]
    public double? Speed { get; set; }

    [BsonElement("batteryLevel")]
    public int? BatteryLevel { get; set; }

    [BsonElement("address")]
    public string? Address { get; set; }

    [BsonElement("isLostPing")]
    public bool IsLostPing { get; set; }

    [BsonElement("recordedAt")]
    public DateTime RecordedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Audit trail for security events (lost mode toggles, QR scans, battery critical, biometrics).
/// Stored in MongoDB collection "Fam_AuditLogs" in database "FamSphereDb".
/// </summary>
public sealed class FamAuditLog
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = string.Empty;

    [BsonElement("deviceId")]
    public string? DeviceId { get; set; }

    [BsonElement("familyId")]
    public string FamilyId { get; set; } = string.Empty;

    [BsonElement("userId")]
    public string UserId { get; set; } = string.Empty;

    [BsonElement("eventType")]
    public string EventType { get; set; } = string.Empty;

    [BsonElement("severity")]
    public string Severity { get; set; } = "Info";

    [BsonElement("details")]
    public string Details { get; set; } = string.Empty;

    [BsonElement("ipAddress")]
    public string? IpAddress { get; set; }

    [BsonElement("timestamp")]
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Ephemeral QR session token for device onboarding, vault sharing, or pairing.
/// Stored in MongoDB collection "Fam_QrSessions" in database "FamSphereDb".
/// </summary>
public sealed class FamQrSession
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = string.Empty;

    [BsonElement("sessionCode")]
    public string SessionCode { get; set; } = string.Empty;

    [BsonElement("payloadType")]
    public string PayloadType { get; set; } = string.Empty;

    [BsonElement("payloadData")]
    public string PayloadData { get; set; } = string.Empty;

    [BsonElement("familyId")]
    public string FamilyId { get; set; } = string.Empty;

    [BsonElement("createdByUserId")]
    public string CreatedByUserId { get; set; } = string.Empty;

    [BsonElement("createdAt")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [BsonElement("expiresAt")]
    public DateTime ExpiresAt { get; set; }

    [BsonElement("isUsed")]
    public bool IsUsed { get; set; }

    [BsonElement("usedByDeviceId")]
    public string? UsedByDeviceId { get; set; }
}

// ---- DTOs for Mobile API Communication ----

public sealed record FamDeviceRegisterRequest(
    string DeviceId,
    string DeviceName,
    string Brand,
    string Model,
    string OsName,
    string OsVersion,
    string AppVersion,
    int BatteryLevel,
    bool IsCharging
);

public sealed record FamLocationReportRequest(
    string DeviceId,
    double Latitude,
    double Longitude,
    double? Altitude,
    double? Accuracy,
    double? Speed,
    int? BatteryLevel,
    bool? IsCharging,
    string? Address
);

public sealed record FamLostModeRequest(
    bool IsLost,
    string? LostMessage
);

public sealed record FamCreateQrRequest(
    string PayloadType,
    string PayloadData,
    int ExpirationMinutes = 15
);

public sealed record FamVerifyQrRequest(
    string SessionCode,
    string DeviceId
);

public sealed record FamQrVerifyResult(
    bool Success,
    string Message,
    string? PayloadType,
    string? PayloadData
);

public sealed record DataDeletionPublicRequest(
    string Email,
    string? Reason
);

