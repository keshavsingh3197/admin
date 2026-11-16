using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Admin.Api.Models;

/// <summary>
/// Central catalog entry for published ecosystem videos stored in <c>AdminDb.channel_videos</c>.
/// Written directly by AnimStudio AI and SocialAnalytics (and editable by Admin) so every public site —
/// especially keshavsingh.in — can filter and search across all channels via <c>GET /api/videos/search</c>.
/// </summary>
public sealed class ChannelVideo
{
    [BsonId]
    [BsonRepresentation(BsonType.String)]
    public string Id { get; set; } = string.Empty;

    public string VideoId { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public string ThumbnailUrl { get; set; } = string.Empty;

    public string ChannelKey { get; set; } = string.Empty;
    public string ChannelName { get; set; } = string.Empty;
    public string ChannelHandle { get; set; } = string.Empty;
    public string Platform { get; set; } = "YouTube";

    public string Niche { get; set; } = string.Empty;
    public string Language { get; set; } = "hi";
    public string Format { get; set; } = "Short";
    public string SourceApp { get; set; } = "Admin";
    public string? AutomationSourceType { get; set; }

    public int DurationSeconds { get; set; }
    public long Views { get; set; }
    public double ViewsPerSubscriber { get; set; }
    public List<string> Tags { get; set; } = [];

    public DateTime PublishedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public bool IsRemoved { get; set; }
}
