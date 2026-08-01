using System.Security.Cryptography;
using Admin.Api.Dtos;
using Admin.Api.Models;
using KeshavSingh.Storage;
using MongoDB.Driver;

namespace Admin.Api.Services;

/// <summary>
/// Documents: metadata in the <c>files</c> Mongo collection, bytes in the configured
/// <see cref="IObjectStore"/>. Access follows the containing folder (via <see cref="FolderService"/>):
/// a root document (no folder) is private to its owner; a document in a folder is readable by anyone
/// with Viewer+ on that folder and writable by Editor+ (or the document's own owner / an admin).
/// </summary>
public class FileService
{
    private readonly IMongoCollection<UserFile> _files;
    private readonly IObjectStore _store;
    private readonly FolderService _folders;

    public FileService(MongoDbService mongoDbService, IObjectStore store, FolderService folders)
    {
        _files = mongoDbService.GetCollection<UserFile>("files");
        _store = store;
        _folders = folders;
    }

    public async Task EnsureIndexesAsync(CancellationToken ct = default)
    {
        await _files.Indexes.CreateManyAsync(new[]
        {
            new CreateIndexModel<UserFile>(Builders<UserFile>.IndexKeys.Ascending(x => x.OwnerUserId)),
            new CreateIndexModel<UserFile>(Builders<UserFile>.IndexKeys.Ascending(x => x.FolderId)),
        }, ct);
    }

    /// <summary>Documents in a folder (root = the caller's own private, folder-less documents).</summary>
    public async Task<IReadOnlyList<UserFileDto>> ListDtosInFolderAsync(string? folderId, Caller caller, CancellationToken ct = default)
    {
        var list = folderId is null
            ? await _files.Find(f => f.OwnerUserId == caller.UserId && f.FolderId == null)
                .SortByDescending(f => f.CreatedAt).ToListAsync(ct)
            : await _files.Find(f => f.FolderId == folderId)
                .SortByDescending(f => f.CreatedAt).ToListAsync(ct);
        return list.Select(Map).ToList();
    }

    /// <summary>
    /// Saves a document into <paramref name="folderId"/> (null = the caller's private root). Returns null
    /// if the caller lacks Editor rights on the target folder.
    /// </summary>
    public async Task<UserFileDto?> SaveAsync(Caller caller, Stream content, string fileName, string contentType, long size, string? folderId, CancellationToken ct = default)
    {
        if (folderId is not null)
        {
            var access = await _folders.ResolveAccessByIdAsync(folderId, caller, ct);
            if (access < FolderAccess.Editor) return null;
        }

        var key = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
        await _store.SaveAsync(key, content, contentType, ct);

        var file = new UserFile
        {
            OwnerUserId = caller.UserId,
            FolderId = folderId,
            FileName = fileName,
            StoredName = key,
            ContentType = contentType,
            Size = size,
        };
        await _files.InsertOneAsync(file, cancellationToken: ct);
        return Map(file);
    }

    /// <summary>Loads a document the caller may read (Viewer+); null if missing or not permitted.</summary>
    public async Task<UserFile?> GetForReadAsync(string id, Caller caller, CancellationToken ct = default)
    {
        var file = await _files.Find(f => f.Id == id).FirstOrDefaultAsync(ct);
        if (file is null) return null;
        return await AccessAsync(file, caller, ct) >= FolderAccess.Viewer ? file : null;
    }

    public Task<Stream?> OpenAsync(UserFile file, CancellationToken ct = default) => _store.OpenAsync(file.StoredName, ct);

    /// <summary>Deletes a document the caller may edit (Editor+, its own owner, or admin).</summary>
    public async Task<bool> DeleteAsync(string id, Caller caller, CancellationToken ct = default)
    {
        var file = await _files.Find(f => f.Id == id).FirstOrDefaultAsync(ct);
        if (file is null || await AccessAsync(file, caller, ct) < FolderAccess.Editor) return false;

        await _store.DeleteAsync(file.StoredName, ct);
        await _files.DeleteOneAsync(f => f.Id == id, ct);
        return true;
    }

    /// <summary>Moves a document to another folder (Editor+ on both sides; root only to its own owner).</summary>
    public async Task<bool> MoveAsync(string id, string? targetFolderId, Caller caller, CancellationToken ct = default)
    {
        var file = await _files.Find(f => f.Id == id).FirstOrDefaultAsync(ct);
        if (file is null || await AccessAsync(file, caller, ct) < FolderAccess.Editor) return false;

        if (targetFolderId is null)
        {
            // Moving to the private root only makes sense for the document's owner (or an admin).
            if (!caller.IsAdmin && file.OwnerUserId != caller.UserId) return false;
        }
        else
        {
            if (await _folders.ResolveAccessByIdAsync(targetFolderId, caller, ct) < FolderAccess.Editor) return false;
        }

        await _files.UpdateOneAsync(f => f.Id == id, Builders<UserFile>.Update.Set(f => f.FolderId, targetFolderId), cancellationToken: ct);
        return true;
    }

    private async Task<FolderAccess> AccessAsync(UserFile file, Caller caller, CancellationToken ct)
    {
        if (caller.IsAdmin) return FolderAccess.Owner;
        if (file.OwnerUserId == caller.UserId) return FolderAccess.Owner;
        if (file.FolderId is null) return FolderAccess.None;                 // someone else's private root doc
        return await _folders.ResolveAccessByIdAsync(file.FolderId, caller, ct);
    }

    private static UserFileDto Map(UserFile f) =>
        new(f.Id!, f.FileName, f.ContentType, f.Size, f.CreatedAt, f.FolderId);
}
