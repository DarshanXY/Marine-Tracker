import { Router } from 'express';
import { ApiError, asyncHandler } from '../middleware/errorHandler';
import { upper } from '../utils/query';
import * as repo from '../data/repo';

const router = Router();

// GET /api/regions
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const data = await repo.listRegions();
    res.json({ data, meta: { count: data.length } });
  }),
);

// GET /api/regions/:code   e.g. /api/regions/MUM
router.get(
  '/:code',
  asyncHandler(async (req, res) => {
    const region = await repo.getRegion(upper(req.params.code) ?? '');
    if (!region) throw ApiError.notFound('Region not found');
    res.json({ data: region });
  }),
);

export default router;
