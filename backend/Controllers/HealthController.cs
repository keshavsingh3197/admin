using Admin.Api.Dtos;
using Admin.Api.Models;
using Admin.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Admin.Api.Controllers;

/// <summary>Admin-facing diagnostics distinct from the anonymous infra liveness probe at "/health".</summary>
[ApiController]
[Route("api/health")]
[Authorize(Roles = Roles.Admin)]
public sealed class HealthController : ControllerBase
{
    private readonly HealthCheckService _health;

    public HealthController(HealthCheckService health)
    {
        _health = health;
    }

    [HttpGet("checks")]
    public async Task<ActionResult<HealthReportDto>> Checks(CancellationToken ct) =>
        Ok(await _health.RunAllAsync(ct));
}
