/**
 * System routes — READ-ONLY status of the backing services (engine, queue, DB,
 * Clay sidecar) for the dashboard's health chips.
 *
 * The service lifecycle is deliberately NOT driven from the UI: the processes are
 * owned by the host (start-all.cmd / infra watchdog), which outlives any browser
 * session. There is intentionally no start/stop endpoint here — nothing in this
 * API spawns or kills a process.
 *
 * Gated: signed-in AND (dev mode OR admin), since ports/labels are infra detail.
 */
import { Router, type RequestHandler } from 'express';
import { ApiError, asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { env } from '../lib/env';
import * as svc from '../lib/serviceControl';

const router = Router();

const canView: RequestHandler = (req, _res, next) => {
  if (env.isDev || req.user?.role === 'ADMIN') return next();
  next(new ApiError(403, 'Service status requires the ADMIN role.'));
};

// GET /api/system/services — status of every backing service.
router.get('/services', authenticate, canView, asyncHandler(async (_req, res) => {
  res.json({ data: await svc.statusAll() });
}));

export default router;
