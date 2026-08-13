namespace Admin.Api.Dtos;

public static class PackageInventoryState
{
    public const string TokenMissing = "token-missing";
    public const string RepoSelectionMissing = "repo-selection-missing";
    public const string PrivateRepoAccessDenied = "private-repo-access-denied";
    public const string ManifestNotFound = "manifest-not-found";
    public const string Ready = "ready";

    public static string Determine(bool workspaceAvailable, IReadOnlyList<string> diagnostics, int packageCount)
    {
        if (!workspaceAvailable)
            return TokenMissing;

        if (diagnostics.Any(x => x.Contains("No repositories are selected", StringComparison.OrdinalIgnoreCase)))
            return RepoSelectionMissing;

        if (diagnostics.Any(x =>
                x.Contains("Forbidden", StringComparison.OrdinalIgnoreCase) ||
                x.Contains("could not list files", StringComparison.OrdinalIgnoreCase) ||
                x.Contains("could not read repo info", StringComparison.OrdinalIgnoreCase) ||
                x.Contains("private repo", StringComparison.OrdinalIgnoreCase) ||
                x.Contains("access denied", StringComparison.OrdinalIgnoreCase)))
            return PrivateRepoAccessDenied;

        if (packageCount == 0)
            return ManifestNotFound;

        return Ready;
    }
}

public sealed record PackageInventoryDto(
    DateTimeOffset GeneratedAtUtc,
    bool WorkspaceAvailable,
    IReadOnlyList<PackageInventoryItemDto> Packages,
    IReadOnlyList<string> Diagnostics,
    string State);

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