using Admin.Api.Dtos;
using Admin.Api.Services;
using KeshavSingh.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Admin.Api.Controllers;

/// <summary>
/// The audit trail — sign-ins, second factors, token reuse, and the administrative actions recorded
/// by <see cref="AdminAuditService"/>, in one timeline.
///
/// <para>Read-only by construction: there is no endpoint here that edits or deletes a row, because
/// an audit log an administrator can quietly edit is not an audit log. Ageing rows out is the
/// retention sweep's job (<see cref="DataRetentionService"/>), which is itself auditable.</para>
///
/// <para>Gated on <c>page.audit</c>, not merely on Admin: the trail names who signed in from where,
/// so it is closer to personal data than most screens and should be grantable on its own.</para>
/// </summary>
[ApiController]
[Route("api/audit")]
[Authorize]
[RequirePagePermission("page.audit")]
public sealed class AuditController : ControllerBase
{
    private readonly AdminAuditService _audit;

    public AuditController(AdminAuditService audit) => _audit = audit;

    /// <summary>
    /// A page of the trail, newest first.
    /// </summary>
    /// <param name="event">Exact event name, or a prefix ending in "." such as "admin." for the family.</param>
    /// <param name="q">Substring match on actor email, target, or IP.</param>
    [HttpGet]
    public async Task<ActionResult<AuditPageView>> List(
        [FromQuery] string? @event,
        [FromQuery] string? q,
        [FromQuery] bool? success,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] int skip = 0,
        [FromQuery] int take = 50,
        CancellationToken ct = default)
    {
        var (items, total) = await _audit.QueryAsync(@event, q, success, from, to, skip, take, ct);

        var views = items.Select(x => new AuditEntryView(
            x.Id,
            x.Event,
            x.Success,
            string.IsNullOrWhiteSpace(x.Email) ? "(anonymous)" : x.Email,
            x.UserId,
            x.Target,
            x.Details,
            x.IpAddress,
            x.UserAgent,
            x.Timestamp)).ToList();

        return Ok(new AuditPageView(views, total, Math.Max(0, skip), Math.Clamp(take, 1, 200)));
    }

    /// <summary>The event names present in the data, for the viewer's filter.</summary>
    [HttpGet("events")]
    public async Task<ActionResult<IReadOnlyList<string>>> Events(CancellationToken ct) =>
        Ok(await _audit.DistinctEventsAsync(ct));
}
