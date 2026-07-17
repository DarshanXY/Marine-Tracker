import { Router } from 'express';
import { ApiError, asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { bool, upper } from '../utils/query';
import * as repo from '../data/repo';

const router = Router();

// GET /api/alerts?acked=false&severity=HIGH&type=HOTSPOT
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const data = await repo.listAlerts({
      acked: bool(req.query.acked),
      severity: upper(req.query.severity),
      type: upper(req.query.type),
    });
    res.json({ data, meta: { count: data.length, open: data.filter((a) => !a.isAcked).length } });
  }),
);

// PATCH /api/alerts/:id/ack — acknowledge an alert (signed-in operators only).
router.patch(
  '/:id/ack',
  authenticate,
  asyncHandler(async (req, res) => {
    const alert = await repo.ackAlert(req.params.id);
    if (!alert) throw ApiError.notFound('Alert not found');
    res.json({ data: alert });
  }),
);

export default router;
