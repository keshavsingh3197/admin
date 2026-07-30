/**
 * Seed / update the config documents for the Keshav Singh identity provider.
 *
 * Two singleton documents, both NON-SECRET, both served/consumed by the backend:
 *
 *   AdminDb.settings  _id "app-settings"  — runtime-tunable: branding, launcher URLs (served at
 *                                            GET /api/config) and the auth-security knobs. Editable
 *                                            live on the admin Settings screen; changes apply at once.
 *
 *   AdminDb.config    _id "app-config"    — infrastructure config (JWT issuer/audience/lifetimes,
 *                                            SSO cookie, WebAuthn, seed identity) loaded into the
 *                                            app's configuration at startup. Edit here (or via IaC);
 *                                            values the framework reads once (JWT validation, CORS)
 *                                            take effect on the next RESTART.
 *
 * The backend auto-creates both on first run (from appsettings), so a fresh setup works without this
 * file — use it to seed a brand-new database up front, for disaster recovery, or to bulk-set values.
 *
 * NEVER put secrets here (JWT signing key, encryption data key, admin password) or the Mongo
 * connection string. Those live ONLY in the service's environment variables / secret store — these
 * documents sit inside the very database they would otherwise protect.
 *
 * Run:  mongosh "<connection string>" db/app-settings.seed.mongodb.js
 *   or open in the "MongoDB for VS Code" extension and click ▶ Run.
 * The database name matches MongoDbSettings:DatabaseName (default "AdminDb").
 */

const target = db.getSiblingDB('AdminDb');

// ---- Runtime settings (branding, launcher URLs, auth knobs) ----
const settings = target.settings.updateOne(
  { _id: 'app-settings' },
  {
    $set: {
      SiteTitle: 'Keshav Singh',
      BlogUrl: 'https://blog.keshavsingh.in',
      BlogAdminUrl: 'https://blog.keshavsingh.in/admin',
      UpdatedAt: new Date(),
    },
    $setOnInsert: {
      EmailTwoFactorEnabled: false,
      SmsTwoFactorEnabled: false,
      EmailOtpMinutes: 5,
      MaxFailedLoginAttempts: 5,
      LockoutMinutes: 15,
      BackupCodeCount: 10,
    },
  },
  { upsert: true },
);

// ---- Infrastructure config (loaded at startup; restart to apply changes) ----
const config = target.config.updateOne(
  { _id: 'app-config' },
  {
    $set: {
      Jwt: {
        Issuer: 'keshavsingh-idp',
        Audience: 'keshavsingh-apps',
        AccessTokenMinutes: 15,
        RefreshTokenDays: 7,
        TwoFactorTokenMinutes: 5,
      },
      Sso: {
        CookieName: 'ks_sso',
        Domain: '.keshavsingh.in',
        Secure: true,
        SameSite: 'Lax',
      },
      WebAuthn: {
        RelyingPartyId: 'keshavsingh.in',
        RelyingPartyName: 'Keshav Singh ID',
        Origins: [
          'https://admin.keshavsingh.in',
          'https://id.keshavsingh.in',
          'https://keshavsingh.in',
        ],
        ChallengeMinutes: 5,
      },
      Seed: {
        // First-run admin identity. The PASSWORD is NOT here — it stays in env (Seed__AdminPassword).
        AdminEmail: '', // <-- set this for a brand-new deployment that still needs its first admin
        AdminDisplayName: 'Keshav',
      },
      UpdatedAt: new Date(),
    },
  },
  { upsert: true },
);

print(`app-settings: matched=${settings.matchedCount} upserted=${settings.upsertedId ? 'yes' : 'no'}`);
print(`app-config:   matched=${config.matchedCount} upserted=${config.upsertedId ? 'yes' : 'no'}`);

// NOTE: a running instance caches both documents. After a DIRECT database edit, RESTART the service
// (app-config always needs a restart; app-settings can instead be re-saved on the Settings screen).
