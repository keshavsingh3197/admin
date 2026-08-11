using MongoDB.Bson.Serialization.Attributes;

namespace Admin.Api.Models;

/// <summary>
/// The single (singleton) settings document for the identity provider. DB-backed so an Admin can
/// tune the auth-security parameters at runtime without a redeploy. The shared auth engine reads
/// this via <c>IAuthSettings</c> (see <c>SettingsService</c>).
/// </summary>
public sealed class AppSettings
{
    public const string SingletonId = "app-settings";

    [BsonId]
    public string Id { get; set; } = SingletonId;

    public string SiteTitle { get; set; } = "Admin";

    // ---- Shared, non-secret app config served publicly at GET /api/config ----
    // Centralised here so every *.keshavsingh.in app reads one source instead of duplicating these
    // in its own environment file. NEVER put secrets or bootstrap config (signing keys, DB/API
    // URLs) here — this document is served without authentication.
    public string BlogUrl { get; set; } = "https://blog.keshavsingh.in";
    public string BlogAdminUrl { get; set; } = "https://blog.keshavsingh.in/admin";

    // Email/SMS/WhatsApp second-factor toggles. Admin uses logging notification stubs, so these
    // stay off unless real senders are wired; TOTP (authenticator) 2FA works regardless via /security.
    public bool EmailTwoFactorEnabled { get; set; }
    public bool SmsTwoFactorEnabled { get; set; }
    public bool WhatsAppTwoFactorEnabled { get; set; }

    public int EmailOtpMinutes { get; set; } = 5;
    public int MaxFailedLoginAttempts { get; set; } = 5;
    public int LockoutMinutes { get; set; } = 15;
    public int BackupCodeCount { get; set; } = 10;
    public int AccessTokenMinutes { get; set; } = 15;
    public int RefreshTokenDays { get; set; } = 7;
    public int TwoFactorTokenMinutes { get; set; } = 5;
    public bool EnforceSingleSessionPerUser { get; set; } = true;
    public int RefreshTokenRetentionDays { get; set; } = 30;
    public int AnalyticsRetentionDays { get; set; } = 90;
    public int LoginAuditRetentionDays { get; set; } = 180;

    // ---- WhatsApp security alerts (Meta Cloud API), sent on account lockout ----
    public bool WhatsAppAlertsEnabled { get; set; }
    public string? WhatsAppAccessTokenEncrypted { get; set; }   // 🔒 AES-encrypted.
    public string WhatsAppPhoneNumberId { get; set; } = string.Empty;
    public string WhatsAppAlertToNumber { get; set; } = string.Empty;

    // ---- Private file storage backend (KeshavSingh.Storage), managed on the Settings screen ----
    // Provider "Local" keeps files on disk; "S3" uses an S3-compatible bucket (Cloudflare R2). The
    // access key is an identifier (stored as-is); the secret is AES-encrypted like the WhatsApp token.
    public string StorageProvider { get; set; } = "Local";       // "Local" | "S3"
    public string StorageS3ServiceUrl { get; set; } = string.Empty;
    public string StorageS3Bucket { get; set; } = string.Empty;
    public string StorageS3AccessKeyId { get; set; } = string.Empty;
    public string? StorageS3SecretAccessKeyEncrypted { get; set; }   // 🔒 AES-encrypted.

    // ---- GitHub integration for the Packages inventory screen ----
    // A PAT with read:packages (+ repo, for private repos) scope, used to discover producer/consumer
    // manifests directly from GitHub (Git Trees + Contents API) and to read published package versions.
    // Falls back to PackageInventory:GitHubToken / PACKAGES_READ_TOKEN in appsettings/env if unset here.
    public string? GitHubPackagesTokenEncrypted { get; set; }   // 🔒 AES-encrypted.

    // ---- GitHub OAuth App (alternative to pasting the PAT above) ----
    // Register an OAuth App at github.com/settings/developers with callback
    // {this API's base URL}/api/settings/github/oauth/callback, then paste its Client ID/Secret here.
    // A completed "Connect to GitHub" flow writes its resulting token into
    // GitHubPackagesTokenEncrypted above — same storage, same consumer, just a different way in.
    public string GitHubOAuthClientId { get; set; } = string.Empty;
    public string? GitHubOAuthClientSecretEncrypted { get; set; }   // 🔒 AES-encrypted.

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
