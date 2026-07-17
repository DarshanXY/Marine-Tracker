import { Router } from 'express';
import { ApiError, asyncHandler } from '../middleware/errorHandler';
import { bool, upper } from '../utils/query';
import * as repo from '../data/repo';

const router = Router();

// GET /api/hotspots?region=MUM&severity=HIGH&active=true
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const data = await repo.listHotspots({
      region: upper(req.query.region),
      severity: upper(req.query.severity),
      active: bool(req.query.active),
    });
    res.json({ data, meta: { count: data.length } });
  }),
);

// GET /api/hotspots/:id  — includes drift trajectory when available.
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const hotspot = await repo.getHotspot(req.params.id);
    if (!hotspot) throw ApiError.notFound('Hotspot not found');
    res.json({ data: hotspot });
  }),
);

export default router;
