using Admin.Api.Services;
using Xunit;

namespace Admin.Api.Tests;

public sealed class ChannelVideoServiceTests
{
    [Fact]
    public void NormalizeForStorage_CanonicalizesHandleTagsThumbnailAndFormat()
    {
        var doc = ChannelVideoService.NormalizeForStorage(new UpsertChannelVideoRequest(
            VideoId: "abc123XYZ",
            Title: "  Pappu at the Chai Stall  ",
            Url: "https://www.youtube.com/shorts/abc123XYZ",
            ChannelName: "Keshav Anim FF",
            ChannelHandle: "KESHAV-ANIM-FF",
            Niche: "Comedy 3D",
            Language: "hi",
            Format: "Vertical",
            SourceApp: "AnimStudio",
            AutomationSourceType: "FunnyComedy",
            DurationSeconds: 15,
            Views: 4200,
            ViewsPerSubscriber: 8.4,
            Tags: ["#Comedy", "comedy", "  ChaiStall  "]));

        Assert.Equal("vid:abc123XYZ", doc.Id);
        Assert.Equal("@KESHAV-ANIM-FF", doc.ChannelHandle);
        Assert.Equal("keshav-anim-ff", doc.ChannelKey);
        Assert.Equal("Short", doc.Format);
        Assert.Equal("hi", doc.Language);
        Assert.Equal("https://i.ytimg.com/vi/abc123XYZ/hqdefault.jpg", doc.ThumbnailUrl);
        Assert.Equal(["comedy", "chaistall"], doc.Tags);
        Assert.False(doc.IsRemoved);
    }

    [Fact]
    public void SearchInMemory_FiltersByQueryChannelLocaleFormatAndExcludesRemoved()
    {
        var v1 = ChannelVideoService.NormalizeForStorage(new UpsertChannelVideoRequest(
            VideoId: "v1",
            Title: "Chai Stall Comedy Skit",
            ChannelHandle: "@KESHAV-ANIM-FF",
            ChannelName: "Keshav Anim FF",
            Niche: "Comedy",
            Language: "hi",
            Format: "Short",
            Tags: ["funny", "chai"],
            Views: 5000));

        var v2 = ChannelVideoService.NormalizeForStorage(new UpsertChannelVideoRequest(
            VideoId: "v2",
            Title: "Bhakta Dhruva Complete Katha",
            ChannelHandle: "@OmkarShivBhakti",
            ChannelName: "Omkar Shiv Bhakti",
            Niche: "Devotional",
            Language: "hi",
            Format: "Video",
            Tags: ["dhruva", "katha"],
            Views: 1200));

        var v3 = ChannelVideoService.NormalizeForStorage(new UpsertChannelVideoRequest(
            VideoId: "v3",
            Title: "Deleted Short",
            ChannelHandle: "@KESHAV-ANIM-FF",
            Language: "hi",
            Format: "Short"));
        v3.IsRemoved = true;

        var res = ChannelVideoService.SearchInMemory(
            [v1, v2, v3],
            new ChannelVideoSearchQuery(Q: "Chai", Channel: "@KESHAV-ANIM-FF", Locale: "hi", Format: "Short"));

        Assert.Equal(1, res.Total);
        var only = Assert.Single(res.Items);
        Assert.Equal("v1", only.VideoId);
        Assert.Equal(2, res.Facets.Channels.Count);
    }
}
