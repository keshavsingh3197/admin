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
Pushing to `main` triggers the **Deploy Angular to GitHub Pages** workflow automatically.  
The custom domain `admin.keshavsingh.in` is configured via the `frontend/public/CNAME` file.

## API Endpoints

| Method | Path                      | Description                                                       |
|--------|---------------------------|-------------------------------------------------------------------|
| GET    | /api/notes                | List all notes                                                    |
| GET    | /api/notes/{id}           | Get note by ID                                                    |
| POST   | /api/notes                | Create note                                                       |
| PUT    | /api/notes/{id}           | Update note                                                       |
| DELETE | /api/notes/{id}           | Delete note                                                       |
| GET    | /api/config               | Central runtime config: URLs, icons, flags, languages (anonymous) |
| GET    | /api/i18n/manifest        | Languages + per-locale bundle versions (anonymous)                |
| GET    | /api/i18n/bundle/{locale} | Translated strings for one language (anonymous)                   |
| GET    | /health                   | Health check                                                      |

The editorial and admin sides of localisation and configuration are listed in
[docs/LOCALIZATION.md](docs/LOCALIZATION.md).
