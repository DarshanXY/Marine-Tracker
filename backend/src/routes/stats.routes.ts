import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { clampInt } from '../utils/query';
import * as repo from '../data/repo';

const router = Router();

// GET /api/stats/overview — headline KPI numbers for the dashboard.
router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    res.json({ data: await repo.getOverview() });
  }),
);

// GET /api/stats/trend?days=30 — daily detection counts time series.
router.get(
  '/trend',
  asyncHandler(async (req, res) => {
    const days = clampInt(req.query.days, 30, 1, 180);
    res.json({ data: await repo.getTrend(days), meta: { days } });
  }),
);

// GET /api/stats/by-region — detections/hotspots grouped by region.
router.get(
  '/by-region',
  asyncHandler(async (_req, res) => {
    res.json({ data: await repo.getByRegion() });
  }),
);

// GET /api/stats/by-class — detection counts grouped by classification.
router.get(
  '/by-class',
  asyncHandler(async (_req, res) => {
    res.json({ data: await repo.getByClass() });
  }),
);

export default router;
