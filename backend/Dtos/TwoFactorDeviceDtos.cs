namespace Admin.Api.Dtos;

public sealed record TwoFactorDeviceView(
    string Id,
    string Name,
    string DeviceType,
    string? CreatedFromOrigin,
    string? CreatedFromDevice,
    DateTime CreatedAt,
    DateTime? LastUsedAt);

public sealed record TwoFactorDeviceCapabilitiesDto(
    int MaxDevices,
    int RegisteredDevices,
    bool TwoFactorEnabled);

/// <summary>
/// Begins adding an authenticator device. <paramref name="Password"/> is required once the account
/// already has two-factor enabled, because this flow hands back the account's LIVE TOTP secret so a
/// second device can be enrolled against it — and a secret handed out is a second factor given away.
/// </summary>
public sealed record StartTwoFactorDeviceEnrollmentRequest(string? Password = null);

public sealed record StartTwoFactorDeviceEnrollmentResponse(
    string Secret,
    string OtpAuthUri,
    string QrCodePngDataUrl,
    bool AlreadyEnabled);

public sealed record ConfirmTwoFactorDeviceEnrollmentRequest(
    string Code,
    string? Name,
    string? DeviceType);

public sealed record ConfirmTwoFactorDeviceEnrollmentResponse(
    TwoFactorDeviceView Device,
    IReadOnlyList<string>? BackupCodes,
    bool TwoFactorEnabled);

public sealed record RemoveTwoFactorDeviceRequest(string Password);
