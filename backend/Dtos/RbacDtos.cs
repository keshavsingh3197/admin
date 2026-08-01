namespace Admin.Api.Dtos;

// RBAC DTOs: custom roles, groups, permission catalog, effective access, and search results.

public sealed record PermissionCatalogItemDto(string Key, string Category, string Label, string Description);

public sealed record WebsiteAccessOptionDto(string Key, string Name);

public sealed record PermissionCatalogResponse(
    IReadOnlyList<PermissionCatalogItemDto> AdminPermissions,
    IReadOnlyList<PermissionCatalogItemDto> SiteActions,
    IReadOnlyList<WebsiteAccessOptionDto> Websites);

public sealed record WebsiteGrantDto(string WebsiteKey, IReadOnlyList<string> Permissions);

public sealed record CustomRoleView(
    string Id,
    string Key,
    string Name,
    string? Description,
    IReadOnlyList<WebsiteGrantDto> WebsiteGrants,
    bool IsSystem,
    DateTime UpdatedAt);

public sealed record UpsertCustomRoleRequest(
    string Key,
    string Name,
    string? Description,
    List<WebsiteGrantDto> WebsiteGrants);

public sealed record GroupView(
    string Id,
    string Name,
    string? Description,
    IReadOnlyList<string> RoleKeys,
    IReadOnlyList<string> MemberUserIds,
    DateTime UpdatedAt);

public sealed record UpsertGroupRequest(
    string Name,
    string? Description,
    List<string> RoleKeys);

public sealed record GroupMemberRequest(string UserId);

public sealed record SiteAccessDto(string WebsiteKey, IReadOnlyList<string> Permissions);

public sealed record EffectiveAccessDto(
    IReadOnlyList<string> AdminPermissions,
    IReadOnlyList<SiteAccessDto> SiteAccess,
    bool HasWildcardSiteAccess,
    IReadOnlyList<string> RoleKeys);

public sealed record SearchResultDto(string Type, string Id, string Title, string? Subtitle, string Route);

public sealed record SearchResponseDto(IReadOnlyList<SearchResultDto> Results);
