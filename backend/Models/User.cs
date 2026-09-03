using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Admin.Api.Models;

/// <summary>An admin user. Sensitive fields are hashed or encrypted at rest.</summary>
public sealed class User
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();

    public string Email { get; set; } = string.Empty;          // Stored lower-cased, unique.
    public string? Username { get; set; }                      // Optional, unique login handle.
    public string DisplayName { get; set; } = string.Empty;
    public string? PhoneNumber { get; set; }                   // E.164, for SMS 2FA.

    /// <summary>Object-store key for the uploaded avatar image, or null if none. See FileService's key
    /// convention (random, never derived from user input) — key is `avatars/{userId}/{random}`.</summary>
    public string? AvatarKey { get; set; }
    public string? AvatarContentType { get; set; }

    /// <summary>PBKDF2 hash string (format iterations.salt.hash). Never the raw password.</summary>
    public string PasswordHash { get; set; } = string.Empty;
    public bool MustChangePassword { get; set; }

    public List<string> Roles { get; set; } = new();

    /// <summary>Who can see this user in the chat directory/search: "everyone" or "family" (only users
    /// sharing a family-circle <see cref="Group"/> with them). Defaults to open for backward compat.</summary>
    public string ChatVisibility { get; set; } = "everyone";

    /// <summary>Custom role keys (see <see cref="CustomRole"/>) assigned directly to this user,
    /// in addition to any granted via group membership.</summary>
    public List<string> CustomRoleKeys { get; set; } = new();

    // ---- Two-factor (TOTP authenticator, default method) ----
    public bool TwoFactorEnabled { get; set; }
    public string? TotpSecretEncrypted { get; set; }

    /// <summary>An enrollment that was started but never confirmed. Kept apart from the live secret
    /// so an abandoned (or hostile) enrollment cannot break a working authenticator — see
    /// <c>AuthEngine.StartEnrollmentAsync</c>.</summary>
    public string? PendingTotpSecretEncrypted { get; set; }

    /// <summary>The TOTP time step of the last accepted code, so it cannot be replayed within its
    /// drift window.</summary>
    public long? LastTotpStep { get; set; }

    public List<string> BackupCodeHashes { get; set; } = new();

    // ---- Email / SMS OTP fallback ----
    public string? EmailOtpHash { get; set; }
    public DateTime? EmailOtpExpiresAt { get; set; }
    public int EmailOtpAttempts { get; set; }

    // ---- Account state / lockout ----
    public bool IsActive { get; set; } = true;
    public bool IsDeleted { get; set; }
    public int FailedLoginAttempts { get; set; }
    public DateTime? LockoutUntil { get; set; }
    public DateTime? LastLoginAt { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
