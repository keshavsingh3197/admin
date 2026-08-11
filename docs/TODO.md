# Admin backlog

Larger asks that came up in review but are their own focused piece of work, not a quick add-on to
whatever prompted them. Move an item from **To do** to **Done** (with the commit/PR it landed in)
when it ships; don't delete history.

## To do

(empty — everything below shipped. Add new items above this line as they come up.)

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
