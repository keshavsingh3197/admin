using Admin.Api.Dtos;
using Admin.Api.Models;
using KeshavSingh.Security;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Admin.Api.Services;

/// <summary>
/// The inbox behind the portfolio's "Contact me" form: what strangers send in, plus the thread of replies
/// written back to them. Submissions are personal data volunteered by people who are not users of this
/// system, so name/email/message are encrypted at rest, only admins can read them, and the client IP is
/// never stored.
///
/// Replies are recorded here, not delivered from here: this app has no outbound mail path (its
/// <c>IEmailSender</c> only sends OTPs), so the inbox hands the admin a pre-filled mail link and the reply
/// row tracks whether they confirmed sending it. Better an honest record than a fake "sent".
/// </summary>
public sealed class ContactService
{
    private readonly IMongoCollection<ContactSubmission> _submissions;
    private readonly DataProtector _protector;
    private readonly ILogger<ContactService> _log;

    public ContactService(MongoDbService db, DataProtector protector, ILogger<ContactService> log)
    {
        _submissions = db.GetCollection<ContactSubmission>("contact_submissions");
        _protector = protector;
        _log = log;
    }

    public Task EnsureIndexesAsync() =>
        _submissions.Indexes.CreateManyAsync(new[]
        {
            new CreateIndexModel<ContactSubmission>(Builders<ContactSubmission>.IndexKeys
                .Descending(s => s.CreatedAt)),
            new CreateIndexModel<ContactSubmission>(Builders<ContactSubmission>.IndexKeys
                .Ascending(s => s.Status).Descending(s => s.CreatedAt)),
        });

    // ---- Public (unauthenticated) ----

    /// <summary>Records a form submission. Returns nothing about storage — the form only needs "sent".</summary>
    public async Task SubmitAsync(ContactSubmitRequest req, CancellationToken ct = default)
    {
        var submission = new ContactSubmission
        {
            Source = string.IsNullOrWhiteSpace(req.Source) ? "portfolio" : req.Source.Trim(),
            Name = Encrypt(req.Name.Trim()),
            Email = Encrypt(req.Email.Trim()),
            Message = Encrypt(req.Message.Trim()),
            Latitude = req.Location?.Latitude,
            Longitude = req.Location?.Longitude,
            AccuracyMeters = req.Location?.Accuracy,
            UserAgent = Truncate(req.UserAgent, 400),
        };
        await _submissions.InsertOneAsync(submission, cancellationToken: ct);
        // No name, email or message in the log — that's the whole point of encrypting them.
        _log.LogInformation("Contact form submission {SubmissionId} received from {Source}",
            submission.Id, submission.Source);
    }

    // ---- Admin ----

    public async Task<IReadOnlyList<ContactSubmissionDto>> ListAsync(string? status, int limit = 100,
        CancellationToken ct = default)
    {
        var filter = ContactStatus.IsValid(status)
            ? Builders<ContactSubmission>.Filter.Eq(s => s.Status, status)
            : Builders<ContactSubmission>.Filter.Empty;

        var list = await _submissions.Find(filter)
            .SortByDescending(s => s.CreatedAt)
            .Limit(Math.Clamp(limit, 1, 500))
            .ToListAsync(ct);
        return list.Select(ToDto).ToList();
    }

    public async Task<ContactInboxSummary> SummaryAsync(CancellationToken ct = default)
    {
        var unread = await _submissions.CountDocumentsAsync(s => s.Status == ContactStatus.New, cancellationToken: ct);
        var total = await _submissions.CountDocumentsAsync(FilterDefinition<ContactSubmission>.Empty, cancellationToken: ct);
        return new ContactInboxSummary(unread, total);
    }

    /// <summary>Fetches one submission and marks it read on the way out (opening it is reading it).</summary>
    public async Task<ContactSubmissionDto?> OpenAsync(string id, CancellationToken ct = default)
    {
        if (!ObjectId.TryParse(id, out _)) return null;
        var submission = await _submissions.Find(s => s.Id == id).FirstOrDefaultAsync(ct);
        if (submission is null) return null;

        if (submission.Status == ContactStatus.New)
        {
            submission.Status = ContactStatus.Read;
            submission.ReadAt = DateTime.UtcNow;
            await _submissions.UpdateOneAsync(s => s.Id == id, Builders<ContactSubmission>.Update
                .Set(s => s.Status, ContactStatus.Read)
                .Set(s => s.ReadAt, submission.ReadAt)
                .Set(s => s.UpdatedAt, DateTime.UtcNow), cancellationToken: ct);
        }
        return ToDto(submission);
    }

    /// <summary>Adds a reply to the thread and moves the submission to "replied".</summary>
    public async Task<ContactSubmissionDto?> ReplyAsync(string id, string adminUserId, string body,
        CancellationToken ct = default)
    {
        if (!ObjectId.TryParse(id, out _)) return null;
        var submission = await _submissions.Find(s => s.Id == id).FirstOrDefaultAsync(ct);
        if (submission is null) return null;

        submission.Replies.Add(new ContactReply
        {
            Body = Encrypt(body.Trim()),
            SentByUserId = adminUserId,
        });
        submission.Status = ContactStatus.Replied;
        submission.UpdatedAt = DateTime.UtcNow;

        await _submissions.UpdateOneAsync(s => s.Id == id, Builders<ContactSubmission>.Update
            .Set(s => s.Replies, submission.Replies)
            .Set(s => s.Status, ContactStatus.Replied)
            .Set(s => s.UpdatedAt, submission.UpdatedAt), cancellationToken: ct);

        _log.LogInformation("Contact submission {SubmissionId} replied to", id);
        return ToDto(submission);
    }

    /// <summary>Marks the latest reply as actually sent, after the admin sent it from their mail client.</summary>
    public async Task<ContactSubmissionDto?> MarkReplySentAsync(string id, int replyIndex, CancellationToken ct = default)
    {
        if (!ObjectId.TryParse(id, out _)) return null;
        var submission = await _submissions.Find(s => s.Id == id).FirstOrDefaultAsync(ct);
        if (submission is null || replyIndex < 0 || replyIndex >= submission.Replies.Count) return null;

        submission.Replies[replyIndex].MarkedSent = true;
        submission.UpdatedAt = DateTime.UtcNow;
        await _submissions.UpdateOneAsync(s => s.Id == id, Builders<ContactSubmission>.Update
            .Set(s => s.Replies, submission.Replies)
            .Set(s => s.UpdatedAt, submission.UpdatedAt), cancellationToken: ct);
        return ToDto(submission);
    }

    public async Task<bool> SetStatusAsync(string id, string status, CancellationToken ct = default)
    {
        if (!ObjectId.TryParse(id, out _) || !ContactStatus.IsValid(status)) return false;
        var result = await _submissions.UpdateOneAsync(s => s.Id == id, Builders<ContactSubmission>.Update
            .Set(s => s.Status, status)
            .Set(s => s.UpdatedAt, DateTime.UtcNow), cancellationToken: ct);
        return result.MatchedCount > 0;
    }

    public async Task<bool> DeleteAsync(string id, CancellationToken ct = default)
    {
        if (!ObjectId.TryParse(id, out _)) return false;
        var result = await _submissions.DeleteOneAsync(s => s.Id == id, ct);
        return result.DeletedCount > 0;
    }

    // ---- Helpers ----

    private ContactSubmissionDto ToDto(ContactSubmission s) => new(
        s.Id!, s.Source, TryDecrypt(s.Name) ?? string.Empty, TryDecrypt(s.Email) ?? string.Empty,
        TryDecrypt(s.Message) ?? string.Empty, s.Latitude, s.Longitude, s.AccuracyMeters, s.UserAgent,
        s.Status, s.CreatedAt, s.ReadAt,
        s.Replies.Select(r => new ContactReplyDto(TryDecrypt(r.Body) ?? string.Empty, r.SentByUserId, r.SentAt, r.MarkedSent))
            .ToList());

    private string Encrypt(string plaintext) => plaintext.Length == 0 ? plaintext : _protector.Encrypt(plaintext);

    /// <summary>Falls back to the raw value if it isn't valid ciphertext, so a read never 500s.</summary>
    private string? TryDecrypt(string? value)
    {
        if (string.IsNullOrEmpty(value)) return value;
        try { return _protector.Decrypt(value); }
        catch (Exception) { return value; }
    }

    private static string? Truncate(string? value, int max) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Length <= max ? value : value[..max];
}
