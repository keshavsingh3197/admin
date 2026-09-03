# Admin — code review

**Reviewed:** 2026-09-03 · **Scope:** the `admin` repo (backend, frontend, CI, deploy config) plus the
eight sibling `KeshavSingh.*` packages under `D:\GITHUB` that it consumes as source.

| Area | Size reviewed |
| --- | --- |
| `admin/backend` | 26 controllers, 32 services, 22 models, 23 DTO files — ~10,700 lines C# |
| `admin/frontend` | 35 feature folders, 29 core services — ~17,000 lines TypeScript |
| `admin/tests` | 1 file, 2 tests |
| `shared-security` | `KeshavSingh.Security` 0.5.0, `KeshavSingh.Auth` 0.9.0 |
| `KeshavSingh-Packages-*` | Core 0.5.0, Mongo.NoSql 0.3.0, Realtime 0.7.0, Storage 0.3.0, Finance 0.4.0, Localization 0.2.0 |

Package versions referenced by `Admin.Api.csproj` match every sibling's `<Version>` exactly — no drift.

---

## Status — all findings addressed (2026-09-03)

Every item below has been fixed, plus one further finding uncovered while fixing H1 (see **H1b**).
The work spans four repos, because half the findings live in the shared packages:

| Repo | Version | What changed |
| --- | --- | --- |
| `shared-security` / `KeshavSingh.Security` | 0.5.0 → **0.6.0** | Key rotation in `DataProtector`; TOTP replay rejection; `NeedsRehash` + `DummyHash`; `JsonWebTokenHandler` |
| `shared-security` / `KeshavSingh.Auth` | 0.9.0 → **0.10.0** | Pending TOTP secret + password-gated re-enrollment; lockout on failed 2FA; session revocation on password change; refresh-reuse detection; timing-equalised login |
| `KeshavSingh-Packages-Core` | 0.5.0 → **0.6.0** | Dev-only localhost CORS + explicit origin allowlist; `refresh_tokens`/`audit` indexes; non-blocking security alerts |
| `KeshavSingh-Packages-Nosql` | 0.3.0 → **0.4.0** | Redaction by source path; `$lookup`/`$graphLookup` collection validation |
| `admin` | — | All app-side fixes, 51 real tests, CI test + CodeQL + Dependabot |

> **Publish before deploying.** Local builds resolve the siblings as `ProjectReference`s, so
> everything compiles here today. An isolated CI or Render checkout restores from the registry, so
> the four packages must be published — in dependency order — before `admin` deploys. The
> `PackageReference` versions in `Admin.Api.csproj` are already bumped to match.
> Order: Security → Auth → Core → Mongo.NoSql → admin. See `docs/PACKAGE_RELEASES.md`.

> **Run migration 005 first.** `db/migrations/005_normalize-usernames.mongodb.js` lower-cases
> existing usernames. Without it, anyone whose stored username has a capital letter cannot sign in
> with it, and the new unique index will not build. The migration reports case-collisions rather
> than guessing which account keeps the name.

**207 tests pass** across the five suites (was 2, and neither of those tested production code).

---

## Verdict

This is a well-built codebase. The security *architecture* is deliberate and mostly correct: AES-256-GCM
for secrets at rest, PBKDF2-SHA256 at 210k iterations, refresh tokens stored only as SHA-256 hashes,
access tokens held in memory and never in `localStorage`, default-deny authorization with a real
server-side permission filter, a genuinely well-guarded database console, and a storage layer with a
path-traversal guard and random keys. The commentary explains *why* rather than *what*, which is rare
and valuable.

The problems are concentrated in three places:

1. **The two-factor lifecycle** — several gaps that undercut 2FA as an actual second factor.
2. **The trust boundary of the SSO family** — the CORS predicate is wider than intended, and the
   config that looks like it narrows it is dead.
3. **Verification** — an identity provider with effectively zero test coverage and no CI gate.

Nothing here is catastrophic in the current deployment (small, known user base, admin-only surfaces),
but items H1–H4 are the kind of thing that turns one stolen access token into a full account takeover,
and they are all cheap to fix.

---

## 1. Security

### H1 — Two-factor can be re-bound with a stolen access token, no password required

**Where:** `shared-security/src/KeshavSingh.Auth/AuthController.cs:90-98`,
`AuthEngine.cs:260` (`StartEnrollmentAsync`), `AuthEngine.cs:275` (`ConfirmEnrollmentAsync`)

`POST /api/auth/2fa/enroll/start` and `/2fa/enroll/confirm` are gated by a bare `[Authorize]`.
`StartEnrollmentAsync` overwrites `user.TotpSecretEncrypted` **unconditionally** — including for an
account that already has 2FA enabled — and returns the new secret in plaintext in the response.
`ConfirmEnrollmentAsync` then flips `TwoFactorEnabled` on and issues 10 fresh backup codes.

So an attacker holding only a short-lived access token can:

1. call `enroll/start` → receive a brand-new TOTP secret,
2. call `enroll/confirm` with a code they compute themselves → 2FA is now bound to *their* authenticator,
3. pocket 10 backup codes for persistent access.

The victim's authenticator stops working, and the account's second factor now belongs to the attacker.
Note the inconsistency: `DisableTwoFactorAsync` (`AuthEngine.cs:294`) **does** require the password.
The weaker path bypasses the stronger one's guard.

There is also a plain availability bug in the same code with no attacker involved: a user with working
2FA who opens the enrollment screen and abandons it has their live secret destroyed while
`TwoFactorEnabled` stays `true` — they are locked out to backup codes.

**Fix:**
- Store the pending secret in a **separate** field (`PendingTotpSecretEncrypted`) and promote it to
  `TotpSecretEncrypted` only inside `ConfirmEnrollmentAsync`. This fixes the availability bug outright.
- Require password re-confirmation (or a valid current TOTP code) on `enroll/start` when
  `TwoFactorEnabled` is already true — matching what `2fa/disable` already does.

---

### H1b — Adding a second authenticator handed out the account's live TOTP secret

**Found while fixing H1**, in admin's own code rather than the package.
**Where:** `admin/backend/Services/TwoFactorDeviceService.cs` (`StartEnrollmentAsync`)

The device registry has its own enrollment flow — the one the SPA actually uses — and it is the flow
`POST /api/auth/2fa/devices/enroll/start` exposes behind a bare `[Authorize]`. Unlike H1 it does not
destroy the existing secret; it does something quieter and arguably worse: when 2FA is already
enabled it **decrypts the account's live TOTP secret and returns it in the response**, so a second
device can be enrolled against the same secret.

An attacker holding only an access token could therefore read the victim's authenticator seed and
generate valid codes indefinitely. Nothing about it looks wrong afterwards — no secret was replaced,
so the victim's own authenticator keeps working and no device appears in the list unless the attacker
completes the enrollment.

**Fixed:** once 2FA is enabled, this now requires password confirmation, matching the bar the
*remove device* flow on the same screen already set. The SPA prompts for it inline (mirroring the
existing remove-device prompt). A first-time setup, which reveals a freshly generated secret and no
existing one, is unchanged.

### H2 — A failed second factor never counts toward lockout, and TOTP codes are replayable

**Where:** `shared-security/src/KeshavSingh.Auth/AuthEngine.cs:148-172` (`VerifyTwoFactorAsync`),
`AuthEngine.cs:217` (`VerifyTotp`)

Two separate gaps in the same method:

**No attempt counter.** When `ok` is false, `VerifyTwoFactorAsync` audits and throws — it never calls
`RegisterFailedAttemptAsync`. `FailedLoginAttempts` and `LockoutUntil` are only ever touched by the
*password* step. The email/SMS OTP path has its own `EmailOtpAttempts >= 5` cap
(`AuthEngine.cs:227`), but **TOTP and backup codes have no cap at all**. The only brake is the `auth`
rate-limit policy — 20 requests/minute, partitioned by IP.

A 6-digit TOTP with the ±1 step window has ~3 valid codes out of 1,000,000 at any moment. At 20
guesses/minute from one address that is roughly a 9% chance of a hit per day; from a handful of
addresses it is hours. The 2FA step token stays valid for the whole `TwoFactorTokenMinutes` window and
can be reused for every attempt.

**No replay protection.** `VerifyTotp` checks the code and returns a bool. Nothing records that a code
was consumed, so the same 6 digits work repeatedly for the full ~90-second window. RFC 6238 §5.2
explicitly requires the verifier to reject a second use. (`TwoFactorDeviceService.MarkUsedAsync`,
called from `SsoController` after a successful verify, only stamps `LastUsedAt` on device rows — it is
UI metadata, not replay protection.) Contrast the other two factors, which are both correct already:
the email OTP is cleared on success and backup codes are burned.

**Fix:**
- Call `RegisterFailedAttemptAsync(user)` on every failed 2FA verification so the existing lockout
  policy applies to the second factor too.
- Persist the last accepted TOTP step counter per user and reject any code whose step is `<=` it.

---

### H3 — Production CORS trusts `localhost`, and the config that looks like it restricts origins is dead

**Where:** `KeshavSingh-Packages-Core/src/KeshavSingh.Core/SsoCorsExtensions.cs:30`;
`admin/backend/appsettings.json:13`; `admin/render.yaml:17-20`

```csharp
if (uri.Host == "localhost") return true; // dev, any port
```

This returns before the `https` check and is not gated on the environment, so in **production**
`http://localhost:<anything>` is an accepted credentialed CORS origin on `id.keshavsingh.in`. There is
no functional reason for it — the documented local dev flow (`SSO.md`) runs the API on localhost too,
which is same-origin and needs no CORS entry. It is pure attack surface. (The `SameSite=Lax` cookie
does limit the damage: a localhost origin is cross-site to `keshavsingh.in`, so the SSO cookie is not
sent. It still widens what any local process can reach with a token it has obtained.)

Separately — and worth fixing at the same time — **`AllowedOrigins` is dead configuration.**
`appsettings.json` declares four origins and `render.yaml` wires `AllowedOrigins__0` and `__1` as
service env vars, but the string `AllowedOrigins` appears in **no C# file anywhere** in admin or in any
package. `Program.cs:169` calls `AddKeshavSsoCors(CorsPolicy)` with no origins argument, so the
effective policy is entirely the wildcard-subdomain predicate. An operator editing `AllowedOrigins` in
the Render dashboard to lock things down gets exactly no effect — the most dangerous kind of config,
the kind that looks like a control.

**The underlying design risk:** `*.keshavsingh.in` over https is a *credentialed* CORS allowlist
(`AllowAnyHeader().AllowAnyMethod().AllowCredentials()`) and simultaneously the SSO cookie's scope.
Any subdomain of `keshavsingh.in` is therefore a fully trusted origin that also receives the refresh
cookie. Given the family already points subdomains at GitHub Pages and Render via CNAME, a **dangling
DNS record is a direct path to full session theft** — claim the abandoned host, serve a page, read the
session. This is the single largest architectural security risk in the system.

**Fix:**
- Gate the `localhost` branch on `IHostEnvironment.IsDevelopment()`.
- Either wire `AllowedOrigins` into `AddKeshavSsoCors` as an explicit allowlist (the origins are few and
  already enumerated), or delete it from `appsettings.json` and `render.yaml` so nobody trusts it.
  Prefer the former — an explicit list also closes the subdomain-takeover path.
- Audit DNS for `*.keshavsingh.in` records pointing at hosts you no longer own.

---

### H4 — No index on `refresh_tokens`, on the hottest path in the entire family

**Where:** `KeshavSingh-Packages-Core/src/KeshavSingh.Core/MongoRefreshTokenStore.cs:36`
(`FindByHashAsync`); no `EnsureIndexes` exists for this collection anywhere

Every SPA in the family calls `POST /api/sso/session` on load, which does
`_tokens.Find(x => x.TokenHash == tokenHash)`. There is **no index on `TokenHash`** — no
`CreateOneAsync` for `refresh_tokens` exists in admin or in any package (grep confirms: 15 services call
`CreateOneAsync`, none for this collection). So every single page load anywhere in the family performs
a **full collection scan** of every refresh token ever issued.

The same applies to `ListActiveAsync` (`UserId` + `AppKey`, on every login), to
`SessionRetentionService.CleanupAsync` (a `DeleteMany` scan every 30 minutes), and to the `audit`
collection, which `AnalyticsService` and `DataRetentionService` both query unindexed.

This is listed under Security rather than Performance because it is also the denial-of-service shape:
the cost of an unauthenticated `POST /api/sso/session` grows linearly with the size of a collection an
attacker can help fill.

**Fix:** add an `EnsureIndexesAsync` to `MongoRefreshTokenStore` (unique on `TokenHash`; compound on
`UserId + AppKey + RevokedAt`; a TTL index on `ExpiresAt` would also retire
`SessionRetentionService` entirely) and to the audit collection (`UserId`, `CreatedAt`). Call them from
the startup block in `Program.cs` alongside the other 15.

---

### M1 — Database console redaction is bypassable by renaming a field

**Where:** `KeshavSingh-Packages-Nosql/src/KeshavSingh.Mongo.NoSql/Console/MongoQueryConsole.cs:229`

`Redact` matches on the **output** field name against `RedactedFields`. An aggregation can simply
rename the field on the way out:

```json
[{"$project": {"x": "$PasswordHash"}}]
[{"$group": {"_id": "$TotpSecretEncrypted"}}]
```

Neither output key is in the redaction list, so the values come back in the clear. The documented
guarantee — *"Secret fields (password hashes, tokens, keys) come back redacted whatever collection they
live in"* (`DbConsoleController.cs:20`) — is therefore not true for aggregations. `find` and `distinct`
are correctly covered.

This requires Admin (the console is `[Authorize(Roles = Roles.Admin)]`), so it is not privilege
escalation. It matters because the redaction exists precisely so that a *compromised admin session*
cannot walk off with every password hash and TOTP secret in one query.

**Fix:** apply redaction by **source** path as well — reject `$project`/`$group`/`$addFields`/
`$replaceRoot` expressions that reference a redacted field path — or, simpler and more robust, apply a
`$project` exclusion of the redacted fields as an implicit *first* stage of every pipeline.

### M2 — `$lookup` can read collections the console denied

**Where:** `KeshavSingh-Packages-Nosql/.../Console/MongoConsoleGuard.cs:35-41`

`$lookup` and `$graphLookup` are allowed stages, but their `from:` collection is never passed through
`CollectionName()`. `DeniedCollections` and the `system.*` rule apply only to the *target* collection of
the query. So `db.notes.aggregate([{$lookup: {from: "users", ...}}])` reads a collection the guard was
asked to deny. `DeniedCollections` is empty today, which is the only reason this is not currently
exploitable — but the control silently does not work.

Related, lower: sub-pipelines inside `$lookup` and `$facet` are not stage-validated (only the top level
is). MongoDB itself rejects `$out`/`$merge` in those positions, so the server backstops it, but the
guard's defence-in-depth has a hole.

**Fix:** recurse into `$lookup.from`, `$lookup.pipeline`, `$graphLookup.from`, and `$facet` values and
apply `CollectionName()` / stage validation there too.

### M3 — Anonymous analytics endpoint has no rate limit, and its IP parse is spoofable

**Where:** `admin/backend/Controllers/AnalyticsController.cs:43-59`

`POST /api/analytics/visit` is `[AllowAnonymous]` with **no `[EnableRateLimiting]` attribute** — the
only anonymous write endpoint in the app without one (contact, account-request, visitor-chat and
short-link redirect all have policies). Anyone can write visit records into Mongo in a loop: analytics
poisoning plus unbounded storage growth.

Line 56 also re-parses `X-Forwarded-For` by hand and takes `Split(',')[0]` — the **left-most** entry,
which is entirely client-supplied. `Program.cs` already runs `UseForwardedHeaders`, which consumes the
right-most entry and gives a trustworthy `RemoteIpAddress`; the manual left-most read undoes that. The
result feeds `BuildVisitorKey`, so unique-visitor counts and dedup are trivially forgeable.

**Fix:** add an `[EnableRateLimiting]` policy, and use `HttpContext.Connection.RemoteIpAddress` (already
corrected by the middleware) instead of re-parsing the header.

### M4 — Upload type checking trusts a client-supplied header

**Where:** `admin/backend/Controllers/FilesController.cs:43`

`_opts.AllowedContentTypes.Contains(file.ContentType)` allowlists the multipart `Content-Type`, which
the uploader chooses freely. The stored value is then echoed back on download
(`FilesController.cs:74`). The current allowlist is well chosen — no `text/html`, no `image/svg+xml` —
and `File(stream, contentType, fileName)` forces `Content-Disposition: attachment` while `Program.cs`
sets `X-Content-Type-Options: nosniff` globally, so this is defence-in-depth rather than a live hole.
But the check as written verifies nothing an attacker cannot choose.

**Fix:** sniff the leading magic bytes and store the *detected* type, rejecting a mismatch with the
declared one. Never widen the allowlist to `text/html` or `image/svg+xml` without also serving from a
separate origin.

### M5 — Password change leaves every other session alive

**Where:** `shared-security/src/KeshavSingh.Auth/AuthEngine.cs:308` (`ChangePasswordAsync`)

The method rehashes and saves. It never revokes refresh tokens. A user who changes their password
because they believe it was compromised keeps every attacker session valid until natural expiry —
which for a `.keshavsingh.in` SSO cookie is `RefreshTokenDays`.

**Fix:** call `_tokens.RevokeAllForUserAsync(userId)` after a successful change, then mint a fresh pair
for the caller so the current session survives.

### M6 — Refresh-token rotation has no reuse detection

**Where:** `shared-security/src/KeshavSingh.Auth/AuthEngine.cs:321` (`RefreshAsync`)

Rotation is implemented correctly (revoke the presented token, issue a new one). But presenting an
*already-revoked* token just throws "Session expired" — it does not revoke the token family or raise an
alert. That is the exact signal of a stolen refresh token. Worse, whoever refreshes *first* keeps the
session and the legitimate user is silently signed out, so theft looks like a glitch.

**Fix:** on finding a record whose `RevokedAt` is set, revoke every active token for that user
(`RevokeAllForUserAsync`) and audit it as a security event — this is OAuth 2.0 Security BCP §4.13.2.
`MongoAuditSink` already has a WhatsApp alert path for exactly this class of event.

### M7 — Login timing distinguishes real accounts from unknown ones

**Where:** `shared-security/src/KeshavSingh.Auth/AuthEngine.cs:55-73`

The comment says *"Uniform failure for unknown user / bad password / inactive: no account
enumeration"*, and the *responses* are indeed uniform. The *timing* is not: an unknown user returns
immediately, while a known user runs `PasswordHasher.Verify` — 210,000 PBKDF2 iterations, tens of
milliseconds. That difference is comfortably measurable over the network and turns the login endpoint
into an account-existence oracle.

**Fix:** when no user is found, verify the supplied password against a fixed dummy hash before
returning, so both paths pay the same cost.

### L1 — Username matching is case-sensitive and unindexed

**Where:** `admin/backend/Auth/MongoAuthUserStore.cs:22`

```csharp
.Find(u => (u.Email == lower || u.Username == identifier) && !u.IsDeleted)
```

Email is normalised to lowercase and has a unique index (`AdminSeeder.cs:41`). Username is compared
verbatim, has **no unique index**, and no normalisation. Two consequences: `Bob` and `bob` are distinct
logins, and because the query is an unordered `OR` with `FirstOrDefaultAsync`, a username that happens
to equal another user's email address makes which account gets returned effectively arbitrary.

**Fix:** normalise usernames on write, add a unique (sparse) index, and resolve email before username
rather than in one `OR`.

### L2 — Lockout alerts block the login response

**Where:** `KeshavSingh-Packages-Core/src/KeshavSingh.Core/MongoAuditSink.cs:61`

`await _whatsApp.SendAlertAsync(...)` runs inline in the request path on every lockout — an outbound
HTTPS call to Meta's Cloud API that the user's login response waits on. A slow or hanging Meta endpoint
directly slows the auth path, exactly when it is under attack. The failure is caught, so it cannot
error the request; it can only stall it.

**Fix:** queue it (a `Channel<T>` + hosted service) or at minimum bound it with an explicit
`HttpClient` timeout.

### L3 — Legacy JWT handler

**Where:** `shared-security/src/KeshavSingh.Security/JwtService.cs`

Uses `System.IdentityModel.Tokens.Jwt` / `JwtSecurityTokenHandler`. Microsoft has had this in
maintenance mode for some time in favour of `Microsoft.IdentityModel.JsonWebTokens` /
`JsonWebTokenHandler`, which is faster and is where new work lands. Functionally fine today.

### L4 — No key rotation path for either symmetric key

`DataProtector` (`KeshavSingh.Security/DataProtector.cs`) writes `nonce | tag | ciphertext` with no key
version byte, so rotating `Encryption:DataKey` makes every stored TOTP secret, WhatsApp token, S3 secret
and OAuth client secret permanently undecryptable, with no migration path. Similarly `JwtService` has no
`kid` header, so the shared HS256 signing key cannot be rotated without simultaneously restarting every
service in the family.

**Fix:** prefix the ciphertext with a key-id byte and let `DataProtector` hold a small map of keys
(current + previous). For JWT, this is the natural moment to revisit `SSO.md`'s own noted tradeoff —
RS256 with a JWKS endpoint removes the shared-secret assumption entirely and means a resource server can
no longer *mint* tokens, only validate them.

### L5 — `PasswordHasher` never upgrades a stored hash

`Verify` reads the iteration count from the stored hash, which is the right design — but nothing ever
rehashes. Raising `Iterations` from 210,000 protects only accounts created afterwards.

**Fix:** return a `needsRehash` signal when the stored iteration count is below the current constant,
and rehash inside `LoginAsync` on a successful verify (the plaintext password is in hand exactly there).

### L6 — Short links are an open redirect on the identity provider's own domain

`GET https://id.keshavsingh.in/s/{code}` 302s to any `http`/`https` URL. Target validation is correct
(`ShortLinksController.cs:36`, scheme allowlist; `:39`, code pattern `^[A-Za-z0-9_-]{3,32}$`), and
creation is permission-gated behind `page.shortLinks` — so this is a design consideration rather than a
bug. It is worth naming because the IdP domain is the worst possible host for an open redirect: it is
the domain users are trained to trust for sign-in, and it is a plausible ingredient in OAuth redirect
abuse.

**Fix (optional):** an interstitial for off-family targets, or host `/s/` on a domain that is not the IdP.

### Verified as correct — no action needed

Worth recording so future reviews don't re-litigate these:

- **Crypto primitives.** AES-256-GCM with a fresh 96-bit nonce per encryption and correct framing;
  PBKDF2-HMAC-SHA256 at the OWASP floor with a self-describing hash format and `FixedTimeEquals`;
  SHA-256 for high-entropy tokens only, with the reasoning documented; HMAC-SHA1 for TOTP correctly
  identified as required interop, not a lapse.
- **No injection.** `SearchService.cs:38` uses `Regex.Escape` before building a `BsonRegularExpression`.
  All Mongo access goes through the typed `Builders<T>` API — no string-concatenated queries anywhere.
- **No XSS surface in the SPA.** Zero `innerHTML`, zero `eval`. The single
  `bypassSecurityTrustResourceUrl` (`files.component.ts:498`) wraps a same-origin `blob:` URL from an
  authenticated download.
- **Token storage.** Access tokens are held in memory only; `localStorage` carries nothing but theme
  and A/V device preferences.
- **Storage package.** `LocalDiskObjectStore.ResolveInsideRoot` is a correct traversal guard, keys are
  random and never client-derived, S3 fails closed on incomplete config rather than silently falling
  back to local disk.
- **Authorization coverage.** Every controller is either class-level `[Authorize]` or has each action
  individually attributed; 33 `[Authorize(Roles=...)]` and 6 `[RequirePagePermission]` usages.
  `RequirePagePermissionAttribute` fails **closed** when no evaluator is registered.
- **Secret handling in settings.** `SettingsService` returns `!string.IsNullOrEmpty(...Encrypted)`
  booleans to the UI rather than the secrets themselves.
- **IDOR discipline.** `FilesController` returns 404 rather than 403 on denial, deliberately.

---

## 2. Design and architecture

**Effective-permission resolution is uncached and runs per request.**
`PermissionsService.GetEffectiveAccessAsync` (`admin/backend/Services/PermissionsService.cs:46`) issues
roughly five database round trips — user, groups, custom roles, master keys, website list — and
`IPageAccessEvaluator.HasAccessAsync` calls it on **every request** to a `[RequirePagePermission]`
endpoint. A screen that fires five API calls pays ~25 queries purely for authorization.
`builder.Services.AddMemoryCache()` is registered in `Program.cs:109` and never used for this. Cache
effective access per user with a short TTL, invalidated on role/group/user mutation.

**Service lifetimes are inconsistent without a stated rule.** Nearly everything is `AddSingleton`
(30 services), while the auth stores, `AuthEngine`, `PasskeyService`, `SessionMinter`, `AdminSeeder`
and `ApplicationMetricsService` are `AddScoped`. Both work — `IMongoCollection` is thread-safe, and I
found no captive-dependency violation — but the split appears incidental rather than decided. Write the
rule down: stateless Mongo-backed services singleton, anything touching per-request identity scoped.

**`Program.cs` is doing too much at 363 lines.** It is currently the best map of the system, which is
itself the problem — it mixes DI registration, JWT configuration, seven rate-limit policies, CORS,
security headers, and a 25-line startup migration block. Extract to `AddAdminServices()`,
`AddAdminRateLimiting()`, and `InitializeAdminAsync()` extension methods. The startup block especially:
it is an ordered sequence of `EnsureIndexesAsync`/`SeedAsync` calls whose ordering constraint (localisation
must precede localised content) is expressed only in a comment.

**Service-locator in a controller.** `DbConsoleController.cs:73` reaches into
`HttpContext.RequestServices.GetRequiredService<IConfiguration>()` mid-action for one config value.
Inject it.

**Frontend components are very large.** `localization.component.ts` is 60 KB, `finance-manage` 46 KB,
`messages` 38 KB, `call.service` 37 KB, `settings` 34 KB. These are single-file standalone components
carrying template, styles, and logic. They will be the hardest part of this codebase to change safely,
and they have no tests. Split the largest into presentational sub-components with the data access in
services — `localization` in particular reads as three screens (languages, translations, configuration)
in one file.

**No shared HTTP error handling in the SPA.** 29 core services each handle their own errors; the
interceptor covers 401 only. A single error-normalising interceptor would remove a lot of duplication.

---

## 3. Outdated code and dead weight to remove

**The entire working tree is uncommitted CRLF churn.** `git status` shows 158 modified files;
`git diff --stat` reports 24,437 insertions and 24,437 deletions; `git diff --ignore-cr-at-eol --stat`
reports **0 and 0**. Every file was rewritten with CRLF endings and there is no `.gitattributes`.
Right now `git diff` is useless and the next commit would be an unreviewable 24k-line diff that buries
whatever real change ships with it.

**Fix first, before anything else in this document:**
```bash
printf '* text=auto eol=lf\n' > .gitattributes
git add --renormalize .
git commit -m "Normalize line endings to LF; add .gitattributes"
```

**`backend/tests/Admin.Api.Tests/` — delete it.** It has no `.csproj`, no build references it, and
`Admin.Api.csproj:64-66` explicitly excludes `tests/**` from compilation so the Docker publish does not
choke on it. It is not even a stale duplicate of the live file — it has **diverged**: it references an
`internal static class PackageInventoryServiceTestsHelper` that exists nowhere else in the repo. Two
copies of a test file, neither of which tests production code, one of which cannot compile.

**`AllowedOrigins` — dead configuration in two places.** Covered in H3. Either wire it up or delete it
from `appsettings.json:13` and `render.yaml:17-20`.

**`README.md` API table is stale.** It documents 8 endpoints (notes, config, i18n, health) against 26
controllers. Either regenerate it or replace the table with a pointer to `backend/Controllers/` and an
OpenAPI document — see the feature suggestions below.

**`collStats` is deprecated.** `DbConsoleController.cs:70` uses the `collStats` *command*, deprecated
since MongoDB 6.2 in favour of the `$collStats` aggregation stage. Works today; will not forever.

**A `@deprecated` alias with no removal date.** `frontend/src/app/core/models/config.models.ts:13`
keeps an old type "so existing imports keep compiling". Grep the consumers, migrate, delete.

**`docs/TODO.md` "To do" section is empty** — everything shipped. That is a good sign, but the file is
now a changelog wearing a backlog's name. Consider renaming it, and moving the items from this review
into a fresh backlog.

Notably absent, and worth saying: **no `TODO`/`FIXME`/`HACK` comments anywhere in ~28,000 lines**, and
no commented-out code blocks. That is unusually disciplined.

---

## 4. Testing and quality gates — the biggest gap

**The identity provider for six sites has 2 tests, and neither one tests production code.**

`tests/Admin.Api.Tests/PackageInventoryServiceTests.cs` declares its own
`private static bool VersionMatches(...)` and `private static IReadOnlyList<string> NormalizeTags(...)`
inside the test class — **copies** of the logic in `PackageInventoryService.cs:429`. The tests assert
against the copies. If the real implementation broke tomorrow, both tests would still pass. Effective
backend coverage of admin is zero, and the one service under test is the least security-critical in the
app.

The frontend has one spec (`app.spec.ts`) for ~17,000 lines.

The packages are better — `shared-security` has 2 test projects and 6 files with facts, and every
`KeshavSingh-Packages-*` repo except the two npm ones has a test project. The core crypto is covered.
It is the *application* that is not.

**CI does not run tests at all.** `.github/workflows/backend-ci.yml` restores, builds, and publishes —
no `dotnet test` step. Its path filter is `backend/**`, so changes under `tests/`, `db/` or `docs/`
trigger no workflow whatsoever. There is no `dependabot.yml`, no CodeQL, no Snyk step (despite Snyk
being the organisation's standard for SCA/SAST/container scanning), and no `npm audit`. The frontend has
no `lint` script.

**What to add, in order of value per hour spent:**

1. A `dotnet test` step in `backend-ci.yml`, with the path filter widened to include `tests/**`.
2. Rewrite the two existing tests to call the real `PackageInventoryService` members (make them
   `internal` + `[InternalsVisibleTo]`, or extract them to a testable static class).
3. Tests for the things that would actually hurt if they broke, roughly in this order:
   `PermissionsService.ComputeAccessAsync` (the role/group/wildcard merge is intricate and entirely
   untested), `AuthEngine` 2FA paths (all of H1/H2 would have been caught by tests),
   `MongoConsoleGuard` (pure, no server needed, and M1/M2 are exactly what tests would surface),
   `OAuthStateService.IsFamilyUrl`, and `ShortLinkService.IsValidTargetUrl`.
4. `dependabot.yml` for NuGet + npm, and a Snyk or CodeQL step.
5. Frontend: a `lint` script, plus specs for `auth.guard`, `auth.interceptor`, and `rbac-scope.util`.

Also worth setting: no `Directory.Build.props`, no `.editorconfig`, and no
`TreatWarningsAsErrors`/`AnalysisMode` in any csproj. `Nullable` is enabled, which is the important
half.

---

## 5. Performance

Ranked by likely impact:

1. **Missing indexes** — see H4. Affects every page load in the family. Fix this first.
2. **Permission resolution per request** — ~5 queries × every gated request, uncached.
3. **`DbConsoleController.Usage`** runs `collStats` in a loop, one command per collection, on every
   call to the database screen.
4. **`SearchService`** uses unanchored `$regex` across notes, short links and users. Mongo cannot use an
   index for a non-prefix regex, so this is a full scan of three collections per search. A text index
   (`$text`) or an anchored prefix match would fix it.
5. **`SessionRetentionCleanupWorker`** runs three unindexed `DeleteMany` scans every 30 minutes. A TTL
   index on `ExpiresAt` would replace the refresh-token half entirely.
6. **Frontend bundle** — the Angular budget is 500 kB warn / 1 MB error, but with 35 eagerly-imported
   feature folders and several 30–60 KB components it is worth checking the current initial bundle.
   Routes are already lazy-loaded, which is the main thing.

---

## 6. Features worth adding

**Security, highest value first**

- **Passkey-only sign-in as a first-class path.** The plumbing already exists (`PasskeyService`,
  `SessionMinter`, FIDO2 4.0.1, `WebAuthn` config with a parent-domain RP ID) and it is currently a
  second factor / convenience. Promoting it to a primary credential removes the password brute-force
  surface, and the parent-domain RP ID means one passkey already works across the whole family.
- **Step-up authentication for sensitive actions.** A recurring theme in the findings above (H1, M5) is
  that a valid access token is sufficient for actions that should require re-proving identity: changing
  2FA enrollment, rotating the storage secret, using the DB console with writes on, deleting a user.
  One `[RequireRecentAuth(minutes: 5)]` attribute would close a whole class of issue at once.
- **Admin-visible session management.** `ListAllActiveForUserAsync` already exists in the store and
  `SessionsController` exposes some of this — extend it to "sign out every device", surfaced in the UI
  and triggered automatically on password change (M5).
- **Security event notifications to the affected user**, not just the admin WhatsApp number: new device
  sign-in, 2FA changed, password changed. The `IEmailSender`/`IWhatsAppSender` abstractions are already
  in place — and note that `IEmailSender` is still wired to `LoggingEmailSender` (`Program.cs:129`), so
  no email actually leaves the system today. That is worth knowing.

**Operational**

- **A real email sender.** As above: `LoggingEmailSender` and `LoggingSmsSender` mean the email and SMS
  2FA fallbacks silently do nothing in production. Either wire a provider or hide those options in the
  UI so a locked-out user is not offered a channel that cannot deliver.
- **OpenAPI/Swagger.** 26 controllers and a stale hand-written README table. `Microsoft.AspNetCore.OpenApi`
  is in the box for net10.0; a generated document also gives sibling apps a typed client.
- **Structured logging + a health dashboard.** `HealthCheckService` exists and is Admin-gated; the
  organisation standard is New Relic in open formats. Nothing currently exports metrics.
- **Automated backup verification.** `DatabaseBackupService` creates backups; nothing restores or
  verifies one. An untested backup is a hope, not a backup.
- **Audit log viewer with retention.** `DataRetentionService` purges login logs, and `audit` is queried
  by analytics, but there is no first-class "who did what" screen for the non-login events (DB console
  writes, settings changes, role grants) — which is exactly what you would want after an incident.

---

## 7. Suggested order of work

**Do first — cheap, and unblocks reviewing everything else**
1. `.gitattributes` + `git add --renormalize .` (Section 3)
2. Delete `backend/tests/` (Section 3)

**Then — security, in this order**
3. H4 — indexes on `refresh_tokens` and `audit`
4. H1 — separate pending TOTP secret + password re-confirmation on re-enrollment
5. H2 — lockout on failed 2FA + TOTP replay rejection
6. H3 — gate `localhost` CORS on Development; wire or delete `AllowedOrigins`; audit DNS
7. M5, M6 — revoke sessions on password change; detect refresh-token reuse
8. M3 — rate-limit `POST /api/analytics/visit`; use the framework's `RemoteIpAddress`
9. M1, M2 — console redaction by source path; validate `$lookup.from`
10. M4, M7, L1 — upload sniffing; dummy-hash on unknown user; username normalisation + index

**Then — make it stick**
11. `dotnet test` in CI, path filter widened, and rewrite the two vacuous tests
12. Tests for `PermissionsService`, `AuthEngine` 2FA, `MongoConsoleGuard`
13. Dependabot + Snyk/CodeQL

**Then — design**
14. Cache effective permissions
15. Split `Program.cs`; split the 60 KB / 46 KB frontend components
16. L2–L5 (async alerts, `JsonWebTokenHandler`, key rotation, rehash-on-login)

---

*Findings cite `file:line` against the tree as of 2026-09-03. Line numbers in `admin` are stable; the
package citations refer to the sibling checkouts under `D:\GITHUB`, which build as `ProjectReference`s
locally.*
