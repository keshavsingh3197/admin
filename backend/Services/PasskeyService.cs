using Admin.Api.Auth;
using Admin.Api.Dtos;
using Admin.Api.Models;
using Fido2NetLib;
using Fido2NetLib.Objects;
using KeshavSingh.Security;
using Microsoft.Extensions.Options;
using MongoDB.Driver;
using System.Text;
using System.Text.Json.Nodes;

namespace Admin.Api.Services;

/// <summary>Thrown when a passkey ceremony cannot be completed. The message is safe to surface;
/// it never contains internal detail (see the org error-handling baseline).</summary>
public sealed class PasskeyException(string message) : Exception(message);

/// <summary>
/// Drives the FIDO2/WebAuthn ceremonies and persists credentials. Registration is done by an
/// authenticated user; login is usernameless (discoverable credentials) so no account has to be
/// named up front. The private key never leaves the authenticator — only its public key, id and
/// signature counter are stored, none of which are secret.
/// </summary>
public sealed class PasskeyService
{
    private readonly IFido2 _fido2;
    private readonly WebAuthnOptions _options;
    private readonly PasswordHasher _passwords;
    private readonly IMongoCollection<PasskeyCredential> _credentials;
    private readonly IMongoCollection<WebAuthnChallenge> _challenges;
    private readonly IMongoCollection<User> _users;

    public PasskeyService(IFido2 fido2, IOptions<WebAuthnOptions> options, PasswordHasher passwords, MongoDbService db)
    {
        _fido2 = fido2;
        _options = options.Value;
        _passwords = passwords;
        _credentials = db.GetCollection<PasskeyCredential>("passkey_credentials");
        _challenges = db.GetCollection<WebAuthnChallenge>("webauthn_challenges");
        _users = db.GetCollection<User>("users");
    }

    /// <summary>
    /// Ensures the collection indexes at startup: a TTL index that lets MongoDB reap expired
    /// challenges automatically, a unique index on the credential id (the usernameless-login lookup
    /// key), and a per-user index for listing. Idempotent — safe to call on every boot.
    /// </summary>
    public async Task EnsureIndexesAsync(CancellationToken ct = default)
    {
        await _challenges.Indexes.CreateManyAsync(new[]
        {
            new CreateIndexModel<WebAuthnChallenge>(
                Builders<WebAuthnChallenge>.IndexKeys.Ascending(c => c.ExpiresAt),
                new CreateIndexOptions { Name = "ttl_expiresAt", ExpireAfter = TimeSpan.Zero }),
            new CreateIndexModel<WebAuthnChallenge>(
                Builders<WebAuthnChallenge>.IndexKeys.Ascending(c => c.Handle),
                new CreateIndexOptions { Name = "ux_handle", Unique = true }),
        }, ct);

        await _credentials.Indexes.CreateManyAsync(new[]
        {
            new CreateIndexModel<PasskeyCredential>(
                Builders<PasskeyCredential>.IndexKeys.Ascending(c => c.CredentialId),
                new CreateIndexOptions { Name = "ux_credentialId", Unique = true }),
            new CreateIndexModel<PasskeyCredential>(
                Builders<PasskeyCredential>.IndexKeys.Ascending(c => c.UserId),
                new CreateIndexOptions { Name = "ix_userId" }),
        }, ct);
    }

    // ---- Registration (authenticated) ----

    public async Task<PasskeyRegisterBeginResponse> BeginRegistrationAsync(string userId, CancellationToken ct)
    {
        var user = await _users.Find(u => u.Id == userId && !u.IsDeleted).FirstOrDefaultAsync(ct)
            ?? throw new PasskeyException("Account not found.");

        var existing = await _credentials.Find(c => c.UserId == userId).ToListAsync(ct);
        var exclude = existing
            .Select(c => new PublicKeyCredentialDescriptor(Base64UrlDecode(c.CredentialId)))
            .ToList();

        var options = _fido2.RequestNewCredential(new RequestNewCredentialParams
        {
            User = new Fido2User
            {
                Id = Encoding.UTF8.GetBytes(user.Id),
                Name = user.Email,
                DisplayName = string.IsNullOrWhiteSpace(user.DisplayName) ? user.Email : user.DisplayName,
            },
            ExcludeCredentials = exclude,
            // Discoverable + user-verifying => a real passkey that supports usernameless login.
            AuthenticatorSelection = new AuthenticatorSelection
            {
                ResidentKey = ResidentKeyRequirement.Required,
                UserVerification = UserVerificationRequirement.Required,
            },
            AttestationPreference = AttestationConveyancePreference.None,
            PubKeyCredParams = PubKeyCredParam.Defaults,
        });

        var optionsJson = options.ToJson();
        var handle = await StoreChallengeAsync("register", userId, optionsJson, ct);
        return new PasskeyRegisterBeginResponse(handle, JsonNode.Parse(optionsJson)!);
    }

    public async Task<PasskeyListItem> CompleteRegistrationAsync(
        string userId, PasskeyRegisterCompleteRequest req, CancellationToken ct)
    {
        if (req.Response is null) throw new PasskeyException("Missing attestation response.");
        var challenge = await ConsumeChallengeAsync(req.Handle, "register", ct);
        if (challenge.UserId != userId) throw new PasskeyException("Challenge does not belong to this account.");

        RegisteredPublicKeyCredential credential;
        try
        {
            credential = await _fido2.MakeNewCredentialAsync(new MakeNewCredentialParams
            {
                AttestationResponse = req.Response,
                OriginalOptions = CredentialCreateOptions.FromJson(challenge.OptionsJson),
                IsCredentialIdUniqueToUserCallback = async (p, innerCt) =>
                {
                    var id = Base64UrlEncode(p.CredentialId);
                    var count = await _credentials.CountDocumentsAsync(c => c.CredentialId == id, cancellationToken: innerCt);
                    return count == 0;
                },
            }, ct);
        }
        catch (Exception ex) when (ex is not PasskeyException)
        {
            throw new PasskeyException("Could not register this passkey.");
        }

        var record = new PasskeyCredential
        {
            UserId = userId,
            CredentialId = Base64UrlEncode(credential.Id),
            PublicKey = credential.PublicKey,
            UserHandle = Encoding.UTF8.GetBytes(userId),
            SignCount = credential.SignCount,
            Name = Sanitize(req.Name),
            AaGuid = credential.AaGuid,
            Transports = credential.Transports?.Select(t => t.ToString()).ToArray() ?? Array.Empty<string>(),
            IsBackedUp = credential.IsBackedUp,
        };
        await _credentials.InsertOneAsync(record, cancellationToken: ct);
        return ToListItem(record);
    }

    // ---- Login (anonymous, usernameless) ----

    public async Task<PasskeyLoginBeginResponse> BeginLoginAsync(CancellationToken ct)
    {
        var options = _fido2.GetAssertionOptions(new GetAssertionOptionsParams
        {
            AllowedCredentials = Array.Empty<PublicKeyCredentialDescriptor>(), // usernameless / discoverable
            UserVerification = UserVerificationRequirement.Required,
        });
        var optionsJson = options.ToJson();
        var handle = await StoreChallengeAsync("assert", null, optionsJson, ct);
        return new PasskeyLoginBeginResponse(handle, JsonNode.Parse(optionsJson)!);
    }

    /// <summary>Verifies an assertion and returns the authenticated user. Fails closed.</summary>
    public async Task<User> CompleteLoginAsync(PasskeyLoginCompleteRequest req, CancellationToken ct)
    {
        if (req.Response is null) throw new PasskeyException("Missing assertion response.");
        var challenge = await ConsumeChallengeAsync(req.Handle, "assert", ct);

        var credentialId = Base64UrlEncode(req.Response.RawId);
        var stored = await _credentials.Find(c => c.CredentialId == credentialId).FirstOrDefaultAsync(ct)
            ?? throw new PasskeyException("Passkey not recognised.");

        var user = await _users.Find(u => u.Id == stored.UserId && !u.IsDeleted).FirstOrDefaultAsync(ct);
        if (user is null || !user.IsActive)
            throw new PasskeyException("This account cannot sign in.");

        VerifyAssertionResult result;
        try
        {
            result = await _fido2.MakeAssertionAsync(new MakeAssertionParams
            {
                AssertionResponse = req.Response,
                OriginalOptions = AssertionOptions.FromJson(challenge.OptionsJson),
                StoredPublicKey = stored.PublicKey,
                StoredSignatureCounter = (uint)stored.SignCount,
                IsUserHandleOwnerOfCredentialIdCallback = (p, innerCt) =>
                    Task.FromResult(p.UserHandle.AsSpan().SequenceEqual(stored.UserHandle)),
            }, ct);
        }
        catch (Exception ex) when (ex is not PasskeyException)
        {
            throw new PasskeyException("Passkey verification failed.");
        }

        await _credentials.UpdateOneAsync(
            c => c.Id == stored.Id,
            Builders<PasskeyCredential>.Update
                .Set(c => c.SignCount, result.SignCount)
                .Set(c => c.LastUsedAt, DateTime.UtcNow),
            cancellationToken: ct);

        return user;
    }

    // ---- Management ----

    public async Task<IReadOnlyList<PasskeyListItem>> ListAsync(string userId, CancellationToken ct)
    {
        var creds = await _credentials.Find(c => c.UserId == userId)
            .SortByDescending(c => c.CreatedAt).ToListAsync(ct);
        return creds.Select(ToListItem).ToList();
    }

    /// <summary>
    /// Removes one of the caller's own passkeys after a step-up re-authentication: the account
    /// password must be re-entered and is verified server-side. Removing a sign-in credential is a
    /// sensitive change, so it is never done on the session cookie alone. Returns false only when
    /// the passkey isn't the caller's; a wrong password fails closed with an exception.
    /// </summary>
    public async Task<bool> RemoveAsync(string userId, string id, string password, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(password)) throw new PasskeyException("Enter your password to confirm.");

        var user = await _users.Find(u => u.Id == userId && !u.IsDeleted).FirstOrDefaultAsync(ct)
            ?? throw new PasskeyException("Account not found.");
        if (!_passwords.Verify(password, user.PasswordHash))
            throw new PasskeyException("Password is incorrect.");

        var res = await _credentials.DeleteOneAsync(c => c.Id == id && c.UserId == userId, ct);
        return res.DeletedCount > 0;
    }

    // ---- Challenge store (single-use, short-lived) ----

    private async Task<string> StoreChallengeAsync(string purpose, string? userId, string optionsJson, CancellationToken ct)
    {
        var handle = TokenHasher.NewOpaqueToken();
        await _challenges.InsertOneAsync(new WebAuthnChallenge
        {
            Handle = handle,
            Purpose = purpose,
            UserId = userId,
            OptionsJson = optionsJson,
            ExpiresAt = DateTime.UtcNow.AddMinutes(_options.ChallengeMinutes),
        }, cancellationToken: ct);
        return handle;
    }

    private async Task<WebAuthnChallenge> ConsumeChallengeAsync(string handle, string purpose, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(handle)) throw new PasskeyException("Missing challenge handle.");
        // Atomically fetch-and-remove so a challenge can never be replayed.
        var challenge = await _challenges.FindOneAndDeleteAsync(c => c.Handle == handle, cancellationToken: ct);
        if (challenge is null || challenge.Purpose != purpose)
            throw new PasskeyException("This request has expired. Please try again.");
        if (challenge.ExpiresAt < DateTime.UtcNow)
            throw new PasskeyException("This request has expired. Please try again.");
        return challenge;
    }

    // ---- Helpers ----

    private static PasskeyListItem ToListItem(PasskeyCredential c) =>
        new(c.Id, c.Name, c.IsBackedUp, c.CreatedAt, c.LastUsedAt);

    private static string? Sanitize(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return null;
        name = name.Trim();
        return name.Length > 60 ? name[..60] : name;
    }

    private static string Base64UrlEncode(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] Base64UrlDecode(string value)
    {
        var s = value.Replace('-', '+').Replace('_', '/');
        switch (s.Length % 4) { case 2: s += "=="; break; case 3: s += "="; break; }
        return Convert.FromBase64String(s);
    }
}
