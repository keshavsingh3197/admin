using System.IO.Compression;
using System.Text;
using Admin.Api.Dtos;
using Admin.Api.Models;
using KeshavSingh.Security;
using KeshavSingh.Storage;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Admin.Api.Services;

/// <summary>Encrypted logical Mongo exports stored through the active Local/R2 object store.</summary>
public sealed class DatabaseBackupService
{
    private readonly MongoDbService _db; private readonly IObjectStore _store; private readonly DataProtector _protector;
    private readonly IMongoCollection<DatabaseBackup> _backups;
    public DatabaseBackupService(MongoDbService db, IObjectStore store, DataProtector protector)
    { _db = db; _store = store; _protector = protector; _backups = db.GetCollection<DatabaseBackup>("database_backups"); }
    public async Task<IReadOnlyList<DatabaseBackupView>> ListAsync(CancellationToken ct) =>
        (await _backups.Find(_ => true).SortByDescending(x => x.CreatedAt).ToListAsync(ct)).Select(Map).ToList();
    public async Task<DatabaseBackupView> CreateAsync(string userId, CancellationToken ct)
    {
        var snapshot = new BsonDocument { ["database"] = _db.Database.DatabaseNamespace.DatabaseName, ["createdAt"] = DateTime.UtcNow, ["collections"] = new BsonDocument() };
        using var namesCursor = await _db.Database.ListCollectionNamesAsync(cancellationToken: ct);
        var names = new List<string>(); while (await namesCursor.MoveNextAsync(ct)) names.AddRange(namesCursor.Current);
        foreach (var name in names.Where(n => !n.StartsWith("system.", StringComparison.Ordinal)))
        {
            var docs = await _db.Database.GetCollection<BsonDocument>(name).Find(FilterDefinition<BsonDocument>.Empty).ToListAsync(ct);
            snapshot["collections"].AsBsonDocument[name] = new BsonArray(docs);
        }
        await using var raw = new MemoryStream();
        await using (var gzip = new GZipStream(raw, CompressionLevel.SmallestSize, true))
            await gzip.WriteAsync(Encoding.UTF8.GetBytes(snapshot.ToJson()), ct);
        var encrypted = Encoding.UTF8.GetBytes(_protector.Encrypt(Convert.ToBase64String(raw.ToArray())));
        var entity = new DatabaseBackup { StorageKey = $"database-backups/{DateTime.UtcNow:yyyy/MM}/{Guid.NewGuid():N}.ksbackup", FileName = $"mongo-{DateTime.UtcNow:yyyyMMdd-HHmmss}.ksbackup", SizeBytes = encrypted.Length, CreatedByUserId = userId };
        await using var body = new MemoryStream(encrypted); await _store.SaveAsync(entity.StorageKey, body, "application/octet-stream", ct);
        await _backups.InsertOneAsync(entity, cancellationToken: ct); return Map(entity);
    }
    private static DatabaseBackupView Map(DatabaseBackup x) => new(x.Id, x.FileName, x.SizeBytes, x.CreatedAt, x.CreatedByUserId);
}
