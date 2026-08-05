using System.ComponentModel.DataAnnotations;

namespace Admin.Api.Dtos;

// ---- Public (the widget on the public site) ----

/// <summary>Starting a chat. Name and email are optional — a visitor may just want to ask something.</summary>
public sealed record StartVisitorChatRequest(
    [MaxLength(40)] string? Source,
    [MaxLength(120)] string? DisplayName,
    [EmailAddress, MaxLength(200)] string? Email,
    [MaxLength(400)] string? UserAgent);

/// <summary>
/// The token is the visitor's only credential. It is returned once, kept in their browser, and never
/// stored server-side in a form that could be replayed (only its hash is).
/// </summary>
public sealed record StartVisitorChatResponse(string Token, string SessionId, string Greeting);

public sealed record PostVisitorMessageRequest([Required, MinLength(1), MaxLength(2_000)] string Body);

public sealed record VisitorChatMessageView(
    string Id, string Author, string? StaffName, string Body, DateTime SentAt);

/// <summary>
/// What the widget polls for: anything said since it last looked, whether someone is typing back, and
/// whether the conversation is still open.
/// </summary>
public sealed record VisitorChatPoll(
    string Status,
    bool StaffTyping,
    IReadOnlyList<VisitorChatMessageView> Messages);

// ---- Staff side ----

public sealed record VisitorChatSessionView(
    string Id,
    string Source,
    string? DisplayName,
    string? Email,
    string Status,
    string? UserAgent,
    DateTime CreatedAt,
    DateTime LastMessageAt,
    DateTime VisitorSeenAt,
    bool VisitorOnline,
    bool VisitorTyping,
    int UnreadForStaff,
    string? LastMessagePreview,
    string? LastStaffUserId);

public sealed record VisitorChatThread(
    VisitorChatSessionView Session,
    IReadOnlyList<VisitorChatMessageView> Messages);

public sealed record ReplyToVisitorRequest([Required, MinLength(1), MaxLength(2_000)] string Body);

public sealed record UpdateVisitorChatStatusRequest(
    [Required, RegularExpression("^(open|closed|blocked)$")] string Status);

/// <summary>Counts for the nav badge: conversations waiting, and how many are live right now.</summary>
public sealed record VisitorChatSummary(long Waiting, long Online, long Open);
