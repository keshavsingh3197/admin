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
    string Repository,
    string Status,
    IReadOnlyList<PackageConsumerDto> Consumers);

public sealed record PackageConsumerDto(
    string Project,
    string RequestedVersion,
    bool IsCurrent);