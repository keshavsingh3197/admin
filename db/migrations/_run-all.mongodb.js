/**
 * Runs every migration in this folder, in order. Each script is tracked in AdminDb._migrations, so
 * already-applied ones are skipped — safe to re-run any time (e.g. after adding a new migration).
 *
 * Run from the REPO ROOT (load() paths are resolved relative to the current directory):
 *   mongosh "<connection string>" db/migrations/_run-all.mongodb.js
 *
 * When you add a migration, append its filename (without extension) to the list below.
 */

const MIGRATIONS = [
  '001_seed-app-settings',
  '002_seed-app-config',
  '003_localization',
  '004_portfolio-structured-content',
];

print(`Applying ${MIGRATIONS.length} migration(s)…`);
for (const name of MIGRATIONS) {
  load(`db/migrations/${name}.mongodb.js`);
}
print('Done.');
