using System.Security.Cryptography;
using System.Text;
using Admin.Api.Dtos;
using Admin.Api.Models;
using KeshavSingh.Security;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Admin.Api.Services;

/// <summary>
/// Live chat with visitors on the public sites — the bubble in the corner of the portfolio, answered
/// from the admin app.
///
/// Visitors have no account, so a session is held together by an opaque token their browser keeps. Only
/// the token's SHA-256 is stored: a leak of this collection cannot resume anyone's conversation. Message
/// bodies and any name/email offered are encrypted at rest (the same treatment as the contact inbox),
/// and the client IP is never recorded.
///
/// Delivery is polling rather than sockets, deliberately: the SignalR hub is authenticated, and opening
/// it to anonymous connections to save a few seconds of latency would be a poor trade. "Typing" is a
/// timestamp for the same reason — a stale one expires on its own, so a closed laptop can never leave
/// the other side watching a dot forever.
/// </summary>
public sealed class VisitorChatService
{
    /// <summary>How recently someone must have typed for the other side to be told about it.</summary>
    private static readonly TimeSpan TypingWindow = TimeSpan.FromSeconds(8);

    /// <summary>How recently a visitor must have polled to count as still on the page.</summary>
    private static readonly TimeSpan OnlineWindow = TimeSpan.FromSeconds(45);

    /// <summary>Messages returned for one thread. Long enough for any real conversation.</summary>
    private const int MaxThreadMessages = 500;

    private readonly IMongoCollection<VisitorChatSession> _sessions;
    private readonly IMongoCollection<VisitorChatMessage> _messages;
    private readonly DataProtector _protector;
    private readonly ILogger<VisitorChatService> _log;

    public VisitorChatService(MongoDbService db, DataProtector protector, ILogger<VisitorChatService> log)
    {
        _sessions = db.GetCollection<VisitorChatSession>("visitor_chat_sessions");
        _messages = db.GetCollection<VisitorChatMessage>("visitor_chat_messages");
        _protector = protector;
        _log = log;
    }

    public Task EnsureIndexesAsync() => Task.WhenAll(
        _sessions.Indexes.CreateManyAsync(new[]
        {
            new CreateIndexModel<VisitorChatSession>(
                Builders<VisitorChatSession>.IndexKeys.Ascending(s => s.TokenHash),
                new CreateIndexOptions { Unique = true }),
            new CreateIndexModel<VisitorChatSession>(
                Builders<VisitorChatSession>.IndexKeys.Descending(s => s.LastMessageAt)),
            new CreateIndexModel<VisitorChatSession>(
                Builders<VisitorChatSession>.IndexKeys.Ascending(s => s.Status).Descending(s => s.LastMessageAt)),
        }),
        _messages.Indexes.CreateManyAsync(new[]
        {
            new CreateIndexModel<VisitorChatMessage>(
                Builders<VisitorChatMessage>.IndexKeys.Ascending(m => m.SessionId).Ascending(m => m.SentAt)),
        }));

    // ---- Visitor side (anonymous) ----

    /// <summary>
    /// Opens a conversation and hands back the only copy of its token. Nothing is required of the
    /// visitor — a name and email are welcome but optional, because demanding them to ask a question is
    /// how a chat widget goes unused.
    /// </summary>
    public async Task<StartVisitorChatResponse> StartAsync(StartVisitorChatRequest req, string greeting,
        CancellationToken ct = default)
    {
        var token = GenerateToken();
        var session = new VisitorChatSession
        {
            TokenHash = Hash(token),
            Source = string.IsNullOrWhiteSpace(req.Source) ? "portfolio" : req.Source.Trim(),
            DisplayName = EncryptOptional(req.DisplayName),
            Email = EncryptOptional(req.Email),
            UserAgent = Truncate(req.UserAgent, 400),
        };
        await _sessions.InsertOneAsync(session, cancellationToken: ct);

        // The greeting is handed back for the widget to show, not stored: it is the same canned line
        // every time, and a thread that opens with our own boilerplate tells whoever answers nothing.
        _log.LogInformation("Visitor chat {SessionId} started from {Source}", session.Id, session.Source);
        return new StartVisitorChatResponse(token, session.Id!, greeting);
    }

    /// <summary>Records a visitor's message. Returns false when the token is unknown or blocked.</summary>
    public async Task<bool> PostVisitorMessageAsync(string token, string body, CancellationToken ct = default)
    {
        var session = await ResolveAsync(token, ct);
        if (session is null || session.Status == VisitorChatStatus.Blocked) return false;

        var now = DateTime.UtcNow;
        await _messages.InsertOneAsync(new VisitorChatMessage
        {
            SessionId = session.Id!,
            Author = VisitorChatAuthor.Visitor,
            Body = Encrypt(body.Trim()),
            SentAt = now,
        }, cancellationToken: ct);

        await _sessions.UpdateOneAsync(s => s.Id == session.Id, Builders<VisitorChatSession>.Update
            .Set(s => s.LastMessageAt, now)
            .Set(s => s.VisitorSeenAt, now)
            .Set(s => s.VisitorTypingAt, null)
            // A visitor writing again reopens a conversation staff had closed; ignoring them would be rude.
            .Set(s => s.Status, VisitorChatStatus.Open), cancellationToken: ct);

        return true;
    }

    /// <summary>
    /// What the widget asks for every few seconds: anything said since <paramref name="afterId"/>,
    /// whether staff are typing, and whether the conversation is still open. Also marks the visitor as
    /// present, which is what the staff queue shows as "online".
    /// </summary>
    public async Task<VisitorChatPoll?> PollAsync(string token, string? afterId, CancellationToken ct = default)
    {
        var session = await ResolveAsync(token, ct);
        if (session is null) return null;

        var now = DateTime.UtcNow;
        await _sessions.UpdateOneAsync(s => s.Id == session.Id,
            Builders<VisitorChatSession>.Update.Set(s => s.VisitorSeenAt, now), cancellationToken: ct);

        var messages = await ReadMessagesAsync(session.Id!, afterId, ct);
        var staffTyping = IsRecent(session.StaffTypingAt, now);

        return new VisitorChatPoll(session.Status, staffTyping, messages);
    }

    /// <summary>Notes that the visitor is typing. Expires by itself — see <see cref="TypingWindow"/>.</summary>
    public async Task<bool> VisitorTypingAsync(string token, CancellationToken ct = default)
    {
        var session = await ResolveAsync(token, ct);
        if (session is null || session.Status == VisitorChatStatus.Blocked) return false;

        var now = DateTime.UtcNow;
        await _sessions.UpdateOneAsync(s => s.Id == session.Id, Builders<VisitorChatSession>.Update
            .Set(s => s.VisitorTypingAt, now)
            .Set(s => s.VisitorSeenAt, now), cancellationToken: ct);
        return true;
    }

    // ---- Staff side (signed in) ----

    public async Task<IReadOnlyList<VisitorChatSessionView>> ListAsync(string? status, int limit = 100,
        CancellationToken ct = default)
    {
        var filter = VisitorChatStatus.IsValid(status)
            ? Builders<VisitorChatSession>.Filter.Eq(s => s.Status, status)
            : Builders<VisitorChatSession>.Filter.Empty;

        var sessions = await _sessions.Find(filter)
            .SortByDescending(s => s.LastMessageAt)
            .Limit(Math.Clamp(limit, 1, 300))
            .ToListAsync(ct);

        var views = new List<VisitorChatSessionView>(sessions.Count);
        foreach (var session in sessions) views.Add(await ToViewAsync(session, ct));
        return views;
    }

    /// <summary>Counts for the nav badge. "Waiting" is a visitor whose last message nobody has read.</summary>
    public async Task<VisitorChatSummary> SummaryAsync(CancellationToken ct = default)
    {
        var open = await _sessions.CountDocumentsAsync(
            s => s.Status == VisitorChatStatus.Open, cancellationToken: ct);

        // "Nobody has read the latest message" compares two fields of the same document, which only
        // $expr can express — the LINQ provider would have to pull every session back to do it.
        var waitingFilter = Builders<VisitorChatSession>.Filter.Eq(s => s.Status, VisitorChatStatus.Open)
            & Builders<VisitorChatSession>.Filter.Or(
                Builders<VisitorChatSession>.Filter.Eq(s => s.StaffReadAt, null),
                new BsonDocument("$expr",
                    new BsonDocument("$lt", new BsonArray { "$staffReadAt", "$lastMessageAt" })));
        var waiting = await _sessions.CountDocumentsAsync(waitingFilter, cancellationToken: ct);

        var since = DateTime.UtcNow - OnlineWindow;
        var online = await _sessions.CountDocumentsAsync(
            s => s.Status == VisitorChatStatus.Open && s.VisitorSeenAt >= since, cancellationToken: ct);

        return new VisitorChatSummary(waiting, online, open);
    }

    /// <summary>Opens a conversation for staff, which also marks it read.</summary>
    public async Task<VisitorChatThread?> OpenAsync(string sessionId, CancellationToken ct = default)
    {
        if (!ObjectId.TryParse(sessionId, out _)) return null;
        var session = await _sessions.Find(s => s.Id == sessionId).FirstOrDefaultAsync(ct);
        if (session is null) return null;

        session.StaffReadAt = DateTime.UtcNow;
        await _sessions.UpdateOneAsync(s => s.Id == sessionId,
            Builders<VisitorChatSession>.Update.Set(s => s.StaffReadAt, session.StaffReadAt),
            cancellationToken: ct);

        var messages = await ReadMessagesAsync(sessionId, afterId: null, ct);
        return new VisitorChatThread(await ToViewAsync(session, ct), messages);
    }

    /// <summary>Only what has arrived since <paramref name="afterId"/> — what the open thread polls for.</summary>
    public async Task<VisitorChatThread?> PollStaffAsync(string sessionId, string? afterId,
        CancellationToken ct = default)
    {
        if (!ObjectId.TryParse(sessionId, out _)) return null;
        var session = await _sessions.Find(s => s.Id == sessionId).FirstOrDefaultAsync(ct);
        if (session is null) return null;

        var messages = await ReadMessagesAsync(sessionId, afterId, ct);
        return new VisitorChatThread(await ToViewAsync(session, ct), messages);
    }

    public async Task<VisitorChatMessageView?> ReplyAsync(string sessionId, string staffUserId, string? staffName,
        string body, CancellationToken ct = default)
    {
        if (!ObjectId.TryParse(sessionId, out _)) return null;
        var session = await _sessions.Find(s => s.Id == sessionId).FirstOrDefaultAsync(ct);
        if (session is null) return null;

        var now = DateTime.UtcNow;
        var message = new VisitorChatMessage
        {
            SessionId = sessionId,
            Author = VisitorChatAuthor.Staff,
            StaffUserId = staffUserId,
            StaffName = staffName,
            Body = Encrypt(body.Trim()),
            SentAt = now,
        };
        await _messages.InsertOneAsync(message, cancellationToken: ct);

        await _sessions.UpdateOneAsync(s => s.Id == sessionId, Builders<VisitorChatSession>.Update
            .Set(s => s.LastMessageAt, now)
            .Set(s => s.StaffReadAt, now)
            .Set(s => s.StaffTypingAt, null)
            .Set(s => s.LastStaffUserId, staffUserId), cancellationToken: ct);

        _log.LogInformation("Visitor chat {SessionId} answered by {UserId}", sessionId, staffUserId);
        return ToMessageView(message);
    }

    public async Task<bool> StaffTypingAsync(string sessionId, CancellationToken ct = default)
    {
        if (!ObjectId.TryParse(sessionId, out _)) return false;
        var result = await _sessions.UpdateOneAsync(s => s.Id == sessionId,
            Builders<VisitorChatSession>.Update.Set(s => s.StaffTypingAt, DateTime.UtcNow),
            cancellationToken: ct);
        return result.MatchedCount > 0;
    }

    public async Task<bool> SetStatusAsync(string sessionId, string status, CancellationToken ct = default)
    {
        if (!ObjectId.TryParse(sessionId, out _) || !VisitorChatStatus.IsValid(status)) return false;
        var result = await _sessions.UpdateOneAsync(s => s.Id == sessionId,
            Builders<VisitorChatSession>.Update.Set(s => s.Status, status), cancellationToken: ct);

        if (result.MatchedCount > 0)
            _log.LogInformation("Visitor chat {SessionId} set to {Status}", sessionId, status);
        return result.MatchedCount > 0;
    }

    /// <summary>Deletes a conversation and everything said in it.</summary>
    public async Task<bool> DeleteAsync(string sessionId, CancellationToken ct = default)
    {
        if (!ObjectId.TryParse(sessionId, out _)) return false;
        var result = await _sessions.DeleteOneAsync(s => s.Id == sessionId, ct);
        if (result.DeletedCount == 0) return false;

        await _messages.DeleteManyAsync(m => m.SessionId == sessionId, ct);
        return true;
    }

    // ---- Helpers ----

    private async Task<VisitorChatSession?> ResolveAsync(string? token, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > 128) return null;
        var hash = Hash(token);
        return await _sessions.Find(s => s.TokenHash == hash).FirstOrDefaultAsync(ct);
    }

    private async Task<IReadOnlyList<VisitorChatMessageView>> ReadMessagesAsync(
        string sessionId, string? afterId, CancellationToken ct)
    {
        var filter = Builders<VisitorChatMessage>.Filter.Eq(m => m.SessionId, sessionId);

        // Paging by id rather than timestamp: two messages can share a millisecond, and an id
        // comparison can't skip one of them or replay it.
        if (!string.IsNullOrWhiteSpace(afterId) && ObjectId.TryParse(afterId, out var after))
            filter &= Builders<VisitorChatMessage>.Filter.Gt(m => m.Id, after.ToString());

        var messages = await _messages.Find(filter)
            .SortBy(m => m.Id)
            .Limit(MaxThreadMessages)
            .ToListAsync(ct);

        return messages.Select(ToMessageView).ToList();
    }

    private async Task<VisitorChatSessionView> ToViewAsync(VisitorChatSession session, CancellationToken ct)
    {
        var last = await _messages.Find(m => m.SessionId == session.Id)
            .SortByDescending(m => m.Id).Limit(1).FirstOrDefaultAsync(ct);

        var now = DateTime.UtcNow;

        var unreadFilter = Builders<VisitorChatMessage>.Filter.Eq(m => m.SessionId, session.Id)
            & Builders<VisitorChatMessage>.Filter.Eq(m => m.Author, VisitorChatAuthor.Visitor);
        if (session.StaffReadAt is DateTime readAt)
            unreadFilter &= Builders<VisitorChatMessage>.Filter.Gt(m => m.SentAt, readAt);
        var unread = await _messages.CountDocumentsAsync(unreadFilter, cancellationToken: ct);

        return new VisitorChatSessionView(
            session.Id!,
            session.Source,
            TryDecrypt(session.DisplayName),
            TryDecrypt(session.Email),
            session.Status,
            session.UserAgent,
            session.CreatedAt,
            session.LastMessageAt,
            session.VisitorSeenAt,
            session.VisitorSeenAt >= now - OnlineWindow,
            IsRecent(session.VisitorTypingAt, now),
            (int)Math.Min(unread, int.MaxValue),
            last is null ? null : Preview(TryDecrypt(last.Body)),
            session.LastStaffUserId);
    }

    private VisitorChatMessageView ToMessageView(VisitorChatMessage m) =>
        new(m.Id!, m.Author, m.StaffName, TryDecrypt(m.Body) ?? string.Empty, m.SentAt);

    private static bool IsRecent(DateTime? at, DateTime now) => at is not null && now - at.Value <= TypingWindow;

    private static string GenerateToken() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .Replace('+', '-').Replace('/', '_').TrimEnd('=');

    private static string Hash(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    private string Encrypt(string plaintext) => plaintext.Length == 0 ? plaintext : _protector.Encrypt(plaintext);

    private string? EncryptOptional(string? plaintext) =>
        string.IsNullOrWhiteSpace(plaintext) ? null : _protector.Encrypt(plaintext.Trim());

    /// <summary>Falls back to the raw value if it isn't valid ciphertext, so a read never 500s.</summary>
    private string? TryDecrypt(string? value)
    {
        if (string.IsNullOrEmpty(value)) return value;
        try { return _protector.Decrypt(value); }
        catch (Exception) { return value; }
    }

    private static string? Preview(string? body) =>
        string.IsNullOrWhiteSpace(body) ? null : body.Length <= 90 ? body : body[..90] + "…";

    private static string? Truncate(string? value, int max) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Length <= max ? value : value[..max];
}
