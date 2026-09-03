namespace Admin.Api.Dtos;

/// <summary>One row in the audit viewer.</summary>
/// <param name="Actor">Who did it — the operator's email, or "(anonymous)" for a pre-login event.</param>
/// <param name="Target">What was acted on, when that differs from the actor. Null for auth events.</param>
public sealed record AuditEntryView(
    string Id,
    string Event,
    bool Success,
    string Actor,
    string? ActorUserId,
    string? Target,
    string? Details,
    string? IpAddress,
    string? UserAgent,
    DateTime Timestamp);

public sealed record AuditPageView(IReadOnlyList<AuditEntryView> Items, long Total, int Skip, int Take);
