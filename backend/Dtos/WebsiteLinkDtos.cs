namespace Admin.Api.Dtos;

public sealed record WebsiteLinkView(
    string Id,
    string Key,
    string Name,
    string Url,
    bool IsEnabled,
    int SortOrder,
    DateTime UpdatedAt,
    string Icon = "🌐",
    string Description = "",
    bool ShowInEcosystemBar = true,
    string DefaultLocale = "en",
    IReadOnlyList<string>? EnabledLocales = null,
    bool AllowVisitorLanguageSwitch = true,
    bool ShowLanguagePicker = true,
    bool ForceLocale = false
);

public sealed record UpsertWebsiteLinkRequest(
    string Key,
    string Name,
    string Url,
    bool IsEnabled,
    int SortOrder,
    string? Icon = null,
    string? Description = null,
    bool? ShowInEcosystemBar = null,
    string? DefaultLocale = null,
    List<string>? EnabledLocales = null,
    bool? AllowVisitorLanguageSwitch = null,
    bool? ShowLanguagePicker = null,
    bool? ForceLocale = null
);

public sealed record EcosystemWebsiteView(
    string Key,
    string Name,
    string Url,
    string Icon,
    string Description,
    int SortOrder,
    bool ShowInEcosystemBar,
    DateTime UpdatedAt,
    string DefaultLocale = "en",
    IReadOnlyList<string>? EnabledLocales = null,
    bool AllowVisitorLanguageSwitch = true,
    bool ShowLanguagePicker = true,
    bool ForceLocale = false
);
