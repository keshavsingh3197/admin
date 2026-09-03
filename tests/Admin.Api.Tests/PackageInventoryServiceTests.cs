using Admin.Api.Services;
using Xunit;

namespace Admin.Api.Tests;

/// <summary>
/// Exercises <see cref="PackageInventoryService"/>'s pure helpers through <c>InternalsVisibleTo</c>.
/// These used to be re-declared inside the test class, which meant they asserted against a copy and
/// would keep passing however the service behaved.
/// </summary>
public class PackageInventoryServiceTests
{
    [Theory]
    [InlineData("^1.2.3", "1.2.3", true)]
    [InlineData("~1.2.3", "1.2.3", true)]
    [InlineData("=1.2.3", "1.2.3", true)]
    [InlineData("v1.2.3", "1.2.3", true)]
    [InlineData("1.2.3", "1.2.3", true)]
    [InlineData(" 1.2.3 ", "1.2.3", true)]
    [InlineData("1.2.3", "1.2.4", false)]
    [InlineData("^1.2.3", "1.3.0", false)]
    public void VersionMatches_HandlesFlexibleConstraints(string constraint, string version, bool expected) =>
        Assert.Equal(expected, PackageInventoryService.VersionMatches(constraint, version));

    [Fact]
    public void SummarizePublishedVersions_KeepsOnlyTheLatestStableRelease()
    {
        var summary = PackageInventoryService.SummarizePublishedVersions(new[]
        {
            "1.2.3", "1.2.2", "1.2.3-beta.1", "1.2.3-rc.1", "1.0.0", "latest",
        });

        Assert.Equal("1.2.3", summary.LatestTag);
        Assert.Equal(new[] { "1.2.3" }, summary.Tags);
        Assert.DoesNotContain("latest", summary.PublishedVersions);
        Assert.DoesNotContain("1.2.3-beta.1", summary.PublishedVersions);
    }

    [Fact]
    public void SummarizePublishedVersions_HandlesNothingPublished()
    {
        var summary = PackageInventoryService.SummarizePublishedVersions(Array.Empty<string>());

        Assert.Null(summary.LatestTag);
        Assert.Empty(summary.Tags);
    }

    [Fact]
    public void SummarizePublishedVersions_IgnoresBlanksAndDuplicates()
    {
        var summary = PackageInventoryService.SummarizePublishedVersions(new[] { "1.0.0", " ", "1.0.0", "" });

        Assert.Equal(new[] { "1.0.0" }, summary.PublishedVersions);
    }
}
