import { Router } from 'express';
import multer from 'multer';
import { restoreBackup } from '../admin/restore.controller';
import { apiLimiter } from '../middleware/rateLimit.middleware';

const router = Router();
const upload = multer({ dest: 'backups/temp_uploads/' });

// Unauthenticated endpoint - security is enforced via cryptographic passkey in the controller
router.post('/restore', apiLimiter, upload.single('backup'), restoreBackup);

// Endpoint to check system status (used by frontend to detect maintenance mode)
router.get('/status', (req, res) => {
  res.json({ success: true, message: 'System is operational', maintenanceMode: false });
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
