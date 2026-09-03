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

    private readonly AdminAuditService _audit;

    public DataRetentionController(DataRetentionService service, AdminAuditService audit)
    {
        _service = service;
        _audit = audit;
    }

    [HttpGet("overview")]
    public async Task<ActionResult<IReadOnlyList<DataDomainOverviewDto>>> Overview(CancellationToken ct) =>
        Ok(await _service.GetOverviewAsync(ct));

    [HttpPost("purge-range")]
    public async Task<ActionResult<PurgeResultDto>> PurgeRange(PurgeRangeRequest request, CancellationToken ct)
    {
        try
        {
            var deleted = await _service.PurgeRangeAsync(request.Domain, request.FromUtc, request.ToUtc, ct);
            // Deleting records is itself an administrative action, and the audit rows are one of the
            // things a purge can delete — so the purge must leave a record of its own.
            await _audit.RecordAsync(AdminAuditEvents.RetentionPurge, request.Domain,
                $"Purged {deleted} record(s) dated {request.FromUtc:yyyy-MM-dd} to {request.ToUtc:yyyy-MM-dd}.", ct: ct);
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
            await _audit.RecordAsync(AdminAuditEvents.RetentionPurge, domain,
                $"Purged {deleted} record(s) past the configured retention window.", ct: ct);
            return Ok(new PurgeResultDto(deleted));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }
}
