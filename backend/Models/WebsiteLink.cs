using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Admin.Api.Models;

public sealed class WebsiteLink
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();

    public string Key { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public bool IsEnabled { get; set; } = true;
    public int SortOrder { get; set; }
    [BsonDefaultValue("")]
    public string Icon { get; set; } = string.Empty;
    [BsonDefaultValue("")]
    public string Description { get; set; } = string.Empty;
    [BsonDefaultValue(true)]
    public bool ShowInEcosystemBar { get; set; } = true;

    [BsonDefaultValue("en")]
    public string DefaultLocale { get; set; } = "en";
    public List<string> EnabledLocales { get; set; } = ["en", "hi"];
    [BsonDefaultValue(true)]
    public bool AllowVisitorLanguageSwitch { get; set; } = true;
    [BsonDefaultValue(true)]
    public bool ShowLanguagePicker { get; set; } = true;
    [BsonDefaultValue(false)]
    public bool ForceLocale { get; set; } = false;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
