using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Admin.Api.Models;

/// <summary>
/// Somebody asking for an account. Nobody self-registers into this identity provider: a request sits
/// here until an admin approves it, and only then does a <see cref="User"/> exist to sign in with.
///
/// The password the applicant chose is hashed on arrival (PBKDF2, same as any user) and carried across
/// on approval, so they can sign in with what they picked and no password ever needs mailing — this
/// system has no outbound mail path. The hash is cleared once it has been used or the request refused.
/// </summary>
public sealed class AccountRequest
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();

    /// <summary>Lower-cased, and unique across pending requests.</summary>
    public string Email { get; set; } = string.Empty;

    public string DisplayName { get; set; } = string.Empty;

    /// <summary>Why they want access, in their words. Shown to the admin deciding.</summary>
    public string? Reason { get; set; }

    /// <summary>PBKDF2 hash of the applicant's chosen password. Null once approved or rejected.</summary>
    public string? PasswordHash { get; set; }

    public AccountRequestStatus Status { get; set; } = AccountRequestStatus.Pending;

    /// <summary>Set on approval — the user this request became, for the audit trail.</summary>
    public string? CreatedUserId { get; set; }

    public string? DecidedByUserId { get; set; }
    public DateTime? DecidedAt { get; set; }

    /// <summary>The admin's note on the decision. Never shown to the applicant.</summary>
    public string? DecisionNote { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public enum AccountRequestStatus
{
    Pending = 0,
    Approved = 1,
    Rejected = 2,
}
