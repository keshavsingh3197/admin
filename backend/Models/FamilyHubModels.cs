using MongoDB.Bson.Serialization.Attributes;

namespace Admin.Api.Models;

/// <summary>
/// A shared family chore, grocery, or errand item synchronized between the mobile app and Admin.
/// </summary>
public sealed class FamilyTask
{
    [BsonId]
    public string Id { get; set; } = string.Empty;

    [BsonElement("familyId")]
    public string FamilyId { get; set; } = string.Empty;

    [BsonElement("title")]
    public string Title { get; set; } = string.Empty;

    [BsonElement("category")]
    public string Category { get; set; } = "chore"; // grocery, chore, shopping, errand

    [BsonElement("completed")]
    public bool Completed { get; set; }

    [BsonElement("assignedTo")]
    public string? AssignedTo { get; set; }

    [BsonElement("priority")]
    public string Priority { get; set; } = "medium"; // low, medium, high

    [BsonElement("dueDate")]
    public string? DueDate { get; set; }

    [BsonElement("createdAt")]
    public long CreatedAt { get; set; }

    [BsonElement("updatedAt")]
    public long UpdatedAt { get; set; }

    [BsonElement("createdByUserId")]
    public string? CreatedByUserId { get; set; }
}

/// <summary>
/// A family calendar event, gathering, birthday or appointment.
/// </summary>
public sealed class FamilyEvent
{
    [BsonId]
    public string Id { get; set; } = string.Empty;

    [BsonElement("familyId")]
    public string FamilyId { get; set; } = string.Empty;

    [BsonElement("title")]
    public string Title { get; set; } = string.Empty;

    [BsonElement("type")]
    public string Type { get; set; } = "reminder"; // birthday, medical, anniversary, gathering, reminder

    [BsonElement("date")]
    public string Date { get; set; } = string.Empty; // YYYY-MM-DD

    [BsonElement("time")]
    public string? Time { get; set; }

    [BsonElement("notes")]
    public string? Notes { get; set; }

    [BsonElement("attendees")]
    public List<string> Attendees { get; set; } = new();

    [BsonElement("createdAt")]
    public long CreatedAt { get; set; }

    [BsonElement("updatedAt")]
    public long UpdatedAt { get; set; }

    [BsonElement("createdByUserId")]
    public string? CreatedByUserId { get; set; }
}

/// <summary>
/// A confidential vault item (Wifi credentials, safe codes, medical IDs, policy numbers).
/// </summary>
public sealed class FamilyVaultItem
{
    [BsonId]
    public string Id { get; set; } = string.Empty;

    [BsonElement("familyId")]
    public string FamilyId { get; set; } = string.Empty;

    [BsonElement("title")]
    public string Title { get; set; } = string.Empty;

    [BsonElement("category")]
    public string Category { get; set; } = "security"; // wifi, security, document, health, finance

    [BsonElement("secretValue")]
    public string SecretValue { get; set; } = string.Empty;

    [BsonElement("description")]
    public string? Description { get; set; }

    [BsonElement("updatedAt")]
    public long UpdatedAt { get; set; }

    [BsonElement("updatedByUserId")]
    public string? UpdatedByUserId { get; set; }
}

/// <summary>
/// Profile representation of a family member and emergency contact.
/// </summary>
public sealed class FamilyMemberProfile
{
    [BsonId]
    public string Id { get; set; } = string.Empty;

    [BsonElement("familyId")]
    public string FamilyId { get; set; } = string.Empty;

    [BsonElement("userId")]
    public string? UserId { get; set; }

    [BsonElement("name")]
    public string Name { get; set; } = string.Empty;

    [BsonElement("relation")]
    public string Relation { get; set; } = string.Empty;

    [BsonElement("phone")]
    public string Phone { get; set; } = string.Empty;

    [BsonElement("avatarColor")]
    public string AvatarColor { get; set; } = "#4F46E5";

    [BsonElement("status")]
    public string Status { get; set; } = "Home";

    [BsonElement("isEmergencyContact")]
    public bool IsEmergencyContact { get; set; }

    [BsonElement("updatedAt")]
    public long UpdatedAt { get; set; }
}

/// <summary>
/// Aggregated family hub state returned to the mobile app or admin dashboard.
/// </summary>
public sealed record FamilyHubState(
    string FamilyId,
    string FamilyName,
    IReadOnlyList<FamilyMemberProfile> Members,
    IReadOnlyList<FamilyTask> Tasks,
    IReadOnlyList<FamilyEvent> Events,
    IReadOnlyList<FamilyVaultItem> VaultItems,
    long LastSyncedAt);

/// <summary>
/// Sync request payload submitted from the mobile app.
/// </summary>
public sealed record FamilySyncRequest(
    string? FamilyId,
    List<FamilyMemberProfile>? Members,
    List<FamilyTask>? Tasks,
    List<FamilyEvent>? Events,
    List<FamilyVaultItem>? VaultItems,
    long? ClientTimestamp);

/// <summary>
/// SOS Emergency trigger request.
/// </summary>
public sealed record FamilySosAlertRequest(
    string? FamilyId,
    string Message,
    List<string>? EmergencyContactNames,
    double? Latitude,
    double? Longitude);

