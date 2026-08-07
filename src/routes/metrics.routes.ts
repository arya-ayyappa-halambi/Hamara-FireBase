import { Router, Request, Response } from 'express';
import { metricsService } from '../services/metrics.service';

const router = Router();

// GET /metrics - Prometheus Metrics Exposition Endpoint
router.get('/metrics', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(metricsService.generatePrometheusMetrics());
});

export default router;
