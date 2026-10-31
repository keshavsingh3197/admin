using KeshavSingh.Auth;
using KeshavSingh.Auth.Abstractions;

namespace Admin.Api.Services;

/// <summary>Satisfies the shared engine's required contract without enabling delivery.</summary>
public sealed class DisabledWhatsAppSender : IWhatsAppSender
{
    public Task SendOtpAsync(string toPhone, string code, CancellationToken ct = default) =>
        Task.FromException(new AuthException("WhatsApp authentication is not supported.", 400));
}
