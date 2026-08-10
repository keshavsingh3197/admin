using System.Security.Cryptography;
using Admin.Api.Dtos;
using Admin.Api.Models;
using Admin.Api.Services;
using KeshavSingh.Auth;
using KeshavSingh.Security;
using KeshavSingh.Storage;
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
    private const long MaxAvatarBytes = 3 * 1024 * 1024; // 3 MB — plenty for a profile picture.
    private static readonly HashSet<string> AllowedAvatarContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/png", "image/jpeg", "image/webp", "image/gif",
    };

    private readonly IMongoCollection<User> _users;
    private readonly IMongoCollection<RefreshToken> _tokens;
    private readonly PasswordHasher _passwords;
    private readonly GroupService _groups;
    private readonly IObjectStore _store;

    public UsersController(MongoDbService db, PasswordHasher passwords, GroupService groups, IObjectStore store)
    {
        _users = db.GetCollection<User>("users");
        _tokens = db.GetCollection<RefreshToken>("refresh_tokens");
        _passwords = passwords;
        _groups = groups;
        _store = store;
    }

    /// <summary>The caller's own profile — available to any authenticated user.</summary>
    [HttpGet("me")]
    public async Task<ActionResult<UserListItem>> Me()
    {
        var user = await _users.Find(u => u.Id == User.GetUserId()).FirstOrDefaultAsync();
        if (user is null) return Unauthorized();
        var groupIds = (await _groups.ListForUserAsync(user.Id)).Select(g => g.Id).ToList();
        return Ok(Map(user, groupIds));
    }

    /// <summary>Self-service: choose who can find the caller in the chat directory — "everyone" or "family".</summary>
    [HttpPut("me/chat-visibility")]
    public async Task<ActionResult<UserListItem>> UpdateChatVisibility(UpdateChatVisibilityRequest request)
    {
        var visibility = request.Visibility.Trim().ToLowerInvariant();
        if (visibility is not ("everyone" or "family"))
            return BadRequest(new { error = "Visibility must be 'everyone' or 'family'." });

        var userId = User.GetUserId();
        var user = await _users.FindOneAndUpdateAsync<User>(u => u.Id == userId,
            Builders<User>.Update.Set(u => u.ChatVisibility, visibility).Set(u => u.UpdatedAt, DateTime.UtcNow),
            new FindOneAndUpdateOptions<User> { ReturnDocument = ReturnDocument.After });
        if (user is null) return Unauthorized();
        var groupIds = (await _groups.ListForUserAsync(userId)).Select(g => g.Id).ToList();
        return Ok(Map(user, groupIds));
    }

    /// <summary>Self-service: display name, username, phone number. Roles/active-state stay Admin-only.</summary>
    [HttpPut("me")]
    public async Task<ActionResult<UserListItem>> UpdateMyProfile(UpdateMyProfileRequest request)
    {
        var userId = User.GetUserId();
        var update = Builders<User>.Update.Set(u => u.UpdatedAt, DateTime.UtcNow);

        if (request.DisplayName is not null)
            update = update.Set(u => u.DisplayName, request.DisplayName.Trim());

        if (request.Username is not null)
        {
            var username = string.IsNullOrWhiteSpace(request.Username) ? null : request.Username.Trim();
            if (username is not null &&
                await _users.Find(u => u.Username == username && u.Id != userId && !u.IsDeleted).AnyAsync())
                return Conflict(new { error = "That username is already taken." });
            update = update.Set(u => u.Username, username);
        }

        if (request.PhoneNumber is not null)
            update = update.Set(u => u.PhoneNumber,
                string.IsNullOrWhiteSpace(request.PhoneNumber) ? null : request.PhoneNumber.Trim());

        var user = await _users.FindOneAndUpdateAsync<User>(u => u.Id == userId, update,
            new FindOneAndUpdateOptions<User> { ReturnDocument = ReturnDocument.After });
        if (user is null) return Unauthorized();
        var groupIds = (await _groups.ListForUserAsync(userId)).Select(g => g.Id).ToList();
        return Ok(Map(user, groupIds));
    }

    /// <summary>Self-service avatar upload. Replaces any existing image; the old blob is deleted.</summary>
    [HttpPost("me/avatar")]
    [RequestSizeLimit(MaxAvatarBytes)]
    public async Task<ActionResult<UserListItem>> UploadMyAvatar(IFormFile file)
    {
        if (file.Length == 0) return BadRequest(new { error = "No file was uploaded." });
        if (file.Length > MaxAvatarBytes) return BadRequest(new { error = "Image must be 3 MB or smaller." });
        if (!AllowedAvatarContentTypes.Contains(file.ContentType))
            return BadRequest(new { error = "Image must be PNG, JPEG, WEBP or GIF." });

        var userId = User.GetUserId();
        var previous = await _users.Find(u => u.Id == userId).Project(u => u.AvatarKey).FirstOrDefaultAsync();

        // Random key, never the client-supplied filename — same convention as FileService.
        var key = $"avatars/{userId}/{Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant()}";
        await using (var stream = file.OpenReadStream())
            await _store.SaveAsync(key, stream, file.ContentType);

        var user = await _users.FindOneAndUpdateAsync<User>(u => u.Id == userId,
            Builders<User>.Update.Set(u => u.AvatarKey, key).Set(u => u.AvatarContentType, file.ContentType)
                .Set(u => u.UpdatedAt, DateTime.UtcNow),
            new FindOneAndUpdateOptions<User> { ReturnDocument = ReturnDocument.After });
        if (user is null) return Unauthorized();

        if (!string.IsNullOrEmpty(previous)) await _store.DeleteAsync(previous);

        var groupIds = (await _groups.ListForUserAsync(userId)).Select(g => g.Id).ToList();
        return Ok(Map(user, groupIds));
    }

    /// <summary>Self-service: remove the caller's avatar.</summary>
    [HttpDelete("me/avatar")]
    public async Task<ActionResult<UserListItem>> DeleteMyAvatar()
    {
        var userId = User.GetUserId();
        var previous = await _users.Find(u => u.Id == userId).Project(u => u.AvatarKey).FirstOrDefaultAsync();
        var user = await _users.FindOneAndUpdateAsync<User>(u => u.Id == userId,
            Builders<User>.Update.Set(u => u.AvatarKey, null as string).Set(u => u.AvatarContentType, null as string)
                .Set(u => u.UpdatedAt, DateTime.UtcNow),
            new FindOneAndUpdateOptions<User> { ReturnDocument = ReturnDocument.After });
        if (user is null) return Unauthorized();

        if (!string.IsNullOrEmpty(previous)) await _store.DeleteAsync(previous);

        var groupIds = (await _groups.ListForUserAsync(userId)).Select(g => g.Id).ToList();
        return Ok(Map(user, groupIds));
    }

    /// <summary>
    /// Any signed-in user may view any other active user's avatar (same visibility as a display name
    /// in the directory/chat — not gated behind Admin). 404 for a missing/deleted user or no avatar,
    /// never a distinguishing error, so this can't be used to enumerate accounts.
    /// </summary>
    [HttpGet("{id}/avatar")]
    public async Task<IActionResult> GetAvatar(string id)
    {
        var user = await _users.Find(u => u.Id == id && !u.IsDeleted).FirstOrDefaultAsync();
        if (user?.AvatarKey is null) return NotFound();

        var stream = await _store.OpenAsync(user.AvatarKey);
        if (stream is null) return NotFound();
        return File(stream, user.AvatarContentType ?? "application/octet-stream");
    }

    [HttpGet]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<IReadOnlyList<UserListItem>>> List()
    {
        var users = await _users.Find(u => !u.IsDeleted).SortBy(u => u.Email).ToListAsync();
        var groups = await _groups.ListAsync();
        var membership = users.ToDictionary(u => u.Id, u => (IReadOnlyList<string>)groups
            .Where(g => g.MemberUserIds.Contains(u.Id)).Select(g => g.Id).ToList());
        return Ok(users.Select(u => Map(u, membership[u.Id])).ToList());
    }

    [HttpGet("{id}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<UserListItem>> Get(string id)
    {
        var user = await _users.Find(u => u.Id == id && !u.IsDeleted).FirstOrDefaultAsync();
        if (user is null) return NotFound();
        var groupIds = (await _groups.ListForUserAsync(id)).Select(g => g.Id).ToList();
        return Ok(Map(user, groupIds));
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
            CustomRoleKeys = (request.CustomRoleKeys ?? new()).Distinct().ToList(),
            // Admin-created accounts start with a temporary password and must change it (and
            // enrol 2FA) on first sign-in.
            MustChangePassword = true,
        };
        await _users.InsertOneAsync(user);
        return CreatedAtAction(nameof(Get), new { id = user.Id }, Map(user, Array.Empty<string>()));
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

        if (request.CustomRoleKeys is not null)
            update = update.Set(u => u.CustomRoleKeys, request.CustomRoleKeys.Distinct().ToList());

        if (request.IsActive is { } active)
        {
            update = update.Set(u => u.IsActive, active);
            if (!active) await RevokeSessionsAsync(id); // Deactivating ends the user's sessions now.
        }

        var user = await _users.FindOneAndUpdateAsync<User>(u => u.Id == id, update,
            new FindOneAndUpdateOptions<User> { ReturnDocument = ReturnDocument.After });
        if (user is null) return NotFound();
        var groupIds = (await _groups.ListForUserAsync(id)).Select(g => g.Id).ToList();
        return Ok(Map(user, groupIds));
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
        if (roles is null || roles.Count == 0) return new List<string> { Roles.Viewer };
        var normalized = roles.Distinct().ToList();
        return normalized.All(Roles.IsValid) ? normalized : null;
    }

    private static UserListItem Map(User u, IReadOnlyList<string> groupIds) => new(
        u.Id, u.Email, u.Username, u.DisplayName, u.PhoneNumber, u.Roles, u.CustomRoleKeys, groupIds,
        u.ChatVisibility, u.IsActive, u.TwoFactorEnabled, !string.IsNullOrEmpty(u.AvatarKey), u.LastLoginAt, u.CreatedAt);
}
