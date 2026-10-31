using KeshavSingh.Auth.Abstractions;
using KeshavSingh.Core;
using KeshavSingh.Core.Models;
using MongoDB.Driver;

namespace Admin.Api.Services;

/// <summary>Persists auth audits using the shared schema, with no outbound notification dependency.</summary>
public sealed class AdminAuthAuditSink : IAuthAuditSink
{
    private readonly IMongoCollection<LoginAudit> _audit;
    private readonly IHttpContextAccessor _http;
    private readonly ILogger<AdminAuthAuditSink> _logger;

    public AdminAuthAuditSink(MongoDbService db, IHttpContextAccessor http, ILogger<AdminAuthAuditSink> logger)
    {
        _audit = db.GetCollection<LoginAudit>("audit");
        _http = http;
        _logger = logger;
    }

    public async Task EnsureIndexesAsync(CancellationToken ct = default)
    {
        await _audit.Indexes.CreateManyAsync(new[]
        {
            new CreateIndexModel<LoginAudit>(
                Builders<LoginAudit>.IndexKeys.Descending(x => x.Timestamp),
                new CreateIndexOptions { Name = "ix_audit_timestamp" }),
            new CreateIndexModel<LoginAudit>(
                Builders<LoginAudit>.IndexKeys.Ascending(x => x.UserId).Descending(x => x.Timestamp),
                new CreateIndexOptions { Name = "ix_audit_user_timestamp" }),
            new CreateIndexModel<LoginAudit>(
                Builders<LoginAudit>.IndexKeys.Ascending(x => x.Event).Descending(x => x.Timestamp),
                new CreateIndexOptions { Name = "ix_audit_event_timestamp" }),
        }, ct);
    }

    public async Task LogAsync(string @event, bool success, string email, string? userId = null)
    {
        var ctx = _http.HttpContext;
        var entry = new LoginAudit
        {
            Event = @event,
            Success = success,
            Email = email,
            UserId = userId,
            IpAddress = ctx?.Connection.RemoteIpAddress?.ToString(),
            UserAgent = ctx?.Request.Headers.UserAgent.ToString(),
        };

        try
        {
            await _audit.InsertOneAsync(entry);
        }
        catch (Exception ex)
        {
            // Preserve the shared sink's fail-open auditing behavior.
            _logger.LogError(ex, "Failed to persist audit event {Event}", @event);
        }

        _logger.LogInformation("AUDIT {Event} success={Success} user={UserId} ip={Ip}",
            @event, success, userId, entry.IpAddress);
    }
}
