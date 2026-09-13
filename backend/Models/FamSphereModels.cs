using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Admin.Api.Models;

/// <summary>
/// Dedicated mobile user account stored in FamSphereDb collection "Fam_Users".
/// Fully isolated from AdminDb.users.
/// </summary>
public sealed class FamUser
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();

    [BsonElement("email")]
    public string Email { get; set; } = string.Empty;

    [BsonElement("username")]
    public string? Username { get; set; }

    [BsonElement("displayName")]
    public string DisplayName { get; set; } = string.Empty;

    [BsonElement("passwordHash")]
    public string PasswordHash { get; set; } = string.Empty;

    [BsonElement("roles")]
    public List<string> Roles { get; set; } = new() { "MobileUser" };

    [BsonElement("isActive")]
    public bool IsActive { get; set; } = true;

    [BsonElement("createdAt")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [BsonElement("updatedAt")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Synced family contact stored in FamSphereDb collection "Fam_Contacts".
/// </summary>
public sealed class FamContact
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();

    [BsonElement("userId")]
    public string UserId { get; set; } = string.Empty;

    [BsonElement("familyId")]
    public string FamilyId { get; set; } = string.Empty;

    [BsonElement("name")]
    public string Name { get; set; } = string.Empty;

    [BsonElement("phoneNumbers")]
    public List<string> PhoneNumbers { get; set; } = new();

    [BsonElement("emails")]
    public List<string> Emails { get; set; } = new();

    [BsonElement("company")]
    public string? Company { get; set; }

    [BsonElement("syncedAt")]
    public DateTime SyncedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Audio and video call log stored in FamSphereDb collection "Fam_Calls".
/// </summary>
public sealed class FamCallRecord
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();

    [BsonElement("userId")]
    public string UserId { get; set; } = string.Empty;

    [BsonElement("familyId")]
    public string FamilyId { get; set; } = string.Empty;

    [BsonElement("deviceId")]
    public string? DeviceId { get; set; }

    [BsonElement("callType")]
    public string CallType { get; set; } = "Audio"; // "Audio" or "Video"

    [BsonElement("targetNameOrPhone")]
    public string TargetNameOrPhone { get; set; } = string.Empty;

    [BsonElement("durationSeconds")]
    public int DurationSeconds { get; set; }

    [BsonElement("status")]
    public string Status { get; set; } = "Completed"; // "Completed", "Missed", "Rejected"

    [BsonElement("timestamp")]
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Family chat message stored in FamSphereDb collection "Fam_Messages".
/// </summary>
public sealed class FamChatMessage
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();

    [BsonElement("userId")]
    public string UserId { get; set; } = string.Empty;

    [BsonElement("familyId")]
    public string FamilyId { get; set; } = string.Empty;

    [BsonElement("senderName")]
    public string SenderName { get; set; } = string.Empty;

    [BsonElement("messageText")]
    public string MessageText { get; set; } = string.Empty;

    [BsonElement("messageType")]
    public string MessageType { get; set; } = "Text"; // "Text", "Location", "Emergency"

    [BsonElement("timestamp")]
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// App version and update config stored in FamSphereDb collection "Fam_AppConfig".
/// </summary>
public sealed class FamAppVersionConfig
{
    [BsonId]
    public string Id { get; set; } = "famsphere_app_version";

    [BsonElement("latestVersionName")]
    public string LatestVersionName { get; set; } = "1.0.0";

    [BsonElement("latestVersionCode")]
    public int LatestVersionCode { get; set; } = 6;

    [BsonElement("minSupportedVersionCode")]
    public int MinSupportedVersionCode { get; set; } = 1;

    [BsonElement("isMandatory")]
    public bool IsMandatory { get; set; } = false;

    [BsonElement("releaseNotes")]
    public string ReleaseNotes { get; set; } = "Performance improvements and security updates.";

    [BsonElement("playStoreUrl")]
    public string PlayStoreUrl { get; set; } = "https://play.google.com/store/apps/details?id=in.keshavsingh.famsphere";

    [BsonElement("updatedAt")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

// ---- DTOs for Mobile API Communication ----

public sealed record MobileLoginRequest(
    string Email,
    string Password
);

public sealed record MobileLoginResponse(
    bool Success,
    string? Error,
    MobileAuthTokens? Tokens
);

public sealed record MobileAuthTokens(
    string AccessToken,
    DateTime AccessTokenExpiresAt,
    MobileUserDto User
);

public sealed record SyncContactsRequest(
    List<FamContactDto> Contacts
);

public sealed record FamContactDto(
    string Name,
    List<string> PhoneNumbers,
    List<string>? Emails,
    string? Company
);

public sealed record LogCallRequest(
    string? DeviceId,
    string CallType,
    string TargetNameOrPhone,
    int DurationSeconds,
    string Status
);

public sealed record SendChatMessageRequest(
    string MessageText,
    string? MessageType
);

public sealed record AppVersionCheckResponse(
    string LatestVersionName,
    int LatestVersionCode,
    int MinSupportedVersionCode,
    bool UpdateAvailable,
    bool IsMandatory,
    string ReleaseNotes,
    string PlayStoreUrl,
    string MarketUrl
);

public sealed record UpdateAppVersionConfigRequest(
    string LatestVersionName,
    int LatestVersionCode,
    int MinSupportedVersionCode,
    bool IsMandatory,
    string ReleaseNotes,
    string PlayStoreUrl
);
