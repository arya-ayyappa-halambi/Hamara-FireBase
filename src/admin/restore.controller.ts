import { Request, Response, NextFunction } from 'express';
import { restoreService } from '../services/restore.service';
import fs from 'fs';

export async function restoreBackup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const passkey = req.body.passkey;
    if (!passkey) {
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
      res.status(500).json({ success: false, message: 'Server is not configured for recovery. Missing RECOVERY_PIN in environment.' });
      return;
    }

    if (recoveryPin !== serverPin) {
      res.status(401).json({ success: false, message: 'Invalid Recovery PIN.' });
      return;
    }

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
