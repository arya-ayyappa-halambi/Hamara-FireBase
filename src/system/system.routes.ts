import { Router } from 'express';
import multer from 'multer';
import { restoreBackup } from '../admin/restore.controller';
import { apiLimiter } from '../middleware/rateLimit.middleware';

const router = Router();
const upload = multer({ dest: 'backups/temp_uploads/' });

// Unauthenticated endpoint - security is enforced via cryptographic passkey in the controller
router.post('/restore', apiLimiter, upload.single('backup'), restoreBackup);

// Endpoint to check system status (used by frontend to detect maintenance mode & active host/port)
router.get('/status', (req, res) => {
  try {
    const os = require('os');
    const { getDb } = require('../db/sqlite.connection');
    const db = getDb();
    const config = db.prepare('SELECT maintenanceMode FROM platform_settings WHERE id = ?').get('default');
    const isMaintenance = config && config.maintenanceMode === 1;

    let networkIp = '127.0.0.1';
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          networkIp = iface.address;
          break;
        }
      }
      if (networkIp !== '127.0.0.1') break;
    }

    const port = parseInt(process.env.PORT ?? '3000', 10);
    const host = process.env.HOST ?? '0.0.0.0';

    res.json({
      success: true,
      message: isMaintenance ? 'System is under maintenance' : 'System is operational',
      maintenanceMode: isMaintenance,
      port,
      host,
      networkIp
    });
  } catch (_) {
    res.json({ success: true, message: 'System is operational', maintenanceMode: false, port: 3000, host: '0.0.0.0', networkIp: '127.0.0.1' });
  }
});

export default router;

// Verify Server Recovery PIN for frontend Lock Screen
router.post('/verify-recovery-pin', apiLimiter, (req, res) => {
  const recoveryPin = req.body?.recoveryPin;
  const serverPin = process.env.RECOVERY_PIN;

  if (!serverPin) {
    return res.status(500).json({ success: false, message: 'Server RECOVERY_PIN is not configured.' });
  }

  if (recoveryPin !== serverPin) {
    return res.status(401).json({ success: false, message: 'Invalid 6-Digit Server Recovery Passcode.' });
  }

  return res.json({ success: true, message: 'Passcode verified successfully.' });
});
