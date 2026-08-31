// ─────────────────────────────────────────────────────────────────────────────
//  src/routes/notification.routes.ts
//  HTTP Router for Real-Time User Notifications
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response, NextFunction } from 'express';
import { authenticateJwt } from '../middleware/auth.middleware';
import { notificationService } from '../services/notification.service';
import { AppError } from '../types/auth.types';

const router = Router();

// Protect all notification routes with JWT auth
router.use(authenticateJwt);

// 1. List user notifications + unread count
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required', 401);

    const limit = Number(req.query.limit || 50);
    const result = notificationService.listUserNotifications(userId, limit);

    res.status(200).json({
      success: true,
      message: 'Notifications retrieved.',
      data: result
    });
  } catch (err) { next(err); }
});

// 2. Mark specific notification as read
router.patch('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required', 401);

    const { id } = req.params;
    const updated = notificationService.markAsRead(userId, id);

    res.status(200).json({
      success: true,
      message: 'Notification marked as read.',
      data: { updated }
    });
  } catch (err) { next(err); }
});

// 3. Mark all notifications as read
router.patch('/read-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required', 401);

    const count = notificationService.markAllAsRead(userId);

    res.status(200).json({
      success: true,
      message: `Marked ${count} notification(s) as read.`,
      data: { count }
    });
  } catch (err) { next(err); }
});

export default router;
