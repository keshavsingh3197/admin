using Admin.Api.Dtos;
using Admin.Api.Models;
using Admin.Api.Auth;
using KeshavSingh.Auth;
using KeshavSingh.Auth.Abstractions;
using KeshavSingh.Security;
using Microsoft.Extensions.Options;
using MongoDB.Driver;
using QRCoder;

namespace Admin.Api.Services;

public sealed class TwoFactorDeviceService
{
    private readonly IMongoCollection<User> _users;
    private readonly IMongoCollection<TwoFactorDevice> _devices;
    private readonly TotpService _totp;
    private readonly DataProtector _protector;
    private readonly PasswordHasher _passwords;
    private readonly IAuthSettings _settings;
    private readonly JwtOptions _jwt;
    private readonly WebAuthnOptions _webAuthn;

    public TwoFactorDeviceService(
        MongoDbService db,
        TotpService totp,
        DataProtector protector,
        PasswordHasher passwords,
        IAuthSettings settings,
        IOptions<JwtOptions> jwt,
        IOptions<WebAuthnOptions> webAuthn)
    {
        _users = db.GetCollection<User>("users");
        _devices = db.GetCollection<TwoFactorDevice>("two_factor_devices");
        _totp = totp;
        _protector = protector;
        _passwords = passwords;
        _settings = settings;
        _jwt = jwt.Value;
        _webAuthn = webAuthn.Value;
    }

    public async Task EnsureIndexesAsync(CancellationToken ct = default)
    {
        await _devices.Indexes.CreateManyAsync(new[]
        {
            new CreateIndexModel<TwoFactorDevice>(Builders<TwoFactorDevice>.IndexKeys.Ascending(x => x.UserId).Descending(x => x.CreatedAt)),
            new CreateIndexModel<TwoFactorDevice>(Builders<TwoFactorDevice>.IndexKeys.Ascending(x => x.UserId).Ascending(x => x.Name)),
        }, ct);
    }

    public async Task<IReadOnlyList<TwoFactorDeviceView>> ListAsync(string userId, CancellationToken ct = default)
    {
        var list = await _devices.Find(x => x.UserId == userId)
            .SortByDescending(x => x.CreatedAt)
            .ToListAsync(ct);

        return list.Select(Map).ToList();
    }

    public async Task<TwoFactorDeviceCapabilitiesDto> GetCapabilitiesAsync(string userId, CancellationToken ct = default)
    {
        var user = await RequireActiveUserAsync(userId, ct);
        var count = await _devices.CountDocumentsAsync(x => x.UserId == userId, cancellationToken: ct);
        return new TwoFactorDeviceCapabilitiesDto(MaxDevices(), (int)count, user.TwoFactorEnabled);
    }

    /// <summary>
    /// Begins adding an authenticator device.
    ///
    /// <para>Unlike a first-time enrollment, adding a SECOND device has to reveal the account's
    /// existing TOTP secret — that is what makes both devices produce the same codes. Revealing it
    /// on the strength of an access token alone would mean a stolen token yields a permanent,
    /// silent second factor: the attacker can generate codes forever and the victim's own
    /// authenticator keeps working, so nothing ever looks wrong. So once 2FA is enabled this costs
    /// the password, exactly as removing a device already does.</para>
    /// </summary>
    public async Task<StartTwoFactorDeviceEnrollmentResponse> StartEnrollmentAsync(
        string userId,
        string? password = null,
        CancellationToken ct = default)
    {
        var user = await RequireActiveUserAsync(userId, ct);
        var registered = await _devices.CountDocumentsAsync(x => x.UserId == userId, cancellationToken: ct);
        if (registered >= MaxDevices())
            throw new AuthException($"You can have at most {MaxDevices()} authenticator devices.", 400);

        if (user.TwoFactorEnabled && !string.IsNullOrWhiteSpace(user.TotpSecretEncrypted)
            && (string.IsNullOrEmpty(password) || !_passwords.Verify(password, user.PasswordHash)))
        {
            throw new AuthException(
                "Confirm your password to add another authenticator to an account that already has two-factor enabled.", 403);
        }

        string secret;
        if (string.IsNullOrWhiteSpace(user.TotpSecretEncrypted))
        {
            secret = _totp.GenerateSecret();
            await _users.UpdateOneAsync(
                x => x.Id == user.Id,
                Builders<User>.Update
                    .Set(x => x.TotpSecretEncrypted, _protector.Encrypt(secret))
                    .Set(x => x.UpdatedAt, DateTime.UtcNow),
                cancellationToken: ct);
        }
        else
        {
            secret = _protector.Decrypt(user.TotpSecretEncrypted);
        }

        var otpUri = _totp.BuildOtpAuthUri(secret, _jwt.Issuer, user.Email);
        return new StartTwoFactorDeviceEnrollmentResponse(secret, otpUri, BuildQrDataUrl(otpUri), user.TwoFactorEnabled);
    }

    public async Task<ConfirmTwoFactorDeviceEnrollmentResponse> ConfirmEnrollmentAsync(
        string userId,
        ConfirmTwoFactorDeviceEnrollmentRequest request,
        string? origin,
        string? userAgent,
        CancellationToken ct = default)
    {
        var user = await RequireActiveUserAsync(userId, ct);
        if (string.IsNullOrWhiteSpace(user.TotpSecretEncrypted))
            throw new AuthException("Start enrollment before confirming.", 400);

        var count = await _devices.CountDocumentsAsync(x => x.UserId == userId, cancellationToken: ct);
        if (count >= MaxDevices())
            throw new AuthException($"You can have at most {MaxDevices()} authenticator devices.", 400);

        var secret = _protector.Decrypt(user.TotpSecretEncrypted);
        // Honour the replay guard here too, and burn the confirming code: a code spent proving a
        // device works must not then also be usable to open a session.
        if (!_totp.TryVerifyCode(secret, request.Code?.Trim() ?? string.Empty, user.LastTotpStep, out var totpStep))
            throw new AuthException("The code did not match. Check your authenticator and try again.", 400);

        var device = new TwoFactorDevice
        {
            UserId = userId,
            Name = Sanitize(request.Name, 80) ?? $"Authenticator {count + 1}",
            DeviceType = Sanitize(request.DeviceType, 60) ?? "Authenticator App",
            CreatedFromOrigin = Sanitize(origin, 180),
            CreatedFromDevice = Sanitize(userAgent, 220),
        };

        await _devices.InsertOneAsync(device, cancellationToken: ct);

        await _users.UpdateOneAsync(
            x => x.Id == userId,
            Builders<User>.Update.Set(x => x.LastTotpStep, totpStep).Set(x => x.UpdatedAt, DateTime.UtcNow),
            cancellationToken: ct);

        IReadOnlyList<string>? backupCodes = null;
        if (!user.TwoFactorEnabled)
        {
            var rawCodes = Enumerable.Range(0, _settings.BackupCodeCount)
                .Select(_ => TokenHasher.NewBackupCode())
                .ToList();

            await _users.UpdateOneAsync(
                x => x.Id == userId,
                Builders<User>.Update
                    .Set(x => x.TwoFactorEnabled, true)
                    .Set(x => x.BackupCodeHashes, rawCodes.Select(TokenHasher.Hash).ToList())
                    .Set(x => x.UpdatedAt, DateTime.UtcNow),
                cancellationToken: ct);

            backupCodes = rawCodes;
        }

        return new ConfirmTwoFactorDeviceEnrollmentResponse(Map(device), backupCodes, true);
    }

    public async Task<bool> RemoveAsync(string userId, string id, string password, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(password))
            throw new AuthException("Enter your password to confirm.", 400);

        var user = await RequireActiveUserAsync(userId, ct);
        if (!_passwords.Verify(password, user.PasswordHash))
            throw new AuthException("Password is incorrect.", 400);

        var deleted = await _devices.DeleteOneAsync(x => x.Id == id && x.UserId == userId, ct);
        if (deleted.DeletedCount == 0) return false;

        var remaining = await _devices.CountDocumentsAsync(x => x.UserId == userId, cancellationToken: ct);
        if (remaining == 0)
        {
            await _users.UpdateOneAsync(
                x => x.Id == userId,
                Builders<User>.Update
                    .Set(x => x.TwoFactorEnabled, false)
                    .Set(x => x.TotpSecretEncrypted, (string?)null)
                    .Set(x => x.BackupCodeHashes, new List<string>())
                    .Set(x => x.UpdatedAt, DateTime.UtcNow),
                cancellationToken: ct);
        }

        return true;
    }

    public Task MarkUsedAsync(string userId, CancellationToken ct = default)
        => _devices.UpdateManyAsync(
            x => x.UserId == userId,
            Builders<TwoFactorDevice>.Update.Set(x => x.LastUsedAt, DateTime.UtcNow),
            cancellationToken: ct);

    private async Task<User> RequireActiveUserAsync(string userId, CancellationToken ct)
    {
        var user = await _users.Find(x => x.Id == userId && !x.IsDeleted).FirstOrDefaultAsync(ct);
        if (user is null || !user.IsActive)
            throw new AuthException("Account unavailable.");
        return user;
    }

    private int MaxDevices() => Math.Clamp(_webAuthn.MaxCredentialsPerUser, 1, 20);

    private static TwoFactorDeviceView Map(TwoFactorDevice x) =>
        new(x.Id, x.Name, x.DeviceType, x.CreatedFromOrigin, x.CreatedFromDevice, x.CreatedAt, x.LastUsedAt);

    private static string? Sanitize(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        return trimmed.Length > max ? trimmed[..max] : trimmed;
    }

    private static string BuildQrDataUrl(string otpAuthUri)
    {
        using var generator = new QRCodeGenerator();
        using var data = generator.CreateQrCode(otpAuthUri, QRCodeGenerator.ECCLevel.Q);
        var png = new PngByteQRCode(data).GetGraphic(8);
        return $"data:image/png;base64,{Convert.ToBase64String(png)}";
    }
}
