using Admin.Api.Models;
using Admin.Api.Services;
using KeshavSingh.Auth.Abstractions;
using MongoDB.Driver;

namespace Admin.Api.Auth;

/// <summary>
/// Maps this app's Mongo <see cref="User"/> document onto the auth engine's neutral
/// <see cref="AuthUser"/> and persists the engine-managed fields back.
/// </summary>
public sealed class MongoAuthUserStore : IAuthUserStore
{
    private readonly IMongoCollection<User> _users;

    public MongoAuthUserStore(MongoDbService db) => _users = db.GetCollection<User>("users");

    /// <summary>
    /// Resolves a login to an account. Email is tried first and username only if that misses:
    /// a single <c>OR</c> with <c>FirstOrDefault</c> leaves the winner up to Mongo's document
    /// order, so an account whose USERNAME equals another account's EMAIL could answer for either.
    /// Both comparisons are case-insensitive, matching how the values are stored.
    /// </summary>
    public async Task<AuthUser?> FindByLoginAsync(string identifier, CancellationToken ct = default)
    {
        var normalized = identifier.Trim().ToLowerInvariant();

        var user = await _users
            .Find(u => u.Email == normalized && !u.IsDeleted)
            .FirstOrDefaultAsync(ct);

        user ??= await _users
            .Find(u => u.Username == normalized && !u.IsDeleted)
            .FirstOrDefaultAsync(ct);

        return user is null ? null : Map(user);
    }

    public async Task<AuthUser?> FindByIdAsync(string userId, CancellationToken ct = default)
    {
        var user = await _users.Find(u => u.Id == userId && !u.IsDeleted).FirstOrDefaultAsync(ct);
        return user is null ? null : Map(user);
    }

    public Task SaveAsync(AuthUser user, CancellationToken ct = default)
    {
        var update = Builders<User>.Update
            .Set(u => u.PasswordHash, user.PasswordHash)
            .Set(u => u.MustChangePassword, user.MustChangePassword)
            .Set(u => u.TwoFactorEnabled, user.TwoFactorEnabled)
            .Set(u => u.TotpSecretEncrypted, user.TotpSecretEncrypted)
            .Set(u => u.PendingTotpSecretEncrypted, user.PendingTotpSecretEncrypted)
            .Set(u => u.LastTotpStep, user.LastTotpStep)
            .Set(u => u.BackupCodeHashes, user.BackupCodeHashes.ToList())
            .Set(u => u.EmailOtpHash, user.EmailOtpHash)
            .Set(u => u.EmailOtpExpiresAt, user.EmailOtpExpiresAt)
            .Set(u => u.EmailOtpAttempts, user.EmailOtpAttempts)
            .Set(u => u.FailedLoginAttempts, user.FailedLoginAttempts)
            .Set(u => u.LockoutUntil, user.LockoutUntil)
            .Set(u => u.LastLoginAt, user.LastLoginAt)
            .Set(u => u.UpdatedAt, DateTime.UtcNow);
        return _users.UpdateOneAsync(u => u.Id == user.Id, update, cancellationToken: ct);
    }

    private static AuthUser Map(User u) => new()
    {
        Id = u.Id,
        Email = u.Email,
        Username = u.Username,
        DisplayName = u.DisplayName,
        PhoneNumber = u.PhoneNumber,
        PasswordHash = u.PasswordHash,
        MustChangePassword = u.MustChangePassword,
        Roles = u.Roles.ToList(),
        TwoFactorEnabled = u.TwoFactorEnabled,
        TotpSecretEncrypted = u.TotpSecretEncrypted,
        PendingTotpSecretEncrypted = u.PendingTotpSecretEncrypted,
        LastTotpStep = u.LastTotpStep,
        BackupCodeHashes = u.BackupCodeHashes.ToList(),
        EmailOtpHash = u.EmailOtpHash,
        EmailOtpExpiresAt = u.EmailOtpExpiresAt,
        EmailOtpAttempts = u.EmailOtpAttempts,
        IsActive = u.IsActive,
        IsDeleted = u.IsDeleted,
        FailedLoginAttempts = u.FailedLoginAttempts,
        LockoutUntil = u.LockoutUntil,
        LastLoginAt = u.LastLoginAt,
    };
}
