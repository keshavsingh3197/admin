using Admin.Api.Dtos;
using Admin.Api.Models;
using MongoDB.Driver;

namespace Admin.Api.Services;

/// <summary>CRUD for user groups and their membership. Roles come from <see cref="CustomRole"/>.</summary>
public sealed class GroupService
{
    private readonly IMongoCollection<Group> _groups;

    public GroupService(MongoDbService db)
    {
        _groups = db.GetCollection<Group>("groups");
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

    public async Task<GroupView> CreateAsync(UpsertGroupRequest request, CancellationToken ct = default)
    {
        var entity = new Group
        {
            Name = request.Name.Trim(),
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
            RoleKeys = (request.RoleKeys ?? new()).Distinct().ToList(),
        };
        await _groups.InsertOneAsync(entity, cancellationToken: ct);
        return Map(entity);
    }

    public async Task<GroupView?> UpdateAsync(string id, UpsertGroupRequest request, CancellationToken ct = default)
    {
        var update = Builders<Group>.Update
            .Set(x => x.Name, request.Name.Trim())
            .Set(x => x.Description, string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim())
            .Set(x => x.RoleKeys, (request.RoleKeys ?? new()).Distinct().ToList())
            .Set(x => x.UpdatedAt, DateTime.UtcNow);

        var updated = await _groups.FindOneAndUpdateAsync(x => x.Id == id, update,
            new FindOneAndUpdateOptions<Group> { ReturnDocument = ReturnDocument.After }, ct);
        return updated is null ? null : Map(updated);
    }

    public Task DeleteAsync(string id, CancellationToken ct = default) =>
        _groups.DeleteOneAsync(x => x.Id == id, ct);

    public async Task<GroupView?> AddMemberAsync(string id, string userId, CancellationToken ct = default)
    {
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
        new(x.Id, x.Name, x.Description, x.RoleKeys, x.MemberUserIds, x.UpdatedAt);
}
