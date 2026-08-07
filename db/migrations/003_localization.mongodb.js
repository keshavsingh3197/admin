/**
 * Migration 003 — localisation: the locale registry, and making website_content per-language.
 *
 * What this does:
 *   1. Seeds AdminDb.locales with English (default) and Hindi.
 *   2. Backfills AdminDb.website_content.Locale on rows that predate the column, so the new unique
 *      index can include it.
 *   3. Swaps website_content's unique index from (SiteKey, ContentKey) — which would forbid a
 *      translation — to (SiteKey, ContentKey, Locale).
 *
 * What this deliberately does NOT do: seed the string catalogue (AdminDb.translations) or the runtime
 * config registry (AdminDb.config_entries). The app seeds both at startup from the definitions in
 * TranslationService.DefaultSeeds / ConfigRegistryService.SystemEntries, and never overwrites an
 * existing row. Duplicating those lists here would only let the two copies drift; from then on they
 * are managed on the admin Localization screen and via its import/export.
 *
 * Tracked + idempotent (see 001). No secrets — nothing here is sensitive.
 *
 * Run:  mongosh "<connection string>" db/migrations/003_localization.mongodb.js
 */

const dbx = db.getSiblingDB('AdminDb');
const MIGRATION_ID = '003_localization';

if (dbx._migrations.findOne({ _id: MIGRATION_ID })) {
  print(`[skip] ${MIGRATION_ID} (already applied)`);
} else {
  const now = new Date();

  // ---- 1. Locales. $setOnInsert so a locale an admin has already tuned is left exactly as it is. ----
  dbx.locales.updateOne(
    { _id: 'en' },
    {
      $setOnInsert: {
        EnglishName: 'English',
        NativeName: 'English',
        Direction: 'ltr',
        Icon: '🇬🇧',
        IsDefault: true,
        IsEnabled: true,
        FallbackCode: '',
        SortOrder: 0,
        DateFormat: 'dd MMM yyyy',
        NumberFormat: '1.0-2',
        CurrencyCode: 'INR',
        UpdatedAt: now,
      },
    },
    { upsert: true }
  );

  dbx.locales.updateOne(
    { _id: 'hi' },
    {
      $setOnInsert: {
        EnglishName: 'Hindi',
        NativeName: 'हिन्दी',
        Direction: 'ltr',
        Icon: '🇮🇳',
        IsDefault: false,
        IsEnabled: true,
        // Untranslated Hindi keys render the English string rather than a blank.
        FallbackCode: 'en',
        SortOrder: 1,
        DateFormat: 'dd MMM yyyy',
        NumberFormat: '1.0-2',
        CurrencyCode: 'INR',
        UpdatedAt: now,
      },
    },
    { upsert: true }
  );

  const defaultLocale = (dbx.locales.findOne({ IsDefault: true }) || { _id: 'en' })._id;
  print(`  locales: ${dbx.locales.countDocuments()} registered, default '${defaultLocale}'`);

  // ---- 2. Backfill the locale column BEFORE the unique index includes it: two untagged rows would
  // otherwise collide on an empty value. ----
  const backfilled = dbx.website_content.updateMany(
    { $or: [{ Locale: { $exists: false } }, { Locale: '' }] },
    { $set: { Locale: defaultLocale } }
  );
  print(`  website_content: ${backfilled.modifiedCount} row(s) tagged '${defaultLocale}'`);

  // ---- 3. Index swap. The app creates the same index at startup; doing it here means a deployment
  // whose old index is still in place can't fail to create the new one. ----
  const indexes = dbx.website_content.getIndexes().map((i) => i.name);
  if (indexes.includes('SiteKey_1_ContentKey_1')) {
    dbx.website_content.dropIndex('SiteKey_1_ContentKey_1');
    print('  website_content: dropped the old (SiteKey, ContentKey) unique index');
  }
  dbx.website_content.createIndex(
    { SiteKey: 1, ContentKey: 1, Locale: 1 },
    { unique: true, name: 'site_content_locale_unique' }
  );

  // Indexes the app also creates at startup — repeated here so a restored database is queryable
  // before the service comes up.
  dbx.translations.createIndex(
    { Locale: 1, Namespace: 1, Key: 1 },
    { unique: true, name: 'locale_ns_key_unique' }
  );
  dbx.config_entries.createIndex({ Group: 1 });
  dbx.locales.createIndex({ SortOrder: 1 });

  dbx._migrations.insertOne({ _id: MIGRATION_ID, appliedAt: now });
  print(`[ok] ${MIGRATION_ID}`);
}
