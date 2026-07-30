namespace Admin.Api.Dtos;

public sealed record WebsiteLinkView(
    string Id,
    string Key,
    string Name,
    string Url,
    bool IsEnabled,
    int SortOrder,
    DateTime UpdatedAt
);

public sealed record UpsertWebsiteLinkRequest(
    string Key,
    string Name,
    string Url,
    bool IsEnabled,
    int SortOrder
);
