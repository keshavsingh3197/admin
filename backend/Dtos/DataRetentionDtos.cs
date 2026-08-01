namespace Admin.Api.Dtos;

/// <summary>A purgeable time-series data domain (login audit logs, analytics visits, ...).</summary>
public sealed record DataDomainOverviewDto(
    string Key,
    string Label,
    string Description,
    long TotalCount,
    DateTime? OldestUtc,
    DateTime? NewestUtc,
    int RetentionDays);

/// <summary>Deletes every record in [FromUtc, ToUtc] for the given domain key.</summary>
public sealed record PurgeRangeRequest(string Domain, DateTime FromUtc, DateTime ToUtc);

public sealed record PurgeResultDto(long DeletedCount);
