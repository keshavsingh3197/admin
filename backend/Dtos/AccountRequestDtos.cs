using System.ComponentModel.DataAnnotations;
using Admin.Api.Models;

namespace Admin.Api.Dtos;

/// <summary>
/// The public sign-up form. Minimum 12 characters matches <c>CreateUserRequest</c>, so an applicant
/// can never end up with a weaker password than an admin-created account.
/// </summary>
public sealed record AccountRequestSubmitRequest(
    [Required, EmailAddress, MaxLength(256)] string Email,
    [Required, MaxLength(120)] string DisplayName,
    [Required, MinLength(12), MaxLength(256)] string Password,
    [MaxLength(1000)] string? Reason);

/// <summary>
/// What the form gets back. Deliberately identical whatever happened — accepted, duplicate of a
/// pending request, or an address that already has an account — so the endpoint cannot be used to
/// find out who has an account here.
/// </summary>
public sealed record AccountRequestSubmitResult(bool Received, string Message);

/// <summary>The admin's view of one request.</summary>
public sealed record AccountRequestDto(
    string Id,
    string Email,
    string DisplayName,
    string? Reason,
    AccountRequestStatus Status,
    DateTime CreatedAt,
    DateTime? DecidedAt,
    string? DecisionNote,
    string? CreatedUserId);

public sealed record AccountRequestSummary(int Pending, int Total);

/// <summary>
/// Approval settings. Roles default to Viewer — enough to sign in and comment on the blog, and
/// nothing else — because an approved stranger is a reader, not a colleague.
/// </summary>
public sealed record ApproveAccountRequest(
    List<string>? Roles,
    [MaxLength(400)] string? Note);

public sealed record RejectAccountRequest([MaxLength(400)] string? Note);
