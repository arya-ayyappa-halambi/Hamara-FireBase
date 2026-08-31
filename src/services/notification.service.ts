// ─────────────────────────────────────────────────────────────────────────────
//  src/services/notification.service.ts
//  AegisDB — Real-Time User Notification Center Service (WebSockets + DB)
// ─────────────────────────────────────────────────────────────────────────────

import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/sqlite.connection';
import { wsService } from '../realtime/websocket.service';

export interface UserNotificationRecord {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'invite' | 'security';
  data?: any;
  isRead: boolean;
  createdAt: string;
}

class NotificationService {
  private static instance: NotificationService;

  private constructor() {}

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Sends an in-app notification to a user and broadcasts via WebSockets
   */
  public sendNotification(params: {
    userId: string;
    title: string;
    message: string;
    type?: 'info' | 'success' | 'warning' | 'invite' | 'security';
    data?: any;
  }): UserNotificationRecord {
    const { userId, title, message, type = 'info', data } = params;
    const db = getDb();
    const id = `notif_${uuidv4()}`;
    const now = new Date().toISOString();
    const dataJson = data ? JSON.stringify(data) : null;

    db.prepare(`
      INSERT INTO user_notifications (id, userId, title, message, type, data, isRead, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `).run(id, userId, title, message, type, dataJson, now);

    const record: UserNotificationRecord = {
      id,
      userId,
      title,
      message,
      type,
      data,
      isRead: false,
      createdAt: now
    };

    // Live push over WebSockets to this user's active client connections
    wsService.broadcast('USER_NOTIFICATION', {
      userId,
      notification: record
    });

    return record;
  }

  /**
   * List notifications for a user
   */
  public listUserNotifications(userId: string, limit = 50): { notifications: UserNotificationRecord[]; unreadCount: number } {
    const db = getDb();

    const rows = db.prepare(`
      SELECT * FROM user_notifications
      WHERE userId = ?
      ORDER BY createdAt DESC
      LIMIT ?
    `).all(userId, limit) as any[];

    const countRow = db.prepare(`
      SELECT COUNT(*) as unreadCount FROM user_notifications
      WHERE userId = ? AND isRead = 0
    `).get(userId) as any;

    const notifications: UserNotificationRecord[] = rows.map(r => ({
      id: r.id,
      userId: r.userId,
      title: r.title,
      message: r.message,
      type: r.type || 'info',
      data: r.data ? JSON.parse(r.data) : null,
      isRead: r.isRead === 1,
      createdAt: r.createdAt
    }));

    return {
      notifications,
      unreadCount: countRow?.unreadCount || 0
    };
  }

  /**
   * Mark a single notification as read
   */
  public markAsRead(userId: string, notificationId: string): boolean {
    const db = getDb();
    const info = db.prepare('UPDATE user_notifications SET isRead = 1 WHERE id = ? AND userId = ?').run(notificationId, userId);
    return info.changes > 0;
  }

  /**
   * Mark all notifications as read for a user
   */
  public markAllAsRead(userId: string): number {
    const db = getDb();
    const info = db.prepare('UPDATE user_notifications SET isRead = 1 WHERE userId = ? AND isRead = 0').run(userId);
    return info.changes;
  }
}

export const notificationService = NotificationService.getInstance();
