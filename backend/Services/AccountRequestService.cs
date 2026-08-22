using Admin.Api.Dtos;
using Admin.Api.Models;
using KeshavSingh.Core;
using KeshavSingh.Security;
using MongoDB.Driver;

namespace Admin.Api.Services;

/// <summary>
/// The queue behind "request an account".
///
/// This identity provider has no self-registration: submitting a request creates nothing a person can
/// sign in with. Approval is the only path that mints a <see cref="User"/>, and until an admin takes
/// that action a login attempt with the applicant's address fails exactly as an unknown address does.
///
/// The submit path is deliberately incurious in what it reports back — see
/// <see cref="AccountRequestSubmitResult"/> — and it never logs the applicant's address; audit lines
/// carry request ids and the deciding admin's user id instead.
/// </summary>
public sealed class AccountRequestService
{
    private readonly IMongoCollection<AccountRequest> _requests;
    private readonly IMongoCollection<User> _users;
    private readonly PasswordHasher _passwords;
    private readonly ILogger<AccountRequestService> _log;

    public AccountRequestService(MongoDbService db, PasswordHasher passwords, ILogger<AccountRequestService> log)
    {
        _requests = db.GetCollection<AccountRequest>("account_requests");
        _users = db.GetCollection<User>("users");
        _passwords = passwords;
        _log = log;
    }

    public Task EnsureIndexesAsync() =>
        _requests.Indexes.CreateManyAsync(new[]
        {
            new CreateIndexModel<AccountRequest>(
                Builders<AccountRequest>.IndexKeys.Descending(r => r.CreatedAt),
                new CreateIndexOptions { Name = "ix_account_request_created" }),
            new CreateIndexModel<AccountRequest>(
                Builders<AccountRequest>.IndexKeys.Ascending(r => r.Status).Descending(r => r.CreatedAt),
                new CreateIndexOptions { Name = "ix_account_request_status_created" }),
            // At most one request per address may be open at a time. Partial, so a rejected applicant
            // can apply again and an approved one does not block their own address forever.
            new CreateIndexModel<AccountRequest>(
                Builders<AccountRequest>.IndexKeys.Ascending(r => r.Email),
                new CreateIndexOptions<AccountRequest>
                {
                    Unique = true,
                    Name = "ux_account_request_pending_email",
                    PartialFilterExpression = Builders<AccountRequest>.Filter.Eq(r => r.Status, AccountRequestStatus.Pending),
                }),
        });

    // ---- Public ----

    /// <summary>
    /// Records a request, unless the address already has an account or an open request. The caller
    /// is told the same thing either way; only the log distinguishes the cases, and only by id.
    /// </summary>
    public async Task SubmitAsync(AccountRequestSubmitRequest req, CancellationToken ct = default)
    {
        var email = req.Email.Trim().ToLowerInvariant();

        // Already a user, or already waiting: record nothing new and say nothing different.
        if (await _users.Find(u => u.Email == email && !u.IsDeleted).AnyAsync(ct)) return;
        if (await _requests.Find(r => r.Email == email && r.Status == AccountRequestStatus.Pending).AnyAsync(ct)) return;

        var request = new AccountRequest
        {
            Email = email,
            DisplayName = req.DisplayName.Trim(),
            Reason = string.IsNullOrWhiteSpace(req.Reason) ? null : req.Reason.Trim(),
            PasswordHash = _passwords.Hash(req.Password),
        };

        try
        {
            await _requests.InsertOneAsync(request, cancellationToken: ct);
        }
        catch (MongoWriteException e) when (e.WriteError?.Category == ServerErrorCategory.DuplicateKey)
        {
            // Two submissions raced; the unique index kept the first. Nothing to report.
            return;
        }

        _log.LogInformation("Account request {RequestId} received at {Timestamp:o}", request.Id, request.CreatedAt);
    }

    // ---- Admin ----

    public async Task<IReadOnlyList<AccountRequestDto>> ListAsync(
        string? status, int limit, CancellationToken ct = default)
    {
        var filter = Builders<AccountRequest>.Filter.Empty;
        if (!string.IsNullOrWhiteSpace(status) &&
            Enum.TryParse<AccountRequestStatus>(status, ignoreCase: true, out var parsed))
        {
            filter = Builders<AccountRequest>.Filter.Eq(r => r.Status, parsed);
        }

        var rows = await _requests.Find(filter)
            .SortByDescending(r => r.CreatedAt)
            .Limit(Math.Clamp(limit, 1, 500))
            .ToListAsync(ct);

        return rows.Select(Map).ToList();
    }

    public async Task<AccountRequestSummary> SummaryAsync(CancellationToken ct = default)
    {
        var pending = await _requests.CountDocumentsAsync(
            r => r.Status == AccountRequestStatus.Pending, cancellationToken: ct);
        var total = await _requests.CountDocumentsAsync(
            Builders<AccountRequest>.Filter.Empty, cancellationToken: ct);
        return new AccountRequestSummary((int)pending, (int)total);
    }

    /// <summary>
    /// Turns a pending request into a real account. Returns the outcome rather than throwing, so the
    /// controller can map "already a user" to a conflict and everything else to a clean 404.
    /// </summary>
    public async Task<ApprovalOutcome> ApproveAsync(
        string id, string adminUserId, List<string>? roles, string? note, CancellationToken ct = default)
    {
        var request = await _requests.Find(r => r.Id == id).FirstOrDefaultAsync(ct);
        if (request is null) return ApprovalOutcome.NotFound;
        if (request.Status != AccountRequestStatus.Pending) return ApprovalOutcome.NotPending;
        if (string.IsNullOrEmpty(request.PasswordHash)) return ApprovalOutcome.NotPending;

        // An admin may have created the account by hand in the meantime.
        if (await _users.Find(u => u.Email == request.Email && !u.IsDeleted).AnyAsync(ct))
            return ApprovalOutcome.AlreadyAUser;

        var granted = NormalizeRoles(roles);
        if (granted is null) return ApprovalOutcome.InvalidRoles;

        var user = new User
        {
            Email = request.Email,
            DisplayName = request.DisplayName,
            PasswordHash = request.PasswordHash,
            Roles = granted,
            // They chose this password themselves minutes ago, so there is nothing temporary to
            // rotate — unlike an admin-created account, which starts on a password someone else knows.
            MustChangePassword = false,
        };
        await _users.InsertOneAsync(user, cancellationToken: ct);

        await _requests.UpdateOneAsync(r => r.Id == id,
            Builders<AccountRequest>.Update
                .Set(r => r.Status, AccountRequestStatus.Approved)
                .Set(r => r.CreatedUserId, user.Id)
                .Set(r => r.DecidedByUserId, adminUserId)
                .Set(r => r.DecidedAt, DateTime.UtcNow)
                .Set(r => r.DecisionNote, Trim(note))
                // The hash now lives on the user; there is no reason to keep a second copy.
                .Set(r => r.PasswordHash, null),
            cancellationToken: ct);

        _log.LogInformation(
            "Account request {RequestId} approved by {AdminId} as user {UserId} at {Timestamp:o}",
            id, adminUserId, user.Id, DateTime.UtcNow);

        return ApprovalOutcome.Approved;
    }

    /// <summary>Refuses a request and discards the password hash it was carrying.</summary>
    public async Task<bool> RejectAsync(string id, string adminUserId, string? note, CancellationToken ct = default)
    {
        var result = await _requests.UpdateOneAsync(
            r => r.Id == id && r.Status == AccountRequestStatus.Pending,
            Builders<AccountRequest>.Update
                .Set(r => r.Status, AccountRequestStatus.Rejected)
                .Set(r => r.DecidedByUserId, adminUserId)
                .Set(r => r.DecidedAt, DateTime.UtcNow)
                .Set(r => r.DecisionNote, Trim(note))
                .Set(r => r.PasswordHash, null),
            cancellationToken: ct);

        if (result.MatchedCount == 0) return false;

        _log.LogInformation("Account request {RequestId} rejected by {AdminId} at {Timestamp:o}",
            id, adminUserId, DateTime.UtcNow);
        return true;
    }

    public enum ApprovalOutcome
    {
        Approved,
        NotFound,
        NotPending,
        AlreadyAUser,
        InvalidRoles,
    }

    /// <summary>Viewer unless the admin says otherwise, and never a role outside the known set.</summary>
    private static List<string>? NormalizeRoles(List<string>? roles)
    {
        if (roles is null || roles.Count == 0) return new List<string> { Roles.Viewer };

        var cleaned = roles.Where(r => !string.IsNullOrWhiteSpace(r)).Select(r => r.Trim()).Distinct().ToList();
        return cleaned.All(Roles.IsValid) ? cleaned : null;
    }

    private static string? Trim(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static AccountRequestDto Map(AccountRequest r) => new(
        r.Id, r.Email, r.DisplayName, r.Reason, r.Status, r.CreatedAt, r.DecidedAt, r.DecisionNote, r.CreatedUserId);
}
