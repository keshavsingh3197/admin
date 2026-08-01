using System.Security.Cryptography;
using Admin.Api.Models;
using KeshavSingh.Storage;
using MongoDB.Driver;

namespace Admin.Api.Services;

/// <summary>
/// Per-user private file storage: metadata in the <c>files</c> Mongo collection, bytes in the
/// configured <see cref="IObjectStore"/>. Reads and deletes are always scoped by owner id;
/// callers pass <c>isAdmin</c> to allow an administrator to fetch another user's file.
/// </summary>
public class FileService
{
    private readonly IMongoCollection<UserFile> _files;
    private readonly IObjectStore _store;

    public FileService(MongoDbService mongoDbService, IObjectStore store)
    {
        _files = mongoDbService.GetCollection<UserFile>("files");
        _store = store;
    }

    public async Task<List<UserFile>> ListAsync(string ownerUserId) =>
        await _files.Find(f => f.OwnerUserId == ownerUserId)
            .SortByDescending(f => f.CreatedAt)
            .ToListAsync();

    /// <summary>
    /// Loads a file the caller is allowed to see: their own, or any file when <paramref name="isAdmin"/>.
    /// Returns <c>null</c> both when the file is missing and when it belongs to someone else — the
    /// caller maps that to 404 so it never confirms another user's file exists (anti-IDOR).
    /// </summary>
    public async Task<UserFile?> GetAccessibleAsync(string userId, string id, bool isAdmin)
    {
        var file = await _files.Find(f => f.Id == id).FirstOrDefaultAsync();
        if (file is null) return null;
        return (isAdmin || file.OwnerUserId == userId) ? file : null;
    }

    public async Task<UserFile> SaveAsync(string ownerUserId, Stream content, string fileName, string contentType, long size)
    {
        // Random key — never derived from the client filename, so nothing user-controlled hits the store.
        var key = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
        await _store.SaveAsync(key, content, contentType);

        var file = new UserFile
        {
            OwnerUserId = ownerUserId,
            FileName = fileName,
            StoredName = key,
            ContentType = contentType,
            Size = size,
        };
        await _files.InsertOneAsync(file);
        return file;
    }

    public Task<Stream?> OpenAsync(UserFile file) => _store.OpenAsync(file.StoredName);

    /// <summary>Deletes a file the caller owns (or any, if admin). Returns false if not found/allowed.</summary>
    public async Task<bool> DeleteAsync(string userId, string id, bool isAdmin)
    {
        var file = await GetAccessibleAsync(userId, id, isAdmin);
        if (file is null) return false;

        await _store.DeleteAsync(file.StoredName);
        await _files.DeleteOneAsync(f => f.Id == id);
        return true;
    }
}
