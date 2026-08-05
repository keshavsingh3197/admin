using Admin.Api.Dtos;
using Admin.Api.Services;
using KeshavSingh.Auth;
using KeshavSingh.Core;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Admin.Api.Controllers;

/// <summary>
/// The portfolio's "Contact me" form posts here. Anonymous by necessity — visitors have no account — so
/// it is rate limited per IP, every field is bounded by the request DTO, and the response says only
/// "sent": no ids, no counts, nothing that would make the endpoint useful for probing.
/// </summary>
[ApiController]
[Route("api/contact")]
[AllowAnonymous]
[EnableRateLimiting("contact")]
public class ContactController : ControllerBase
{
    private readonly ContactService _contact;

    public ContactController(ContactService contact) => _contact = contact;

    [HttpPost]
    public async Task<ActionResult<ContactSubmitResult>> Submit([FromBody] ContactSubmitRequest req)
    {
        await _contact.SubmitAsync(req);
        return Ok(new ContactSubmitResult(true, "Thanks — your message has been received."));
    }
}

/// <summary>The inbox: read what came in, reply, triage. Admin-only — these are other people's details.</summary>
[ApiController]
[Route("api/contact/admin")]
[Authorize(Roles = Roles.Admin)]
public class ContactAdminController : ControllerBase
{
    private readonly ContactService _contact;

    public ContactAdminController(ContactService contact) => _contact = contact;

    private string Me => User.GetUserId();

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ContactSubmissionDto>>> List([FromQuery] string? status,
        [FromQuery] int limit = 100) =>
        Ok(await _contact.ListAsync(status, limit));

    /// <summary>Unread/total, for the inbox badge.</summary>
    [HttpGet("summary")]
    public async Task<ActionResult<ContactInboxSummary>> Summary() => Ok(await _contact.SummaryAsync());

    /// <summary>Opens a submission — which also marks it read.</summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<ContactSubmissionDto>> Get(string id)
    {
        var submission = await _contact.OpenAsync(id);
        return submission is null ? NotFound() : Ok(submission);
    }

    /// <summary>
    /// Records a reply in the thread. Delivery happens from the admin's own mail client (the UI provides
    /// the link) because this app has no outbound mail path — see <see cref="ContactService"/>.
    /// </summary>
    [HttpPost("{id}/reply")]
    public async Task<ActionResult<ContactSubmissionDto>> Reply(string id, [FromBody] SendContactReplyRequest req)
    {
        var submission = await _contact.ReplyAsync(id, Me, req.Body);
        return submission is null ? NotFound() : Ok(submission);
    }

    /// <summary>Confirms a recorded reply was actually sent.</summary>
    [HttpPost("{id}/replies/{index:int}/sent")]
    public async Task<ActionResult<ContactSubmissionDto>> MarkReplySent(string id, int index)
    {
        var submission = await _contact.MarkReplySentAsync(id, index);
        return submission is null ? NotFound() : Ok(submission);
    }

    [HttpPost("{id}/status")]
    public async Task<IActionResult> SetStatus(string id, [FromBody] UpdateContactStatusRequest req) =>
        await _contact.SetStatusAsync(id, req.Status) ? NoContent() : NotFound();

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id) =>
        await _contact.DeleteAsync(id) ? NoContent() : NotFound();
}
