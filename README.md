# Admin

Personal admin panel — manage notes, family credentials, and more.

## Stack

| Layer    | Technology                  |
|----------|-----------------------------|
| Backend  | ASP.NET Core 10 Web API     |
| Frontend | Angular 22                  |
| Database | MongoDB                     |
| Deploy   | Backend → Render · Frontend → GitHub Pages |
| Domain   | [admin.keshavsingh.in](https://admin.keshavsingh.in) |

## Localisation and runtime configuration

Every user-facing string and every previously hard-coded value (launcher URLs, icons, colours, feature
flags, limits) lives in this database and is served over HTTP, so a wording fix, a new language or a
retargeted link is an edit on the **Localization** screen rather than a deploy. English and Hindi ship
seeded, and translators can be sent an Excel workbook and their file imported straight back.

The engine is two shared packages — `KeshavSingh.Localization` (NuGet) and `@keshavsingh3197/web-config`
(npm) — so the blog and the portfolio behave identically without a second implementation. This repo
keeps only what is specific to it: its own seed sources, the `GET /api/config` envelope, per-locale page
content, and the URL/icon host allowlist.

See **[docs/LOCALIZATION.md](docs/LOCALIZATION.md)** for the model, the endpoints, the import/export
formats and the validation rules.

## Project Structure

```
admin/
├── backend/          # ASP.NET Core 10 Web API
│   ├── Controllers/  # REST endpoints
│   ├── Models/       # Data models
│   └── Services/     # Business logic & MongoDB service
├── frontend/         # Angular application
│   └── src/
│       ├── app/
│       │   ├── core/services/   # ApiService (HTTP)
│       │   └── features/        # dashboard, notes
│       └── environments/        # dev & prod API URLs
├── render.yaml       # Render deployment config
└── .github/workflows/
    ├── deploy-frontend.yml  # GitHub Pages deploy
    └── backend-ci.yml       # .NET build CI
```

## Getting Started

### Backend

```bash
cd backend
# set MONGODB_CONNECTION_STRING in your environment or appsettings.Development.json
dotnet run
# API available at http://localhost:5000
```

### Frontend

```bash
cd frontend
npm install
npm start
# App available at http://localhost:4200
```

## Deployment

### Backend → Render
1. Connect the repository in the [Render dashboard](https://render.com).
2. The `render.yaml` blueprint will configure the service automatically.
3. Set the `MongoDbSettings__ConnectionString` environment variable (secret) to your MongoDB Atlas URI.

### Frontend → GitHub Pages
Pushing frontend changes to `master` triggers the **Deploy Angular to GitHub Pages** workflow automatically.
The custom domain `admin.keshavsingh.in` is configured via the `frontend/public/CNAME` file.

## API Endpoints

`backend/Controllers/` is the inventory — 26 controllers, so a hand-maintained table here goes stale
faster than it helps. The anonymous surface is the part worth naming, because everything else
requires a session:

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/sso/login · /api/sso/session · /api/sso/logout | The SSO surface every family app calls |
| GET | /api/config | Central runtime config: URLs, icons, flags, languages |
| GET | /api/i18n/manifest · /api/i18n/bundle/{locale} | Languages and translated strings |
| GET | /api/website-content/public/{site}/{key} | Localised page content |
| POST | /api/analytics/visit | Page-view beacon from a public site |
| POST | /api/contact · /api/account-requests | Contact form and "request an account" |
| POST | /api/visitor-chat/* | Visitor chat widget |
| GET | /s/{code} | Short-link redirect |
| GET | /health | Liveness probe |

Everything anonymous is rate-limited (see the policies in `Program.cs`). The editorial and admin
sides of localisation and configuration are listed in [docs/LOCALIZATION.md](docs/LOCALIZATION.md);
the security posture and the reasoning behind it are in [docs/REVIEW.md](docs/REVIEW.md).
