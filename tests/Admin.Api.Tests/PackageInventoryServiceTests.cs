using Xunit;

namespace Admin.Api.Tests;

public class PackageInventoryServiceTests
{
    [Fact]
    public void VersionMatches_HandlesFlexibleConstraints()
    {
        Assert.True(VersionMatches("^1.2.3", "1.2.3"));
        Assert.True(VersionMatches("~1.2.3", "1.2.3"));
        Assert.True(VersionMatches("=1.2.3", "1.2.3"));
        Assert.True(VersionMatches("v1.2.3", "1.2.3"));
        Assert.True(VersionMatches("1.2.3", "1.2.3"));
        Assert.False(VersionMatches("1.2.3", "1.2.4"));
    }

    [Fact]
    public void NormalizeTags_DeduplicatesAndKeepsOnlyCurrentReleaseSeries()
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

        var tags = NormalizeTags(versions);

        Assert.Equal(new[] { "1.2.3" }, tags);
        Assert.DoesNotContain("1.2.2", tags);
        Assert.DoesNotContain("latest", tags);
        Assert.DoesNotContain("1.2.3-beta.1", tags);
        Assert.DoesNotContain("1.2.3-rc.1", tags);
    }

    private static bool VersionMatches(string constraint, string version) =>
        constraint.Trim().TrimStart('^', '~', '=', 'v').Equals(version.Trim().TrimStart('v'), StringComparison.OrdinalIgnoreCase);

    private static IReadOnlyList<string> NormalizeTags(IEnumerable<string> versions)
    {
        var distinct = versions
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .Select(v => v.Trim())
            .Where(v => !v.Equals("latest", StringComparison.OrdinalIgnoreCase))
            .Where(v => !v.Contains('-', StringComparison.Ordinal))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(v => v, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var latest = distinct.FirstOrDefault();
        return latest is null ? Array.Empty<string>() : new[] { latest };
    }
}
