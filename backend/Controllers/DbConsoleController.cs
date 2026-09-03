using Admin.Api.Dtos;
using Admin.Api.Services;
using KeshavSingh.Auth;
using KeshavSingh.Core;
using KeshavSingh.Mongo.NoSql;
using KeshavSingh.Mongo.NoSql.Console;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Admin.Api.Controllers;

/// <summary>
/// A query editor for this app's own MongoDB — the SQL-console equivalent, for looking at and fixing
/// data without a shell on the server.
///
/// It is the most powerful endpoint in the app, so: Admin only, and every request goes through the
/// KeshavSingh.Mongo.NoSql console guard, which allows finds and read-only aggregations, refuses
/// server-side JavaScript and stages that write collections out, and only ever edits or deletes one
/// document at a time, addressed by its <c>_id</c>. Secret fields (password hashes, tokens, keys) come
/// back redacted whatever collection they live in — and a query that merely REFERENCES one is refused
/// outright, because a pipeline can rename a field on the way out and redaction by output name alone
/// would not see it.
///
/// Queries are logged by user, collection and operation — never their filters or documents, which would
/// put the personal data being queried straight into the logs.
/// </summary>
[ApiController]
[Route("api/db-console")]
[Authorize(Roles = Roles.Admin)]
public sealed class DbConsoleController : ControllerBase
{
    private readonly MongoQueryConsole _console;
    private readonly MongoDbService _mongo;
    private readonly ILogger<DbConsoleController> _log;
    private readonly DatabaseBackupService _backups;
    private readonly long? _capacityBytes;

    public DbConsoleController(
        MongoQueryConsole console, MongoDbService mongo, DatabaseBackupService backups,
        IConfiguration configuration, ILogger<DbConsoleController> log)
    {
        _console = console;
        _mongo = mongo;
        _log = log;
        _backups = backups;
        _capacityBytes = long.TryParse(configuration["DatabaseOperations:CapacityBytes"], out var value) && value > 0
            ? value
            : null;
    }

    private string Me => User.GetUserId();

    /// <summary>What this console will allow, so the UI matches what the API actually does.</summary>
    [HttpGet("capabilities")]
    public ActionResult<DbConsoleCapabilities> Capabilities() => Ok(new DbConsoleCapabilities(
        _console.Options.AllowWrites,
        _console.Options.DefaultLimit,
        _console.Options.MaxLimit,
        _mongo.Database.DatabaseNamespace.DatabaseName));

    [HttpGet("collections")]
    public Task<ActionResult<IReadOnlyList<MongoCollectionSummary>>> Collections(CancellationToken ct) =>
        Run("list", "-", () => _console.ListCollectionsAsync(ct));

    [HttpGet("usage")]
    public async Task<ActionResult<DatabaseUsageDto>> Usage(CancellationToken ct)
    {
        var stats = await _mongo.Database.RunCommandAsync<BsonDocument>(new BsonDocument("dbStats", 1), cancellationToken: ct);
        static long N(BsonDocument d, string key) => d.TryGetValue(key, out var v) && v.IsNumeric ? v.ToInt64() : 0;
        using var cursor = await _mongo.Database.ListCollectionNamesAsync(cancellationToken: ct);
        var usage = new List<DatabaseCollectionUsageDto>();
        var names = new List<string>();
        while (await cursor.MoveNextAsync(ct)) names.AddRange(cursor.Current);
        foreach (var name in names)
        {
            if (name.StartsWith("system.", StringComparison.Ordinal)) continue;

            // $collStats (the aggregation stage), not the collStats command, which MongoDB
            // deprecated in 6.2. The stage nests its numbers under "storageStats".
            var pipeline = new[]
            {
                new BsonDocument("$collStats", new BsonDocument("storageStats", new BsonDocument())),
            };
            using var statsCursor = await _mongo.Database.GetCollection<BsonDocument>(name)
                .AggregateAsync<BsonDocument>(pipeline, cancellationToken: ct);
            var collStats = await statsCursor.FirstOrDefaultAsync(ct);
            var detail = collStats is not null && collStats.TryGetValue("storageStats", out var storage)
                ? storage.AsBsonDocument
                : new BsonDocument();

            usage.Add(new(name, N(detail, "count"), N(detail, "size"), N(detail, "storageSize"), N(detail, "totalIndexSize")));
        }
        var capacity = _capacityBytes;
        var used = N(stats, "storageSize") + N(stats, "indexSize");
        return Ok(new DatabaseUsageDto(_mongo.Database.DatabaseNamespace.DatabaseName, N(stats, "dataSize"), N(stats, "storageSize"), N(stats, "indexSize"), capacity, capacity is null ? null : Math.Max(0, capacity.Value - used), capacity is null ? null : Math.Round(Math.Min(100, used * 100d / capacity.Value), 1), usage.OrderByDescending(x => x.StorageBytes).ToList()));
    }

    [HttpGet("backups")]
    public async Task<ActionResult<IReadOnlyList<DatabaseBackupView>>> Backups(CancellationToken ct) => Ok(await _backups.ListAsync(ct));

    [HttpPost("backups")]
    public async Task<ActionResult<DatabaseBackupView>> CreateBackup(CancellationToken ct) => Ok(await _backups.CreateAsync(Me, ct));

    [HttpGet("collections/{collection}/indexes")]
    public Task<ActionResult<IReadOnlyList<string>>> Indexes(string collection, CancellationToken ct) =>
        Run("indexes", collection, () => _console.ListIndexesAsync(collection, ct));

    [HttpPost("find")]
    public Task<ActionResult<MongoConsolePage>> Find(DbFindRequest r, CancellationToken ct) =>
        Run("find", r.Collection, () => _console.FindAsync(
            r.Collection, r.Filter, r.Projection, r.Sort, r.Skip, r.Limit, ct));

    [HttpPost("count")]
    public Task<ActionResult<long>> Count(DbCountRequest r, CancellationToken ct) =>
        Run("count", r.Collection, () => _console.CountAsync(r.Collection, r.Filter, ct));

    [HttpPost("aggregate")]
    public Task<ActionResult<MongoConsolePage>> Aggregate(DbAggregateRequest r, CancellationToken ct) =>
        Run("aggregate", r.Collection, () => _console.AggregateAsync(r.Collection, r.Pipeline, r.Limit, ct));

    [HttpPost("distinct")]
    public Task<ActionResult<IReadOnlyList<string>>> Distinct(DbDistinctRequest r, CancellationToken ct) =>
        Run("distinct", r.Collection, () => _console.DistinctAsync(r.Collection, r.Field, r.Filter, ct));

    [HttpPost("insert-one")]
    public Task<ActionResult<MongoConsoleWriteResult>> InsertOne(DbInsertRequest r, CancellationToken ct) =>
        Run("insertOne", r.Collection, () => _console.InsertOneAsync(r.Collection, r.Document, ct));

    [HttpPost("update-one")]
    public Task<ActionResult<MongoConsoleWriteResult>> UpdateOne(DbUpdateRequest r, CancellationToken ct) =>
        Run("updateOne", r.Collection, () => _console.UpdateOneAsync(r.Collection, r.Id, r.Update, ct));

    [HttpPost("delete-one")]
    public Task<ActionResult<MongoConsoleWriteResult>> DeleteOne(DbDeleteRequest r, CancellationToken ct) =>
        Run("deleteOne", r.Collection, () => _console.DeleteOneAsync(r.Collection, r.Id, ct));

    /// <summary>
    /// Runs one console operation: audit line first, then the call, with a rejected request coming back
    /// as a 400 carrying the guard's own explanation (which is written for the person who typed it).
    /// </summary>
    private async Task<ActionResult<T>> Run<T>(string operation, string collection, Func<Task<T>> action)
    {
        _log.LogInformation(
            "DB console {Operation} on {Collection} by {UserId} from {Ip}",
            operation, collection, Me, HttpContext.Connection.RemoteIpAddress?.ToString());

        try
        {
            return Ok(await action());
        }
        catch (MongoConsoleException ex)
        {
            _log.LogWarning("DB console {Operation} on {Collection} rejected for {UserId}",
                operation, collection, Me);
            return BadRequest(new { error = ex.Message });
        }
        catch (MongoException ex)
        {
            // The driver's message can carry server internals, so it is logged, not returned.
            _log.LogError(ex, "DB console {Operation} on {Collection} failed for {UserId}",
                operation, collection, Me);
            return BadRequest(new { error = "The database could not run that query." });
        }
    }
}
