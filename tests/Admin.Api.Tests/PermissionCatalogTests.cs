using Admin.Api.Models;
using Xunit;

namespace Admin.Api.Tests;

/// <summary>
/// The catalog is the contract between three places that must agree: the key here, the
/// <c>[RequirePagePermission]</c> on the controller, and the route guard in the SPA. A key that
/// exists in only some of them is either an unenforced permission or an unreachable page.
/// </summary>
public class PermissionCatalogTests
{
    [Fact]
    public void Admin_and_site_permissions_do_not_overlap()
    {
        // A key valid under both scopes would make IsValidForWebsite ambiguous.
        Assert.Empty(PermissionCatalog.AdminPermissionKeys.Intersect(PermissionCatalog.SiteActionKeys));
    }

    [Fact]
    public void Every_key_is_unique()
    {
        var all = PermissionCatalog.AdminPermissions.Concat(PermissionCatalog.SiteActions)
            .Select(x => x.Key).ToList();
        Assert.Equal(all.Count, all.Distinct(StringComparer.Ordinal).Count());
    }

    [Fact]
    public void Admin_permissions_are_assignable_only_under_the_admin_website_key()
    {
        Assert.True(PermissionCatalog.IsValidForWebsite(PermissionCatalog.AdminWebsiteKey, "page.notes"));
        Assert.False(PermissionCatalog.IsValidForWebsite("blog", "page.notes"));
        Assert.False(PermissionCatalog.IsValidForWebsite(PermissionCatalog.AllWebsitesKey, "page.notes"));
    }

    [Fact]
    public void Site_actions_are_assignable_to_any_site_but_not_to_admin()
    {
        Assert.True(PermissionCatalog.IsValidForWebsite("blog", "site.manage"));
        Assert.True(PermissionCatalog.IsValidForWebsite(PermissionCatalog.AllWebsitesKey, "site.manage"));
        Assert.False(PermissionCatalog.IsValidForWebsite(PermissionCatalog.AdminWebsiteKey, "site.manage"));
    }

    [Fact]
    public void An_unknown_key_is_never_valid()
    {
        Assert.False(PermissionCatalog.IsValidForWebsite(PermissionCatalog.AdminWebsiteKey, "page.doesNotExist"));
        Assert.False(PermissionCatalog.IsValidForWebsite("blog", "site.doesNotExist"));
    }

    [Fact]
    public void Every_permission_is_described_for_the_grant_screen()
    {
        foreach (var item in PermissionCatalog.AdminPermissions.Concat(PermissionCatalog.SiteActions))
        {
            Assert.False(string.IsNullOrWhiteSpace(item.Label), $"{item.Key} has no label");
            Assert.False(string.IsNullOrWhiteSpace(item.Description), $"{item.Key} has no description");
            Assert.False(string.IsNullOrWhiteSpace(item.Category), $"{item.Key} has no category");
        }
    }
}
