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
