# Central SSO — deployment guide

`admin.keshavsingh.in` is the **identity provider (IdP)** for every `*.keshavsingh.in` app.
You sign in once here; sibling apps (e.g. the blog console at `git.keshavsingh.in/admin`)
silently pick up the session. Logging out here logs you out everywhere.

## How it works

- The admin backend issues tokens. On sign-in it sets a **rotating refresh token** as an
  `HttpOnly; Secure; SameSite=Lax` cookie scoped to **`.keshavsingh.in`** (`ks_sso`). The
  short-lived **access token** is returned in the body and held in memory by each SPA — never in
  `localStorage`, never in a readable cookie.
- Any app calls `POST /api/sso/session` (`withCredentials`) on load; the shared cookie is sent
  (all apps are same-site under `keshavsingh.in`), and it gets a fresh access token. 401 ⇒ not
  signed in ⇒ redirect to the IdP login.
- All apps trust one JWT identity: **issuer `keshavsingh-idp`, audience `keshavsingh-apps`**,
  signed HS256 with **one shared signing key**. The admin backend is the only issuer; other
  backends only validate. (Because the key is symmetric, keep it secret on every service; a
  future move to RS256/JWKS would remove the shared-secret trust assumption.)

## Required setup (once)

### 1. GitHub Pages source (admin repo)
Repo **Settings → Pages → Source = GitHub Actions** (not "Deploy from a branch"). The
`Deploy Angular to GitHub Pages` workflow now runs on `master` and publishes the built SPA
(with a `404.html` SPA fallback), replacing the old README page.

### 2. DNS — the IdP API must live under keshavsingh.in
A server can only set a cookie for its own registrable domain. The admin API on
`*.onrender.com` **cannot** set a `.keshavsingh.in` cookie, so expose it under the parent domain:

- Add a **custom domain `id.keshavsingh.in`** to the admin backend's Render service.
- Create the DNS record Render asks for (a `CNAME` from `id` → the Render host).
- The admin frontend and the blog console already target `https://id.keshavsingh.in/api`
  (see `frontend/src/environments/environment.prod.ts` and `content-blog/ng-src/index.html`).

### 3. Environment variables (secrets — never commit)

**Admin backend Render service** (the IdP):
| Var | Value |
| --- | --- |
| `Jwt__Issuer` | `keshavsingh-idp` |
| `Jwt__Audience` | `keshavsingh-apps` |
| `Jwt__SigningKey` | a random ≥32-byte string — **the same value on both services** |
| `Sso__CookieDomain` | `.keshavsingh.in` |
| `Encryption__DataKey` | base64 of a 32-byte AES key |
| `Seed__AdminEmail` / `Seed__AdminPassword` | your bootstrap admin login |
| `MongoDbSettings__ConnectionString` | Mongo URI |
| `PACKAGES_READ_TOKEN` | GitHub Packages read token (private NuGet restore) |

**content-blog backend Render service** (resource server only):
| Var | Value |
| --- | --- |
| `Jwt__Issuer` | `keshavsingh-idp` (same as admin) |
| `Jwt__Audience` | `keshavsingh-apps` (same as admin) |
| `Jwt__SigningKey` | **identical** to the admin value |
| `Cors__AllowedOrigins__0` | `https://git.keshavsingh.in` |
| `Mongo__ConnectionString`, `PACKAGES_READ_TOKEN`, … | unchanged |

The admin API's CORS allowlist (`AllowedOrigins` in `appsettings.json`) already includes
`https://admin.keshavsingh.in` and `https://git.keshavsingh.in`, both with credentials.

### 4. One identity
Users now live only in the admin app's database (seeded from `Seed__*`). Give that admin user
the roles the blog console needs — `Admin` (full) or `Editor` (content). content-blog's own
login/seed have been removed; its old user records are ignored.

## Local development
- Admin API on `http://localhost:5000`, admin SPA on `http://localhost:4200`. In dev the cookie is
  host-only (`Sso:Domain=""`, `Secure=false`), so the SSO flow works across localhost ports.
- Run the blog console SPA on a different port and set `window.__IDP_API_BASE__` /
  `window.__ADMIN_APP_URL__` (in `ng-src/index.html`) to your local admin API / SPA to test SSO.

## Verify
1. Pages serves the SPA at `admin.keshavsingh.in` (not the README).
2. Sign in at admin → reload → still signed in (silent `/api/sso/session`); confirm no refresh
   token is in `localStorage` or a JS-readable cookie.
3. With an admin session live, open `git.keshavsingh.in/admin` → authenticated with no prompt.
4. Sign out at admin → the blog console drops to unauthenticated on its next call.
5. An admin-issued token is accepted by `content-blog-nms8.onrender.com/api`, and an
   `Editor`-gated content action authorizes.
   
