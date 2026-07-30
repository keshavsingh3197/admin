# Database migrations

SQL-migrations-style, ordered, tracked changes to the identity provider's MongoDB (`AdminDb`).
Each migration records itself in the **`_migrations`** collection and is **idempotent**, so applying
the set is safe to re-run — already-applied migrations are skipped.

## What lives here vs. what doesn't

| Concern | Managed by |
|---|---|
| **Seed data & data changes** (config docs, backfills, field renames) | **These migrations** |
| **Indexes** (unique credential id, TTL on challenges, unique email, …) | The **app at startup** (`SettingsService`/`AdminSeeder`/`PasskeyService.EnsureIndexesAsync`) — idempotent, so no migration needed |
| **Secrets** (JWT signing key, encryption data key, admin password) | **Environment variables** — never the database |

The backend also auto-creates the two config documents from `appsettings` on first run, so a fresh
deployment works without running these. Use the migrations for explicit, version-controlled setup,
disaster recovery, and any future data change.

## Applying

From the **repo root** (so the `load()` paths resolve):

```bash
mongosh "<your connection string>" db/migrations/_run-all.mongodb.js
```

Or run a single migration:

```bash
mongosh "<your connection string>" db/migrations/002_seed-app-config.mongodb.js
```

The database name is `AdminDb` (matches `MongoDbSettings:DatabaseName`); adjust inside the scripts if
your deployment overrides it.

## Adding a migration

1. Create `NNN_short-description.mongodb.js` with the next number.
2. Copy the tracked/idempotent skeleton from an existing file: guard on
   `_migrations.findOne({ _id })`, do the change (prefer `$setOnInsert` / idempotent ops so a partial
   re-run is safe), then `insertOne` the migration id.
3. Append its name to the list in `_run-all.mongodb.js`.
4. Keep it **secret-free**.

## Applying after a config change

Config in `app-config` is read at **startup** — after applying a migration that changes it, **restart
the service**. Values in `app-settings` (branding, launcher URLs, auth knobs) can instead be re-saved
live on the admin Settings screen.
