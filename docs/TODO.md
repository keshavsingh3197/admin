# Admin backlog

Larger asks that came up in review but are their own focused piece of work, not a quick add-on to
whatever prompted them. Move an item from **To do** to **Done** (with the commit/PR it landed in)
when it ships; don't delete history.

## To do

- **Publish the four bumped packages, in dependency order, before the next admin deploy** —
  `KeshavSingh.Security` 0.6.0 → `KeshavSingh.Auth` 0.10.0 → `KeshavSingh.Core` **0.7.0** →
  `KeshavSingh.Mongo.NoSql` 0.4.0. Local builds use sibling `ProjectReference`s so everything
  compiles today; an isolated Render/CI checkout restores from the registry and will fail until
  these are published. `Admin.Api.csproj` already points at the new versions.
  Core went to 0.7.0 (not 0.6.0) for the audit viewer: `LoginAudit` gained `Target`/`Details` and
  `[BsonIgnoreExtraElements]`. The change is additive, so the other consumers
  (`content-blog`, `ghar-ledger`, `Localization`, `Realtime`) were deliberately left on 0.6.0 —
  bumping them would have forced two more package publishes for no behaviour change.
- **Run `db/migrations/005_normalize-usernames.mongodb.js`** against each environment before the
  deploy that carries the username-normalisation change.
- **A real `IEmailSender` / `ISmsSender`.** Both are still wired to the `Logging*` stubs
  (`Program.cs`), so the email and SMS two-factor fallbacks silently deliver nothing in production.
  Either wire a provider or hide those options in the UI, so a locked-out user is not offered a
  channel that cannot deliver. (WhatsApp is real; email and SMS are not.)
- **Split the largest frontend components.** `localization.component.ts` (60 KB),
  `finance-manage.component.ts` (46 KB), `messages.component.ts` (38 KB) and
  `call.service.ts` (37 KB) each carry template, styles and logic in one file, and have no tests.
  Still outstanding, but no longer blocked: the frontend *can* be built and tested in this WSL shell
  by invoking the Windows Node directly —
  `"/mnt/c/Program Files/nodejs/node.exe" node_modules/@angular/cli/bin/ng.js build` (the Linux
  `npm` shim is the part that fails, with `exec: node: Permission denied`).
- **Frontend lint.** There is still no `lint` script; adding `ng lint` needs
  `ng add @angular-eslint/schematics` first, which writes to `package.json` and installs packages.
- **Sixteen components exceed the 4 kB component-style warning budget** (`files`, `messages`,
  `meetings`, `finance-dashboard` worst). Pre-existing, and unchanged by the design-system pass —
  the token sweep grew component CSS by ~2.3 kB in total and pushed nothing over the line — but the
  fix is to move the repeated block/table/form rules into the shared layer in `styles.css` rather
  than to raise the budget.
- **Consider RS256 + JWKS for the SSO signing key.** `SSO.md` already names the tradeoff: the shared
  HS256 secret means every resource server can *mint* tokens, not just validate them. `DataProtector`
  now versions its ciphertext for rotation; the JWT key has no equivalent.

## Done (UI redesign pass)

- **Design system.** `src/styles.css` rewritten around semantic tokens (status, surface, border and
  accent families across all three themes) plus a shared component layer. The ~150-line
  `!important` override block is gone: it existed only because there were no danger/success/warning
  tokens, so ~30 components hard-coded `#d93025`/`#137333` and those hexes could not follow a theme.
  254 hard-coded colours across 29 components were mapped to tokens, and the 62 repeated
  `color-mix(… var(--border))` border recipes were promoted to `--danger-border` and friends.
- **Sidebar shell.** The horizontal header could show six of 27 feature areas, with the other twelve
  behind one "Manage" dropdown. Replaced with a grouped, collapsible sidebar + context topbar.
  `core/models/navigation.ts` is now the single declaration the sidebar and the palette share.
  It also carries `adminOnly`, which fixed a real leak: the old Manage menu listed every Admin page
  — the database console among them — to any signed-in user holding any grant at all.
- **Command palette (⌘K).** Searches pages (from the same permission-filtered list the sidebar
  renders) and real records through `/api/search`, with keyboard navigation.
- **Audit log viewer** (`page.audit`, `/api/audit`, read-only by construction) — plus the recording
  that makes it non-empty: user lifecycle, role/group/grant changes, settings changes, database
  console writes, backups and retention purges now leave durable rows instead of only an `ILogger`
  line in Render's rolling buffer. Administrative events get their own retention window
  (`AdminAuditRetentionDays`, default 730 days) so they are not purged on the sign-in clock.
- **Tests:** frontend 2 failing → 14 passing; backend 207 → 217.

## Done (this review pass)

- **Security review and remediation across `admin` + four shared packages** — see
  [docs/REVIEW.md](REVIEW.md) for the findings, the reasoning, and what changed. Headline items:
  2FA could be rebound or its secret read with a stolen access token (H1/H1b); failed second factors
  never counted toward lockout and TOTP codes replayed (H2); production CORS trusted `localhost` and
  `AllowedOrigins` was dead config (H3); `refresh_tokens` had no index despite being read on every
  page load family-wide (H4). Test count went from 2 (neither testing production code) to 207.

## Done

- **Social login (GitHub only) with mandatory 2FA**, per explicit answers to the 3 policy questions
  below: link-only (never creates an account), GitHub only, and blocks with a message rather than
  enrolling 2FA inline. Shared engine: `AuthEngine.AuthenticateSocialAsync(verifiedEmail, appKey)`
  (shared-security `KeshavSingh.Auth` 0.8.0 → 0.9.0) — looks up the account by the provider's verified
  email (`IAuthUserStore.FindByLoginAsync`, no new-account path exists at all); refuses if no match /
  inactive / locked; refuses with "enroll 2FA first" if `TwoFactorEnabled` is false; otherwise mints
  the SAME two-factor step-token password login does, so `VerifyTwoFactorAsync` and every existing
  2FA endpoint/UI need zero changes — 2FA is not optional here regardless of the email/SMS/WhatsApp
  fallback toggles. New `AuthEvents.LoginSocial{Success,Failed,Blocked}`. Since content-blog/
  ghar-ledger have no login UI of their own and redirect to admin to sign in, this reaches the whole
  family automatically without touching those repos.
  Admin wiring (`SsoController`, reuses the same GitHub OAuth App Client ID/Secret already saved for
  the Packages integration — same app, different `scope` per authorize request, no second GitHub App
  needed): `POST /api/sso/social/github/start` (anonymous — the user isn't signed in yet; returns the
  authorize URL for a full-page nav, scope `read:user user:email`) and `GET
  /api/sso/social/github/callback` (anonymous by necessity; a signed/time-limited `state`, same
  AES-GCM pattern as the Packages OAuth flow, stands in for auth). The callback exchanges the code,
  reads the account's verified PRIMARY email via `GET https://api.github.com/user/emails` (never the
  public/possibly-unverified `/user` email field), then redirects back to `/login` with either
  `?twoFactorToken=&emailFallback=&smsFallback=&whatsAppFallback=` (existing 2FA screen takes over,
  unchanged) or `?socialError=<reason>`.
  Frontend: `login.component.ts` gained a "Sign in with GitHub" button and reads those same query
  params on `ngOnInit` (skipping the silent-session check when present) to land straight on the 2FA
  step or show the plain-language error. Both builds green.
- **Convert Roles and Groups list pages to `brand-data-table`** — done alongside Users (all three now
  share `BrandTableColumn[]` + a projected `<ng-template>` row, `.tbl`/`table-scroll` CSS dropped).
- **Convert Users/Roles/Groups inline "card" add/edit forms to a modal/popup** — new
  `BrandModalComponent` (`brand-modal`, `@keshavsingh3197/web-ui` 0.3.0 → 0.4.0) wraps the existing
  form markup in all three pages; validation/submit stayed exactly as it was, only the container
  changed from an inline `<form class="card">` to `<brand-modal [open] [heading] (closed)>`.
- **GitHub OAuth App integration** ("Connect to GitHub" button) as an alternative to pasting a PAT.
  Confirmed via research: a classic GitHub OAuth App token carries the same scopes
  (`read:packages`, `repo`) a PAT does and is accepted by the exact same GitHub REST endpoints
  `PackageInventoryService` already calls — so the OAuth flow only changes how the token is obtained,
  writing into the SAME encrypted `GitHubPackagesTokenEncrypted` field. Backend: `AppSettings` gained
  `GitHubOAuthClientId` (plain) + `GitHubOAuthClientSecretEncrypted`; new `GitHubOAuthController`
  (`POST /api/settings/github/oauth/start` — Admin-only XHR, returns the GitHub authorize URL to
  navigate the whole page to; `GET /api/settings/github/oauth/callback` — anonymous, since a browser
  redirect can't carry a bearer token, so a tamper-proof/time-limited `state` payload (AES-GCM via the
  existing `DataProtector`, 10-minute TTL, encodes a nonce/trusted-origin/redirect_uri minted during
  the authenticated `/start` call) stands in for auth on this one endpoint). Frontend: Settings screen
  got Client ID/Secret fields + a "Connect to GitHub" button, and shows the exact callback URL to
  register on GitHub's OAuth App page. Both builds green.

- **Shared searchable/filterable data-table component** — `BrandDataTableComponent`
  (`brand-data-table`) added to `@keshavsingh3197/web-ui` (0.2.0 → 0.3.0): a toolbar (search box + one
  dropdown per `filterable` column), sortable column headers, and a projected `<ng-template>` for row
  markup so callers keep full control of cell rendering/actions. Wired into
  `admin/frontend/features/users/users.component.ts` as the first real consumer (search + Roles/
  Status/2FA filters + sortable Email/Name/Last-login, existing inline edit-row panel unchanged).
  Verified via local `npm link` (not yet published — needs `KeshavSingh-Packages-WebUi` pushed to
  master to publish 0.3.0 to GitHub Packages before any other app can restore it for real).
- Dynamic-looking "master table" for the permission *catalog* itself (as opposed to the grants, which
  are already fully DB-backed) — considered and explicitly rejected, not deferred: the catalog is the
  fixed set of `page.*`/`action.*` keys the code actually enforces. Making it admin-editable would let
  someone define a permission key with no enforcement behind it anywhere. If a new page/action needs
  gating, add its key to `PermissionCatalog` and the matching `[RequirePagePermission("...")]` — that
  part stays code, the grant of it to a role/group/user is (and remains) fully dynamic.
