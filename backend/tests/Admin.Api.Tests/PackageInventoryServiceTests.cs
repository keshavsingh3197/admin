using Admin.Api.Dtos;
using Admin.Api.Services;

namespace Admin.Api.Tests;

public class PackageInventoryServiceTests
{
    [Fact]
    public void VersionMatches_HandlesFlexibleConstraints()
    {
        Assert.True(PackageInventoryServiceTestsHelper.VersionMatches("^1.2.3", "1.2.3"));
        Assert.True(PackageInventoryServiceTestsHelper.VersionMatches("~1.2.3", "1.2.3"));
        Assert.True(PackageInventoryServiceTestsHelper.VersionMatches("=1.2.3", "1.2.3"));
        Assert.True(PackageInventoryServiceTestsHelper.VersionMatches("v1.2.3", "1.2.3"));
        Assert.True(PackageInventoryServiceTestsHelper.VersionMatches("1.2.3", "1.2.3"));
        Assert.False(PackageInventoryServiceTestsHelper.VersionMatches("1.2.3", "1.2.4"));
    }

    [Fact]
    public void NormalizePackageTags_DeduplicatesAndKeepsOnlyCurrentReleaseSeries()
    {
        var versions = new[]
        {
            "1.2.3",
            "1.2.2",
            "1.2.3-beta.1",
            "1.2.3-rc.1",
            "1.0.0",
            "latest"
        };

        var tags = PackageInventoryServiceTestsHelper.NormalizeTags(versions);

        Assert.Contains("1.2.3", tags);
        Assert.DoesNotContain("1.2.2", tags);
        Assert.DoesNotContain("latest", tags);
        Assert.DoesNotContain("1.2.3-beta.1", tags);
        Assert.DoesNotContain("1.2.3-rc.1", tags);
    }

    [Fact]
    public void NormalizePackageInventoryRepositories_DeduplicatesAndValidatesOwnerRepoPairs()
    {
        var repos = new[]
        {
            "  KeshavSingh/Packages-Core  ",
            "keshavsingh/packages-core",
            "keshavsingh/packages-core/",
            "bad-entry",
            "",
            "owner/repo",
            "owner/repo "
        };

        var normalized = SettingsService.NormalizePackageInventoryRepositories(repos);

        Assert.Equal(new[] { "keshavsingh/packages-core", "owner/repo" }, normalized);
    }

    [Fact]
    public void NormalizeWebsiteGrants_DefaultsSelectedSitesToViewPermission()
    {
        var grants = CustomRoleService.NormalizeWebsiteGrants(new[]
        {
            new WebsiteGrantDto("blog", Array.Empty<string>()),
            new WebsiteGrantDto("admin", Array.Empty<string>()),
            new WebsiteGrantDto("*", Array.Empty<string>()),
        });

        Assert.Equal(new[] { "site.view" }, grants.Single(x => x.WebsiteKey == "blog").Permissions);
        Assert.Equal(new[] { "site.view" }, grants.Single(x => x.WebsiteKey == "*").Permissions);
        Assert.Empty(grants.Single(x => x.WebsiteKey == "admin").Permissions);
    }

    [Theory]
    [InlineData("token-missing", false, new[] { "No GitHub token is configured." }, 0)]
    [InlineData("private-repo-access-denied", true, new[] { "org/private-repo: could not list files (Forbidden)." }, 0)]
    [InlineData("manifest-not-found", true, new string[0], 0)]
    [InlineData("ready", true, new[] { "Some repo warning." }, 2)]
    public void DetermineState_SeparatesKnownInventoryFailures(string expectedState, bool workspaceAvailable, string[] diagnostics, int packageCount)
    {
        Assert.Equal(expectedState, PackageInventoryState.Determine(workspaceAvailable, diagnostics, packageCount));
    }
}

internal static class PackageInventoryServiceTestsHelper
{
    public static bool VersionMatches(string constraint, string version) =>
        constraint.Trim().TrimStart('^', '~', '=', 'v').Equals(version.Trim().TrimStart('v'), StringComparison.OrdinalIgnoreCase);

    public static IReadOnlyList<string> NormalizeTags(IEnumerable<string> versions)
    {
        var distinct = versions
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .Select(v => v.Trim())
            .Where(v => !v.Equals("latest", StringComparison.OrdinalIgnoreCase))
            .Where(v => !v.Contains('-', StringComparison.Ordinal))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(v => v, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return distinct.Take(5).ToArray();
    }
}
