// ─────────────────────────────────────────────────────────────────────────────
//  scripts/clean-test-data.ts
//  Surgical cleanup of automated test users, duplicate network rules,
//  and test session tokens from SQLite aegis.db.
// ─────────────────────────────────────────────────────────────────────────────

import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DB_PATH || path.resolve(process.cwd(), 'aegis.db');

function cleanTestData() {
  console.log(`🧹 Connecting to SQLite database at: ${DB_PATH}`);
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = OFF'); // Temporarily off for batch cleanup

  try {
    const tx = db.transaction(() => {
      // 1. Identify test user IDs
      const testUsers = db.prepare(`
        SELECT id FROM users 
        WHERE id LIKE 'usr_%' 
           OR id = 'regular-test-id'
           OR (email LIKE '%@aegisdb.dev' AND (
                email LIKE 'sess.tester%' 
             OR email LIKE 'alice_%' 
             OR email LIKE 'bob_%' 
             OR email LIKE 'teammate%' 
             OR email LIKE 'magic.tester%'
           ))
      `).all() as { id: string }[];

      const testUserIds = testUsers.map(u => u.id);
      console.log(`🎯 Found ${testUserIds.length} test user(s) to remove.`);

      if (testUserIds.length > 0) {
        const placeholders = testUserIds.map(() => '?').join(',');

        // Delete test user sessions
        const delSessions = db.prepare(`DELETE FROM user_sessions WHERE userId IN (${placeholders})`).run(...testUserIds);
        console.log(`  - Deleted ${delSessions.changes} test user session(s).`);

        // Delete test user passkeys
        const delPasskeys = db.prepare(`DELETE FROM user_passkeys WHERE userId IN (${placeholders})`).run(...testUserIds);
        console.log(`  - Deleted ${delPasskeys.changes} test user passkey(s).`);

        // Delete test user PATs
        const delPats = db.prepare(`DELETE FROM user_pats WHERE userId IN (${placeholders})`).run(...testUserIds);
        console.log(`  - Deleted ${delPats.changes} test PAT(s).`);

        // Delete test user notifications
        const delNotifs = db.prepare(`DELETE FROM user_notifications WHERE userId IN (${placeholders})`).run(...testUserIds);
        console.log(`  - Deleted ${delNotifs.changes} test notification(s).`);

        // Delete test magic link tokens
        const delMagic = db.prepare(`DELETE FROM magic_link_tokens WHERE userId IN (${placeholders}) OR email LIKE 'magic.tester%'`).run(...testUserIds);
        console.log(`  - Deleted ${delMagic.changes} test magic link token(s).`);

        // Delete test project_members and team grants
        try {
          db.prepare(`DELETE FROM project_members WHERE userId IN (${placeholders})`).run(...testUserIds);
          db.prepare(`DELETE FROM organization_members WHERE userId IN (${placeholders})`).run(...testUserIds);
        } catch (_) {}

        // Delete the users
        const delUsers = db.prepare(`DELETE FROM users WHERE id IN (${placeholders})`).run(...testUserIds);
        console.log(`  - Deleted ${delUsers.changes} test user account(s).`);
      }

      // 2. Clean duplicate test network rules (Auto-approved device for 192.168.31.120)
      const delRules = db.prepare(`
        DELETE FROM network_access_rules 
        WHERE label LIKE 'Auto-approved device%' 
          AND ipPattern = '192.168.31.120'
      `).run();
      console.log(`🌐 Cleaned up ${delRules.changes} duplicate test network access rule(s).`);

      // 3. Clean test device access requests
      const delDevReqs = db.prepare(`DELETE FROM device_access_requests WHERE ipAddress = '192.168.31.120' OR ipAddress = '192.168.31.55'`).run();
      console.log(`📱 Cleaned up ${delDevReqs.changes} test device access request(s).`);

      // 4. Clean expired/used test OTT tokens
      const delOtt = db.prepare(`DELETE FROM one_time_admin_tokens WHERE label LIKE '%Emergency%' OR label LIKE '%Test%' OR isUsed = 1`).run();
      console.log(`🔑 Cleaned up ${delOtt.changes} test/used One-Time Admin Token(s).`);

      // 5. Clean test duplicate organizations created during tests
      const delOrgs = db.prepare(`DELETE FROM organizations WHERE name = 'Acme Cloud Robotics' OR name = 'Test'`).run();
      console.log(`🏢 Cleaned up ${delOrgs.changes} test organization(s).`);
    });

    tx();
    db.pragma('foreign_keys = ON');
    db.pragma('wal_checkpoint(TRUNCATE)');
    console.log('✅ Test data cleanup completed successfully.');

    // Print remaining counts
    const remainingUsers = db.prepare('SELECT id, name, email, isSuperAdmin FROM users').all();
    console.log(`\n📊 Real Users Remaining: ${remainingUsers.length}`);
    console.log(remainingUsers);

    const remainingRules = db.prepare('SELECT count(*) as count FROM network_access_rules').get() as any;
    console.log(`📊 Network Rules Remaining: ${remainingRules.count}`);
  } catch (err: any) {
    console.error('❌ Error during cleanup:', err.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

cleanTestData();
