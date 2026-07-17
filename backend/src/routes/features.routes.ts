/**
 * Advanced-feature proxies to the Python engine: drift FORECAST (72h fwd + back-
 * track + landfall), change DETECTION, spectral INDICES, live model EVALUATION,
 * capability discovery, and GeoTIFF export. Thin passthroughs — a clear 503 when
 * the engine is unreachable (these are on-demand analyst tools, not the core feed).
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { callEngine } from '../lib/engine';
import { env } from '../lib/env';
import { str } from '../utils/query';

const router = Router();

const jsonInit = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body ?? {}),
});

async function proxy(res: import('express').Response, path: string, init: RequestInit, timeout: number): Promise<void> {
  try {
    const data = await callEngine(path, init, timeout);
    res.json({ data, meta: { engine: 'online' } });
  } catch (err) {
    res.status(503).json({ error: { status: 503, message: `engine unavailable: ${(err as Error).message}` } });
  }
}

// POST /api/engine/forecast/trajectory — full 72h forecast (path+cone+landfall+backtrack)
router.post('/forecast/trajectory', asyncHandler(async (req, res) => {
  await proxy(res, '/forecast/trajectory', jsonInit(req.body), 30_000);
}));

// POST /api/engine/forecast/backtrack — reverse drift (source attribution)
router.post('/forecast/backtrack', asyncHandler(async (req, res) => {
  await proxy(res, '/forecast/backtrack', jsonInit(req.body), 30_000);
}));

// POST /api/engine/change — AOI change detection (recent vs older window)
router.post('/change', asyncHandler(async (req, res) => {
  await proxy(res, '/compute/change', jsonInit(req.body), 130_000);
}));

// POST /api/engine/indices — FDI/NDVI/NDWI/FAI/Plastic-Index for one pixel
router.post('/indices', asyncHandler(async (req, res) => {
  await proxy(res, '/compute/indices', jsonInit(req.body), 8_000);
}));

// GET /api/engine/model/evaluate?dataset=&split= — live held-out metrics
router.get('/model/evaluate', asyncHandler(async (req, res) => {
  const dataset = str(req.query.dataset) ?? 'marida';
  const split = str(req.query.split) ?? 'test';
  await proxy(res, `/model/evaluate?dataset=${encodeURIComponent(dataset)}&split=${encodeURIComponent(split)}`, {}, 30_000);
}));

// GET /api/engine/capabilities — self-describing feature list
router.get('/capabilities', asyncHandler(async (_req, res) => {
  await proxy(res, '/capabilities', {}, 6_000);
}));

// GET /api/engine/model/validation — fusion calibration + PLP independent validation
router.get('/model/validation', asyncHandler(async (_req, res) => {
  await proxy(res, '/model/validation', {}, 6_000);
}));

// GET /api/engine/similarity/info — Clay embedding index availability + stats
router.get('/similarity/info', asyncHandler(async (_req, res) => {
  await proxy(res, '/similarity/info', {}, 8_000);
}));

// GET /api/engine/similarity/demo?cls=&k= — find-similar demo (no embedder needed)
router.get('/similarity/demo', asyncHandler(async (req, res) => {
  const cls = str(req.query.cls) ?? '0';
  const k = str(req.query.k) ?? '6';
  await proxy(res, `/similarity/demo?cls=${encodeURIComponent(cls)}&k=${encodeURIComponent(k)}`, {}, 8_000);
}));

// POST /api/engine/similarity/search {embedding,k} — nearest sites for a Clay embedding
router.post('/similarity/search', asyncHandler(async (req, res) => {
  await proxy(res, '/similarity/search', jsonInit(req.body), 20_000);
}));

// GET /api/engine/similarity/hotspot?key=&k= — TRUE 'sites like this hotspot' from its cached embedding
router.get('/similarity/hotspot', asyncHandler(async (req, res) => {
  const key = str(req.query.key) ?? '';
  const k = str(req.query.k) ?? '6';
  await proxy(res, `/similarity/hotspot?key=${encodeURIComponent(key)}&k=${encodeURIComponent(k)}`, {}, 8_000);
}));

// GET /api/engine/similarity/change?key= — temporal change of a site across its embedded observations
router.get('/similarity/change', asyncHandler(async (req, res) => {
  const key = str(req.query.key) ?? '';
  await proxy(res, `/similarity/change?key=${encodeURIComponent(key)}`, {}, 8_000);
}));

// GET /api/engine/similarity/sites?limit= — embedded sites available for per-hotspot intelligence
router.get('/similarity/sites', asyncHandler(async (req, res) => {
  const limit = str(req.query.limit) ?? '200';
  await proxy(res, `/similarity/sites?limit=${encodeURIComponent(limit)}`, {}, 8_000);
}));

// POST /api/engine/export/geotiff — binary passthrough (georeferenced raster)
router.post('/export/geotiff', asyncHandler(async (req, res) => {
  try {
    const r = await fetch(`${env.pythonEngineUrl}/export/geotiff`, jsonInit(req.body));
    if (!r.ok) {
      res.status(r.status).json({ error: { status: r.status, message: await r.text() } });
      return;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', 'image/tiff');
    res.setHeader('Content-Disposition', r.headers.get('content-disposition') ?? 'attachment; filename="aoi.tif"');
    res.setHeader('X-BBox', r.headers.get('x-bbox') ?? '');
    res.setHeader('Access-Control-Expose-Headers', 'X-BBox');
    res.send(buf);
  } catch (err) {
    res.status(503).json({ error: { status: 503, message: `engine unavailable: ${(err as Error).message}` } });
  }
}));

export default router;
