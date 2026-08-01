using Admin.Api.Dtos;
using Admin.Api.Models;
using MongoDB.Driver;

namespace Admin.Api.Services;

/// <summary>
/// Resolves a user's effective page/action permissions and website access by merging: their
/// legacy system role (Admin/Editor/Viewer, mapped to the matching seeded custom role), any
/// custom roles assigned directly to them, and any custom roles granted by the groups they
/// belong to.
/// </summary>
public sealed class PermissionsService
{
    private readonly IMongoCollection<User> _users;
    private readonly CustomRoleService _roles;
    private readonly GroupService _groups;
    private readonly WebsiteRegistryService _websites;

    public PermissionsService(MongoDbService db, CustomRoleService roles, GroupService groups, WebsiteRegistryService websites)
    {
        _users = db.GetCollection<User>("users");
        _roles = roles;
        _groups = groups;
        _websites = websites;
    }

    public async Task<PermissionCatalogResponse> GetCatalogAsync(CancellationToken ct = default)
    {
        var sites = await _websites.ListAsync(ct);
        return new PermissionCatalogResponse(
            PermissionCatalog.All.Select(x => new PermissionCatalogItemDto(x.Key, x.Category, x.Label, x.Description)).ToList(),
            sites.Select(x => new WebsiteAccessOptionDto(x.Key, x.Name)).ToList());
    }

    public async Task<EffectiveAccessDto> GetEffectiveAccessAsync(string userId, CancellationToken ct = default)
    {
        var user = await _users.Find(x => x.Id == userId && !x.IsDeleted).FirstOrDefaultAsync(ct);
        if (user is null)
            return new EffectiveAccessDto(Array.Empty<string>(), Array.Empty<string>(), false, Array.Empty<string>());

        var roleKeys = new HashSet<string>(user.CustomRoleKeys, StringComparer.Ordinal);
        var groups = await _groups.ListForUserAsync(userId, ct);
        foreach (var g in groups)
            foreach (var k in g.RoleKeys)
                roleKeys.Add(k);

        var isAdmin = user.Roles.Contains(Roles.Admin, StringComparer.Ordinal);
        if (isAdmin) roleKeys.Add("admin");
        if (user.Roles.Contains(Roles.Editor, StringComparer.Ordinal)) roleKeys.Add("editor");
        if (user.Roles.Contains(Roles.Viewer, StringComparer.Ordinal)) roleKeys.Add("viewer");

        var permissions = new HashSet<string>(StringComparer.Ordinal);
        var websiteAccess = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var hasFullWebsiteAccess = isAdmin;

        if (roleKeys.Count > 0)
        {
            var customRoles = await _roles.GetByKeysAsync(roleKeys, ct);
            foreach (var role in customRoles)
            {
                foreach (var p in role.Permissions) permissions.Add(p);
                foreach (var w in role.WebsiteAccess)
                {
                    if (w == "*") hasFullWebsiteAccess = true;
                    else websiteAccess.Add(w);
                }
            }
        }

        if (isAdmin) permissions.UnionWith(PermissionCatalog.AllKeys); // Admin always sees everything.

        return new EffectiveAccessDto(
            permissions.OrderBy(x => x, StringComparer.Ordinal).ToList(),
            hasFullWebsiteAccess ? new List<string> { "*" } : websiteAccess.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToList(),
            hasFullWebsiteAccess,
            roleKeys.OrderBy(x => x, StringComparer.Ordinal).ToList());
    }
}
