namespace Admin.Api.Dtos;

public sealed record CreatorChannelView(
    string Id,
    string Key,
    string Name,
    string Handle,
    string Platform,
    string ChannelId,
    string Url,
    string Niche,
    string Tagline,
    string Description,
    string EngineName,
    string VisualsCredit,
    IReadOnlyList<string> Hashtags,
    IReadOnlyList<string> Tags,
    IReadOnlyList<string> RetiredHandles,
    IReadOnlyList<string> RetiredUrls,
    bool IsPrimary,
    bool IsEnabled,
    bool ShowInAnalytics,
    bool ShowInPanchang,
    bool ShowInStudio,
    bool ShowInFooter,
    int SortOrder,
    DateTime UpdatedAt
);

public sealed record CreatorChannelPublicView(
    string Key,
    string Name,
    string Handle,
    string Platform,
    string ChannelId,
    string Url,
    string Niche,
    string Tagline,
    string Description,
    string EngineName,
    string VisualsCredit,
    IReadOnlyList<string> Hashtags,
    IReadOnlyList<string> Tags,
    IReadOnlyList<string> RetiredHandles,
    IReadOnlyList<string> RetiredUrls,
    bool IsPrimary,
    bool ShowInAnalytics,
    bool ShowInPanchang,
    bool ShowInStudio,
    bool ShowInFooter,
    int SortOrder,
    DateTime UpdatedAt
);

public sealed record UpsertCreatorChannelRequest(
    string Key,
    string Name,
    string Handle,
    string Platform,
    string? ChannelId,
    string Url,
    string? Niche,
    string? Tagline,
    string? Description,
    string? EngineName,
    string? VisualsCredit,
    IReadOnlyList<string>? Hashtags,
    IReadOnlyList<string>? Tags,
    IReadOnlyList<string>? RetiredHandles,
    IReadOnlyList<string>? RetiredUrls,
    bool IsPrimary,
    bool IsEnabled,
    bool ShowInAnalytics,
    bool ShowInPanchang,
    bool ShowInStudio,
    bool ShowInFooter,
    int SortOrder
);

public sealed record ResolveYouTubeChannelRequest(string HandleOrUrl);

public sealed record ResolvedYouTubeChannelResponse(
    string ChannelId,
    string Title,
    string Handle,
    string Url,
    string Description,
    string FeedUrl
);
