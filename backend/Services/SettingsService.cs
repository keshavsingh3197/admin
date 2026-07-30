using Admin.Api.Auth;
using Admin.Api.Dtos;
using Admin.Api.Models;
using KeshavSingh.Auth.Abstractions;
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
    private volatile AppSettings _current = new();

    public SettingsService(MongoDbService db, IOptions<AuthSettingsOptions> seed)
    {
        _col = db.GetCollection<AppSettings>("settings");
        _seed = seed.Value;
    }

    // ---- IAuthSettings (read by the engine) ----
    public bool EmailTwoFactorEnabled => _current.EmailTwoFactorEnabled;
    public bool SmsTwoFactorEnabled => _current.SmsTwoFactorEnabled;
    public int EmailOtpMinutes => _current.EmailOtpMinutes;
    public int MaxFailedLoginAttempts => _current.MaxFailedLoginAttempts;
    public int LockoutMinutes => _current.LockoutMinutes;
    public int BackupCodeCount => _current.BackupCodeCount;

    public async Task InitAsync()
    {
        var existing = await _col.Find(s => s.Id == AppSettings.SingletonId).FirstOrDefaultAsync();
        if (existing is not null) { _current = existing; return; }

        // First run: seed from the "Auth" config so behaviour is unchanged until edited.
        var seeded = new AppSettings
        {
            EmailTwoFactorEnabled = _seed.EmailTwoFactorEnabled,
            SmsTwoFactorEnabled = _seed.SmsTwoFactorEnabled,
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
        return new SettingsView(s.SiteTitle, s.EmailTwoFactorEnabled, s.SmsTwoFactorEnabled,
            s.EmailOtpMinutes, s.MaxFailedLoginAttempts, s.LockoutMinutes, s.BackupCodeCount, s.UpdatedAt);
    }

    public async Task<SettingsView> ApplyAsync(UpdateSettingsRequest r)
    {
        var s = Clone(_current);

        if (r.SiteTitle is not null) s.SiteTitle = r.SiteTitle.Trim();
        if (r.EmailTwoFactorEnabled is { } e) s.EmailTwoFactorEnabled = e;
        if (r.SmsTwoFactorEnabled is { } sm) s.SmsTwoFactorEnabled = sm;
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
        Id = s.Id, SiteTitle = s.SiteTitle,
        EmailTwoFactorEnabled = s.EmailTwoFactorEnabled, SmsTwoFactorEnabled = s.SmsTwoFactorEnabled,
        EmailOtpMinutes = s.EmailOtpMinutes, MaxFailedLoginAttempts = s.MaxFailedLoginAttempts,
        LockoutMinutes = s.LockoutMinutes, BackupCodeCount = s.BackupCodeCount,
    };
}
