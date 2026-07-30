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
