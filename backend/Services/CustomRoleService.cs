using Admin.Api.Dtos;
using Admin.Api.Models;
using MongoDB.Driver;

namespace Admin.Api.Services;

/// <summary>CRUD for user-defined roles, plus the seeded system roles (admin/editor/viewer).</summary>
public sealed class CustomRoleService
{
    private readonly IMongoCollection<CustomRole> _roles;

    public CustomRoleService(MongoDbService db)
    {
        _roles = db.GetCollection<CustomRole>("custom_roles");
    }

    public async Task EnsureIndexesAsync(CancellationToken ct = default)
    {
        await _roles.Indexes.CreateOneAsync(new CreateIndexModel<CustomRole>(
            Builders<CustomRole>.IndexKeys.Ascending(x => x.Key),
            new CreateIndexOptions { Unique = true }),
            cancellationToken: ct);
    }

    public async Task SeedSystemRolesAsync(CancellationToken ct = default)
    {
        if (await _roles.Find(x => x.IsSystem).AnyAsync(ct)) return;

        var seeded = new List<CustomRole>
        {
            new()
            {
                Key = "admin",
                Name = "Admin",
                Description = "Full access to every page, action, and website.",
                Permissions = PermissionCatalog.AllKeys.ToList(),
                WebsiteAccess = new List<string> { "*" },
                IsSystem = true,
            },
            new()
            {
                Key = "editor",
                Name = "Editor",
                Description = "Can create and edit content across linked websites.",
                Permissions = new List<string>
                {
                    "page.dashboard", "page.notes", "page.security", "action.websites.manage",
                },
                WebsiteAccess = new List<string> { "*" },
                IsSystem = true,
            },
            new()
            {
                Key = "viewer",
                Name = "Viewer",
                Description = "Read-only access to the dashboard, notes, and own security settings.",
                Permissions = new List<string> { "page.dashboard", "page.notes", "page.security" },
                WebsiteAccess = new List<string> { "*" },
                IsSystem = true,
            },
        };

        await _roles.InsertManyAsync(seeded, cancellationToken: ct);
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

    public async Task<CustomRoleView> CreateAsync(UpsertCustomRoleRequest request, CancellationToken ct = default)
    {
        var (permissions, websiteAccess) = Validate(request);
        var key = NormalizeKey(request.Key);
        if (await _roles.Find(x => x.Key == key).AnyAsync(ct))
            throw new InvalidOperationException("A role with that key already exists.");

        var entity = new CustomRole
        {
            Key = key,
            Name = request.Name.Trim(),
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
            Permissions = permissions,
            WebsiteAccess = websiteAccess,
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

        var (permissions, websiteAccess) = Validate(request);
        var key = NormalizeKey(request.Key);
        if (key != existing.Key && await _roles.Find(x => x.Key == key).AnyAsync(ct))
            throw new InvalidOperationException("A role with that key already exists.");

        var update = Builders<CustomRole>.Update
            .Set(x => x.Key, key)
            .Set(x => x.Name, request.Name.Trim())
            .Set(x => x.Description, string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim())
            .Set(x => x.Permissions, permissions)
            .Set(x => x.WebsiteAccess, websiteAccess)
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
    }

    private static (List<string> Permissions, List<string> WebsiteAccess) Validate(UpsertCustomRoleRequest request)
    {
        var permissions = (request.Permissions ?? new()).Distinct().ToList();
        if (!permissions.All(PermissionCatalog.IsValid))
            throw new ArgumentException("One or more permission keys are invalid.");

        var websiteAccess = (request.WebsiteAccess ?? new())
            .Select(w => w.Trim().ToLowerInvariant())
            .Where(w => w.Length > 0)
            .Distinct()
            .ToList();
        return (permissions, websiteAccess);
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
        new(x.Id, x.Key, x.Name, x.Description, x.Permissions, x.WebsiteAccess, x.IsSystem, x.UpdatedAt);
}
