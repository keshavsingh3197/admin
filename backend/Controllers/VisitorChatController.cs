using Admin.Api.Dtos;
using Admin.Api.Services;
using KeshavSingh.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Admin.Api.Controllers;

/// <summary>
/// The chat bubble on the public sites. Anonymous by necessity — visitors have no account — so it is
/// rate limited per IP, every field is bounded by its DTO, and the session token in the
/// <c>X-Visitor-Token</c> header is the only thing that identifies a conversation.
///
/// Responses never reveal whether a token merely expired or never existed: both are 404. There is
/// nothing here to enumerate.
/// </summary>
[ApiController]
[Route("api/visitor-chat")]
[AllowAnonymous]
[EnableRateLimiting("visitor-chat")]
public sealed class VisitorChatController : ControllerBase
{
    /// <summary>What the widget opens with. Honest about who is on the other end: a person, later.</summary>
    private const string Greeting =
        "Hi! Leave a message here and it lands straight in my admin inbox — I'll reply as soon as I see it.";

    private readonly VisitorChatService _chat;

    public VisitorChatController(VisitorChatService chat) => _chat = chat;

    private string? Token => Request.Headers["X-Visitor-Token"].FirstOrDefault();

    /// <summary>
    /// Opens a conversation. Rate limited harder than the rest: a visitor needs one of these, ever, so
    /// anything faster is someone filling the queue with empty conversations.
    /// </summary>
    [HttpPost("session")]
    [EnableRateLimiting("visitor-chat-start")]
    public async Task<ActionResult<StartVisitorChatResponse>> Start(StartVisitorChatRequest request,
        CancellationToken ct)
        => Ok(await _chat.StartAsync(request, Greeting, ct));

    [HttpPost("message")]
    public async Task<IActionResult> Send(PostVisitorMessageRequest request, CancellationToken ct)
        => await _chat.PostVisitorMessageAsync(Token ?? string.Empty, request.Body, ct)
            ? Accepted()
            : NotFound();

    /// <summary>Everything said since <paramref name="after"/>, plus whether someone is typing back.</summary>
    [HttpGet("poll")]
    public async Task<ActionResult<VisitorChatPoll>> Poll([FromQuery] string? after, CancellationToken ct)
    {
        var poll = await _chat.PollAsync(Token ?? string.Empty, after, ct);
        return poll is null ? NotFound() : Ok(poll);
    }

    [HttpPost("typing")]
    public async Task<IActionResult> Typing(CancellationToken ct)
        => await _chat.VisitorTypingAsync(Token ?? string.Empty, ct) ? NoContent() : NotFound();
}

/// <summary>
/// The staff side of visitor chat. Any signed-in user can read and answer the queue — that is the point
/// of a shared inbox — while closing, blocking and deleting a conversation stay with Admin, since those
/// destroy or hide someone else's words.
/// </summary>
[ApiController]
[Route("api/visitor-chat/staff")]
[Authorize]
[RequirePagePermission("page.inbox")]
public sealed class VisitorChatStaffController : ControllerBase
{
    private readonly VisitorChatService _chat;

    public VisitorChatStaffController(VisitorChatService chat) => _chat = chat;

    private string Me => User.GetUserId();
    private string? MyName => User.FindFirst("name")?.Value;

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<VisitorChatSessionView>>> List([FromQuery] string? status,
        [FromQuery] int limit = 100, CancellationToken ct = default)
        => Ok(await _chat.ListAsync(status, limit, ct));

    /// <summary>Waiting/online counts for the nav badge.</summary>
    [HttpGet("summary")]
    public async Task<ActionResult<VisitorChatSummary>> Summary(CancellationToken ct)
        => Ok(await _chat.SummaryAsync(ct));

    /// <summary>Opens a conversation, which also marks it read.</summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<VisitorChatThread>> Open(string id, CancellationToken ct)
    {
        var thread = await _chat.OpenAsync(id, ct);
        return thread is null ? NotFound() : Ok(thread);
    }

    /// <summary>Just what is new — what the open conversation polls for.</summary>
    [HttpGet("{id}/poll")]
    public async Task<ActionResult<VisitorChatThread>> Poll(string id, [FromQuery] string? after,
        CancellationToken ct)
    {
        var thread = await _chat.PollStaffAsync(id, after, ct);
        return thread is null ? NotFound() : Ok(thread);
    }

    [HttpPost("{id}/reply")]
    public async Task<ActionResult<VisitorChatMessageView>> Reply(string id, ReplyToVisitorRequest request,
        CancellationToken ct)
    {
        var message = await _chat.ReplyAsync(id, Me, MyName, request.Body, ct);
        return message is null ? NotFound() : Ok(message);
    }

    [HttpPost("{id}/typing")]
    public async Task<IActionResult> Typing(string id, CancellationToken ct)
        => await _chat.StaffTypingAsync(id, ct) ? NoContent() : NotFound();

    [HttpPost("{id}/status")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> SetStatus(string id, UpdateVisitorChatStatusRequest request,
        CancellationToken ct)
        => await _chat.SetStatusAsync(id, request.Status, ct) ? NoContent() : NotFound();

    [HttpDelete("{id}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Delete(string id, CancellationToken ct)
        => await _chat.DeleteAsync(id, ct) ? NoContent() : NotFound();
}
