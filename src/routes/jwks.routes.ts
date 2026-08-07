import { Router, Request, Response } from 'express';
import { rs256KeyService } from '../services/rs256-key.service';

const router = Router();

// Public JWKS endpoint for token verification
router.get('/.well-known/jwks.json', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).json(rs256KeyService.getJwks());
});

export default router;
