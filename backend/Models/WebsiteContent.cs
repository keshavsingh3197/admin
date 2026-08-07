using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Admin.Api.Models;

/// <summary>
/// A block of JSON content served to a public site, addressed by site + key + <see cref="Locale"/>
/// (unique together). One row per language, so the same key can carry Hindi and English copy; a
/// public read that finds no row for the requested language walks the locale's fallback chain rather
/// than returning nothing.
/// </summary>
public sealed class WebsiteContent
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();

    public string SiteKey { get; set; } = string.Empty;
    public string ContentKey { get; set; } = string.Empty;

    /// <summary>BCP-47 code matching a registered <see cref="Locale.Code"/>.</summary>
    public string Locale { get; set; } = string.Empty;

    public string PayloadJson { get; set; } = "{}";
    public bool IsPublished { get; set; } = false;
    public int Version { get; set; } = 1;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
