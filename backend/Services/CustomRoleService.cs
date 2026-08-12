using Admin.Api.Dtos;
using Admin.Api.Models;
using MongoDB.Driver;

namespace Admin.Api.Services;

/// <summary>CRUD for user-defined roles, plus the seeded system roles (admin/editor/viewer).</summary>
public sealed class CustomRoleService
{
    private readonly IMongoCollection<CustomRole> _roles;
    private readonly IMongoCollection<User> _users;
    private readonly IMongoCollection<Group> _groups;

    public CustomRoleService(MongoDbService db)
    {
        _roles = db.GetCollection<CustomRole>("custom_roles");
        _users = db.GetCollection<User>("users");
        _groups = db.GetCollection<Group>("groups");
    }

    public async Task EnsureIndexesAsync(CancellationToken ct = default)
    {
        await _roles.Indexes.CreateOneAsync(new CreateIndexModel<CustomRole>(
            Builders<CustomRole>.IndexKeys.Ascending(x => x.Key),
            new CreateIndexOptions { Unique = true }),
            cancellationToken: ct);
    }

    /// <summary>
    /// Upserts the built-in system roles by key so they always match the definitions below — this
    /// also self-heals roles seeded under an older shape (e.g. before the per-website grants
    /// redesign) instead of leaving stale/incompatible documents behind.
    /// </summary>
    public async Task SeedSystemRolesAsync(CancellationToken ct = default)
    {
        var seeded = new List<CustomRole>
        {
            new()
            {
                Key = "admin",
                Name = "Admin",
                Description = "Full access to every page, action, and website.",
                WebsiteGrants = new List<WebsiteGrant>
                {
                    new() { WebsiteKey = PermissionCatalog.AdminWebsiteKey, Permissions = PermissionCatalog.AdminPermissionKeys.ToList() },
                    new() { WebsiteKey = PermissionCatalog.AllWebsitesKey, Permissions = PermissionCatalog.SiteActionKeys.ToList() },
                },
                IsSystem = true,
            },
            new()
            {
                Key = "editor",
                Name = "Editor",
                Description = "Can create and edit content across linked websites.",
                WebsiteGrants = new List<WebsiteGrant>
                {
                    new() { WebsiteKey = PermissionCatalog.AdminWebsiteKey, Permissions = new List<string> { "page.dashboard", "page.notes", "page.security", "page.files", "page.finance", "page.inbox", "page.shortLinks" } },
                    new() { WebsiteKey = PermissionCatalog.AllWebsitesKey, Permissions = new List<string> { "site.view", "site.manage" } },
                },
                IsSystem = true,
            },
            new()
            {
                Key = "viewer",
                Name = "Viewer",
                Description = "Read-only access to the dashboard, notes, and own security settings.",
                WebsiteGrants = new List<WebsiteGrant>
                {
                    new() { WebsiteKey = PermissionCatalog.AdminWebsiteKey, Permissions = new List<string> { "page.dashboard", "page.notes", "page.security", "page.files", "page.finance", "page.inbox", "page.shortLinks" } },
                    new() { WebsiteKey = PermissionCatalog.AllWebsitesKey, Permissions = new List<string> { "site.view" } },
                },
                IsSystem = true,
            },
        };

        foreach (var role in seeded)
        {
            // Reuse the existing _id/CreatedAt if this system role was already seeded — MongoDB
            // disallows changing _id on a matched replace, and it keeps history stable.
            var existing = await _roles.Find(x => x.Key == role.Key && x.IsSystem).FirstOrDefaultAsync(ct);
            if (existing is not null)
            {
                role.Id = existing.Id;
                role.CreatedAt = existing.CreatedAt;
            }
            await _roles.ReplaceOneAsync(x => x.Id == role.Id, role, new ReplaceOptions { IsUpsert = true }, ct);
        }
    }

    public async Task<IReadOnlyList<CustomRoleView>> ListAsync(CancellationToken ct = default)
    {
        var list = await _roles.Find(_ => true).SortBy(x => x.Name).ToListAsync(ct);
        return list.Select(Map).ToList();
    }

    public async Task<IReadOnlyList<CustomRole>> GetByKeysAsync(IEnumerable<string> keys, CancellationToken ct = default)
    {
        var set = keys.Distinct().ToList();
        if (set.Count == 0) return Array.Empty<CustomRole>();
        return await _roles.Find(x => set.Contains(x.Key)).ToListAsync(ct);
    }

    /// <summary>Verifies that every supplied custom-role key exists.  Assignment endpoints use
    /// this so no user or group can retain a dangling reference after a typo or stale client.</summary>
    public async Task<bool> AllKeysExistAsync(IEnumerable<string> keys, CancellationToken ct = default)
    {
        var set = keys.Where(k => !string.IsNullOrWhiteSpace(k)).Distinct(StringComparer.Ordinal).ToList();
        if (set.Count == 0) return true;
        var found = await _roles.CountDocumentsAsync(x => set.Contains(x.Key), cancellationToken: ct);
        return found == set.Count;
    }

    public async Task<CustomRoleView> CreateAsync(UpsertCustomRoleRequest request, CancellationToken ct = default)
    {
        var grants = Validate(request);
        var key = NormalizeKey(request.Key);
        if (await _roles.Find(x => x.Key == key).AnyAsync(ct))
            throw new InvalidOperationException("A role with that key already exists.");

        var entity = new CustomRole
        {
            Key = key,
            Name = request.Name.Trim(),
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
            WebsiteGrants = grants,
            IsSystem = false,
        };
        await _roles.InsertOneAsync(entity, cancellationToken: ct);
        return Map(entity);
    }

    public async Task<CustomRoleView?> UpdateAsync(string id, UpsertCustomRoleRequest request, CancellationToken ct = default)
    {
        var existing = await _roles.Find(x => x.Id == id).FirstOrDefaultAsync(ct);
        if (existing is null) return null;
        if (existing.IsSystem) throw new InvalidOperationException("System roles cannot be edited.");

        var grants = Validate(request);
        var key = NormalizeKey(request.Key);
        if (key != existing.Key && await _roles.Find(x => x.Key == key).AnyAsync(ct))
            throw new InvalidOperationException("A role with that key already exists.");

        var update = Builders<CustomRole>.Update
            .Set(x => x.Key, key)
            .Set(x => x.Name, request.Name.Trim())
            .Set(x => x.Description, string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim())
            .Set(x => x.WebsiteGrants, grants)
            .Set(x => x.UpdatedAt, DateTime.UtcNow);

        var updated = await _roles.FindOneAndUpdateAsync(x => x.Id == id, update,
            new FindOneAndUpdateOptions<CustomRole> { ReturnDocument = ReturnDocument.After }, ct);
        return updated is null ? null : Map(updated);
    }

    public async Task DeleteAsync(string id, CancellationToken ct = default)
    {
        var existing = await _roles.Find(x => x.Id == id).FirstOrDefaultAsync(ct);
        if (existing is null) return;
        if (existing.IsSystem) throw new InvalidOperationException("System roles cannot be deleted.");
        await _roles.DeleteOneAsync(x => x.Id == id, ct);
        // Keep assignment mappings referentially clean. A removed role must not remain selected on
        // users or groups, where it would otherwise become an invisible/dangling grant.
        await _users.UpdateManyAsync(x => x.CustomRoleKeys.Contains(existing.Key),
            Builders<User>.Update.Pull(x => x.CustomRoleKeys, existing.Key).Set(x => x.UpdatedAt, DateTime.UtcNow),
            cancellationToken: ct);
        await _groups.UpdateManyAsync(x => x.RoleKeys.Contains(existing.Key),
            Builders<Group>.Update.Pull(x => x.RoleKeys, existing.Key).Set(x => x.UpdatedAt, DateTime.UtcNow),
            cancellationToken: ct);
    }

    private static List<WebsiteGrant> Validate(UpsertCustomRoleRequest request)
    {
        var grants = new List<WebsiteGrant>();
        var seenKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var grant in request.WebsiteGrants ?? new())
        {
            var websiteKey = grant.WebsiteKey.Trim().ToLowerInvariant();
            if (websiteKey.Length == 0) throw new ArgumentException("Website key cannot be empty.");
            if (!seenKeys.Add(websiteKey)) throw new ArgumentException($"Duplicate website key '{websiteKey}' in grants.");

            var permissions = (grant.Permissions ?? new List<string>()).Distinct().ToList();
            if (!permissions.All(p => PermissionCatalog.IsValidForWebsite(websiteKey, p)))
                throw new ArgumentException($"One or more permission keys are invalid for website '{websiteKey}'.");
            if (permissions.Count == 0) continue;

            grants.Add(new WebsiteGrant { WebsiteKey = websiteKey, Permissions = permissions });
        }

        return grants;
    }

    private static string NormalizeKey(string key)
    {
        var trimmed = key.Trim().ToLowerInvariant();
        if (trimmed.Length < 2 || trimmed.Length > 40)
            throw new ArgumentException("Key must be 2-40 chars.");
        foreach (var ch in trimmed)
        {
            if (!char.IsLetterOrDigit(ch) && ch != '-' && ch != '_')
                throw new ArgumentException("Key can contain only a-z, 0-9, '-' and '_'.");
        }
        return trimmed;
    }

    private static CustomRoleView Map(CustomRole x) =>
        new(x.Id, x.Key, x.Name, x.Description,
            x.WebsiteGrants.Select(g => new WebsiteGrantDto(g.WebsiteKey, g.Permissions)).ToList(),
            x.IsSystem, x.UpdatedAt);
}
