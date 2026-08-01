namespace Admin.Api.Dtos;

/// <summary>Status of a single diagnostic check. Status is "ok", "warning", or "error".</summary>
public sealed record HealthCheckDto(
    string Key,
    string Category,
    string Label,
    string Status,
    string Message,
    DateTime CheckedAtUtc
);

public sealed record HealthReportDto(
    IReadOnlyList<HealthCheckDto> Checks,
    int OkCount,
    int WarningCount,
    int ErrorCount,
    DateTime GeneratedAtUtc
);
