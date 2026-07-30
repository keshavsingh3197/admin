namespace Admin.Api.Dtos;

public sealed record WebsiteContentView(
    string Id,
    string SiteKey,
    string ContentKey,
    string PayloadJson,
    bool IsPublished,
    int Version,
    DateTime UpdatedAt
);

public sealed record UpsertWebsiteContentRequest(
    string SiteKey,
    string ContentKey,
    string PayloadJson,
    bool IsPublished
);

public sealed record PublicWebsiteContentView(
    string SiteKey,
    string ContentKey,
    string PayloadJson,
    int Version,
    DateTime UpdatedAt
);
