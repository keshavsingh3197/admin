using System.Linq.Expressions;
using Admin.Api.Dtos;
using Admin.Api.Models;
using MongoDB.Driver;

namespace Admin.Api.Services;

/// <summary>
/// Lets an Admin inspect and manually purge time-series collections (login audit logs, website
/// analytics visits) — either a specific date range or "everything past the configured retention
/// window" on demand — on top of the automatic cleanup already run by
/// <see cref="SessionRetentionCleanupWorker"/>.
/// </summary>
public sealed class DataRetentionService
{
    public const string LoginLogsDomain = "loginLogs";
    public const string AnalyticsDomain = "analyticsVisits";
    public const string AdminActionsDomain = "adminActions";

    /// <summary>
    /// Authentication events and administrative events share the <c>audit</c> collection — one
    /// timeline is the point — but they must NOT share a retention window. Sign-in traffic is
    /// high-volume and stops being useful quickly; "who granted themselves Admin" is low-volume and
    /// is the row you come back for. Purging the whole collection on the sign-in clock would quietly
    /// delete the administrative trail along with the noise, so every purge here is scoped by
    /// whether the event name is in the "admin." family.
    /// </summary>
    private const string AdminEventPrefix = "admin.";

    private readonly IMongoCollection<LoginAudit> _audit;
    private readonly IMongoCollection<WebsiteVisit> _visits;
    private readonly SettingsService _settings;

    public DataRetentionService(MongoDbService db, SettingsService settings)
    {
        _audit = db.GetCollection<LoginAudit>("audit");
        _visits = db.GetCollection<WebsiteVisit>("website_visits");
        _settings = settings;
    }

    public async Task<IReadOnlyList<DataDomainOverviewDto>> GetOverviewAsync(CancellationToken ct = default)
    {
        var auditOverview = await BuildOverviewAsync(
            _audit, x => x.Timestamp, LoginLogsDomain, "Login audit logs",
            "Sign-in/out attempts, password and 2FA events.", _settings.LoginAuditRetentionDays, ct,
            scope: NotAdminEvents);

        var adminOverview = await BuildOverviewAsync(
            _audit, x => x.Timestamp, AdminActionsDomain, "Administrative audit trail",
            "Role grants, settings changes, user lifecycle and database console writes.",
            _settings.AdminAuditRetentionDays, ct,
            scope: AdminEvents);

        var visitsOverview = await BuildOverviewAsync(
            _visits, x => x.Timestamp, AnalyticsDomain, "Website analytics visits",
            "Per-visit page/country/referrer records behind the Analytics dashboard.", _settings.AnalyticsRetentionDays, ct);

        return new[] { auditOverview, adminOverview, visitsOverview };
    }

    /// <summary>Deletes every record with a timestamp in [fromUtc, toUtc] for the given domain.</summary>
    public Task<long> PurgeRangeAsync(string domain, DateTime fromUtc, DateTime toUtc, CancellationToken ct = default)
    {
        if (toUtc < fromUtc) throw new ArgumentException("The end date must be on or after the start date.");
        // Purges are bounded to the past — never clear time that hasn't elapsed yet.
        var to = toUtc > DateTime.UtcNow ? DateTime.UtcNow : toUtc;

        return domain switch
        {
            LoginLogsDomain => DeleteAsync(_audit,
                x => x.Timestamp >= fromUtc && x.Timestamp <= to && !x.Event.StartsWith(AdminEventPrefix), ct),
            AdminActionsDomain => DeleteAsync(_audit,
                x => x.Timestamp >= fromUtc && x.Timestamp <= to && x.Event.StartsWith(AdminEventPrefix), ct),
            AnalyticsDomain => DeleteAsync(_visits, x => x.Timestamp >= fromUtc && x.Timestamp <= to, ct),
            _ => throw new ArgumentException($"Unknown data domain '{domain}'."),
        };
    }

    /// <summary>Applies the configured retention window immediately (the same rule the background worker uses).</summary>
    public Task<long> PurgeExpiredAsync(string domain, CancellationToken ct = default)
    {
        return domain switch
        {
            LoginLogsDomain => DeleteAsync(_audit,
                x => x.Timestamp < DateTime.UtcNow.AddDays(-_settings.LoginAuditRetentionDays)
                     && !x.Event.StartsWith(AdminEventPrefix), ct),
            AdminActionsDomain => DeleteAsync(_audit,
                x => x.Timestamp < DateTime.UtcNow.AddDays(-_settings.AdminAuditRetentionDays)
                     && x.Event.StartsWith(AdminEventPrefix), ct),
            AnalyticsDomain => DeleteAsync(_visits, x => x.Timestamp < DateTime.UtcNow.AddDays(-_settings.AnalyticsRetentionDays), ct),
            _ => throw new ArgumentException($"Unknown data domain '{domain}'."),
        };
    }

    private static async Task<long> DeleteAsync<T>(IMongoCollection<T> collection, Expression<Func<T, bool>> filter, CancellationToken ct)
        => (await collection.DeleteManyAsync(filter, ct)).DeletedCount;

    /// <summary>Both halves of the audit split, as filters the overview and the purges share.</summary>
    private static readonly Expression<Func<LoginAudit, bool>> AdminEvents =
        x => x.Event.StartsWith(AdminEventPrefix);
    private static readonly Expression<Func<LoginAudit, bool>> NotAdminEvents =
        x => !x.Event.StartsWith(AdminEventPrefix);

    private static async Task<DataDomainOverviewDto> BuildOverviewAsync<T>(
        IMongoCollection<T> collection,
        Expression<Func<T, DateTime>> timestamp,
        string key, string label, string description, int retentionDays, CancellationToken ct,
        Expression<Func<T, bool>>? scope = null)
        where T : class
    {
        Expression<Func<T, object>> sortField = Expression.Lambda<Func<T, object>>(
            Expression.Convert(timestamp.Body, typeof(object)), timestamp.Parameters);

        // Two domains can share a collection (the audit split), so the overview counts only the
        // rows its own purge would actually delete — otherwise both would report the same totals
        // and an operator could not tell what a purge was about to remove.
        var filter = scope is null ? FilterDefinition<T>.Empty : Builders<T>.Filter.Where(scope);

        var total = await collection.CountDocumentsAsync(filter, cancellationToken: ct);
        var oldest = await collection.Find(filter).Sort(Builders<T>.Sort.Ascending(sortField)).Limit(1).FirstOrDefaultAsync(ct);
        var newest = await collection.Find(filter).Sort(Builders<T>.Sort.Descending(sortField)).Limit(1).FirstOrDefaultAsync(ct);
        var compiled = timestamp.Compile();
        return new DataDomainOverviewDto(
            key, label, description, total,
            oldest is null ? null : compiled(oldest),
            newest is null ? null : compiled(newest),
            retentionDays);
    }
}
