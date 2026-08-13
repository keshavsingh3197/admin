using Admin.Api.Auth;
using Admin.Api.Dtos;
using Admin.Api.Models;
using KeshavSingh.Auth;
using KeshavSingh.Auth.Abstractions;
using KeshavSingh.Core;
using KeshavSingh.Security;
using KeshavSingh.Storage;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using MongoDB.Driver;

namespace Admin.Api.Services;

/// <summary>
/// DB-backed auth settings. Loads a cached singleton <see cref="AppSettings"/> from Mongo (seeding
/// it from the "Auth" appsettings/env defaults on first run) and exposes the slice the shared auth
/// engine reads via <see cref="IAuthSettings"/>. The cache is refreshed on every update.
/// Also the runtime <see cref="IStorageSettingsSource"/> so the file-storage backend picks up
/// provider/credential changes made here without a restart.
/// </summary>
public sealed class SettingsService : IAuthSettings, IWhatsAppSettings, IStorageSettingsSource
{
    private readonly IMongoCollection<AppSettings> _col;
    private readonly AuthSettingsOptions _seed;
    private readonly JwtOptions _jwtSeed;
    private readonly PublicConfigOptions _publicSeed;
    private readonly StorageOptions _storageSeed;
    private readonly DataProtector _protector;
    private readonly IMemoryCache _cache;
    private volatile AppSettings _current = new();

    public SettingsService(MongoDbService db, IOptions<AuthSettingsOptions> seed, IOptions<JwtOptions> jwtSeed,
        IOptions<PublicConfigOptions> publicSeed, IOptions<StorageOptions> storageSeed, DataProtector protector,
        IMemoryCache cache)
    {
        _cache = cache;
        _col = db.GetCollection<AppSettings>("settings");
        _seed = seed.Value;
        _jwtSeed = jwtSeed.Value;
        _publicSeed = publicSeed.Value;
        _storageSeed = storageSeed.Value;
        _protector = protector;
    }

    // ---- IAuthSettings (read by the engine) ----
    public bool EmailTwoFactorEnabled => _current.EmailTwoFactorEnabled;
    public bool SmsTwoFactorEnabled => _current.SmsTwoFactorEnabled;
    public bool WhatsAppTwoFactorEnabled => _current.WhatsAppTwoFactorEnabled;
    public int EmailOtpMinutes => _current.EmailOtpMinutes;
    public int MaxFailedLoginAttempts => _current.MaxFailedLoginAttempts;
    public int LockoutMinutes => _current.LockoutMinutes;
    public int BackupCodeCount => _current.BackupCodeCount;
    public int AccessTokenMinutes => _current.AccessTokenMinutes;
    public int RefreshTokenDays => _current.RefreshTokenDays;
    public int TwoFactorTokenMinutes => _current.TwoFactorTokenMinutes;
    public bool EnforceSingleSessionPerUser => _current.EnforceSingleSessionPerUser;
    public int RefreshTokenRetentionDays => _current.RefreshTokenRetentionDays;
    public int AnalyticsRetentionDays => _current.AnalyticsRetentionDays;
    public int LoginAuditRetentionDays => _current.LoginAuditRetentionDays;

    // ---- IWhatsAppSettings (read by WhatsAppNotifier) ----
    public bool WhatsAppAlertsEnabled => _current.WhatsAppAlertsEnabled;
    public string WhatsAppAccessToken => Decrypt(_current.WhatsAppAccessTokenEncrypted) ?? string.Empty;
    public string WhatsAppPhoneNumberId => _current.WhatsAppPhoneNumberId;
    public string WhatsAppAlertToNumber => _current.WhatsAppAlertToNumber;

    // ---- GitHub Packages token (read by PackageInventoryService) ----
    public string? GitHubPackagesToken => Decrypt(_current.GitHubPackagesTokenEncrypted);

    // ---- OAuth (read by the shared OAuth state/callback and the social-login flows) ----
    public string OAuthCallbackBaseUrl => _current.OAuthCallbackBaseUrl;
    public string GitHubOAuthClientId => _current.GitHubOAuthClientId;
    public string? GitHubOAuthClientSecret => Decrypt(_current.GitHubOAuthClientSecretEncrypted);
    public bool GitHubSocialLoginEnabled => _current.GitHubSocialLoginEnabled;
    public bool LinkedInSocialLoginEnabled => _current.LinkedInSocialLoginEnabled;
    public string LinkedInOAuthClientId => _current.LinkedInOAuthClientId;
    public string? LinkedInOAuthClientSecret => Decrypt(_current.LinkedInOAuthClientSecretEncrypted);
    public IReadOnlyList<string> PackageInventoryRepositories => _current.PackageInventoryRepositories;

    /// <summary>Stores a token obtained via the GitHub OAuth flow the same way a pasted PAT is stored —
    /// same field, same consumer (PackageInventoryService) — and busts its 15-minute result cache.</summary>
    public async Task ApplyGitHubOAuthTokenAsync(string accessToken)
    {
        var s = Clone(_current);
        s.GitHubPackagesTokenEncrypted = _protector.Encrypt(accessToken);
        s.UpdatedAt = DateTime.UtcNow;
        await _col.ReplaceOneAsync(x => x.Id == AppSettings.SingletonId, s, new ReplaceOptions { IsUpsert = true });
        _current = s;
        _cache.Remove("package-inventory");
    }

    // ---- IStorageSettingsSource (read by the file-storage backend, live) ----
    // LocalRoot stays a deploy-time setting (dev only); the S3 secret is decrypted here in memory only.
    public ResolvedStorageSettings GetStorageSettings() => new()
    {
        Provider = _current.StorageProvider,
        LocalRoot = _storageSeed.LocalRoot,
        ServiceUrl = _current.StorageS3ServiceUrl,
        Bucket = _current.StorageS3Bucket,
        AccessKeyId = _current.StorageS3AccessKeyId,
        SecretAccessKey = Decrypt(_current.StorageS3SecretAccessKeyEncrypted) ?? string.Empty,
    };

    private string? Decrypt(string? value)
    {
        if (string.IsNullOrEmpty(value)) return null;
        try { return _protector.Decrypt(value); }
        catch { return null; } // Wrong/rotated key — fail closed rather than throw.
    }

    public async Task InitAsync()
    {
        var existing = await _col.Find(s => s.Id == AppSettings.SingletonId).FirstOrDefaultAsync();
        if (existing is not null) { _current = existing; return; }

        // First run: seed from the "Auth" + "PublicConfig" config so behaviour is unchanged until edited.
        var seeded = new AppSettings
        {
            SiteTitle = _publicSeed.SiteTitle,
            BlogUrl = _publicSeed.BlogUrl,
            BlogAdminUrl = _publicSeed.BlogAdminUrl,
            EmailTwoFactorEnabled = _seed.EmailTwoFactorEnabled,
            SmsTwoFactorEnabled = _seed.SmsTwoFactorEnabled,
            WhatsAppTwoFactorEnabled = _seed.WhatsAppTwoFactorEnabled,
            AccessTokenMinutes = _jwtSeed.AccessTokenMinutes,
            RefreshTokenDays = _jwtSeed.RefreshTokenDays,
            TwoFactorTokenMinutes = _jwtSeed.TwoFactorTokenMinutes,
            EnforceSingleSessionPerUser = true,
            RefreshTokenRetentionDays = 30,
            AnalyticsRetentionDays = 90,
            LoginAuditRetentionDays = 180,
            EmailOtpMinutes = _seed.EmailOtpMinutes,
            MaxFailedLoginAttempts = _seed.MaxFailedLoginAttempts,
            LockoutMinutes = _seed.LockoutMinutes,
            BackupCodeCount = _seed.BackupCodeCount,
            StorageProvider = _storageSeed.Provider,
        };
        await _col.ReplaceOneAsync(s => s.Id == AppSettings.SingletonId, seeded,
            new ReplaceOptions { IsUpsert = true });
        _current = seeded;
    }

    public SettingsView ToView()
    {
        var s = _current;
        return new SettingsView(s.SiteTitle, s.BlogUrl, s.BlogAdminUrl, s.EmailTwoFactorEnabled,
            s.SmsTwoFactorEnabled, s.WhatsAppTwoFactorEnabled, s.AccessTokenMinutes, s.RefreshTokenDays, s.TwoFactorTokenMinutes,
            s.EnforceSingleSessionPerUser, s.RefreshTokenRetentionDays, s.AnalyticsRetentionDays,
            s.LoginAuditRetentionDays,
            s.EmailOtpMinutes, s.MaxFailedLoginAttempts, s.LockoutMinutes, s.BackupCodeCount,
            s.WhatsAppAlertsEnabled, !string.IsNullOrEmpty(s.WhatsAppAccessTokenEncrypted),
            s.WhatsAppPhoneNumberId, s.WhatsAppAlertToNumber,
            s.StorageProvider, s.StorageS3ServiceUrl, s.StorageS3Bucket, s.StorageS3AccessKeyId,
            !string.IsNullOrEmpty(s.StorageS3SecretAccessKeyEncrypted),
            !string.IsNullOrEmpty(s.GitHubPackagesTokenEncrypted),
            s.OAuthCallbackBaseUrl,
            s.OAuthCallbackBaseUrl.Length == 0 ? string.Empty : s.OAuthCallbackBaseUrl + OAuthStateService.CallbackPath,
            s.GitHubOAuthClientId, !string.IsNullOrEmpty(s.GitHubOAuthClientSecretEncrypted),
            s.GitHubSocialLoginEnabled, s.LinkedInSocialLoginEnabled, s.LinkedInOAuthClientId,
            !string.IsNullOrEmpty(s.LinkedInOAuthClientSecretEncrypted), s.PackageInventoryRepositories,
            s.UpdatedAt);
    }

    /// <summary>The narrow, non-secret projection served publicly to every app.</summary>
    public PublicConfigView ToPublicConfig()
    {
        var s = _current;
        return new PublicConfigView(s.SiteTitle, s.BlogUrl, s.BlogAdminUrl, s.UpdatedAt);
    }

    public async Task<SettingsView> ApplyAsync(UpdateSettingsRequest r)
    {
        var s = Clone(_current);

        if (r.SiteTitle is not null) s.SiteTitle = r.SiteTitle.Trim();
        // Launcher URLs are validated against an allowlist (https/keshavsingh.in) before storage;
        // they are served publicly and used as navigation targets, so never store arbitrary input.
        if (r.BlogUrl is not null) s.BlogUrl = ValidateLauncherUrl(r.BlogUrl, nameof(r.BlogUrl));
        if (r.BlogAdminUrl is not null) s.BlogAdminUrl = ValidateLauncherUrl(r.BlogAdminUrl, nameof(r.BlogAdminUrl));
        if (r.EmailTwoFactorEnabled is { } e) s.EmailTwoFactorEnabled = e;
        if (r.SmsTwoFactorEnabled is { } sm) s.SmsTwoFactorEnabled = sm;
        if (r.WhatsAppTwoFactorEnabled is { } wa2fa) s.WhatsAppTwoFactorEnabled = wa2fa;
        if (r.AccessTokenMinutes is { } atm) s.AccessTokenMinutes = Math.Clamp(atm, 1, 240);
        if (r.RefreshTokenDays is { } rtd) s.RefreshTokenDays = Math.Clamp(rtd, 1, 90);
        if (r.TwoFactorTokenMinutes is { } tft) s.TwoFactorTokenMinutes = Math.Clamp(tft, 1, 30);
        if (r.EnforceSingleSessionPerUser is { } esp) s.EnforceSingleSessionPerUser = esp;
        if (r.RefreshTokenRetentionDays is { } rtrd) s.RefreshTokenRetentionDays = Math.Clamp(rtrd, 1, 365);
        if (r.AnalyticsRetentionDays is { } ard) s.AnalyticsRetentionDays = Math.Clamp(ard, 1, 3650);
        if (r.LoginAuditRetentionDays is { } lard) s.LoginAuditRetentionDays = Math.Clamp(lard, 1, 3650);
        // Clamp the security knobs to sane ranges (defence in depth against bad input).
        if (r.EmailOtpMinutes is { } eo) s.EmailOtpMinutes = Math.Clamp(eo, 1, 60);
        if (r.MaxFailedLoginAttempts is { } mfa) s.MaxFailedLoginAttempts = Math.Clamp(mfa, 1, 20);
        if (r.LockoutMinutes is { } lm) s.LockoutMinutes = Math.Clamp(lm, 1, 1440);
        if (r.BackupCodeCount is { } bc) s.BackupCodeCount = Math.Clamp(bc, 5, 20);

        if (r.WhatsAppAlertsEnabled is { } wae) s.WhatsAppAlertsEnabled = wae;
        if (!string.IsNullOrEmpty(r.WhatsAppAccessToken)) s.WhatsAppAccessTokenEncrypted = _protector.Encrypt(r.WhatsAppAccessToken);
        if (r.WhatsAppPhoneNumberId is not null) s.WhatsAppPhoneNumberId = r.WhatsAppPhoneNumberId.Trim();
        if (r.WhatsAppAlertToNumber is not null) s.WhatsAppAlertToNumber = r.WhatsAppAlertToNumber.Trim();

        // File storage backend. Provider is allow-listed; the S3 endpoint must be an absolute https URL.
        // The secret key is write-only: a non-empty value replaces it (encrypted), blank keeps the stored one.
        if (r.StorageProvider is not null) s.StorageProvider = ValidateStorageProvider(r.StorageProvider);
        if (r.StorageS3ServiceUrl is not null) s.StorageS3ServiceUrl = ValidateS3ServiceUrl(r.StorageS3ServiceUrl);
        if (r.StorageS3Bucket is not null) s.StorageS3Bucket = r.StorageS3Bucket.Trim();
        if (r.StorageS3AccessKeyId is not null) s.StorageS3AccessKeyId = r.StorageS3AccessKeyId.Trim();
        if (!string.IsNullOrEmpty(r.StorageS3SecretAccessKey))
            s.StorageS3SecretAccessKeyEncrypted = _protector.Encrypt(r.StorageS3SecretAccessKey);

        if (!string.IsNullOrEmpty(r.GitHubPackagesToken))
        {
            s.GitHubPackagesTokenEncrypted = _protector.Encrypt(r.GitHubPackagesToken);
            // A newly-saved token should apply on the Packages screen's next load, not up to 15
            // minutes later — the inventory result is cached under this exact key (PackageInventoryService).
            _cache.Remove("package-inventory");
        }

        // The one origin every OAuth provider redirects back to. Same allowlist as any other stored
        // URL here (https, keshavsingh.in family) — it is handed to providers as a redirect target.
        if (r.OAuthCallbackBaseUrl is not null)
            s.OAuthCallbackBaseUrl = r.OAuthCallbackBaseUrl.Trim().Length == 0
                ? string.Empty
                : ValidateLauncherUrl(r.OAuthCallbackBaseUrl, nameof(r.OAuthCallbackBaseUrl));
        if (r.GitHubOAuthClientId is not null) s.GitHubOAuthClientId = r.GitHubOAuthClientId.Trim();
        if (!string.IsNullOrEmpty(r.GitHubOAuthClientSecret))
            s.GitHubOAuthClientSecretEncrypted = _protector.Encrypt(r.GitHubOAuthClientSecret);
        if (r.GitHubSocialLoginEnabled is { } githubEnabled) s.GitHubSocialLoginEnabled = githubEnabled;
        if (r.LinkedInSocialLoginEnabled is { } linkedInEnabled) s.LinkedInSocialLoginEnabled = linkedInEnabled;
        if (r.LinkedInOAuthClientId is not null) s.LinkedInOAuthClientId = r.LinkedInOAuthClientId.Trim();
        if (!string.IsNullOrEmpty(r.LinkedInOAuthClientSecret))
            s.LinkedInOAuthClientSecretEncrypted = _protector.Encrypt(r.LinkedInOAuthClientSecret);
        if (r.PackageInventoryRepositories is not null)
        {
            s.PackageInventoryRepositories = r.PackageInventoryRepositories
                .Select(x => x.Trim()).Where(x => x.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            _cache.Remove("package-inventory");
        }

        s.UpdatedAt = DateTime.UtcNow;
        await _col.ReplaceOneAsync(x => x.Id == AppSettings.SingletonId, s,
            new ReplaceOptions { IsUpsert = true });
        _current = s;
        return ToView();
    }

    private static AppSettings Clone(AppSettings s) => new()
    {
        Id = s.Id, SiteTitle = s.SiteTitle, BlogUrl = s.BlogUrl, BlogAdminUrl = s.BlogAdminUrl,
        EmailTwoFactorEnabled = s.EmailTwoFactorEnabled, SmsTwoFactorEnabled = s.SmsTwoFactorEnabled,
        WhatsAppTwoFactorEnabled = s.WhatsAppTwoFactorEnabled,
        AccessTokenMinutes = s.AccessTokenMinutes, RefreshTokenDays = s.RefreshTokenDays,
        TwoFactorTokenMinutes = s.TwoFactorTokenMinutes,
        EnforceSingleSessionPerUser = s.EnforceSingleSessionPerUser,
        RefreshTokenRetentionDays = s.RefreshTokenRetentionDays,
        AnalyticsRetentionDays = s.AnalyticsRetentionDays,
        LoginAuditRetentionDays = s.LoginAuditRetentionDays,
        EmailOtpMinutes = s.EmailOtpMinutes, MaxFailedLoginAttempts = s.MaxFailedLoginAttempts,
        LockoutMinutes = s.LockoutMinutes, BackupCodeCount = s.BackupCodeCount,
        WhatsAppAlertsEnabled = s.WhatsAppAlertsEnabled,
        WhatsAppAccessTokenEncrypted = s.WhatsAppAccessTokenEncrypted,
        WhatsAppPhoneNumberId = s.WhatsAppPhoneNumberId,
        WhatsAppAlertToNumber = s.WhatsAppAlertToNumber,
        StorageProvider = s.StorageProvider,
        StorageS3ServiceUrl = s.StorageS3ServiceUrl,
        StorageS3Bucket = s.StorageS3Bucket,
        StorageS3AccessKeyId = s.StorageS3AccessKeyId,
        StorageS3SecretAccessKeyEncrypted = s.StorageS3SecretAccessKeyEncrypted,
        GitHubPackagesTokenEncrypted = s.GitHubPackagesTokenEncrypted,
        OAuthCallbackBaseUrl = s.OAuthCallbackBaseUrl,
        GitHubOAuthClientId = s.GitHubOAuthClientId,
        GitHubOAuthClientSecretEncrypted = s.GitHubOAuthClientSecretEncrypted,
        GitHubSocialLoginEnabled = s.GitHubSocialLoginEnabled,
        LinkedInSocialLoginEnabled = s.LinkedInSocialLoginEnabled,
        LinkedInOAuthClientId = s.LinkedInOAuthClientId,
        LinkedInOAuthClientSecretEncrypted = s.LinkedInOAuthClientSecretEncrypted,
        PackageInventoryRepositories = [.. s.PackageInventoryRepositories],
    };

    /// <summary>Storage provider is an allowlist: only "Local" or "S3" (mapped to 400 otherwise).</summary>
    private static string ValidateStorageProvider(string value)
    {
        var v = value.Trim();
        if (v.Equals("Local", StringComparison.OrdinalIgnoreCase)) return "Local";
        if (v.Equals("S3", StringComparison.OrdinalIgnoreCase)) return "S3";
        throw new ArgumentException("Storage provider must be 'Local' or 'S3'.");
    }

    /// <summary>
    /// The S3/R2 endpoint. Empty is allowed (clears it); otherwise it must be an absolute https URL
    /// (e.g. https://&lt;account-id&gt;.r2.cloudflarestorage.com). Allowlist on scheme, at the boundary.
    /// </summary>
    private static string ValidateS3ServiceUrl(string value)
    {
        var url = value.Trim();
        if (url.Length == 0) return string.Empty;
        if (!Uri.TryCreate(url, UriKind.Absolute, out var u) || u.Scheme != Uri.UriSchemeHttps)
            throw new ArgumentException("Storage S3 service URL must be an absolute https URL.");
        return u.GetLeftPart(UriPartial.Authority);
    }

    /// <summary>
    /// Validates a launcher URL at the trust boundary: it must be an absolute https URL (http only
    /// for localhost in dev) on the keshavsingh.in family. Allowlist, not denylist. Throws
    /// <see cref="ArgumentException"/> (mapped to 400 by the controller) on anything else.
    /// </summary>
    private static string ValidateLauncherUrl(string value, string field)
    {
        var url = value.Trim();
        if (url.Length == 0) throw new ArgumentException($"{field} cannot be empty.");
        if (!Uri.TryCreate(url, UriKind.Absolute, out var u))
            throw new ArgumentException($"{field} must be a valid URL.");

        var isLocalhost = u.Host == "localhost";
        if (u.Scheme != Uri.UriSchemeHttps && !(isLocalhost && u.Scheme == Uri.UriSchemeHttp))
            throw new ArgumentException($"{field} must use https.");
        var onFamily = isLocalhost || u.Host == "keshavsingh.in"
            || u.Host.EndsWith(".keshavsingh.in", StringComparison.OrdinalIgnoreCase);
        if (!onFamily) throw new ArgumentException($"{field} must be a keshavsingh.in address.");

        return u.GetLeftPart(UriPartial.Path).TrimEnd('/');
    }
}
