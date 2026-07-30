namespace Admin.Api.Dtos;

public sealed record WebsiteOptionDto(
    string Key,
    string Name,
    string Url
);

public sealed record WebsiteStatusDto(
    bool IsReachable,
    int? StatusCode,
    long? ResponseMs,
    DateTime CheckedAtUtc
);

public sealed record WebsiteMetricsDto(
    long TotalUsers,
    long ActiveUsers,
    long ActiveSessions,
    long TotalNotes,
    long SuccessfulLoginsLast24h,
    long FailedLoginsLast24h
);

public sealed record WebsiteDashboardDto(
    WebsiteOptionDto Website,
    WebsiteStatusDto Status,
    WebsiteMetricsDto Metrics
);
