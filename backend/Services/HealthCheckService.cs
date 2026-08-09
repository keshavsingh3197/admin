using Admin.Api.Dtos;
using Admin.Api.Models;
using System.Diagnostics;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Admin.Api.Services;

/// <summary>
/// Runs a set of diagnostic checks across the pieces most likely to silently drift into a broken
/// state (stale RBAC data, a misconfigured website link, unreachable Mongo, retention settings out
/// of range) so problems like the legacy-role 500 surface here first instead of as a live error.
/// </summary>
public sealed class HealthCheckService
{
    private readonly MongoDbService _db;
    private readonly WebsiteRegistryService _websites;
    private readonly CustomRoleService _roles;
    private readonly GroupService _groups;
    private readonly SettingsService _settings;
    private readonly IMongoCollection<User> _users;
    private readonly IHttpClientFactory _httpClientFactory;

    public HealthCheckService(
        MongoDbService db,
        WebsiteRegistryService websites,
        CustomRoleService roles,
        GroupService groups,
        SettingsService settings,
        IHttpClientFactory httpClientFactory)
    {
        _db = db;
        _websites = websites;
        _roles = roles;
        _groups = groups;
        _settings = settings;
        _users = db.GetCollection<User>("users");
        _httpClientFactory = httpClientFactory;
    }

    public async Task<HealthReportDto> RunAllAsync(CancellationToken ct = default)
    {
        var checks = new List<HealthCheckDto>();

        checks.Add(await CheckDatabaseAsync(ct));
        checks.Add(await CheckAdminUserAsync(ct));
        checks.AddRange(await CheckRolesAsync(ct));
        checks.AddRange(await CheckGroupsAsync(ct));
        checks.Add(CheckRetentionSettings());
        checks.AddRange(await CheckWebsitesAsync(ct));

        return new HealthReportDto(
            checks,
            OkCount: checks.Count(x => x.Status == "ok"),
            WarningCount: checks.Count(x => x.Status == "warning"),
            ErrorCount: checks.Count(x => x.Status == "error"),
            GeneratedAtUtc: DateTime.UtcNow);
    }

    private async Task<HealthCheckDto> CheckDatabaseAsync(CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var timer = Stopwatch.StartNew();
        try
        {
            await _db.Database.RunCommandAsync<BsonDocument>(new BsonDocument("ping", 1), cancellationToken: ct);
            return new HealthCheckDto("database.ping", "Database", "MongoDB connectivity", "ok", "Ping succeeded.", now, timer.ElapsedMilliseconds, "/database");
        }
        catch (Exception)
        {
            return new HealthCheckDto("database.ping", "Database", "MongoDB connectivity", "error", "Database did not respond to the connectivity check.", now, timer.ElapsedMilliseconds, "/database");
        }
    }

    private async Task<HealthCheckDto> CheckAdminUserAsync(CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var adminCount = await _users.CountDocumentsAsync(
            u => !u.IsDeleted && u.IsActive && u.Roles.Contains(Roles.Admin), cancellationToken: ct);

        return adminCount > 0
            ? new HealthCheckDto("users.admin-exists", "Users", "At least one active Admin", "ok", $"{adminCount} active Admin user(s).", now)
            : new HealthCheckDto("users.admin-exists", "Users", "At least one active Admin", "error", "No active Admin user exists — the app would be unmanageable.", now);
    }

    private async Task<IReadOnlyList<HealthCheckDto>> CheckRolesAsync(CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var roles = await _roles.ListAsync(ct);
        var websiteKeys = (await _websites.ListAsync(ct)).Select(x => x.Key).ToHashSet(StringComparer.OrdinalIgnoreCase);

        var results = new List<HealthCheckDto>();
        foreach (var role in roles)
        {
            var key = $"rbac.role.{role.Key}";
            var label = $"Role \"{role.Name}\" grants";

            if (role.WebsiteGrants.Count == 0)
            {
                results.Add(new HealthCheckDto(key, "RBAC", label, "warning", "Has no website grants — it grants no access anywhere.", now));
                continue;
            }

            var unknownKeys = role.WebsiteGrants
                .Select(g => g.WebsiteKey)
                .Where(wk => wk != PermissionCatalog.AdminWebsiteKey && wk != PermissionCatalog.AllWebsitesKey && !websiteKeys.Contains(wk))
                .Distinct()
                .ToList();

            var emptyGrants = role.WebsiteGrants.Count(g => g.Permissions.Count == 0);

            if (unknownKeys.Count > 0)
            {
                results.Add(new HealthCheckDto(key, "RBAC", label, "warning",
                    $"References website key(s) that no longer exist: {string.Join(", ", unknownKeys)}.", now));
            }
            else if (emptyGrants > 0)
            {
                results.Add(new HealthCheckDto(key, "RBAC", label, "warning", $"{emptyGrants} grant(s) have no permissions selected.", now));
            }
            else
            {
                results.Add(new HealthCheckDto(key, "RBAC", label, "ok", $"{role.WebsiteGrants.Count} grant(s), all valid.", now));
            }
        }

        return results;
    }

    private async Task<IReadOnlyList<HealthCheckDto>> CheckGroupsAsync(CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var groups = await _groups.ListAsync(ct);
        var roleKeys = (await _roles.ListAsync(ct)).Select(x => x.Key).ToHashSet(StringComparer.OrdinalIgnoreCase);

        var results = new List<HealthCheckDto>();
        foreach (var group in groups)
        {
            var key = $"rbac.group.{group.Id}";
            var label = $"Group \"{group.Name}\" roles";
            var unknownRoles = group.RoleKeys.Where(rk => !roleKeys.Contains(rk)).Distinct().ToList();

            if (group.RoleKeys.Count == 0)
            {
                results.Add(new HealthCheckDto(key, "RBAC", label, "warning", "Has no roles assigned — members inherit nothing from it.", now));
            }
            else if (unknownRoles.Count > 0)
            {
                results.Add(new HealthCheckDto(key, "RBAC", label, "warning", $"References role key(s) that no longer exist: {string.Join(", ", unknownRoles)}.", now));
            }
            else
            {
                results.Add(new HealthCheckDto(key, "RBAC", label, "ok", $"{group.RoleKeys.Count} role(s), all valid.", now));
            }
        }

        return results;
    }

    private HealthCheckDto CheckRetentionSettings()
    {
        var now = DateTime.UtcNow;
        var view = _settings.ToView();
        var issues = new List<string>();
        if (view.RefreshTokenRetentionDays is < 1 or > 365) issues.Add("refresh token retention out of range");
        if (view.AnalyticsRetentionDays is < 1 or > 3650) issues.Add("analytics retention out of range");
        if (view.LoginAuditRetentionDays is < 1 or > 3650) issues.Add("login audit retention out of range");

        return issues.Count == 0
            ? new HealthCheckDto("settings.retention", "Settings", "Retention windows", "ok", "All retention windows are within valid ranges.", now)
            : new HealthCheckDto("settings.retention", "Settings", "Retention windows", "error", string.Join("; ", issues), now);
    }

    private async Task<IReadOnlyList<HealthCheckDto>> CheckWebsitesAsync(CancellationToken ct)
    {
        var sites = await _websites.ListAsync(ct);
        var checks = sites.Where(x => x.IsEnabled).Select(async site => {
            var now = DateTime.UtcNow;
            var timer = Stopwatch.StartNew();
            var key = $"website.{site.Key}";
            try
            {
                var client = _httpClientFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(6);
                using var response = await client.GetAsync(site.Url, HttpCompletionOption.ResponseHeadersRead, ct);
                return response.IsSuccessStatusCode
                    ? new HealthCheckDto(key, "Websites", site.Name, "ok", $"Reachable (HTTP {(int)response.StatusCode}).", now, timer.ElapsedMilliseconds, "/website")
                    : new HealthCheckDto(key, "Websites", site.Name, "warning", $"Responded with HTTP {(int)response.StatusCode}.", now, timer.ElapsedMilliseconds, "/website");
            }
            catch (Exception) when (!ct.IsCancellationRequested)
            {
                return new HealthCheckDto(key, "Websites", site.Name, "error", "The website did not respond within the health-check window.", now, timer.ElapsedMilliseconds, "/website");
            }
        });

        return await Task.WhenAll(checks);
    }
}
