using Admin.Api.Models;
using KeshavSingh.Auth.Abstractions;
using MongoDB.Driver;

namespace Admin.Api.Services;

public sealed record ApplicationMetricsDto(int UserCount, int RoleCount, int GroupCount, int ActiveSessionCount);

public sealed class ApplicationMetricsService
{
    private readonly IMongoCollection<User> _users;
    private readonly CustomRoleService _roles;
    private readonly GroupService _groups;
    private readonly IRefreshTokenStore _sessions;

    public ApplicationMetricsService(MongoDbService db, CustomRoleService roles, GroupService groups, IRefreshTokenStore sessions)
    {
        _users = db.GetCollection<User>("users");
        _roles = roles;
        _groups = groups;
        _sessions = sessions;
    }

    public async Task<ApplicationMetricsDto> GetAsync(string appKey, CancellationToken ct)
    {
        var roles = await _roles.ListAsync(ct);
        var applicableRoleKeys = roles
            .Where(role => role.WebsiteGrants.Any(grant =>
                grant.WebsiteKey.Equals(appKey, StringComparison.OrdinalIgnoreCase) ||
                grant.WebsiteKey == PermissionCatalog.AllWebsitesKey))
            .Select(role => role.Key)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var groups = (await _groups.ListAsync(ct))
            .Where(group => group.RoleKeys.Any(applicableRoleKeys.Contains))
            .ToList();
        var groupMembers = groups.SelectMany(group => group.MemberUserIds).ToHashSet();
        var activeUsers = await _users.Find(user => !user.IsDeleted && user.IsActive).ToListAsync(ct);
        var usersWithAccess = activeUsers.Where(user =>
            user.Roles.Contains(Roles.Admin) ||
            user.CustomRoleKeys.Any(applicableRoleKeys.Contains) ||
            groupMembers.Contains(user.Id!)).ToList();

        var sessionLists = await Task.WhenAll(usersWithAccess.Select(user =>
            _sessions.ListActiveAsync(user.Id!, appKey, ct)));

        return new ApplicationMetricsDto(
            usersWithAccess.Count,
            applicableRoleKeys.Count,
            groups.Count,
            sessionLists.Sum(items => items.Count));
    }
}