namespace Admin.Api.Dtos;

/// <summary>Read model for the settings screen (Admin-only; includes the security knobs).</summary>
public sealed record SettingsView(
    string SiteTitle,
    string BlogUrl,
    string BlogAdminUrl,
    bool EmailTwoFactorEnabled,
    bool SmsTwoFactorEnabled,
    bool WhatsAppTwoFactorEnabled,
    int AccessTokenMinutes,
    int RefreshTokenDays,
    int TwoFactorTokenMinutes,
    bool EnforceSingleSessionPerUser,
    int RefreshTokenRetentionDays,
    int AnalyticsRetentionDays,
    int LoginAuditRetentionDays,
    int EmailOtpMinutes,
    int MaxFailedLoginAttempts,
    int LockoutMinutes,
    int BackupCodeCount,
    bool WhatsAppAlertsEnabled,
    bool WhatsAppAccessTokenSet,
    string WhatsAppPhoneNumberId,
    string WhatsAppAlertToNumber,
    string StorageProvider,
    string StorageS3ServiceUrl,
    string StorageS3Bucket,
    string StorageS3AccessKeyId,
    bool StorageS3SecretAccessKeySet,
    DateTime UpdatedAt);

/// <summary>Partial update — only non-null fields are applied.</summary>
public sealed record UpdateSettingsRequest(
    string? SiteTitle,
    string? BlogUrl,
    string? BlogAdminUrl,
    bool? EmailTwoFactorEnabled,
    bool? SmsTwoFactorEnabled,
    bool? WhatsAppTwoFactorEnabled,
    int? AccessTokenMinutes,
    int? RefreshTokenDays,
    int? TwoFactorTokenMinutes,
    bool? EnforceSingleSessionPerUser,
    int? RefreshTokenRetentionDays,
    int? AnalyticsRetentionDays,
    int? LoginAuditRetentionDays,
    int? EmailOtpMinutes,
    int? MaxFailedLoginAttempts,
    int? LockoutMinutes,
    int? BackupCodeCount,
    bool? WhatsAppAlertsEnabled,
    string? WhatsAppAccessToken,
    string? WhatsAppPhoneNumberId,
    string? WhatsAppAlertToNumber,
    string? StorageProvider,
    string? StorageS3ServiceUrl,
    string? StorageS3Bucket,
    string? StorageS3AccessKeyId,
    string? StorageS3SecretAccessKey);

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

/// <summary>
/// What <c>GET /api/config</c> actually returns: the settings projection above, plus the runtime
/// config registry and the localisation manifest, so an app can boot knowing its URLs, icons,
/// feature flags and languages without any of them being compiled into its build.
///
/// <para><see cref="Values"/> holds only the entries whose stored scope permits the caller — public
/// for anonymous, public + authenticated for a signed-in one. Secret and internal entries are never
/// present. <see cref="Types"/> gives each key's declared type so the client can parse it without
/// guessing.</para>
///
/// <para><see cref="Version"/> changes whenever anything in here does; it is the ETag and the signal
/// for a client to re-fetch.</para>
/// </summary>
public sealed record AppConfigEnvelopeView(
    string SiteTitle,
    string BlogUrl,
    string BlogAdminUrl,
    string Version,
    string DefaultLocale,
    IReadOnlyList<PublicLocaleView> Locales,
    IReadOnlyDictionary<string, string> Values,
    IReadOnlyDictionary<string, string> Types,
    IReadOnlyDictionary<string, string> LocaleVersions,
    DateTime UpdatedAt);
