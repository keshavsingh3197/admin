using Admin.Api.Models;
using MongoDB.Driver;

namespace Admin.Api.Services;

/// <summary>
/// Service managing family chores, groceries, calendar events, vault items, and emergency contacts
/// synchronized between KeshavMobileApp and Admin.
/// </summary>
public sealed class FamilyHubService
{
    private readonly IMongoCollection<FamilyTask> _tasks;
    private readonly IMongoCollection<FamilyEvent> _events;
    private readonly IMongoCollection<FamilyVaultItem> _vault;
    private readonly IMongoCollection<FamilyMemberProfile> _members;
    private readonly IMongoCollection<User> _users;
    private readonly GroupService _groups;
    private readonly AdminAuditService _audit;
    private readonly ILogger<FamilyHubService> _logger;

    public FamilyHubService(
        MongoDbService db,
        GroupService groups,
        AdminAuditService audit,
        ILogger<FamilyHubService> logger)
    {
        _tasks = db.GetCollection<FamilyTask>("family_tasks");
        _events = db.GetCollection<FamilyEvent>("family_events");
        _vault = db.GetCollection<FamilyVaultItem>("family_vault");
        _members = db.GetCollection<FamilyMemberProfile>("family_members");
        _users = db.GetCollection<User>("users");
        _groups = groups;
        _audit = audit;
        _logger = logger;
    }

    /// <summary>
    /// Resolves the family ID and family display name for a given user.
    /// Prefers the user's Family Circle group if one exists; otherwise defaults to a personal family hub.
    /// </summary>
    public async Task<(string familyId, string familyName)> ResolveFamilyScopeAsync(string userId)
    {
        var userGroups = await _groups.ListForUserAsync(userId);
        var familyGroup = userGroups.FirstOrDefault(g => g.IsFamilyCircle);

        if (familyGroup is not null)
        {
            return (familyGroup.Id, familyGroup.Name);
        }

        var user = await _users.Find(u => u.Id == userId).FirstOrDefaultAsync();
        var displayName = user?.DisplayName ?? "Keshav";
        return (userId, $"{displayName}'s Family Hub");
    }

    /// <summary>
    /// Retrieves the consolidated family hub state.
    /// </summary>
    public async Task<FamilyHubState> GetStateAsync(string userId)
    {
        var (familyId, familyName) = await ResolveFamilyScopeAsync(userId);

        var members = await _members.Find(m => m.FamilyId == familyId).ToListAsync();
        var tasks = await _tasks.Find(t => t.FamilyId == familyId).SortByDescending(t => t.UpdatedAt).ToListAsync();
        var events = await _events.Find(e => e.FamilyId == familyId).SortBy(e => e.Date).ToListAsync();
        var vault = await _vault.Find(v => v.FamilyId == familyId).SortByDescending(v => v.UpdatedAt).ToListAsync();

        // If no members are stored yet, seed the current user as the default primary member
        if (members.Count == 0)
        {
            var user = await _users.Find(u => u.Id == userId).FirstOrDefaultAsync();
            var primaryMember = new FamilyMemberProfile
            {
                Id = $"m-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
                FamilyId = familyId,
                UserId = userId,
                Name = user?.DisplayName ?? "Family Admin",
                Relation = "Admin",
                Phone = user?.PhoneNumber ?? "",
                AvatarColor = "#4F46E5",
                Status = "Online",
                IsEmergencyContact = true,
                UpdatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            };

            await _members.InsertOneAsync(primaryMember);
            members.Add(primaryMember);
        }

        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        return new FamilyHubState(familyId, familyName, members, tasks, events, vault, nowMs);
    }

    /// <summary>
    /// Performs a two-way synchronization of mobile state to MongoDB.
    /// Incoming items with non-empty IDs are upserted.
    /// </summary>
    public async Task<FamilyHubState> SyncAsync(string userId, FamilySyncRequest request)
    {
        var (familyId, _) = await ResolveFamilyScopeAsync(userId);
        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        // Upsert tasks
        if (request.Tasks is { Count: > 0 })
        {
            foreach (var task in request.Tasks)
            {
                if (string.IsNullOrWhiteSpace(task.Id))
                    task.Id = $"t-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}-{Guid.NewGuid().ToString("N")[..6]}";

                task.FamilyId = familyId;
                task.CreatedByUserId ??= userId;
                if (task.UpdatedAt == 0) task.UpdatedAt = nowMs;
                if (task.CreatedAt == 0) task.CreatedAt = nowMs;

                await _tasks.ReplaceOneAsync(
                    t => t.Id == task.Id && t.FamilyId == familyId,
                    task,
                    new ReplaceOptions { IsUpsert = true });
            }
        }

        // Upsert events
        if (request.Events is { Count: > 0 })
        {
            foreach (var evt in request.Events)
            {
                if (string.IsNullOrWhiteSpace(evt.Id))
                    evt.Id = $"e-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}-{Guid.NewGuid().ToString("N")[..6]}";

                evt.FamilyId = familyId;
                evt.CreatedByUserId ??= userId;
                if (evt.UpdatedAt == 0) evt.UpdatedAt = nowMs;
                if (evt.CreatedAt == 0) evt.CreatedAt = nowMs;

                await _events.ReplaceOneAsync(
                    e => e.Id == evt.Id && e.FamilyId == familyId,
                    evt,
                    new ReplaceOptions { IsUpsert = true });
            }
        }

        // Upsert vault items
        if (request.VaultItems is { Count: > 0 })
        {
            foreach (var vaultItem in request.VaultItems)
            {
                if (string.IsNullOrWhiteSpace(vaultItem.Id))
                    vaultItem.Id = $"v-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}-{Guid.NewGuid().ToString("N")[..6]}";

                vaultItem.FamilyId = familyId;
                vaultItem.UpdatedByUserId = userId;
                if (vaultItem.UpdatedAt == 0) vaultItem.UpdatedAt = nowMs;

                await _vault.ReplaceOneAsync(
                    v => v.Id == vaultItem.Id && v.FamilyId == familyId,
                    vaultItem,
                    new ReplaceOptions { IsUpsert = true });
            }
        }

        // Upsert family members
        if (request.Members is { Count: > 0 })
        {
            foreach (var member in request.Members)
            {
                if (string.IsNullOrWhiteSpace(member.Id))
                    member.Id = $"m-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}-{Guid.NewGuid().ToString("N")[..6]}";

                member.FamilyId = familyId;
                if (member.UpdatedAt == 0) member.UpdatedAt = nowMs;

                await _members.ReplaceOneAsync(
                    m => m.Id == member.Id && m.FamilyId == familyId,
                    member,
                    new ReplaceOptions { IsUpsert = true });
            }
        }

        _logger.LogInformation("FamilyHub state synchronized for user {UserId}, family {FamilyId}", userId, familyId);
        return await GetStateAsync(userId);
    }

    /// <summary>
    /// Logs an SOS alert for auditing and emergency response.
    /// </summary>
    public async Task LogSosAlertAsync(string userId, FamilySosAlertRequest request)
    {
        var (familyId, familyName) = await ResolveFamilyScopeAsync(userId);
        var contactNames = request.EmergencyContactNames is not null
            ? string.Join(", ", request.EmergencyContactNames)
            : "None";

        var details = $"Family: {familyName} ({familyId}). Message: {request.Message}. Alerted: {contactNames}.";
        if (request.Latitude.HasValue && request.Longitude.HasValue)
        {
            details += $" Coords: {request.Latitude:F5},{request.Longitude:F5}";
        }

        await _audit.RecordAsync("family.emergency_sos", target: familyId, details: details, success: true);
        _logger.LogWarning("🚨 Emergency SOS Triggered by user {UserId}: {Details}", userId, details);
    }

    /// <summary>
    /// Deletes a task by ID.
    /// </summary>
    public async Task<bool> DeleteTaskAsync(string userId, string taskId)
    {
        var (familyId, _) = await ResolveFamilyScopeAsync(userId);
        var res = await _tasks.DeleteOneAsync(t => t.Id == taskId && t.FamilyId == familyId);
        return res.DeletedCount > 0;
    }

    /// <summary>
    /// Deletes an event by ID.
    /// </summary>
    public async Task<bool> DeleteEventAsync(string userId, string eventId)
    {
        var (familyId, _) = await ResolveFamilyScopeAsync(userId);
        var res = await _events.DeleteOneAsync(e => e.Id == eventId && e.FamilyId == familyId);
        return res.DeletedCount > 0;
    }

    /// <summary>
    /// Deletes a vault item by ID.
    /// </summary>
    public async Task<bool> DeleteVaultItemAsync(string userId, string vaultId)
    {
        var (familyId, _) = await ResolveFamilyScopeAsync(userId);
        var res = await _vault.DeleteOneAsync(v => v.Id == vaultId && v.FamilyId == familyId);
        return res.DeletedCount > 0;
    }

    /// <summary>
    /// Deletes a family member by ID.
    /// </summary>
    public async Task<bool> DeleteMemberAsync(string userId, string memberId)
    {
        var (familyId, _) = await ResolveFamilyScopeAsync(userId);
        var res = await _members.DeleteOneAsync(m => m.Id == memberId && m.FamilyId == familyId);
        return res.DeletedCount > 0;
    }
}

