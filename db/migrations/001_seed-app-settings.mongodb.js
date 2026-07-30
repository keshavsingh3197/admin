/**
 * Migration 001 — seed the runtime settings document (branding, launcher URLs, auth-security knobs).
 *
 * Collection AdminDb.settings, _id "app-settings". Served (branding/URLs) at GET /api/config and
 * read live by the app; editable on the admin Settings screen.
 *
 * Tracked + idempotent: records itself in AdminDb._migrations and uses $setOnInsert, so re-running
 * is a no-op and it never clobbers values you've since tuned. NO secrets belong here.
 *
 * Run:  mongosh "<connection string>" db/migrations/001_seed-app-settings.mongodb.js
 *   (or apply the whole folder in order — see db/migrations/README.md)
 */

const dbx = db.getSiblingDB('AdminDb');
const MIGRATION_ID = '001_seed-app-settings';

if (dbx._migrations.findOne({ _id: MIGRATION_ID })) {
  print(`[skip] ${MIGRATION_ID} (already applied)`);
} else {
  dbx.settings.updateOne(
    { _id: 'app-settings' },
    {
      $setOnInsert: {
        SiteTitle: 'Keshav Singh',
        BlogUrl: 'https://blog.keshavsingh.in',
        BlogAdminUrl: 'https://blog.keshavsingh.in/admin',
        EmailTwoFactorEnabled: false,
        SmsTwoFactorEnabled: false,
        EmailOtpMinutes: 5,
        MaxFailedLoginAttempts: 5,
        LockoutMinutes: 15,
        BackupCodeCount: 10,
        UpdatedAt: new Date(),
      },
    },
    { upsert: true },
  );

  dbx._migrations.insertOne({ _id: MIGRATION_ID, appliedAt: new Date() });
  print(`[applied] ${MIGRATION_ID}`);
}
