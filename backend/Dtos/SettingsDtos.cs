namespace Admin.Api.Dtos;

/// <summary>Read model for the settings screen.</summary>
public sealed record SettingsView(
    string SiteTitle,
    bool EmailTwoFactorEnabled,
    bool SmsTwoFactorEnabled,
    int EmailOtpMinutes,
    int MaxFailedLoginAttempts,
    int LockoutMinutes,
    int BackupCodeCount,
    DateTime UpdatedAt);

/// <summary>Partial update — only non-null fields are applied.</summary>
public sealed record UpdateSettingsRequest(
    string? SiteTitle,
    bool? EmailTwoFactorEnabled,
    bool? SmsTwoFactorEnabled,
    int? EmailOtpMinutes,
    int? MaxFailedLoginAttempts,
    int? LockoutMinutes,
    int? BackupCodeCount);
