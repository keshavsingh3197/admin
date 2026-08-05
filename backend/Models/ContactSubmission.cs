using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Admin.Api.Models;

public static class ContactStatus
{
    public const string New = "new";
    public const string Read = "read";
    public const string Replied = "replied";
    public const string Spam = "spam";
    public const string Archived = "archived";

    public static bool IsValid(string? status) => status is New or Read or Replied or Spam or Archived;
}

/// <summary>
/// A reply an admin wrote back. This app has no outbound mail path (its <c>IEmailSender</c> only
/// delivers OTPs), so a reply is <em>recorded</em> here and the admin sends it from their own mail client
/// via the inbox's mail link. <see cref="MarkedSent"/> is the admin confirming they did.
/// </summary>
[BsonIgnoreExtraElements]
public sealed class ContactReply
{
    /// <summary>Encrypted at rest, like the incoming message.</summary>
    [BsonElement("body")] public string Body { get; set; } = string.Empty;

    [BsonElement("sentByUserId")] public string SentByUserId { get; set; } = string.Empty;
    [BsonElement("sentAt")] public DateTime SentAt { get; set; } = DateTime.UtcNow;

    /// <summary>Set once the admin says they actually sent it, so the thread reflects reality.</summary>
    [BsonElement("markedSent")] public bool MarkedSent { get; set; }
}

/// <summary>
/// A message from the portfolio's "Contact me" form. This is personal data volunteered by a stranger:
/// the name, email and message body are encrypted at rest, only admins can read it, and the client IP is
/// deliberately not stored — the form needs no fingerprinting to work.
/// </summary>
[BsonIgnoreExtraElements]
public sealed class ContactSubmission
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    /// <summary>Which site it came from (portfolio, blog, …), so one inbox can serve several.</summary>
    [BsonElement("source")] public string Source { get; set; } = "portfolio";

    // All three are encrypted at rest (see DataProtector) and decrypted only when an admin reads them.
    [BsonElement("name")] public string Name { get; set; } = string.Empty;
    [BsonElement("email")] public string Email { get; set; } = string.Empty;
    [BsonElement("message")] public string Message { get; set; } = string.Empty;

    /// <summary>Where the sender said they were, if they shared it. Coarse and optional.</summary>
    [BsonElement("latitude")] public double? Latitude { get; set; }
    [BsonElement("longitude")] public double? Longitude { get; set; }
    [BsonElement("accuracyMeters")] public double? AccuracyMeters { get; set; }

    /// <summary>Kept for spotting bot floods; truncated on the way in.</summary>
    [BsonElement("userAgent")] public string? UserAgent { get; set; }

    [BsonElement("status")] public string Status { get; set; } = ContactStatus.New;
    [BsonElement("replies")] public List<ContactReply> Replies { get; set; } = new();

    [BsonElement("createdAt")] public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    [BsonElement("readAt")] public DateTime? ReadAt { get; set; }
    [BsonElement("updatedAt")] public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
