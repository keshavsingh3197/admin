using Admin.Api.Dtos;
using Admin.Api.Services;
using KeshavSingh.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Admin.Api.Controllers;

[ApiController]
[Route("api/auth/2fa/devices")]
[Authorize]
public sealed class TwoFactorDeviceController : ControllerBase
{
    private readonly TwoFactorDeviceService _devices;

    public TwoFactorDeviceController(TwoFactorDeviceService devices)
    {
        _devices = devices;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<TwoFactorDeviceView>>> List(CancellationToken ct)
        => Ok(await _devices.ListAsync(User.GetUserId(), ct));

    [HttpGet("capabilities")]
    public async Task<ActionResult<TwoFactorDeviceCapabilitiesDto>> Capabilities(CancellationToken ct)
        => Ok(await _devices.GetCapabilitiesAsync(User.GetUserId(), ct));

    /// <summary>Adding a device to an account that already has 2FA requires the password — the
    /// response carries the account's live TOTP secret.</summary>
    [HttpPost("enroll/start")]
    public async Task<ActionResult<StartTwoFactorDeviceEnrollmentResponse>> StartEnrollment(
        StartTwoFactorDeviceEnrollmentRequest? request, CancellationToken ct)
        => Ok(await _devices.StartEnrollmentAsync(User.GetUserId(), request?.Password, ct));

    [HttpPost("enroll/confirm")]
    public async Task<ActionResult<ConfirmTwoFactorDeviceEnrollmentResponse>> ConfirmEnrollment(
        ConfirmTwoFactorDeviceEnrollmentRequest request,
        CancellationToken ct)
        => Ok(await _devices.ConfirmEnrollmentAsync(
            User.GetUserId(),
            request,
            GetRequestOrigin(Request),
            Request.Headers.UserAgent.ToString(),
            ct));

    [HttpPost("{id}/remove")]
    public async Task<IActionResult> Remove(string id, RemoveTwoFactorDeviceRequest request, CancellationToken ct)
        => await _devices.RemoveAsync(User.GetUserId(), id, request.Password, ct) ? NoContent() : NotFound();

    private static string? GetRequestOrigin(HttpRequest request)
    {
        if (request.Headers.TryGetValue("Origin", out var origin) && !string.IsNullOrWhiteSpace(origin))
            return origin.ToString().Trim();

        if (request.Headers.TryGetValue("Referer", out var referer)
            && Uri.TryCreate(referer.ToString(), UriKind.Absolute, out var uri))
        {
            return uri.GetLeftPart(UriPartial.Authority);
        }

        return null;
    }
}
