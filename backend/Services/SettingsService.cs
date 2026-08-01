using Admin.Api.Auth;
using Admin.Api.Dtos;
using Admin.Api.Models;
using KeshavSingh.Auth;
using KeshavSingh.Auth.Abstractions;
using KeshavSingh.Security;
using Microsoft.Extensions.Options;
using MongoDB.Driver;

namespace Admin.Api.Services;

/// <summary>
/// DB-backed auth settings. Loads a cached singleton <see cref="AppSettings"/> from Mongo (seeding
/// it from the "Auth" appsettings/env defaults on first run) and exposes the slice the shared auth
/// engine reads via <see cref="IAuthSettings"/>. The cache is refreshed on every update.
/// </summary>
public sealed class SettingsService : IAuthSettings
{
    private readonly IMongoCollection<AppSettings> _col;
    private readonly AuthSettingsOptions _seed;
    private readonly JwtOptions _jwtSeed;
    private readonly PublicConfigOptions _publicSeed;
    private volatile AppSettings _current = new();

    public SettingsService(MongoDbService db, IOptions<AuthSettingsOptions> seed, IOptions<JwtOptions> jwtSeed, IOptions<PublicConfigOptions> publicSeed)
    {
        _col = db.GetCollection<AppSettings>("settings");
        _seed = seed.Value;
        _jwtSeed = jwtSeed.Value;
        _publicSeed = publicSeed.Value;
    }

    // ---- IAuthSettings (read by the engine) ----
    public bool EmailTwoFactorEnabled => _current.EmailTwoFactorEnabled;
    public bool SmsTwoFactorEnabled => _current.SmsTwoFactorEnabled;
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
        };
        await _col.ReplaceOneAsync(s => s.Id == AppSettings.SingletonId, seeded,
            new ReplaceOptions { IsUpsert = true });
        _current = seeded;
    }

    public SettingsView ToView()
    {
        var s = _current;
        return new SettingsView(s.SiteTitle, s.BlogUrl, s.BlogAdminUrl, s.EmailTwoFactorEnabled,
            s.SmsTwoFactorEnabled, s.AccessTokenMinutes, s.RefreshTokenDays, s.TwoFactorTokenMinutes,
            s.EnforceSingleSessionPerUser, s.RefreshTokenRetentionDays, s.AnalyticsRetentionDays,
            s.LoginAuditRetentionDays,
            s.EmailOtpMinutes, s.MaxFailedLoginAttempts, s.LockoutMinutes, s.BackupCodeCount, s.UpdatedAt);
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
        AccessTokenMinutes = s.AccessTokenMinutes, RefreshTokenDays = s.RefreshTokenDays,
        TwoFactorTokenMinutes = s.TwoFactorTokenMinutes,
        EnforceSingleSessionPerUser = s.EnforceSingleSessionPerUser,
        RefreshTokenRetentionDays = s.RefreshTokenRetentionDays,
        AnalyticsRetentionDays = s.AnalyticsRetentionDays,
        LoginAuditRetentionDays = s.LoginAuditRetentionDays,
        EmailOtpMinutes = s.EmailOtpMinutes, MaxFailedLoginAttempts = s.MaxFailedLoginAttempts,
        LockoutMinutes = s.LockoutMinutes, BackupCodeCount = s.BackupCodeCount,
    };

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
