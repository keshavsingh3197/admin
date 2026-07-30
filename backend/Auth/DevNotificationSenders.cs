using KeshavSingh.Auth.Abstractions;

namespace Admin.Api.Auth;

// Placeholder OTP delivery. The admin's primary second factor is a TOTP authenticator
// app, which needs no sender. Until a real SMTP/SMS transport is configured, the email
// and SMS fallbacks only log that delivery was requested.
// Do not enable EmailTwoFactorEnabled/SmsTwoFactorEnabled in production with these.

public sealed class LoggingEmailSender : IEmailSender
{
    private readonly ILogger<LoggingEmailSender> _logger;
    public LoggingEmailSender(ILogger<LoggingEmailSender> logger) => _logger = logger;

    public Task SendOtpAsync(string toEmail, string code, CancellationToken ct = default)
    {
        _logger.LogWarning("Email OTP requested via development logging sender; configure a real email provider before enabling email 2FA.");
        return Task.CompletedTask;
    }
}

public sealed class LoggingSmsSender : ISmsSender
{
    private readonly ILogger<LoggingSmsSender> _logger;
    public LoggingSmsSender(ILogger<LoggingSmsSender> logger) => _logger = logger;

    public Task SendOtpAsync(string toPhone, string code, CancellationToken ct = default)
    {
        _logger.LogWarning("SMS OTP requested via development logging sender; configure a real SMS provider before enabling SMS 2FA.");
        return Task.CompletedTask;
    }
}
