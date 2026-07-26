using Admin.Api.Models;
using Admin.Api.Services;
using KeshavSingh.Auth.Abstractions;
using MongoDB.Driver;

namespace Admin.Api.Auth;

/// <summary>
/// Records security events with request context (IP, user-agent), excluding passwords,
/// tokens, and other personal data. Serves as the auth engine's <see cref="IAuthAuditSink"/>.
/// </summary>
public sealed class AuditLogger : IAuthAuditSink
{
    private readonly IMongoCollection<LoginAudit> _audit;
    private readonly IHttpContextAccessor _http;
    private readonly ILogger<AuditLogger> _logger;

    public AuditLogger(MongoDbService db, IHttpContextAccessor http, ILogger<AuditLogger> logger)
    {
        _audit = db.GetCollection<LoginAudit>("audit");
        _http = http;
        _logger = logger;
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
            // Auditing must never break the request path, but the failure itself is notable.
            _logger.LogError(ex, "Failed to persist audit event {Event}", @event);
        }

        _logger.LogInformation("AUDIT {Event} success={Success} user={UserId} ip={Ip}",
            @event, success, userId, entry.IpAddress);
    }
}
