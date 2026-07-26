using KeshavSingh.Auth.Abstractions;
using Microsoft.Extensions.Options;

namespace Admin.Api.Auth;

/// <summary>
/// Bindable options for the auth engine's settings slice (config section "Auth").
/// Defaults are sensible for a personal admin using TOTP as the primary second factor.
/// </summary>
public sealed class AuthSettingsOptions
{
    public const string Section = "Auth";
    public bool EmailTwoFactorEnabled { get; set; }          // off until an email sender is wired
    public bool SmsTwoFactorEnabled { get; set; }            // off until an SMS sender is wired
    public int EmailOtpMinutes { get; set; } = 5;
    public int MaxFailedLoginAttempts { get; set; } = 5;
    public int LockoutMinutes { get; set; } = 15;
    public int BackupCodeCount { get; set; } = 10;
}

/// <summary>Adapts <see cref="AuthSettingsOptions"/> to the engine's <see cref="IAuthSettings"/>.</summary>
public sealed class ConfigAuthSettings : IAuthSettings
{
    private readonly AuthSettingsOptions _o;
    public ConfigAuthSettings(IOptions<AuthSettingsOptions> options) => _o = options.Value;

    public bool EmailTwoFactorEnabled => _o.EmailTwoFactorEnabled;
    public bool SmsTwoFactorEnabled => _o.SmsTwoFactorEnabled;
    public int EmailOtpMinutes => _o.EmailOtpMinutes;
    public int MaxFailedLoginAttempts => _o.MaxFailedLoginAttempts;
    public int LockoutMinutes => _o.LockoutMinutes;
    public int BackupCodeCount => _o.BackupCodeCount;
}
