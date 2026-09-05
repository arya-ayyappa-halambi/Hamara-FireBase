import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { restoreService } from '../services/restore.service';
import { failedLoginService } from '../services/failed-login-limiter.service';
import fs from 'fs';

function safeComparePin(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function restoreBackup(req: Request, res: Response, next: NextFunction): Promise<void> {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const lockStatus = failedLoginService.isLockedOut(ip, 'restore_backup');
  if (lockStatus.locked) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(429).json({
      success: false,
      message: `Too many failed restore attempts. Locked out for ${lockStatus.remainingSec} seconds.`,
      remainingSec: lockStatus.remainingSec
    });
    return;
  }

  try {
    const passkey = req.body.passkey;
    if (!passkey) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(400).json({ success: false, message: 'Passkey is required to restore backup.' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ success: false, message: 'Backup file is required.' });
      return;
    }

    const recoveryPin = req.body.recoveryPin;
    const serverPin = process.env.RECOVERY_PIN;

    if (!serverPin) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(500).json({ success: false, message: 'Server is not configured for recovery. Missing RECOVERY_PIN in environment.' });
      return;
    }

    if (!recoveryPin || !safeComparePin(String(recoveryPin), serverPin)) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      const failResult = failedLoginService.recordFailedAttempt(ip, 'restore_backup');
      if (failResult.locked) {
        res.status(429).json({
          success: false,
          message: `Too many failed attempts. Locked out for ${failResult.remainingSec} seconds.`,
          remainingSec: failResult.remainingSec
        });
        return;
      }
      res.status(401).json({
        success: false,
        message: `Invalid Recovery PIN. (${5 - failResult.attempts} attempts remaining)`
      });
      return;
    }

    // Successful authentication
    failedLoginService.recordSuccessfulLogin(ip, 'restore_backup');

    // Attempt restore
    await restoreService.restoreBackup(req.file.path, passkey);
    
    res.status(200).json({ success: true, message: 'Restore completed successfully. System is restarting.' });
  } catch (err: any) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(400).json({ success: false, message: err.message || 'Failed to restore backup.' });
  }
}

