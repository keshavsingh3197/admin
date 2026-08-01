using Admin.Api.Dtos;
using Admin.Api.Models;
using Admin.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Admin.Api.Controllers;

/// <summary>Manual, date-ranged data purging for time-series collections (Admin only).</summary>
[ApiController]
[Route("api/data-retention")]
[Authorize(Roles = Roles.Admin)]
public sealed class DataRetentionController : ControllerBase
{
    private readonly DataRetentionService _service;

    public DataRetentionController(DataRetentionService service) => _service = service;

    [HttpGet("overview")]
    public async Task<ActionResult<IReadOnlyList<DataDomainOverviewDto>>> Overview(CancellationToken ct) =>
        Ok(await _service.GetOverviewAsync(ct));

    [HttpPost("purge-range")]
    public async Task<ActionResult<PurgeResultDto>> PurgeRange(PurgeRangeRequest request, CancellationToken ct)
    {
        try
        {
            var deleted = await _service.PurgeRangeAsync(request.Domain, request.FromUtc, request.ToUtc, ct);
            return Ok(new PurgeResultDto(deleted));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("purge-expired/{domain}")]
    public async Task<ActionResult<PurgeResultDto>> PurgeExpired(string domain, CancellationToken ct)
    {
        try
        {
            var deleted = await _service.PurgeExpiredAsync(domain, ct);
            return Ok(new PurgeResultDto(deleted));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }
}
