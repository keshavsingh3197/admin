using Admin.Api.Auth;
using Xunit;

namespace Admin.Api.Tests;

/// <summary>
/// App-scoped roles are what keep an account made for one application out of every other one on
/// the shared sign-on. The rule that matters most is that such a role stands alone: next to Admin
/// or Editor it would lift the very confinement it exists to apply.
/// </summary>
public class AppScopedRolesTests
{
    [Fact]
    public void StudioUser_is_app_scoped()
    {
        Assert.True(AppScopedRoles.IsAppScoped(AppScopedRoles.StudioUser));
    }

    [Theory]
    [InlineData("Admin")]
    [InlineData("Editor")]
    [InlineData("Viewer")]
    public void The_shared_roles_are_not_app_scoped(string role)
    {
        Assert.False(AppScopedRoles.IsAppScoped(role));
    }

    [Fact]
    public void A_lone_StudioUser_is_a_valid_set()
    {
        Assert.True(AppScopedRoles.IsValidSet(new[] { "StudioUser" }));
    }

    [Theory]
    [InlineData("StudioUser", "Viewer")]
    [InlineData("StudioUser", "Editor")]
    [InlineData("Admin", "StudioUser")]
    public void StudioUser_may_not_be_combined_with_another_role(string first, string second)
    {
        Assert.False(AppScopedRoles.IsValidSet(new[] { first, second }));
    }

    [Theory]
    [InlineData("Admin")]
    [InlineData("Editor", "Viewer")]
    [InlineData("Viewer")]
    public void The_shared_roles_stay_valid_as_before(params string[] roles)
    {
        Assert.True(AppScopedRoles.IsValidSet(roles));
    }

    [Theory]
    [InlineData("studiouser")]
    [InlineData("STUDIOUSER")]
    [InlineData("StudioUser ")]
    [InlineData("MobileUser")]
    [InlineData("SuperAdmin")]
    public void Anything_else_is_refused(string role)
    {
        Assert.False(AppScopedRoles.IsValidSet(new[] { role }));
    }
}
