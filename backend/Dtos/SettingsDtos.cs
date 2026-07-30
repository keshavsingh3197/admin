namespace Admin.Api.Dtos;

/// <summary>Read model for the settings screen (Admin-only; includes the security knobs).</summary>
public sealed record SettingsView(
    string SiteTitle,
    string BlogUrl,
    string BlogAdminUrl,
    bool EmailTwoFactorEnabled,
    bool SmsTwoFactorEnabled,
    int AccessTokenMinutes,
    int RefreshTokenDays,
    int TwoFactorTokenMinutes,
    bool EnforceSingleSessionPerUser,
    int RefreshTokenRetentionDays,
    int AnalyticsRetentionDays,
    int EmailOtpMinutes,
    int MaxFailedLoginAttempts,
    int LockoutMinutes,
    int BackupCodeCount,
    DateTime UpdatedAt);

/// <summary>Partial update — only non-null fields are applied.</summary>
public sealed record UpdateSettingsRequest(
    string? SiteTitle,
    string? BlogUrl,
    string? BlogAdminUrl,
    bool? EmailTwoFactorEnabled,
    bool? SmsTwoFactorEnabled,
    int? AccessTokenMinutes,
    int? RefreshTokenDays,
    int? TwoFactorTokenMinutes,
    bool? EnforceSingleSessionPerUser,
    int? RefreshTokenRetentionDays,
    int? AnalyticsRetentionDays,
    int? EmailOtpMinutes,
    int? MaxFailedLoginAttempts,
    int? LockoutMinutes,
    int? BackupCodeCount);

/// <summary>
/// The non-secret, shareable config served publicly at <c>GET /api/config</c> for every
/// *.keshavsingh.in app. Deliberately a NARROW projection of the settings — it must never carry
/// the security knobs or anything secret.
/// </summary>
public sealed record PublicConfigView(
    string SiteTitle,
    string BlogUrl,
    string BlogAdminUrl,
    DateTime UpdatedAt);
