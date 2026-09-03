using System.Text.RegularExpressions;
using KeshavSingh.Core.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.IdentityModel.JsonWebTokens;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Admin.Api.Services;

/// <summary>
/// Administrative event names, alongside the authentication events in
/// <see cref="KeshavSingh.Auth.Abstractions.AuthEvents"/>. Both land in the same <c>audit</c>
/// collection so "who did what" is one timeline.
///
/// <para>Prefix is always <c>admin.</c> so a filter can separate operator actions from the sign-in
/// traffic that otherwise dominates the collection by volume.</para>
/// </summary>
public static class AdminAuditEvents
{
    public const string UserCreated = "admin.user.created";
    public const string UserUpdated = "admin.user.updated";
    public const string UserDeleted = "admin.user.deleted";
    public const string UserPasswordReset = "admin.user.password_reset";
    public const string RoleChanged = "admin.role.changed";
    public const string GroupChanged = "admin.group.changed";
    public const string GrantChanged = "admin.grant.changed";
    public const string SettingsChanged = "admin.settings.changed";
    public const string ConsoleWrite = "admin.console.write";
    public const string BackupCreated = "admin.backup.created";
    public const string RetentionPurge = "admin.retention.purge";
}

/// <summary>
/// Records and reads administrative actions.
///
/// <para>Two things made this worth building. Reading: the <c>audit</c> collection was written to
/// on every sign-in and read back by nothing except the analytics counters — after an incident
/// there was no way to answer "who changed this", which is precisely when you need to. Writing:
/// the actions most worth reconstructing afterwards — a role granted, a setting changed, a document
/// deleted from the console — were only going to <see cref="ILogger"/>, so they lived in Render's
/// rolling log buffer and nowhere durable.</para>
///
/// <para>Recording is deliberately best-effort: an audit write must never be the reason an
/// administrative action fails, so <see cref="RecordAsync"/> swallows its own errors. Note the
/// asymmetry with authentication auditing, which is allowed to fail a request — a failed login that
/// cannot be recorded is a security control that has stopped working, whereas a role grant that
/// cannot be recorded has still been correctly authorized and applied.</para>
///
/// <para>Nothing here may carry personal data or secrets beyond the acting/target identity the
/// event is inherently about — see <see cref="LoginAudit.Details"/>.</para>
/// </summary>
public sealed class AdminAuditService
{
    private readonly IMongoCollection<LoginAudit> _audit;
    private readonly IHttpContextAccessor _http;
    private readonly ILogger<AdminAuditService> _log;

    public AdminAuditService(MongoDbService db, IHttpContextAccessor http, ILogger<AdminAuditService> log)
    {
        _audit = db.GetCollection<LoginAudit>("audit");
        _http = http;
        _log = log;
    }

    /// <summary>
    /// Records one administrative action. Never throws.
    /// </summary>
    /// <param name="event">One of <see cref="AdminAuditEvents"/>.</param>
    /// <param name="target">What was acted on — an email, a settings section, a collection name.</param>
    /// <param name="details">A short summary of the change. No personal data, no secrets, no filters.</param>
    public async Task RecordAsync(
        string @event,
        string? target = null,
        string? details = null,
        bool success = true,
        CancellationToken ct = default)
    {
        try
        {
            var ctx = _http.HttpContext;
            await _audit.InsertOneAsync(new LoginAudit
            {
                Event = @event,
                Success = success,
                // The acting operator, resolved from the validated token — never from anything the
                // caller passed. Claim names are the raw JWT ones because the API sets
                // MapInboundClaims = false, so "sub"/"email" arrive verbatim rather than as ClaimTypes URIs.
                UserId = ctx?.User?.FindFirst(JwtRegisteredClaimNames.Sub)?.Value,
                Email = ctx?.User?.FindFirst(JwtRegisteredClaimNames.Email)?.Value ?? string.Empty,
                Target = Trim(target, 200),
                Details = Trim(details, 400),
                IpAddress = ctx?.Connection.RemoteIpAddress?.ToString(),
                UserAgent = Trim(ctx?.Request.Headers.UserAgent.ToString(), 300),
            }, cancellationToken: ct);
        }
        catch (Exception ex)
        {
            // Deliberate: see the class remarks. Logged so a silently broken audit trail is still
            // visible to whoever is watching the logs.
            _log.LogError(ex, "Failed to record audit event {Event}", @event);
        }
    }

    /// <summary>
    /// One page of the audit trail, newest first, with the filters the viewer offers.
    ///
    /// <para>Paged by skip/take rather than a cursor because the viewer is a small, indexed,
    /// human-driven screen — <c>ix_audit_timestamp</c> and <c>ix_audit_event_timestamp</c> cover
    /// the sort and the event filter.</para>
    /// </summary>
    public async Task<(IReadOnlyList<LoginAudit> Items, long Total)> QueryAsync(
        string? @event,
        string? search,
        bool? success,
        DateTime? from,
        DateTime? to,
        int skip,
        int take,
        CancellationToken ct = default)
    {
        var filter = BuildFilter(@event, search, success, from, to);

        var total = await _audit.CountDocumentsAsync(filter, cancellationToken: ct);
        var items = await _audit.Find(filter)
            .SortByDescending(x => x.Timestamp)
            .Skip(Math.Max(0, skip))
            .Limit(Math.Clamp(take, 1, 200))
            .ToListAsync(ct);

        return (items, total);
    }


    /// <summary>
    /// Translates the viewer's filters into one Mongo filter. Separated from the query so the
    /// escaping below can be tested without a database.
    /// </summary>
    internal static FilterDefinition<LoginAudit> BuildFilter(
        string? @event, string? search, bool? success, DateTime? from, DateTime? to)
    {
        var f = Builders<LoginAudit>.Filter;
        var filters = new List<FilterDefinition<LoginAudit>>();

        if (!string.IsNullOrWhiteSpace(@event))
        {
            // A trailing dot selects a whole family ("admin."); anything else is an exact event.
            filters.Add(@event.EndsWith('.')
                ? f.Regex(x => x.Event, new BsonRegularExpression("^" + Regex.Escape(@event)))
                : f.Eq(x => x.Event, @event));
        }

        if (success is { } wanted) filters.Add(f.Eq(x => x.Success, wanted));
        if (from is { } start) filters.Add(f.Gte(x => x.Timestamp, start));
        if (to is { } end) filters.Add(f.Lt(x => x.Timestamp, end));

        if (!string.IsNullOrWhiteSpace(search))
        {
            // ESCAPED. The search box is free text from the operator: an unescaped ".*" would widen
            // the query to everything, and an email containing "+" would silently match nothing.
            var pattern = new BsonRegularExpression(Regex.Escape(search.Trim()), "i");
            filters.Add(f.Or(
                f.Regex(x => x.Email, pattern),
                f.Regex(x => x.Target, pattern),
                f.Regex(x => x.IpAddress, pattern)));
        }

        return filters.Count > 0 ? f.And(filters) : f.Empty;
    }

    /// <summary>
    /// The event names actually present, so the viewer's filter offers what the data contains rather
    /// than every constant the code could theoretically write.
    /// </summary>
    public async Task<IReadOnlyList<string>> DistinctEventsAsync(CancellationToken ct = default)
    {
        var names = await _audit.DistinctAsync(x => x.Event, Builders<LoginAudit>.Filter.Empty, cancellationToken: ct);
        var list = await names.ToListAsync(ct);
        list.Sort(StringComparer.Ordinal);
        return list;
    }

    private static string? Trim(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        return trimmed.Length > max ? trimmed[..max] : trimmed;
    }
}
