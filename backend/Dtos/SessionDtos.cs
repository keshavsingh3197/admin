namespace Admin.Api.Dtos;

/// <summary>One of the caller's own active sessions, across every *.keshavsingh.in app.</summary>
public sealed record SessionListItemDto(
    string Id,
    string AppKey,
    string? DeviceLabel,
    DateTime CreatedAt,
    DateTime ExpiresAt,
    bool IsCurrent);
