using Admin.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Admin.Api.Controllers;

/// <summary>
/// Public ecosystem status endpoint consumed by keshavsingh.in/status and admin health dashboards.
/// </summary>
[ApiController]
[Route("api/status")]
public sealed class StatusController : ControllerBase
{
    private readonly EcosystemStatusService _status;

    public StatusController(EcosystemStatusService status)
    {
        _status = status;
    }

    [HttpGet]
    [AllowAnonymous]
    public async Task<ActionResult<EcosystemStatusReportDto>> Get(
        [FromQuery] bool refresh = false,
        CancellationToken ct = default)
    {
        return Ok(await _status.GetStatusAsync(refresh, ct));
    }
}
