/**
 * Migration 005 — lower-case existing usernames so the login lookup and the new unique index agree.
 *
 * Why this is needed: usernames used to be stored verbatim and compared verbatim, with no unique
 * index. That made "Bob" and "bob" two different logins, and — because the lookup was a single
 * `email == x OR username == x` with an unordered FirstOrDefault — an account whose USERNAME equalled
 * another account's EMAIL could answer for either. Both are now normalised to lower case on write and
 * on lookup, and `ux_user_username` (unique, sparse) enforces it.
 *
 * So this must run BEFORE the app next starts, for two reasons:
 *   1. A user whose stored username has any upper-case character can no longer sign in with it.
 *   2. AdminSeeder creates the unique index at startup; if two accounts differ only by case, the
 *      index cannot be built and the app logs a warning and carries on without it.
 *
 * Case-collisions are NOT resolved automatically — which of two accounts should keep the name is a
 * judgement call, not a script's. They are reported for you to fix, and the migration refuses to
 * record itself until none remain.
 *
 * Tracked + idempotent: recorded in AdminDb._migrations; re-running is a no-op.
 *
 * Run:  mongosh "<connection string>" db/migrations/005_normalize-usernames.mongodb.js
 */

const dbx = db.getSiblingDB('AdminDb');
const MIGRATION_ID = '005_normalize-usernames';

if (dbx._migrations.findOne({ _id: MIGRATION_ID })) {
  print(`[skip] ${MIGRATION_ID} (already applied)`);
} else {
  // 1. Find every account that would change, and group by the normalised name to spot collisions.
  const byNormalized = new Map();
  dbx.users
    .find({ Username: { $exists: true, $ne: null, $ne: '' } }, { Username: 1, Email: 1 })
    .forEach(u => {
      const key = String(u.Username).trim().toLowerCase();
      if (!byNormalized.has(key)) byNormalized.set(key, []);
      byNormalized.get(key).push(u);
    });

  const collisions = [...byNormalized.entries()].filter(([, users]) => users.length > 1);

  if (collisions.length > 0) {
    print('');
    print(`[BLOCKED] ${MIGRATION_ID}: these usernames collide once lower-cased.`);
    print('Pick which account keeps each name, change the others, then re-run this migration.');
    for (const [name, users] of collisions) {
      print(`  "${name}":`);
      for (const u of users) print(`    _id=${u._id}  username=${u.Username}  email=${u.Email}`);
    }
    print('');
  } else {
    let changed = 0;
    for (const [normalized, users] of byNormalized) {
      const u = users[0];
      if (u.Username === normalized) continue;
      dbx.users.updateOne(
        { _id: u._id },
        { $set: { Username: normalized, UpdatedAt: new Date() } });
      print(`  ${u.Username} -> ${normalized}`);
      changed++;
    }

    dbx._migrations.insertOne({ _id: MIGRATION_ID, appliedAt: new Date() });
    print(`[done] ${MIGRATION_ID} — ${changed} username(s) normalised.`);
  }
}
