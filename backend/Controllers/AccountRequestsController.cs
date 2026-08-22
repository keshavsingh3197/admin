using Admin.Api.Dtos;
using Admin.Api.Services;
using KeshavSingh.Auth;
using KeshavSingh.Core;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Admin.Api.Controllers;

/// <summary>
/// "Request an account" — the only way in for someone who does not have one, and it does not let them
/// in. It records an application; an admin decides. Anonymous by necessity, so it is rate limited per
/// address, every field is bounded by the DTO, and the reply is the same sentence no matter what the
/// server found, which is what keeps it from being an account-enumeration oracle.
/// </summary>
[ApiController]
[Route("api/account-requests")]
[AllowAnonymous]
[EnableRateLimiting("account-request")]
public sealed class AccountRequestsController : ControllerBase
{
    private readonly AccountRequestService _requests;

    public AccountRequestsController(AccountRequestService requests) => _requests = requests;

    [HttpPost]
    public async Task<ActionResult<AccountRequestSubmitResult>> Submit(
        [FromBody] AccountRequestSubmitRequest request, CancellationToken ct)
    {
        await _requests.SubmitAsync(request, ct);
        return Accepted(new AccountRequestSubmitResult(true,
            "Thanks — your request has been sent. You will be able to sign in once it is approved."));
    }
}

/// <summary>Reviewing and deciding requests. Admin-only: these are other people's details.</summary>
[ApiController]
[Route("api/account-requests/admin")]
[Authorize(Roles = Roles.Admin)]
public sealed class AccountRequestsAdminController : ControllerBase
{
    private readonly AccountRequestService _requests;

    public AccountRequestsAdminController(AccountRequestService requests) => _requests = requests;

    private string Me => User.GetUserId();

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<AccountRequestDto>>> List(
        [FromQuery] string? status, [FromQuery] int limit = 100, CancellationToken ct = default) =>
        Ok(await _requests.ListAsync(status, limit, ct));

    /// <summary>Pending/total, for the queue badge.</summary>
    [HttpGet("summary")]
    public async Task<ActionResult<AccountRequestSummary>> Summary(CancellationToken ct) =>
        Ok(await _requests.SummaryAsync(ct));

    /// <summary>Approve: creates the account, and only then can the applicant sign in.</summary>
    [HttpPost("{id}/approve")]
    public async Task<IActionResult> Approve(string id, ApproveAccountRequest request, CancellationToken ct)
    {
        var outcome = await _requests.ApproveAsync(id, Me, request.Roles, request.Note, ct);
        return outcome switch
        {
            AccountRequestService.ApprovalOutcome.Approved => NoContent(),
            AccountRequestService.ApprovalOutcome.NotFound => NotFound(),
            AccountRequestService.ApprovalOutcome.NotPending =>
                Conflict(new { error = "That request has already been decided." }),
            AccountRequestService.ApprovalOutcome.AlreadyAUser =>
                Conflict(new { error = "An account with that email already exists." }),
            AccountRequestService.ApprovalOutcome.InvalidRoles =>
                BadRequest(new { error = "One or more roles are invalid." }),
            _ => StatusCode(StatusCodes.Status500InternalServerError),
        };
    }

    [HttpPost("{id}/reject")]
    public async Task<IActionResult> Reject(string id, RejectAccountRequest request, CancellationToken ct) =>
        await _requests.RejectAsync(id, Me, request.Note, ct) ? NoContent() : NotFound();
}
