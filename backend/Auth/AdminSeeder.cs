using Admin.Api.Models;
using Admin.Api.Services;
using KeshavSingh.Security;
using MongoDB.Driver;

namespace Admin.Api.Auth;

public sealed class SeedOptions
{
    public const string Section = "Seed";
    public string AdminEmail { get; set; } = string.Empty;
    public string AdminDisplayName { get; set; } = "Administrator";
    public string AdminPassword { get; set; } = string.Empty;
}

/// <summary>
/// One-time bootstrap of the first Admin user so a fresh database is usable. The password
/// comes from configuration/secrets (never committed). Skips silently if any user exists
/// or the seed config is absent. Also ensures the unique-email index.
/// </summary>
public sealed class AdminSeeder
{
    private readonly IMongoCollection<User> _users;
    private readonly PasswordHasher _passwords;
    private readonly SeedOptions _seed;
    private readonly ILogger<AdminSeeder> _logger;

    public AdminSeeder(MongoDbService db, PasswordHasher passwords,
        Microsoft.Extensions.Options.IOptions<SeedOptions> seed, ILogger<AdminSeeder> logger)
    {
        _users = db.GetCollection<User>("users");
        _passwords = passwords;
        _seed = seed.Value;
        _logger = logger;
    }

    public async Task SeedAsync()
    {
        // Unique email (case-normalised: emails are stored lower-cased on write).
        await _users.Indexes.CreateOneAsync(new CreateIndexModel<User>(
            Builders<User>.IndexKeys.Ascending(u => u.Email),
            new CreateIndexOptions { Unique = true, Name = "ux_user_email" }));

        // Usernames are the other login identifier, so they need the same guarantee email has:
        // without a unique index two accounts can share one, and which of them a login resolves to
        // is then arbitrary. Sparse, because the field is optional.
        //
        // Non-fatal: a database that predates username normalisation may hold two accounts whose
        // names differ only by case, and Mongo will refuse to build the index over them. Refusing to
        // START over that would take the identity provider — and every app that depends on it —
        // offline for a data problem that migration 005 exists to report and fix.
        try
        {
            await _users.Indexes.CreateOneAsync(new CreateIndexModel<User>(
                Builders<User>.IndexKeys.Ascending(u => u.Username),
                new CreateIndexOptions { Unique = true, Sparse = true, Name = "ux_user_username" }));
        }
        catch (MongoCommandException ex)
        {
            _logger.LogError(ex,
                "Could not create the unique username index — most likely two accounts whose usernames " +
                "differ only by case. Run db/migrations/005_normalize-usernames.mongodb.js, which reports " +
                "the collisions. Until then usernames are not enforced unique.");
        }

        if (await _users.Find(FilterDefinition<User>.Empty).AnyAsync())
            return; // Already seeded.

        if (string.IsNullOrWhiteSpace(_seed.AdminEmail) || string.IsNullOrWhiteSpace(_seed.AdminPassword))
        {
            _logger.LogWarning("No users and no Seed:AdminEmail/AdminPassword configured — " +
                               "set them (user-secrets / env) to create the first admin.");
            return;
        }

        var user = new User
        {
            Email = _seed.AdminEmail.Trim().ToLowerInvariant(),
            DisplayName = _seed.AdminDisplayName,
            PasswordHash = _passwords.Hash(_seed.AdminPassword),
            Roles = new List<string> { Roles.Admin },
            MustChangePassword = true, // force a password change + 2FA enrolment on first sign-in
        };
        await _users.InsertOneAsync(user);
        _logger.LogInformation("Seeded first admin user {Email}.", user.Email);
    }
}
