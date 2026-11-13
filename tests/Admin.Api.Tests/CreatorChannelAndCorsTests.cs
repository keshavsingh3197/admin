using Admin.Api.Dtos;
using Admin.Api.Models;
using Admin.Api.Services;
using Admin.Api.Startup;
using Xunit;

namespace Admin.Api.Tests;

public sealed class CreatorChannelAndCorsTests
{
    [Fact]
    public void NormalizeEntity_CleansAndNormalizesValidChannel()
    {
        var req = new UpsertCreatorChannelRequest(
            Key: " OmkarShivBhakti ",
            Name: " Omkar Shiv Bhakti ",
            Handle: " @OmkarShivBhakti ",
            Platform: "youtube",
            ChannelId: "UC1234567890123456789012",
            Url: "https://www.youtube.com/@OmkarShivBhakti/",
            Niche: "Devotional 3D",
            Tagline: "Devotional 3D Animations",
            Description: "Sacred storytelling",
            EngineName: "AnimStudio",
            VisualsCredit: "Omkar Shiv Bhakti 3D Devotional Animations",
            Hashtags: ["#OmkarShivBhakti", "AnimStudio", "animstudio", "bad<tag>"],
            Tags: ["omkar shiv bhakti", "#OMKR"],
            RetiredHandles: ["OMKR", "omkr"],
            RetiredUrls: ["youtube.com/@omkr-shiv"],
            IsPrimary: false,
            IsEnabled: true,
            ShowInAnalytics: true,
            ShowInPanchang: true,
            ShowInStudio: true,
            ShowInFooter: true,
            SortOrder: 20);

        var entity = CreatorChannelService.NormalizeEntity(new CreatorChannel(), req);

        Assert.Equal("omkarshivbhakti", entity.Key);
        Assert.Equal("YouTube", entity.Platform);
        Assert.Equal("https://www.youtube.com/@OmkarShivBhakti", entity.Url);
        Assert.Equal(["OmkarShivBhakti", "AnimStudio"], entity.Hashtags);
        Assert.Equal(["omkar shiv bhakti", "OMKR"], entity.Tags);
        Assert.Equal(["OMKR"], entity.RetiredHandles);
        Assert.Equal(["youtube.com/@omkr-shiv"], entity.RetiredUrls);
    }

    [Theory]
    [InlineData("javascript:alert(1)")]
    [InlineData("ftp://youtube.com/@test")]
    [InlineData("http://youtube.com/@test")]
    public void NormalizeExternalUrl_RejectsInsecureOrInvalidUrls(string url)
    {
        Assert.Throws<ArgumentException>(() => CreatorChannelService.NormalizeExternalUrl(url, "url"));
    }

    [Theory]
    [InlineData("@keshavsinghworld", "https://www.youtube.com/@keshavsinghworld")]
    [InlineData("UC1234567890123456789012", "https://www.youtube.com/channel/UC1234567890123456789012")]
    [InlineData("https://www.youtube.com/@OmkarShivBhakti", "https://www.youtube.com/@OmkarShivBhakti")]
    public void BuildYouTubeTargetUrl_AcceptsHandlesIdsAndUrls(string input, string expected)
    {
        Assert.Equal(expected, CreatorChannelService.BuildYouTubeTargetUrl(input));
    }

    [Theory]
    [InlineData("https://evil.com/@bad")]
    [InlineData("http://www.youtube.com/@bad")]
    public void BuildYouTubeTargetUrl_RejectsNonYouTubeOrHttpUrls(string input)
    {
        Assert.Throws<ArgumentException>(() => CreatorChannelService.BuildYouTubeTargetUrl(input));
    }

    [Theory]
    [InlineData("https://social.keshavsingh.in/dashboard", true, "https://social.keshavsingh.in")]
    [InlineData("https://panchang.keshavsingh.in", true, "https://panchang.keshavsingh.in")]
    [InlineData("https://keshavsingh.in/", true, "https://keshavsingh.in")]
    [InlineData("https://keshavsingh3197.github.io/site", true, "https://keshavsingh3197.github.io")]
    [InlineData("https://evil-keshavsingh.in", false, "")]
    [InlineData("http://social.keshavsingh.in", false, "")]
    public void DynamicCorsAllowlist_EnforcesStrictFamilyBoundary(string url, bool expectedAllowed, string expectedOrigin)
    {
        var allowed = DynamicEcosystemCorsPolicyProvider.IsAllowedFamilyOrigin(url, out var origin);
        Assert.Equal(expectedAllowed, allowed);
        Assert.Equal(expectedOrigin, origin);
    }
}
