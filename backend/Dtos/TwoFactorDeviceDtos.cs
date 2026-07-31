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
