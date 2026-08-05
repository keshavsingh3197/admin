using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Admin.Api.Models;

public static class VisitorChatStatus
{
    public const string Open = "open";
    public const string Closed = "closed";
    public const string Blocked = "blocked";

    public static bool IsValid(string? status) => status is Open or Closed or Blocked;
}

public static class VisitorChatAuthor
{
    public const string Visitor = "visitor";
    public const string Staff = "staff";
}

/// <summary>
/// A live conversation with someone on a public site — the chat bubble on the portfolio. The visitor has
/// no account, so the session is identified by an opaque token their browser holds; only the SHA-256 of
/// that token is stored, so a dump of this collection cannot be used to resume anyone's chat.
///
/// Everything the visitor types is personal data volunteered by a stranger, so message bodies and any
/// name/email they offer are encrypted at rest, and the client IP is never stored.
/// </summary>
[BsonIgnoreExtraElements]
public sealed class VisitorChatSession
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    /// <summary>SHA-256 of the visitor's token. The token itself is never persisted.</summary>
    [BsonElement("tokenHash")] public string TokenHash { get; set; } = string.Empty;

    /// <summary>Which site the chat started on, so one queue can serve several.</summary>
    [BsonElement("source")] public string Source { get; set; } = "portfolio";

    // Encrypted at rest, and optional — a visitor can chat without telling us who they are.
    [BsonElement("displayName")] public string? DisplayName { get; set; }
    [BsonElement("email")] public string? Email { get; set; }

    [BsonElement("status")] public string Status { get; set; } = VisitorChatStatus.Open;

    /// <summary>Kept for spotting bot floods; truncated on the way in.</summary>
    [BsonElement("userAgent")] public string? UserAgent { get; set; }

    [BsonElement("createdAt")] public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    [BsonElement("lastMessageAt")] public DateTime LastMessageAt { get; set; } = DateTime.UtcNow;

    /// <summary>Last poll from the visitor's browser — how the staff side knows they are still there.</summary>
    [BsonElement("visitorSeenAt")] public DateTime VisitorSeenAt { get; set; } = DateTime.UtcNow;

    /// <summary>When the staff side last opened this conversation, for the unread count.</summary>
    [BsonElement("staffReadAt")] public DateTime? StaffReadAt { get; set; }

    // "X is typing" is a timestamp, not a flag: a stale one expires by itself, so a dropped
    // connection can never leave the other side watching a dot that never stops.
    [BsonElement("visitorTypingAt")] public DateTime? VisitorTypingAt { get; set; }
    [BsonElement("staffTypingAt")] public DateTime? StaffTypingAt { get; set; }

    /// <summary>Who answered last, shown in the queue so an unanswered visitor stands out.</summary>
    [BsonElement("lastStaffUserId")] public string? LastStaffUserId { get; set; }
}

/// <summary>One line of a visitor conversation. The body is encrypted at rest.</summary>
[BsonIgnoreExtraElements]
public sealed class VisitorChatMessage
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    [BsonElement("sessionId")] public string SessionId { get; set; } = string.Empty;

    /// <summary>"visitor" or "staff" — see <see cref="VisitorChatAuthor"/>.</summary>
    [BsonElement("author")] public string Author { get; set; } = VisitorChatAuthor.Visitor;

    /// <summary>Set only for staff messages, so a thread shows who replied.</summary>
    [BsonElement("staffUserId")] public string? StaffUserId { get; set; }
    [BsonElement("staffName")] public string? StaffName { get; set; }

    [BsonElement("body")] public string Body { get; set; } = string.Empty;
    [BsonElement("sentAt")] public DateTime SentAt { get; set; } = DateTime.UtcNow;
}
