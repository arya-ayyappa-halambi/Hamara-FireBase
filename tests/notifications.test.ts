// ─────────────────────────────────────────────────────────────────────────────
//  tests/notifications.test.ts
//  Test Suite for User Real-Time In-App Notifications
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import { initSqlite, getDb } from '../src/db/sqlite.connection';
import { notificationService } from '../src/services/notification.service';

let passed = 0;
let failed = 0;

function assert(condition: boolean, description: string): void {
  if (condition) {
    console.log(`  ✅ PASS: ${description}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${description}`);
    failed++;
  }
}

async function runNotificationTests(): Promise<void> {
  console.log('\n================================================================');
  console.log('🧪 Running In-App Real-Time Notification Center Test Suite');
  console.log('================================================================\n');

  initSqlite();

  const db = getDb();
  let testUser = db.prepare('SELECT id FROM users LIMIT 1').get() as any;
  if (!testUser) {
    db.prepare(`
      INSERT INTO users (id, email, emailHash, name, passwordHash, isSuperAdmin, createdAt, updatedAt)
      VALUES (?, ?, ?, 'Notif User', 'fake_pass', 0, datetime('now'), datetime('now'))
    `).run('notif-user-id', 'notif@aegisdb.dev', 'notif_hash');
    testUser = { id: 'notif-user-id' };
  }
  const userId = testUser.id;

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: Send In-App Notification
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- 1. Send In-App Notifications ---');
  const notif1 = notificationService.sendNotification({
    userId,
    title: 'Security Alert',
    message: 'New login from Chrome on macOS.',
    type: 'security',
    data: { ip: '192.168.1.50' }
  });

  const notif2 = notificationService.sendNotification({
    userId,
    title: 'Team Invite Received',
    message: 'You have been invited to join Acme Cloud Robotics.',
    type: 'invite',
    data: { orgId: 'org_123' }
  });

  assert(notif1.id.startsWith('notif_'), 'Notification 1 created with notif_ ID');
  assert(notif1.title === 'Security Alert', 'Title preserved');
  assert(notif1.isRead === false, 'Initial state is unread');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: List User Notifications & Unread Count
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. List Notifications & Unread Counter ---');
  const report = notificationService.listUserNotifications(userId);
  assert(report.notifications.length >= 2, 'Notifications returned in list');
  assert(report.unreadCount >= 2, 'Unread counter accurately reflects unread items');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: Mark Single Notification as Read
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Mark Single Notification as Read ---');
  const marked = notificationService.markAsRead(userId, notif1.id);
  assert(marked === true, 'Notification marked as read');

  const reportAfterOne = notificationService.listUserNotifications(userId);
  const updatedNotif = reportAfterOne.notifications.find(n => n.id === notif1.id);
  assert(updatedNotif?.isRead === true, 'Notification record shows isRead: true');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: Mark All Notifications as Read
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. Mark All as Read ---');
  const count = notificationService.markAllAsRead(userId);
  assert(count >= 1, 'Marked remaining notifications as read');

  const reportFinal = notificationService.listUserNotifications(userId);
  assert(reportFinal.unreadCount === 0, 'Unread counter dropped to 0');

  console.log('\n================================================================');
  console.log(`📊 Notification Test Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runNotificationTests().catch(err => {
  console.error('Fatal error in notifications test suite:', err);
  process.exit(1);
});
