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
    bool ShowInEcosystemBar = true
);

public sealed record UpsertWebsiteLinkRequest(
    string Key,
    string Name,
    string Url,
    bool IsEnabled,
    int SortOrder,
    string? Icon = null,
    string? Description = null,
    bool? ShowInEcosystemBar = null
);

public sealed record EcosystemWebsiteView(
    string Key,
    string Name,
    string Url,
    string Icon,
    string Description,
    int SortOrder,
    bool ShowInEcosystemBar,
    DateTime UpdatedAt
);
