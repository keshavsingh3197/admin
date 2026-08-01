namespace Admin.Api.Models;

/// <summary>
/// Static catalog of permission keys a <see cref="CustomRole"/> can grant, scoped per website via
/// <see cref="WebsiteGrant"/>. Under the "admin" website key a grant can pick from
/// <see cref="AdminPermissions"/> (this app's own pages and management actions); under any other
/// website key (or "*" for every external website) a grant can pick from <see cref="SiteActions"/>.
/// This gates UI/navigation; the fixed <see cref="Roles"/> (Admin/Editor/Viewer) remain the
/// enforced API authorization boundary.
/// </summary>
public static class PermissionCatalog
{
    public sealed record Item(string Key, string Category, string Label, string Description);

    public const string AdminWebsiteKey = "admin";
    public const string AllWebsitesKey = "*";

    /// <summary>Assignable only under the "admin" website key.</summary>
    public static readonly IReadOnlyList<Item> AdminPermissions = new List<Item>
    {
        new("page.dashboard", "Pages", "Dashboard", "View the launcher dashboard."),
        new("page.notes", "Pages", "Notes", "Access the notes page."),
        new("page.security", "Pages", "Security & 2FA", "Access own security settings."),
        new("page.analytics", "Pages", "Analytics", "View analytics dashboards."),
        new("page.users", "Pages", "Users", "Access user management."),
        new("page.settings", "Pages", "Settings", "Access runtime settings."),
        new("page.roles", "Pages", "Roles & Permissions", "Access role management."),
        new("page.groups", "Pages", "Groups", "Access group management."),
        new("page.search", "Pages", "Search", "Use the global search."),
        new("action.users.manage", "Actions", "Manage users", "Create, edit, deactivate, delete users."),
        new("action.roles.manage", "Actions", "Manage roles", "Create, edit, delete custom roles."),
        new("action.groups.manage", "Actions", "Manage groups", "Create, edit, delete groups and membership."),
        new("action.settings.manage", "Actions", "Manage settings", "Edit runtime auth/security settings."),
    };

    /// <summary>Assignable under any other website key, or "*" for every external website.</summary>
    public static readonly IReadOnlyList<Item> SiteActions = new List<Item>
    {
        new("site.view", "Site", "View", "View this site's analytics and dashboard card."),
        new("site.manage", "Site", "Manage", "Manage this site's content, links, and settings."),
    };

    public static readonly IReadOnlySet<string> AdminPermissionKeys =
        new HashSet<string>(AdminPermissions.Select(x => x.Key), StringComparer.Ordinal);

    public static readonly IReadOnlySet<string> SiteActionKeys =
        new HashSet<string>(SiteActions.Select(x => x.Key), StringComparer.Ordinal);

    public static bool IsValidForWebsite(string websiteKey, string permissionKey) =>
        websiteKey == AdminWebsiteKey ? AdminPermissionKeys.Contains(permissionKey) : SiteActionKeys.Contains(permissionKey);
}
