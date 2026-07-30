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
    long FailedLoginsLast24h,
    long VisitsLast24h,
    long UniqueVisitorsLast24h
);

public sealed record CountryMetricDto(
    string Country,
    long Visits
);

public sealed record PageMetricDto(
    string Path,
    long Visits
);

public sealed record VisitDetailDto(
    string Path,
    string Country,
    string? Referrer,
    DateTime Timestamp,
    string VisitorKey
);

public sealed record WebsiteDetailsDto(
    IReadOnlyList<CountryMetricDto> TopCountries,
    IReadOnlyList<PageMetricDto> TopPages,
    IReadOnlyList<VisitDetailDto> RecentVisits
);

public sealed record WebsiteDashboardDto(
    WebsiteOptionDto Website,
    WebsiteStatusDto Status,
    WebsiteMetricsDto Metrics,
    WebsiteDetailsDto Details
);

public sealed record TrackVisitRequest(
    string WebsiteKey,
    string? Path,
    string? Referrer
);
