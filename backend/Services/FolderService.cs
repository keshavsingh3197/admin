using Admin.Api.Dtos;
using Admin.Api.Models;
using KeshavSingh.Storage;
using MongoDB.Driver;

namespace Admin.Api.Services;

/// <summary>The identity + resolved group membership of the caller, built once per request.</summary>
public sealed record Caller(string UserId, IReadOnlySet<string> GroupIds, bool IsAdmin);

/// <summary>
/// Folders and their sharing/access rules. Access is resolved by walking a folder's ancestor chain:
/// a caller has access if they are an admin, own any folder in the chain, or match a share
/// (their user id, or a group they belong to) on any ancestor — shares cascade downward. Denials are
/// surfaced by the controllers as 404 (never 403) so the API never confirms another user's folder exists.
/// </summary>
public sealed class FolderService
{
    private const int MaxDepth = 32;   // ancestor-walk cap — also kills any accidental cycle.
    private const int MaxNameLength = 100;

    private readonly IMongoCollection<Folder> _folders;
    private readonly IMongoCollection<UserFile> _files;
    private readonly IMongoCollection<User> _users;
    private readonly IMongoCollection<Group> _groups;
    private readonly GroupService _groupService;
    private readonly IObjectStore _store;

    public FolderService(MongoDbService db, GroupService groupService, IObjectStore store)
    {
        _folders = db.GetCollection<Folder>("folders");
        _files = db.GetCollection<UserFile>("files");
        _users = db.GetCollection<User>("users");
        _groups = db.GetCollection<Group>("groups");
        _groupService = groupService;
        _store = store;
    }

    public async Task EnsureIndexesAsync(CancellationToken ct = default)
    {
        await _folders.Indexes.CreateManyAsync(new[]
        {
            new CreateIndexModel<Folder>(Builders<Folder>.IndexKeys.Ascending(x => x.OwnerUserId)),
            new CreateIndexModel<Folder>(Builders<Folder>.IndexKeys.Ascending(x => x.ParentId)),
            new CreateIndexModel<Folder>(Builders<Folder>.IndexKeys.Ascending("shares.subjectId")),
        }, ct);
    }

    /// <summary>Resolves the caller's group membership once so access checks don't re-query per folder.</summary>
    public async Task<Caller> BuildCallerAsync(string userId, bool isAdmin, CancellationToken ct = default)
    {
        var groups = await _groupService.ListForUserAsync(userId, ct);
        var ids = groups.Where(g => g.Id is not null).Select(g => g.Id!).ToHashSet();
        return new Caller(userId, ids, isAdmin);
    }

    public Task<Folder?> GetAsync(string id, CancellationToken ct = default) =>
        _folders.Find(f => f.Id == id).FirstOrDefaultAsync(ct)!;

    /// <summary>Walks the folder + ancestors, returning the highest access the caller has.</summary>
    public async Task<FolderAccess> ResolveAccessAsync(Folder folder, Caller caller, CancellationToken ct = default)
    {
        if (caller.IsAdmin) return FolderAccess.Owner;

        var best = FolderAccess.None;
        var current = folder;
        var depth = 0;
        while (current is not null && depth++ < MaxDepth)
        {
            if (current.OwnerUserId == caller.UserId) return FolderAccess.Owner;
            foreach (var share in current.Shares)
            {
                var matches = (share.SubjectType == ShareSubjectType.User && share.SubjectId == caller.UserId)
                           || (share.SubjectType == ShareSubjectType.Group && caller.GroupIds.Contains(share.SubjectId));
                if (matches)
                {
                    var lvl = FolderShareLevel.ToAccess(share.Level);
                    if (lvl > best) best = lvl;
                }
            }
            if (current.ParentId is null) break;
            current = await _folders.Find(f => f.Id == current.ParentId).FirstOrDefaultAsync(ct);
        }
        return best;
    }

    /// <summary>Access to a folder by id (loads it first). None if the folder is missing.</summary>
    public async Task<FolderAccess> ResolveAccessByIdAsync(string folderId, Caller caller, CancellationToken ct = default)
    {
        var folder = await _folders.Find(f => f.Id == folderId).FirstOrDefaultAsync(ct);
        return folder is null ? FolderAccess.None : await ResolveAccessAsync(folder, caller, ct);
    }

    public async Task<(Folder? Folder, FolderAccess Access)> GetWithAccessAsync(string id, Caller caller, CancellationToken ct = default)
    {
        var folder = await _folders.Find(f => f.Id == id).FirstOrDefaultAsync(ct);
        if (folder is null) return (null, FolderAccess.None);
        return (folder, await ResolveAccessAsync(folder, caller, ct));
    }

    /// <summary>Child folders of a parent (root = the caller's own top-level folders).</summary>
    public async Task<IReadOnlyList<FolderDto>> ListChildFoldersAsync(string? parentId, Caller caller, CancellationToken ct = default)
    {
        var list = parentId is null
            ? await _folders.Find(f => f.OwnerUserId == caller.UserId && f.ParentId == null).SortBy(f => f.Name).ToListAsync(ct)
            : await _folders.Find(f => f.ParentId == parentId).SortBy(f => f.Name).ToListAsync(ct);
        return list.Select(Map).ToList();
    }

    /// <summary>Top-most folders shared with the caller (directly or via a group), excluding their own.</summary>
    public async Task<IReadOnlyList<FolderDto>> ListSharedRootsAsync(Caller caller, CancellationToken ct = default)
    {
        var subjectIds = new HashSet<string>(caller.GroupIds) { caller.UserId };
        var filter = Builders<Folder>.Filter.And(
            Builders<Folder>.Filter.ElemMatch(f => f.Shares, s => subjectIds.Contains(s.SubjectId)),
            Builders<Folder>.Filter.Ne(f => f.OwnerUserId, caller.UserId));
        var list = await _folders.Find(filter).SortBy(f => f.Name).ToListAsync(ct);
        return list.Select(Map).ToList();
    }

    /// <summary>Root-first breadcrumb from the tree root down to (and including) the given folder.</summary>
    public async Task<IReadOnlyList<BreadcrumbItem>> BuildBreadcrumbAsync(Folder folder, CancellationToken ct = default)
    {
        var chain = new List<BreadcrumbItem>();
        var current = folder;
        var depth = 0;
        while (current is not null && depth++ < MaxDepth)
        {
            chain.Add(new BreadcrumbItem(current.Id!, current.Name));
            if (current.ParentId is null) break;
            current = await _folders.Find(f => f.Id == current.ParentId).FirstOrDefaultAsync(ct);
        }
        chain.Reverse();
        return chain;
    }

    public async Task<FolderDto?> CreateAsync(CreateFolderRequest req, Caller caller, CancellationToken ct = default)
    {
        var name = SanitizeName(req.Name);

        string ownerUserId = caller.UserId;
        if (req.ParentId is not null)
        {
            var (parent, access) = await GetWithAccessAsync(req.ParentId, caller, ct);
            if (parent is null || access < FolderAccess.Editor) return null;   // controller → 404
            ownerUserId = parent.OwnerUserId;                                  // one owner per tree
        }

        var folder = new Folder { OwnerUserId = ownerUserId, Name = name, ParentId = req.ParentId };
        await _folders.InsertOneAsync(folder, cancellationToken: ct);
        return Map(folder);
    }

    public async Task<bool> RenameAsync(string id, string name, Caller caller, CancellationToken ct = default)
    {
        var (folder, access) = await GetWithAccessAsync(id, caller, ct);
        if (folder is null || access < FolderAccess.Editor) return false;

        await _folders.UpdateOneAsync(f => f.Id == id,
            Builders<Folder>.Update.Set(f => f.Name, SanitizeName(name)).Set(f => f.UpdatedAt, DateTime.UtcNow), cancellationToken: ct);
        return true;
    }

    /// <summary>Deletes a folder and its whole subtree — folders, documents, and their blobs. Owner/admin only.</summary>
    public async Task<bool> DeleteRecursiveAsync(string id, Caller caller, CancellationToken ct = default)
    {
        var (folder, access) = await GetWithAccessAsync(id, caller, ct);
        if (folder is null || access < FolderAccess.Owner) return false;

        // Breadth-first collect the folder and all descendants.
        var folderIds = new List<string> { id };
        var frontier = new Queue<string>();
        frontier.Enqueue(id);
        var guard = 0;
        while (frontier.Count > 0 && guard++ < 100_000)
        {
            var parent = frontier.Dequeue();
            var children = await _folders.Find(f => f.ParentId == parent).Project(f => f.Id!).ToListAsync(ct);
            foreach (var childId in children) { folderIds.Add(childId); frontier.Enqueue(childId); }
        }

        // Remove the blob for every document in those folders, then the docs, then the folders.
        var docs = await _files.Find(f => folderIds.Contains(f.FolderId!)).ToListAsync(ct);
        foreach (var doc in docs)
            await _store.DeleteAsync(doc.StoredName, ct);
        await _files.DeleteManyAsync(f => folderIds.Contains(f.FolderId!), ct);
        await _folders.DeleteManyAsync(f => folderIds.Contains(f.Id!), ct);
        return true;
    }

    // ---- Sharing (owner-only; the controller checks access == Owner before calling these) ----

    public async Task<IReadOnlyList<FolderShareDto>> ListSharesAsync(Folder folder, CancellationToken ct = default)
    {
        var result = new List<FolderShareDto>(folder.Shares.Count);
        foreach (var s in folder.Shares)
            result.Add(new FolderShareDto(s.SubjectType, s.SubjectId, await ResolveSubjectNameAsync(s, ct), s.Level));
        return result;
    }

    /// <summary>Adds or updates a share. Returns false on invalid subject/level (controller → 400/404).</summary>
    public async Task<bool> AddShareAsync(Folder folder, ShareRequest req, CancellationToken ct = default)
    {
        if (!ShareSubjectType.IsValid(req.SubjectType) || !FolderShareLevel.IsValid(req.Level)) return false;
        if (string.IsNullOrWhiteSpace(req.SubjectId)) return false;
        if (req.SubjectType == ShareSubjectType.User && req.SubjectId == folder.OwnerUserId) return false; // no self-share

        var exists = req.SubjectType == ShareSubjectType.User
            ? await _users.Find(u => u.Id == req.SubjectId && !u.IsDeleted).AnyAsync(ct)
            : await _groups.Find(g => g.Id == req.SubjectId).AnyAsync(ct);
        if (!exists) return false;

        // Replace any existing share for the same subject, then add the new one (idempotent upsert).
        await _folders.UpdateOneAsync(f => f.Id == folder.Id,
            Builders<Folder>.Update.PullFilter(f => f.Shares,
                s => s.SubjectType == req.SubjectType && s.SubjectId == req.SubjectId), cancellationToken: ct);
        await _folders.UpdateOneAsync(f => f.Id == folder.Id,
            Builders<Folder>.Update
                .Push(f => f.Shares, new FolderShare { SubjectType = req.SubjectType, SubjectId = req.SubjectId, Level = req.Level })
                .Set(f => f.UpdatedAt, DateTime.UtcNow), cancellationToken: ct);
        return true;
    }

    public async Task RemoveShareAsync(Folder folder, string subjectType, string subjectId, CancellationToken ct = default)
    {
        await _folders.UpdateOneAsync(f => f.Id == folder.Id,
            Builders<Folder>.Update
                .PullFilter(f => f.Shares, s => s.SubjectType == subjectType && s.SubjectId == subjectId)
                .Set(f => f.UpdatedAt, DateTime.UtcNow), cancellationToken: ct);
    }

    private async Task<string> ResolveSubjectNameAsync(FolderShare s, CancellationToken ct)
    {
        if (s.SubjectType == ShareSubjectType.Group)
        {
            var g = await _groups.Find(x => x.Id == s.SubjectId).FirstOrDefaultAsync(ct);
            return g?.Name ?? "(unknown group)";
        }
        var u = await _users.Find(x => x.Id == s.SubjectId).FirstOrDefaultAsync(ct);
        return u is null ? "(unknown user)" : (string.IsNullOrWhiteSpace(u.DisplayName) ? u.Email : u.DisplayName);
    }

    private static FolderDto Map(Folder f) => new(f.Id!, f.Name, f.ParentId, f.Shares.Count, f.CreatedAt);

    private static string SanitizeName(string name)
    {
        var trimmed = (name ?? string.Empty).Trim();
        if (trimmed.Length == 0) throw new ArgumentException("Folder name cannot be empty.");
        // Display-only value (never used as a path), but strip separators/control chars to keep it tidy.
        trimmed = new string(trimmed.Where(c => c != '/' && c != '\\' && !char.IsControl(c)).ToArray()).Trim();
        if (trimmed.Length == 0) throw new ArgumentException("Folder name is invalid.");
        return trimmed.Length > MaxNameLength ? trimmed[..MaxNameLength] : trimmed;
    }
}
