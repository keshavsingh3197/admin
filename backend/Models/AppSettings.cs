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

    // Email/SMS second-factor toggles. Admin uses logging notification stubs, so these stay off
    // unless real senders are wired; TOTP (authenticator) 2FA works regardless via /security.
    public bool EmailTwoFactorEnabled { get; set; }
    public bool SmsTwoFactorEnabled { get; set; }

    public int EmailOtpMinutes { get; set; } = 5;
    public int MaxFailedLoginAttempts { get; set; } = 5;
    public int LockoutMinutes { get; set; } = 15;
    public int BackupCodeCount { get; set; } = 10;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
