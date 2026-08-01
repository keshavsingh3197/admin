namespace Admin.Api.Models;

/// <summary>
/// Static catalog of permission keys a <see cref="CustomRole"/> can grant: which pages are visible
/// and which management actions are allowed. This gates UI/navigation; the fixed
/// <see cref="Roles"/> (Admin/Editor/Viewer) remain the enforced API authorization boundary.
/// </summary>
public static class PermissionCatalog
{
    public sealed record Item(string Key, string Category, string Label, string Description);

    public static readonly IReadOnlyList<Item> All = new List<Item>
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
        new("action.websites.manage", "Actions", "Manage websites", "Edit the website registry and content."),
    };

    public static readonly IReadOnlySet<string> AllKeys =
        new HashSet<string>(All.Select(x => x.Key), StringComparer.Ordinal);

    public static bool IsValid(string key) => AllKeys.Contains(key);
}
