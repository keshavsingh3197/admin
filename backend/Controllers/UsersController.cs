using Admin.Api.Dtos;
using Admin.Api.Models;
using Admin.Api.Services;
using KeshavSingh.Auth;
using KeshavSingh.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;

namespace Admin.Api.Controllers;

/// <summary>
/// User &amp; role management for the identity provider. Admin is the single source of truth for
/// every *.keshavsingh.in app, so accounts and roles are managed here (default-deny; most
/// endpoints require the Admin role). Deactivating, deleting or resetting a password revokes the
/// user's refresh tokens, which ends their SSO session everywhere on the next silent refresh.
/// </summary>
[ApiController]
[Route("api/users")]
[Authorize]
public sealed class UsersController : ControllerBase
{
    private readonly IMongoCollection<User> _users;
    private readonly IMongoCollection<RefreshToken> _tokens;
    private readonly PasswordHasher _passwords;

    public UsersController(MongoDbService db, PasswordHasher passwords)
    {
        _users = db.GetCollection<User>("users");
        _tokens = db.GetCollection<RefreshToken>("refresh_tokens");
        _passwords = passwords;
    }

    /// <summary>The caller's own profile — available to any authenticated user.</summary>
    [HttpGet("me")]
    public async Task<ActionResult<UserListItem>> Me()
    {
        var user = await _users.Find(u => u.Id == User.GetUserId()).FirstOrDefaultAsync();
        return user is null ? Unauthorized() : Ok(Map(user));
    }

    [HttpGet]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<IReadOnlyList<UserListItem>>> List()
    {
        var users = await _users.Find(u => !u.IsDeleted).SortBy(u => u.Email).ToListAsync();
        return Ok(users.Select(Map).ToList());
    }

    [HttpGet("{id}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<UserListItem>> Get(string id)
    {
        var user = await _users.Find(u => u.Id == id && !u.IsDeleted).FirstOrDefaultAsync();
        return user is null ? NotFound() : Ok(Map(user));
    }

    [HttpPost]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<UserListItem>> Create(CreateUserRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var username = string.IsNullOrWhiteSpace(request.Username) ? null : request.Username.Trim();
        var roles = NormalizeRoles(request.Roles);
        if (roles is null) return BadRequest(new { error = "One or more roles are invalid." });

        if (await _users.Find(u => u.Email == email && !u.IsDeleted).AnyAsync())
            return Conflict(new { error = "A user with that email already exists." });
        if (username is not null && await _users.Find(u => u.Username == username && !u.IsDeleted).AnyAsync())
            return Conflict(new { error = "That username is already taken." });

        var user = new User
        {
            Email = email,
            Username = username,
            DisplayName = request.DisplayName.Trim(),
            PhoneNumber = string.IsNullOrWhiteSpace(request.PhoneNumber) ? null : request.PhoneNumber.Trim(),
            PasswordHash = _passwords.Hash(request.Password),
            Roles = roles,
            // Admin-created accounts start with a temporary password and must change it (and
            // enrol 2FA) on first sign-in.
            MustChangePassword = true,
        };
        await _users.InsertOneAsync(user);
        return CreatedAtAction(nameof(Get), new { id = user.Id }, Map(user));
    }

    [HttpPut("{id}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<UserListItem>> Update(string id, UpdateUserRequest request)
    {
        var update = Builders<User>.Update.Set(u => u.UpdatedAt, DateTime.UtcNow);

        if (request.DisplayName is not null)
            update = update.Set(u => u.DisplayName, request.DisplayName.Trim());

        if (request.Username is not null)
        {
            var username = string.IsNullOrWhiteSpace(request.Username) ? null : request.Username.Trim();
            if (username is not null &&
                await _users.Find(u => u.Username == username && u.Id != id && !u.IsDeleted).AnyAsync())
                return Conflict(new { error = "That username is already taken." });
            update = update.Set(u => u.Username, username);
        }

        if (request.PhoneNumber is not null)
            update = update.Set(u => u.PhoneNumber,
                string.IsNullOrWhiteSpace(request.PhoneNumber) ? null : request.PhoneNumber.Trim());

        if (request.Roles is not null)
        {
            var roles = NormalizeRoles(request.Roles);
            if (roles is null) return BadRequest(new { error = "One or more roles are invalid." });
            update = update.Set(u => u.Roles, roles);
        }

        if (request.IsActive is { } active)
        {
            update = update.Set(u => u.IsActive, active);
            if (!active) await RevokeSessionsAsync(id); // Deactivating ends the user's sessions now.
        }

        var user = await _users.FindOneAndUpdateAsync<User>(u => u.Id == id, update,
            new FindOneAndUpdateOptions<User> { ReturnDocument = ReturnDocument.After });
        return user is null ? NotFound() : Ok(Map(user));
    }

    [HttpPost("{id}/reset-password")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> ResetPassword(string id, ResetPasswordRequest request)
    {
        var result = await _users.UpdateOneAsync(u => u.Id == id, Builders<User>.Update
            .Set(u => u.PasswordHash, _passwords.Hash(request.NewPassword))
            .Set(u => u.MustChangePassword, true)
            .Set(u => u.UpdatedAt, DateTime.UtcNow));
        if (result.MatchedCount == 0) return NotFound();

        await RevokeSessionsAsync(id); // Force re-authentication everywhere after a reset.
        return NoContent();
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Delete(string id)
    {
        if (id == User.GetUserId())
            return BadRequest(new { error = "You cannot delete your own account." });

        // Soft delete: keep the record for audit, mark inactive, and revoke sessions.
        var result = await _users.UpdateOneAsync(u => u.Id == id && !u.IsDeleted, Builders<User>.Update
            .Set(u => u.IsDeleted, true)
            .Set(u => u.IsActive, false)
            .Set(u => u.UpdatedAt, DateTime.UtcNow));
        if (result.MatchedCount == 0) return NotFound();

        await RevokeSessionsAsync(id);
        return NoContent();
    }

    [HttpGet("/api/roles")]
    [Authorize(Roles = Roles.Admin)]
    public ActionResult<IReadOnlyList<string>> ListRoles() => Ok(Roles.All.OrderBy(r => r).ToList());

    private Task RevokeSessionsAsync(string userId) =>
        _tokens.UpdateManyAsync(r => r.UserId == userId && r.RevokedAt == null,
            Builders<RefreshToken>.Update.Set(r => r.RevokedAt, DateTime.UtcNow));

    private static List<string>? NormalizeRoles(List<string>? roles)
    {
        if (roles is null || roles.Count == 0) return new List<string> { Models.Roles.Viewer };
        var normalized = roles.Distinct().ToList();
        return normalized.All(Models.Roles.IsValid) ? normalized : null;
    }

    private static UserListItem Map(User u) => new(
        u.Id, u.Email, u.Username, u.DisplayName, u.PhoneNumber, u.Roles, u.IsActive,
        u.TwoFactorEnabled, u.LastLoginAt, u.CreatedAt);
}
