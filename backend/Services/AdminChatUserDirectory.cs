using Admin.Api.Models;
using KeshavSingh.Realtime.Chat;
using MongoDB.Driver;

namespace Admin.Api.Services;

/// <summary>
/// Bridges the chat package (<see cref="IChatUserDirectory"/>) to admin's own user store (the
/// <c>users</c> collection). Excludes inactive/deleted users; display name falls back to email.
/// </summary>
public sealed class AdminChatUserDirectory : IChatUserDirectory
{
    private readonly IMongoCollection<User> _users;

    public AdminChatUserDirectory(MongoDbService db) => _users = db.GetCollection<User>("users");

    public async Task<IReadOnlyList<ChatDirectoryEntry>> ListActiveAsync(string excludeUserId, CancellationToken ct = default)
    {
        var users = await _users.Find(u => !u.IsDeleted && u.IsActive && u.Id != excludeUserId)
            .SortBy(u => u.DisplayName).ToListAsync(ct);
        return users.Select(u => new ChatDirectoryEntry(u.Id, DisplayOf(u))).ToList();
    }

    public async Task<IReadOnlyDictionary<string, string>> DisplayNamesAsync(IEnumerable<string> ids, CancellationToken ct = default)
    {
        var set = ids.Distinct().ToList();
        if (set.Count == 0) return new Dictionary<string, string>();
        var users = await _users.Find(u => set.Contains(u.Id)).ToListAsync(ct);
        return users.ToDictionary(u => u.Id, DisplayOf);
    }

    private static string DisplayOf(User u) => string.IsNullOrWhiteSpace(u.DisplayName) ? u.Email : u.DisplayName;
}
