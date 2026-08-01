using System.ComponentModel.DataAnnotations;

namespace Admin.Api.Dtos;

// User & role management DTOs for the identity provider's admin surface (/api/users).

public sealed record CreateUserRequest(
    [Required, EmailAddress, MaxLength(256)] string Email,
    [MaxLength(60)] string? Username,
    [Required, MaxLength(120)] string DisplayName,
    [Phone, MaxLength(20)] string? PhoneNumber,
    [Required, MinLength(12), MaxLength(256)] string Password,
    List<string>? Roles,
    List<string>? CustomRoleKeys);

public sealed record UpdateUserRequest(
    [MaxLength(60)] string? Username,
    [MaxLength(120)] string? DisplayName,
    [Phone, MaxLength(20)] string? PhoneNumber,
    List<string>? Roles,
    List<string>? CustomRoleKeys,
    bool? IsActive);

public sealed record ResetPasswordRequest(
    [Required, MinLength(12), MaxLength(256)] string NewPassword);

public sealed record UserListItem(
    string Id,
    string Email,
    string? Username,
    string DisplayName,
    string? PhoneNumber,
    IReadOnlyList<string> Roles,
    IReadOnlyList<string> CustomRoleKeys,
    IReadOnlyList<string> GroupIds,
    bool IsActive,
    bool TwoFactorEnabled,
    DateTime? LastLoginAt,
    DateTime CreatedAt);
