using Admin.Api.Dtos;
using Admin.Api.Models;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Admin.Api.Services;

/// <summary>
/// Cross-entity admin search. Notes are searched for every authenticated user (this app has a
/// single shared notes list); Users/Websites/Roles/Groups results are restricted to Admins since
/// only Admins can manage or view them elsewhere in this app.
/// </summary>
public sealed class SearchService
{
    private readonly IMongoCollection<User> _users;
    private readonly IMongoCollection<Note> _notes;
    private readonly IMongoCollection<ShortLink> _shortLinks;
    private readonly WebsiteRegistryService _websites;
    private readonly CustomRoleService _roles;
    private readonly GroupService _groups;

    public SearchService(MongoDbService db, WebsiteRegistryService websites, CustomRoleService roles, GroupService groups)
    {
        _users = db.GetCollection<User>("users");
        _notes = db.GetCollection<Note>("notes");
        _shortLinks = db.GetCollection<ShortLink>("short_links");
        _websites = websites;
        _roles = roles;
        _groups = groups;
    }

    public async Task<IReadOnlyList<SearchResultDto>> SearchAsync(string query, bool isAdmin, CancellationToken ct = default)
    {
        var q = query.Trim();
        if (q.Length < 2) return Array.Empty<SearchResultDto>();

        var results = new List<SearchResultDto>();
        var regex = new BsonRegularExpression(System.Text.RegularExpressions.Regex.Escape(q), "i");

        var notes = await _notes.Find(Builders<Note>.Filter.Or(
                Builders<Note>.Filter.Regex(x => x.Title, regex),
                Builders<Note>.Filter.Regex(x => x.Content, regex)))
            .Limit(8).ToListAsync(ct);
        results.AddRange(notes.Select(n => new SearchResultDto("Note", n.Id ?? "", n.Title, n.Category, "/notes")));

        var shortLinks = await _shortLinks.Find(Builders<ShortLink>.Filter.Or(
                Builders<ShortLink>.Filter.Regex(x => x.Code, regex),
                Builders<ShortLink>.Filter.Regex(x => x.TargetUrl, regex)))
            .Limit(8).ToListAsync(ct);
        results.AddRange(shortLinks.Select(s => new SearchResultDto("Short link", s.Id ?? "", s.Code, s.TargetUrl, "/short-links")));

        if (!isAdmin) return results;

        var users = await _users.Find(Builders<User>.Filter.And(
                Builders<User>.Filter.Eq(x => x.IsDeleted, false),
                Builders<User>.Filter.Or(
                    Builders<User>.Filter.Regex(x => x.Email, regex),
                    Builders<User>.Filter.Regex(x => x.DisplayName, regex),
                    Builders<User>.Filter.Regex(x => x.Username, regex))))
            .Limit(8).ToListAsync(ct);
        results.AddRange(users.Select(u => new SearchResultDto("User", u.Id, u.DisplayName, u.Email, "/users")));

        var sites = await _websites.ListAsync(ct);
        results.AddRange(sites.Where(w =>
                w.Name.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                w.Key.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                w.Url.Contains(q, StringComparison.OrdinalIgnoreCase))
            .Take(8)
            .Select(w => new SearchResultDto("Website", w.Id, w.Name, w.Url, "/settings")));

        var roles = await _roles.ListAsync(ct);
        results.AddRange(roles.Where(r =>
                r.Name.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                r.Key.Contains(q, StringComparison.OrdinalIgnoreCase))
            .Take(8)
            .Select(r => new SearchResultDto("Role", r.Id, r.Name, r.Description, "/roles")));

        var groups = await _groups.ListAsync(ct);
        results.AddRange(groups.Where(g => g.Name.Contains(q, StringComparison.OrdinalIgnoreCase))
            .Take(8)
            .Select(g => new SearchResultDto("Group", g.Id, g.Name, g.Description, "/groups")));

        return results;
    }
}
