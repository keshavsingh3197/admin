using Admin.Api.Dtos;
using Admin.Api.Models;
using MongoDB.Driver;

namespace Admin.Api.Services;

/// <summary>CRUD for user groups and their membership. Roles come from <see cref="CustomRole"/>.</summary>
public sealed class GroupService
{
    private readonly IMongoCollection<Group> _groups;
    private readonly IMongoCollection<User> _users;
    private readonly CustomRoleService _roles;

    public GroupService(MongoDbService db, CustomRoleService roles)
    {
        _groups = db.GetCollection<Group>("groups");
        _users = db.GetCollection<User>("users");
        _roles = roles;
    }

    public async Task EnsureIndexesAsync(CancellationToken ct = default)
    {
        await _groups.Indexes.CreateOneAsync(new CreateIndexModel<Group>(
            Builders<Group>.IndexKeys.Ascending(x => x.MemberUserIds)),
            cancellationToken: ct);
    }

    public async Task<IReadOnlyList<GroupView>> ListAsync(CancellationToken ct = default)
    {
        var list = await _groups.Find(_ => true).SortBy(x => x.Name).ToListAsync(ct);
        return list.Select(Map).ToList();
    }

    public async Task<IReadOnlyList<Group>> ListForUserAsync(string userId, CancellationToken ct = default) =>
        await _groups.Find(x => x.MemberUserIds.Contains(userId)).ToListAsync(ct);

    /// <summary>
    /// Every other user who shares a family-circle group with <paramref name="userId"/> (used to
    /// resolve chat visibility set to "family" — see <see cref="Admin.Api.Services.AdminChatUserDirectory"/>).
    /// </summary>
    public async Task<HashSet<string>> FamilyMemberIdsAsync(string userId, CancellationToken ct = default)
    {
        var groups = await _groups.Find(x => x.IsFamilyCircle && x.MemberUserIds.Contains(userId)).ToListAsync(ct);
        var ids = new HashSet<string>(groups.SelectMany(g => g.MemberUserIds));
        ids.Remove(userId);
        return ids;
    }

    public async Task<GroupView> CreateAsync(UpsertGroupRequest request, CancellationToken ct = default)
    {
        var roleKeys = await ValidateAsync(request, ct);
        var entity = new Group
        {
            Name = request.Name.Trim(),
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
            RoleKeys = roleKeys,
            IsFamilyCircle = request.IsFamilyCircle,
        };
        await _groups.InsertOneAsync(entity, cancellationToken: ct);
        return Map(entity);
    }

    public async Task<GroupView?> UpdateAsync(string id, UpsertGroupRequest request, CancellationToken ct = default)
    {
        var roleKeys = await ValidateAsync(request, ct);
        var update = Builders<Group>.Update
            .Set(x => x.Name, request.Name.Trim())
            .Set(x => x.Description, string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim())
            .Set(x => x.RoleKeys, roleKeys)
            .Set(x => x.IsFamilyCircle, request.IsFamilyCircle)
            .Set(x => x.UpdatedAt, DateTime.UtcNow);

        var updated = await _groups.FindOneAndUpdateAsync(x => x.Id == id, update,
            new FindOneAndUpdateOptions<Group> { ReturnDocument = ReturnDocument.After }, ct);
        return updated is null ? null : Map(updated);
    }

    public Task DeleteAsync(string id, CancellationToken ct = default) =>
        _groups.DeleteOneAsync(x => x.Id == id, ct);

    public async Task<GroupView?> AddMemberAsync(string id, string userId, CancellationToken ct = default)
    {
        if (!await _users.Find(x => x.Id == userId && !x.IsDeleted).AnyAsync(ct))
            throw new ArgumentException("The selected user no longer exists.");
        var updated = await _groups.FindOneAndUpdateAsync(x => x.Id == id,
            Builders<Group>.Update.AddToSet(x => x.MemberUserIds, userId).Set(x => x.UpdatedAt, DateTime.UtcNow),
            new FindOneAndUpdateOptions<Group> { ReturnDocument = ReturnDocument.After }, ct);
        return updated is null ? null : Map(updated);
    }

    public async Task<GroupView?> RemoveMemberAsync(string id, string userId, CancellationToken ct = default)
    {
        var updated = await _groups.FindOneAndUpdateAsync(x => x.Id == id,
            Builders<Group>.Update.Pull(x => x.MemberUserIds, userId).Set(x => x.UpdatedAt, DateTime.UtcNow),
            new FindOneAndUpdateOptions<Group> { ReturnDocument = ReturnDocument.After }, ct);
        return updated is null ? null : Map(updated);
    }

    private static GroupView Map(Group x) =>
        new(x.Id, x.Name, x.Description, x.RoleKeys, x.MemberUserIds, x.IsFamilyCircle, x.UpdatedAt);

    private async Task<List<string>> ValidateAsync(UpsertGroupRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Name)) throw new ArgumentException("Group name is required.");
        var keys = (request.RoleKeys ?? new()).Where(k => !string.IsNullOrWhiteSpace(k))
            .Select(k => k.Trim().ToLowerInvariant()).Distinct(StringComparer.Ordinal).ToList();
        if (!await _roles.AllKeysExistAsync(keys, ct))
            throw new ArgumentException("One or more selected roles no longer exist. Refresh and try again.");
        return keys;
    }
}
