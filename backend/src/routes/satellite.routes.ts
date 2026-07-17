import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { getSatelliteStatus } from '../services/satellite.service';
import { env } from '../lib/env';
import { str } from '../utils/query';
import * as repo from '../data/repo';

const router = Router();

// GET /api/satellite/status — which Sentinel-2 provider is configured (live/demo).
router.get(
  '/status',
  asyncHandler(async (_req, res) => {
    res.json({ data: await getSatelliteStatus() });
  }),
);

// GET /api/satellite/scenes — recent Sentinel-2 scenes.
// Proxies the Python engine (real STAC discovery when configured); falls back to
// the bundled demo scenes if the engine is unreachable.
router.get(
  '/scenes',
  asyncHandler(async (req, res) => {
    const region = str(req.query.region);
    const bbox = str(req.query.bbox); // 'west,south,east,north' for a user-drawn AOI
    try {
      const url = new URL(`${env.pythonEngineUrl}/satellite/scenes`);
      if (bbox) url.searchParams.set('bbox', bbox);
      else if (region) url.searchParams.set('region', region);
      const controller = new AbortController();
      // A cold STAC bbox lookup (DNS + TLS + AWS Earth Search) can take 8-15s the
      // first time; 8s was too tight and silently fell back to demo scenes. The
      // engine caches bbox results after the first hit, so subsequent polls are
      // instant. Frontend axios waits 30s, so 20s here never races the client.
      const timer = setTimeout(() => controller.abort(), 20_000);
      const engineRes = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
      if (!engineRes.ok) throw new Error(`engine ${engineRes.status}`);
      const body = (await engineRes.json()) as { data: unknown[]; meta?: Record<string, unknown> };
      res.json({ data: body.data, meta: { ...body.meta, engine: 'online' } });
    } catch {
      const data = await repo.listScenes();
      res.json({ data, meta: { source: 'demo', engine: 'offline', count: data.length } });
    }
  }),
);

export default router;
