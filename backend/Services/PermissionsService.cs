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
        var websites = new List<WebsiteAccessOptionDto> { new(PermissionCatalog.AdminWebsiteKey, "Admin (this app)") };
        websites.AddRange(sites.Select(x => new WebsiteAccessOptionDto(x.Key, x.Name)));

        return new PermissionCatalogResponse(
            PermissionCatalog.AdminPermissions.Select(x => new PermissionCatalogItemDto(x.Key, x.Category, x.Label, x.Description)).ToList(),
            PermissionCatalog.SiteActions.Select(x => new PermissionCatalogItemDto(x.Key, x.Category, x.Label, x.Description)).ToList(),
            websites);
    }

    public async Task<EffectiveAccessDto> GetEffectiveAccessAsync(string userId, CancellationToken ct = default)
    {
        var user = await _users.Find(x => x.Id == userId && !x.IsDeleted).FirstOrDefaultAsync(ct);
        if (user is null)
            return new EffectiveAccessDto(Array.Empty<string>(), Array.Empty<SiteAccessDto>(), false, Array.Empty<string>());

        var roleKeys = new HashSet<string>(user.CustomRoleKeys, StringComparer.Ordinal);
        var groups = await _groups.ListForUserAsync(userId, ct);
        foreach (var g in groups)
            foreach (var k in g.RoleKeys)
                roleKeys.Add(k);

        var isAdmin = user.Roles.Contains(Roles.Admin, StringComparer.Ordinal);
        if (isAdmin) roleKeys.Add("admin");
        if (user.Roles.Contains(Roles.Editor, StringComparer.Ordinal)) roleKeys.Add("editor");
        if (user.Roles.Contains(Roles.Viewer, StringComparer.Ordinal)) roleKeys.Add("viewer");

        return await ComputeAccessAsync(roleKeys, isAdmin, ct);
    }

    /// <summary>Merges the website grants of a set of custom role keys (used for both a user's
    /// effective access and previewing what a group grants its members).</summary>
    public async Task<EffectiveAccessDto> ComputeAccessAsync(IReadOnlySet<string> roleKeys, bool isAdmin, CancellationToken ct = default)
    {
        var adminPermissions = new HashSet<string>(StringComparer.Ordinal);
        var wildcardPermissions = new HashSet<string>(StringComparer.Ordinal);
        var siteGrants = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);
        var hasWildcard = isAdmin;

        if (roleKeys.Count > 0)
        {
            var customRoles = await _roles.GetByKeysAsync(roleKeys, ct);
            foreach (var role in customRoles)
            {
                foreach (var grant in role.WebsiteGrants)
                {
                    if (grant.WebsiteKey == PermissionCatalog.AdminWebsiteKey)
                        adminPermissions.UnionWith(grant.Permissions);
                    else if (grant.WebsiteKey == PermissionCatalog.AllWebsitesKey)
                    {
                        wildcardPermissions.UnionWith(grant.Permissions);
                        hasWildcard = true;
                    }
                    else
                    {
                        if (!siteGrants.TryGetValue(grant.WebsiteKey, out var set))
                            siteGrants[grant.WebsiteKey] = set = new HashSet<string>(StringComparer.Ordinal);
                        set.UnionWith(grant.Permissions);
                    }
                }
            }
        }

        if (isAdmin)
        {
            adminPermissions.UnionWith(PermissionCatalog.AdminPermissionKeys);
            wildcardPermissions.UnionWith(PermissionCatalog.SiteActionKeys);
        }

        // Apply the wildcard grant to every known website, plus any site with an explicit grant.
        var allSiteKeys = new HashSet<string>(siteGrants.Keys, StringComparer.OrdinalIgnoreCase);
        if (wildcardPermissions.Count > 0)
            foreach (var site in await _websites.ListAsync(ct))
                allSiteKeys.Add(site.Key);

        var siteAccess = allSiteKeys
            .Select(key =>
            {
                var perms = new HashSet<string>(wildcardPermissions, StringComparer.Ordinal);
                if (siteGrants.TryGetValue(key, out var explicitPerms)) perms.UnionWith(explicitPerms);
                return new SiteAccessDto(key, perms.OrderBy(x => x, StringComparer.Ordinal).ToList());
            })
            .Where(s => s.Permissions.Count > 0)
            .OrderBy(s => s.WebsiteKey, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new EffectiveAccessDto(
            adminPermissions.OrderBy(x => x, StringComparer.Ordinal).ToList(),
            siteAccess,
            hasWildcard,
            roleKeys.OrderBy(x => x, StringComparer.Ordinal).ToList());
    }
}
