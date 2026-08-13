namespace Admin.Api.Dtos;

public sealed record PackageInventoryDto(
    DateTimeOffset GeneratedAtUtc,
    bool WorkspaceAvailable,
    IReadOnlyList<PackageInventoryItemDto> Packages,
    IReadOnlyList<string> Diagnostics);

public sealed record PackageInventoryItemDto(
    string Ecosystem,
    string Name,
    string SourceVersion,
    string? PublishedVersion,
    IReadOnlyList<string> PublishedVersions,
    string? LatestTag,
    IReadOnlyList<string> Tags,
    string Repository,
    string Status,
    IReadOnlyList<PackageConsumerDto> Consumers);

public sealed record PackageInventoryVersionSummary(
    IReadOnlyList<string> PublishedVersions,
    string? LatestTag,
    IReadOnlyList<string> Tags);

public sealed record PackageConsumerDto(
    string Project,
    string RequestedVersion,
    bool IsCurrent);