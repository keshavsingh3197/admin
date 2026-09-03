# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`/mnt/d/GITHUB/CLAUDE.md` (the parent container folder) covers the cross-repo rules — sibling
checkouts, `PACKAGES_READ_TOKEN`, package publishing order. This file is admin-specific.

## What this repo is

`admin` is the **identity provider** for the whole `*.keshavsingh.in` family, plus the admin SPA that
manages it. It is the only service that *issues* JWTs; every other backend only validates them. It is
also the single writer for the family's runtime config and translations, and the host for chat,
calls, files, finance, analytics and the website registry.

- Frontend `admin.keshavsingh.in` (GitHub Pages) · API `id.keshavsingh.in` (Render Docker) · MongoDB
  `AdminDb`.
- The API **must** be served from a `keshavsingh.in` subdomain — a host on `onrender.com` cannot set
  the `.keshavsingh.in` SSO cookie. See `SSO.md`.

## Commands

There is **no solution file**, so always pass a project path:

```bash
cd backend && dotnet run                       # API on http://localhost:5000, needs local MongoDB
dotnet build backend/Admin.Api.csproj
dotnet test tests/Admin.Api.Tests/Admin.Api.Tests.csproj                       # xUnit
dotnet test tests/Admin.Api.Tests/Admin.Api.Tests.csproj --filter FullyQualifiedName~PackageInventory
```

```bash
cd frontend
npm test                                        # @angular/build:unit-test + vitest
npx ng test --include src/app/**/foo.spec.ts    # single spec (builder option, not a vitest flag)
```

Migrations run from the **repo root** so the `load()` paths in `_run-all.mongodb.js` resolve:

```bash
mongosh "<connection string>" db/migrations/_run-all.mongodb.js
```

## Architecture

**The app is thin; the engines are packages.** `backend/Program.cs` is the map of what is wired from
where. `AddKeshavAuthControllers` / `AddKeshavChatControllers` / `AddKeshavLocalizationControllers`
mount whole API surfaces (`/api/auth/*`, `/api/chat/*`, `/api/i18n/**`, `/api/app-config/**`) that
have **no controller in this repo**; the app supplies only the adapters (`MongoAuthUserStore`,
`AdminChatUserDirectory`, `SettingsService` as `IAuthSettings`/`IStorageSettingsSource`/
`IWhatsAppSettings`, `PermissionsService` as `IPageAccessEvaluator`) and its own seeds. Before adding
an endpoint, check whether the package already owns that surface.

**Configuration is layered, and the layer decides where an edit goes.**

| Layer | Where | When it is read | Edit it via |
| --- | --- | --- | --- |
| Secrets (`Jwt__SigningKey`, `Encryption__DataKey`, `MongoDbSettings__ConnectionString`, `Seed__*`, TURN) | env vars only | startup | Render dashboard / user-secrets |
| `appsettings.json` | git | startup | code change + deploy |
| Mongo `config` / `app-config` (non-secret Jwt/Sso/WebAuthn/Seed) | DB, layered over appsettings by `Auth/AppConfigLoader.cs` | **startup only** | migration or DB edit + **restart** |
| Mongo `settings` / `app-settings` (auth knobs, branding, storage provider, WhatsApp) | DB, live via `SettingsService` | per request | admin Settings screen |
| `locales` / `translations` / `config_entries` / `website_content` | DB | per request, cached + ETagged | admin Localization screen |

`AppConfigLoader` never emits secret keys, so the DB layer can only override non-secret config.

**SSO.** `SsoController` (`/api/sso/*`) wraps the shared `AuthEngine` so the rotating refresh token
goes out **only** as the HttpOnly `ks_sso` cookie on `.keshavsingh.in`; the short-lived access token
is returned in the body and held in memory by each SPA. Sibling apps call `POST /api/sso/session`
with credentials on load. `SessionMinter` mints the same shape for passkey logins by composing
`JwtService` + `IRefreshTokenStore` — never re-implement token crypto. All services share one HS256
key with issuer `keshavsingh-idp` / audience `keshavsingh-apps`; the key must be byte-identical
everywhere. SignalR passes the JWT as `?access_token=`, accepted **only** on `/hubs/chat`.

**Authorization is two layers.** The fixed roles `Admin`/`Editor`/`Viewer` are the enforced API
boundary. On top, `Models/PermissionCatalog.cs` defines `page.*` / `action.*` keys (assignable under
the `admin` website key) and `site.*` keys (under any other website key, or `*`), granted through
custom roles/groups scoped per website by `WebsiteGrant`. Adding a gated page means three edits that
must agree: a `PermissionCatalog` entry, `[RequirePagePermission("page.x")]` on the controller (the
attribute is from `KeshavSingh.Auth`, resolved via `IPageAccessEvaluator` → `PermissionsService`),
and `pagePermissionGuard('page.x')` on the route in `frontend/src/app/app.routes.ts`.

**Nothing user-facing is hard-coded.** Strings, URLs, icons, flags and limits live in Mongo and are
served from `GET /api/config` + `/api/i18n/**`. `Localization/AdminAppSeeds.cs` and
`PublicSiteSeeds.cs` are this repo's seed content (applied additively at startup — an editor's change
is never overwritten); a new config key also needs `CONFIG_KEYS` in `@keshavsingh3197/web-config`
published before consumers can read it. Registry URLs/icons are host-allowlisted by
`Localization:AllowedHosts` because they render into anonymous pages. Full model: `docs/LOCALIZATION.md`.

**Startup does the schema work.** The tail of `Program.cs` calls `EnsureIndexesAsync`/`SeedAsync` on
each service — indexes and system seeds belong there (idempotent), while data changes and config
seeds belong in `db/migrations/NNN_*.mongodb.js` (tracked in `_migrations`, idempotent, listed in
`_run-all.mongodb.js`).

**Frontend.** Standalone components, one lazy-loaded folder per feature under
`src/app/features/`, HTTP + state in `src/app/core/services/`. `environment.apiUrl` is the only value
the SPA hard-codes — everything else comes from `/api/config`. `auth.interceptor.ts` attaches the
bearer to same-origin API calls and retries a 401 once through a silent SSO session (never on
`/sso/*`), then fails closed to `/login`.

## Traps

- The real test project is `tests/Admin.Api.Tests/`. `backend/tests/Admin.Api.Tests/` is a stale copy
  with no `.csproj`, and `Admin.Api.csproj` excludes `tests/**` from compile so the Docker publish
  doesn't try to build xUnit sources.
- **Backend CI never runs tests** — `.github/workflows/backend-ci.yml` only restores, builds and
  publishes, and its path filter is `backend/**`, so changes under `tests/`, `db/` or `docs/` trigger
  no workflow at all. Run `dotnet test` yourself.
- The Docker build context is `backend/` (`render.yaml` → `dockerContext: ./backend`), so only files
  under `backend/` reach the image — hence the duplicated `backend/nuget.config`. That checkout has no
  siblings, so `PackageReference` versions in `Admin.Api.csproj` must already be published.
- `Admin.Api.csproj`: when the sibling `shared-security` checkout exists, `SkipPrivatePackages=true`
  and the `KeshavSingh.*` refs become `ProjectReference`s — local builds compile sibling source even
  with `PACKAGES_READ_TOKEN` set. Pass `-p:UseLocalProjectReferences=false` to test a registry restore.
- `README.md`'s API table lists only notes/config/i18n/health; there are ~26 controllers. Treat
  `backend/Controllers/` as the real inventory.
- `/packages` (`PackageInventoryService`) is the source of truth for package version alignment across
  the workspace; release checklist in `docs/PACKAGE_RELEASES.md`.
