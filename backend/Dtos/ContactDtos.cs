using System.ComponentModel.DataAnnotations;

namespace Admin.Api.Dtos;

/// <summary>
/// What the portfolio's contact form posts. Public endpoint, so every field is bounded here at the trust
/// boundary before anything is stored. Shape matches the portfolio's <c>ContactMessage</c> model.
/// </summary>
public sealed record ContactSubmitRequest(
    [Required, MinLength(2), MaxLength(120)] string Name,
    [Required, EmailAddress, MaxLength(200)] string Email,
    [Required, MinLength(10), MaxLength(4000)] string Message,
    ContactLocationDto? Location,
    [MaxLength(400)] string? UserAgent,
    [MaxLength(40)] string? Source);

public sealed record ContactLocationDto(
    [Range(-90, 90)] double? Latitude,
    [Range(-180, 180)] double? Longitude,
    [Range(0, 1_000_000)] double? Accuracy);

/// <summary>Deliberately says nothing about storage, so the form can't be used to probe the backend.</summary>
public sealed record ContactSubmitResult(bool Success, string Message);

/// <summary><c>MarkedSent</c> is the admin confirming they sent it from their own mail client.</summary>
public sealed record ContactReplyDto(string Body, string SentByUserId, DateTime SentAt, bool MarkedSent);

public sealed record ContactSubmissionDto(
    string Id,
    string Source,
    string Name,
    string Email,
    string Message,
    double? Latitude,
    double? Longitude,
    double? AccuracyMeters,
    string? UserAgent,
    string Status,
    DateTime CreatedAt,
    DateTime? ReadAt,
    IReadOnlyList<ContactReplyDto> Replies);

public sealed record SendContactReplyRequest([Required, MinLength(2), MaxLength(4000)] string Body);

public sealed record UpdateContactStatusRequest(
    [Required, RegularExpression("^(new|read|replied|spam|archived)$")] string Status);

/// <summary>Counts for the inbox badge: how many are unread, and how many there are in total.</summary>
public sealed record ContactInboxSummary(long Unread, long Total);
