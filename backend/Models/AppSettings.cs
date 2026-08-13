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

    // ---- OAuth (GitHub / LinkedIn) ----
    // Every OAuth flow — social sign-in and "Connect to GitHub" for the Packages screen — uses ONE
    // redirect URI: {OAuthCallbackBaseUrl}/api/oauth/callback. Providers match redirect_uri against
    // what the app registered (a GitHub OAuth App allows exactly one), so this must be a fixed,
    // canonical origin rather than whichever host a request happened to arrive on — reaching the API
    // via a second hostname is what produces "redirect_uri is not associated with this application".
    // Blank falls back to the current request's origin (fine for localhost / a fresh deployment).
    // Which site the user returns to afterwards is carried in signed state, never registered.
    public string OAuthCallbackBaseUrl { get; set; } = string.Empty;

    public string GitHubOAuthClientId { get; set; } = string.Empty;
    public string? GitHubOAuthClientSecretEncrypted { get; set; }   // 🔒 AES-encrypted.

    public bool GitHubSocialLoginEnabled { get; set; }
    public bool LinkedInSocialLoginEnabled { get; set; }
    public string LinkedInOAuthClientId { get; set; } = string.Empty;
    public string? LinkedInOAuthClientSecretEncrypted { get; set; } // 🔒 AES-encrypted.

    // Which repositories the Packages screen scans, chosen on the Settings screen and persisted here.
    // Empty means package inventory is deliberately not configured: never fall back to enumerating
    // every repo the token can see — that is slow, noisy, and burns the GitHub API rate limit.
    public List<string> PackageInventoryRepositories { get; set; } = [];

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
