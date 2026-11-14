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

    [Theory]
    [InlineData("blog", "Content Blog", "https://git.keshavsingh.in", true)]
    [InlineData("blog-admin", "Blog Admin", "https://blog-admin.keshavsingh.in", true)]
    [InlineData("admin", "Admin & SSO", "https://admin.keshavsingh.in", true)]
    [InlineData("ghar-ledger", "Ghar Ledger", "https://ghar.keshavsingh.in", true)]
    [InlineData("gharledger", "Ghar Ledger", "https://ghar-ledger.onrender.com", true)]
    [InlineData("studio", "AnimStudio AI", "https://studio.keshavsingh.in", false)]
    [InlineData("social", "Social Analytics", "https://social.keshavsingh.in", false)]
    [InlineData("panchang", "Hindu Panchang", "https://panchang.keshavsingh.in", false)]
    [InlineData("pratiyogita", "Pratiyogita", "https://pratiyogita.keshavsingh.in", false)]
    public void WebsiteRegistry_IdentifiesInternalAndHiddenSites(string key, string name, string url, bool expectedHidden)
    {
        Assert.Equal(expectedHidden, WebsiteRegistryService.IsInternalOrHiddenByDefaultWebsite(key, name, url));
    }

    [Fact]
    public void WebsiteRegistry_DeduplicatesEcosystemLinksByUrlAndName()
    {
        var list = new List<WebsiteLink>
        {
            new() { Key = "studio", Name = "AnimStudio AI", Url = "https://studio.keshavsingh.in/", SortOrder = 10, IsEnabled = true, ShowInEcosystemBar = true },
            new() { Key = "ghar-ledger", Name = "Ghar Ledger", Url = "https://ghar.keshavsingh.in", SortOrder = 25, IsEnabled = true, ShowInEcosystemBar = false },
            new() { Key = "gharledger-dup", Name = "Ghar Ledger", Url = "https://ghar.keshavsingh.in/", SortOrder = 99, IsEnabled = true, ShowInEcosystemBar = true },
            new() { Key = "panchang", Name = "Hindu Panchang", Url = "https://panchang.keshavsingh.in", SortOrder = 20, IsEnabled = true, ShowInEcosystemBar = true },
        };

        var projected = WebsiteRegistryService.ProjectEcosystemLinks(list);
        Assert.Equal(3, projected.Count);
        Assert.Equal(["studio", "panchang", "ghar-ledger"], projected.Select(x => x.Key).ToArray());
    }

    [Theory]
    [InlineData("keshavsinghworld", "@keshavsinghworld", "Keshav Singh World", true)]
    [InlineData("personal", "keshavsinghworld", "Keshav Singh", true)]
    [InlineData("omkarshivbhakti", "@OmkarShivBhakti", "Omkar Shiv Bhakti", false)]
    public void CreatorChannel_ExcludesPersonalChannelFromPanchangByDefault(string key, string handle, string name, bool expectedExcluded)
    {
        Assert.Equal(expectedExcluded, CreatorChannelService.IsExcludedFromPanchangByDefault(key, handle, name));
    }
}
