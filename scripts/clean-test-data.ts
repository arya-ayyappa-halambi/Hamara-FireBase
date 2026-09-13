// ─────────────────────────────────────────────────────────────────────────────
//  scripts/clean-test-data.ts
//  Surgical cleanup of automated test data, duplicate test projects, test PATs,
//  test device requests, and test notifications from SQLite flarebase.db.
// ─────────────────────────────────────────────────────────────────────────────

import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DB_PATH || path.resolve(process.cwd(), 'flarebase.db');

function cleanTestData() {
  console.log(`🧹 Connecting to SQLite database at: ${DB_PATH}`);
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = OFF'); // Temporarily off for batch cleanup

  try {
    const tx = db.transaction(() => {
      // 1. Delete all test PATs
      const delPats = db.prepare(`
        DELETE FROM user_pats 
        WHERE name LIKE '%Test%' 
           OR name = 'Full Admin CLI Key' 
           OR tokenPrefix LIKE 'pat_%'
      `).run();
      console.log(`  - Deleted ${delPats.changes} test PAT(s).`);

      // 2. Delete test duplicate projects (keep only 1 default per real user and named projects like DEBRIX)
      const delProjects = db.prepare(`
        DELETE FROM projects 
        WHERE name = 'My Secret Side Project' 
           OR name = 'Global Tunnel App'
           OR name = 'Test Project'
           OR name = 'E2E Rules Project'
           OR id LIKE 'proj_rules_%'
      `).run();
      console.log(`  - Deleted ${delProjects.changes} test duplicate project(s).`);

      // 3. Delete test notifications
      const delNotifs = db.prepare(`
        DELETE FROM user_notifications 
        WHERE title IN ('Security Alert', 'Team Invite Received')
           OR data LIKE '%org_123%'
           OR data LIKE '%192.168.1.50%'
      `).run();
      console.log(`  - Deleted ${delNotifs.changes} test notification(s).`);

      // 4. Delete test device access requests
      const delDeviceReqs = db.prepare(`DELETE FROM device_access_requests`).run();
      console.log(`  - Deleted ${delDeviceReqs.changes} test device access request(s).`);

      // 5. Delete test jailed IP records
      const delJail = db.prepare(`DELETE FROM jailed_ip_records`).run();
      console.log(`  - Deleted ${delJail.changes} test jailed IP record(s).`);

      // 6. Delete test user security logs
      const delSecLogs = db.prepare(`DELETE FROM user_security_logs`).run();
      console.log(`  - Deleted ${delSecLogs.changes} test security log(s).`);

      // 7. Delete test user sessions (keeping 0 or current)
      const delSessions = db.prepare(`DELETE FROM user_sessions`).run();
      console.log(`  - Deleted ${delSessions.changes} test user session(s).`);

      // 8. Delete orphan organization members & invites
      const delOrgMembers = db.prepare(`DELETE FROM organization_members WHERE orgId NOT IN (SELECT id FROM organizations)`).run();
      console.log(`  - Deleted ${delOrgMembers.changes} orphan organization member(s).`);

      const delOrgInvites = db.prepare(`DELETE FROM organization_invites WHERE orgId NOT IN (SELECT id FROM organizations)`).run();
      console.log(`  - Deleted ${delOrgInvites.changes} orphan organization invite(s).`);

      // 9. Delete stale refresh tokens
      const delRefresh = db.prepare(`DELETE FROM refresh_tokens`).run();
      console.log(`  - Deleted ${delRefresh.changes} stale refresh token(s).`);

      // 10. Delete test migrations
      const delMigrations = db.prepare(`DELETE FROM scheduled_endpoint_migrations`).run();
      console.log(`  - Deleted ${delMigrations.changes} test scheduled migration(s).`);

      // 11. Delete duplicate auto-approved network rules for local loopback
      const delRules = db.prepare(`DELETE FROM network_access_rules WHERE ipPattern LIKE '%192.168.31.120%'`).run();
      console.log(`  - Deleted ${delRules.changes} duplicate test network rule(s).`);

      // 12. Verify preserved real users
      const realUsers = db.prepare('SELECT id, email, isSuperAdmin FROM users').all();
      console.log(`\n✅ Database Clean Complete! Preserved ${realUsers.length} real user(s):`);
      for (const u of realUsers as any[]) {
        const displayEmail = u.email.startsWith('{') ? '[Encrypted User Account]' : u.email;
        console.log(`   • ${displayEmail} (${u.isSuperAdmin ? 'Super Admin' : 'User'}) [ID: ${u.id}]`);
      }
    });

    tx();
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
