using Admin.Api.Auth;
using Admin.Api.Dtos;
using Admin.Api.Services;
using KeshavSingh.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Admin.Api.Controllers;

/// <summary>
/// WebAuthn / FIDO2 passkeys for the identity provider.
///
/// <para>Registration and management (<c>/api/passkeys*</c>, <see cref="Authorize"/>) are performed
/// by the signed-in user. Sign-in (<c>/api/passkeys/login/*</c>, anonymous + rate-limited) is
/// usernameless: the browser offers a discoverable credential, the server verifies the assertion
/// and — on success — mints the very same SSO session a password login would, setting the shared
/// HttpOnly refresh cookie via <see cref="SessionMinter"/>.</para>
/// </summary>
[ApiController]
[Route("api/passkeys")]
[Authorize]
public sealed class PasskeyController : ControllerBase
{
    private readonly PasskeyService _passkeys;
    private readonly SessionMinter _sessions;

    public PasskeyController(PasskeyService passkeys, SessionMinter sessions)
    {
        _passkeys = passkeys;
        _sessions = sessions;
    }

    // ---- Registration (authenticated self-service) ----

    [HttpPost("register/begin")]
    public async Task<ActionResult<PasskeyRegisterBeginResponse>> RegisterBegin(CancellationToken ct)
        => await Guard(() => _passkeys.BeginRegistrationAsync(User.GetUserId(), ct));

    [HttpPost("register/complete")]
    public async Task<ActionResult<PasskeyListItem>> RegisterComplete(
        PasskeyRegisterCompleteRequest req, CancellationToken ct)
        => await Guard(() => _passkeys.CompleteRegistrationAsync(User.GetUserId(), req, ct));

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<PasskeyListItem>>> List(CancellationToken ct)
        => Ok(await _passkeys.ListAsync(User.GetUserId(), ct));

    /// <summary>Removes a passkey. Requires step-up re-auth (the account password) in the body,
    /// which is why this is a POST rather than a bare DELETE.</summary>
    [HttpPost("{id}/remove")]
    public async Task<IActionResult> Remove(string id, PasskeyRemoveRequest req, CancellationToken ct)
    {
        try
        {
            return await _passkeys.RemoveAsync(User.GetUserId(), id, req.Password, ct)
                ? NoContent() : NotFound();
        }
        catch (PasskeyException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    // ---- Login (anonymous, usernameless) ----

    [HttpPost("login/begin")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<ActionResult<PasskeyLoginBeginResponse>> LoginBegin(CancellationToken ct)
        => await Guard(() => _passkeys.BeginLoginAsync(ct));

    [HttpPost("login/complete")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<ActionResult<SsoSessionResponse>> LoginComplete(
        PasskeyLoginCompleteRequest req, CancellationToken ct)
    {
        try
        {
            var user = await _passkeys.CompleteLoginAsync(req, ct);
            return Ok(await _sessions.IssueAsync(user, Response, ct));
        }
        catch (PasskeyException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    /// <summary>Maps the safe <see cref="PasskeyException"/> message to a 400; fails closed.</summary>
    private async Task<ActionResult<T>> Guard<T>(Func<Task<T>> action)
    {
        try { return Ok(await action()); }
        catch (PasskeyException ex) { return BadRequest(new { error = ex.Message }); }
    }
}
