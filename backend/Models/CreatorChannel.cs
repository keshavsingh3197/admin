using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Admin.Api.Models;

/// <summary>
/// Central ecosystem creator / brand social channel (YouTube, Instagram, Facebook, GitHub, etc.).
/// Managed solely by Admins in admin.keshavsingh.in and distributed publicly via GET /api/config
/// and GET /api/config/channels so no consumer app hardcodes static channel names or links.
/// </summary>
public sealed class CreatorChannel
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();

    public string Key { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Handle { get; set; } = string.Empty;
    public string Platform { get; set; } = "YouTube";
    public string ChannelId { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public string Niche { get; set; } = string.Empty;
    public string Tagline { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string EngineName { get; set; } = string.Empty;
    public string VisualsCredit { get; set; } = string.Empty;
    public List<string> Hashtags { get; set; } = [];
    public List<string> Tags { get; set; } = [];
    public List<string> RetiredHandles { get; set; } = [];
    public List<string> RetiredUrls { get; set; } = [];
    public bool IsPrimary { get; set; }
    public bool IsEnabled { get; set; } = true;
    public bool ShowInAnalytics { get; set; } = true;
    public bool ShowInPanchang { get; set; }
    public bool ShowInStudio { get; set; }
    public bool ShowInFooter { get; set; } = true;
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
