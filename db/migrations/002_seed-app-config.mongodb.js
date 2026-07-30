/**
 * Migration 002 — seed the infrastructure config document (loaded into app config at startup).
 *
 * Collection AdminDb.config, _id "app-config". Holds the NON-SECRET Jwt/Sso/WebAuthn/Seed config the
 * app used to read from env vars / appsettings. Read once at startup by AppConfigLoader, so changes
 * here take effect on the next service RESTART.
 *
 * Tracked + idempotent (see 001). NO secrets: the JWT signing key, encryption data key and admin
 * password stay in environment variables — never in this database.
 *
 * Run:  mongosh "<connection string>" db/migrations/002_seed-app-config.mongodb.js
 */

const dbx = db.getSiblingDB('AdminDb');
const MIGRATION_ID = '002_seed-app-config';

if (dbx._migrations.findOne({ _id: MIGRATION_ID })) {
  print(`[skip] ${MIGRATION_ID} (already applied)`);
} else {
  dbx.config.updateOne(
    { _id: 'app-config' },
    {
      $setOnInsert: {
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
          MaxCredentialsPerUser: 5,
        },
        Seed: {
          // First-run admin identity. The PASSWORD stays in env (Seed__AdminPassword).
          AdminEmail: '',
          AdminDisplayName: 'Keshav',
        },
        UpdatedAt: new Date(),
      },
    },
    { upsert: true },
  );

  dbx._migrations.insertOne({ _id: MIGRATION_ID, appliedAt: new Date() });
  print(`[applied] ${MIGRATION_ID}`);
}
