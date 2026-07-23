/**
 * Saved study-area routes — keep a Map Explorer AOI, revisit it, and forecast
 * plastic drift from it.
 *
 *   GET    /api/areas                  list (?region= ?limit=)
 *   GET    /api/areas/:id              one area + stored scan + forecast history
 *   POST   /api/areas                  save an AOI              (auth, level ≥ FIELD)
 *   PATCH  /api/areas/:id              rename / annotate / re-scan (auth, ≥ FIELD)
 *   DELETE /api/areas/:id              remove                   (auth, ≥ FIELD)
 *   POST   /api/areas/:id/forecast     compute + store 72h drift (auth, ≥ FIELD)
 *
 * Reads are public so the page renders in the demo without a login; writes are
 * privileged, matching operations.routes.
 *
 * The forecast route calls the Python engine SERVER-SIDE and stores what the
 * engine returned. A client-supplied path is never persisted — otherwise a
 * stored "prediction" would carry no more authority than whatever the browser
 * chose to POST.
 */
import { Router } from 'express';
import { ApiError, asyncHandler } from '../middleware/errorHandler';
import { authenticate, requireMinLevel } from '../middleware/auth';
import { ROLE_LEVEL } from '../types/auth';
import { callEngine } from '../lib/engine';
import { clampInt, num, str, upper } from '../utils/query';
import * as areas from '../data/areas.repo';
import type { BoundingBox, CreateAreaInput } from '../types/domain';

const router = Router();

// Field crews and above may manage saved areas.
const canManage = [authenticate, requireMinLevel(ROLE_LEVEL.FIELD)];

/** Validate a { north, south, east, west } body field into a real bbox. */
function parseBbox(raw: unknown): BoundingBox {
  const b = (raw ?? {}) as Record<string, unknown>;
  const north = num(b.north);
  const south = num(b.south);
  const east = num(b.east);
  const west = num(b.west);
  if (north === undefined || south === undefined || east === undefined || west === undefined) {
    throw ApiError.badRequest('bbox requires numeric north, south, east and west');
  }
  if (north <= south || east <= west) {
    throw ApiError.badRequest('bbox must have north > south and east > west');
  }
  if (north > 90 || south < -90 || east > 180 || west < -180) {
    throw ApiError.badRequest('bbox is outside valid lat/lon range');
  }
  return { north, south, east, west };
}

/** Engine forecast payload we care about (shape mirrors TrajectoryForecast).
 *  The pathEnd/coast fields describe the landfall clamp: where and why the drawn
 *  path ends, and which coastline meridian was used. They must be threaded
 *  through here or they are silently dropped between the engine and the DB. */
type EngineForecast = {
  points?: { t: number; lat: number; lon: number }[];
  cone?: unknown[];
  etaHours?: number | null;
  landfall?: { probability?: number };
  windageCoeffs?: number[];
  horizonHours?: number;
  pathEndHours?: number;
  pathEndReason?: 'landfall' | 'horizon';
  coastLon?: number | null;
  coastModel?: string;
  dataSource?: string;
  backtrack?: unknown;
};

// GET /api/areas
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const data = await areas.listAreas({
      region: upper(req.query.region),
      limit: clampInt(req.query.limit, 100, 1, 200),
    });
    res.json({ data, meta: { count: data.length } });
  }),
);

// GET /api/areas/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const area = await areas.getArea(req.params.id);
    if (!area) throw ApiError.notFound('Saved area not found');
    res.json({ data: area });
  }),
);

// POST /api/areas
router.post(
  '/',
  ...canManage,
  asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const name = str(b.name);
    if (!name) throw ApiError.badRequest('name is required');

    const input: CreateAreaInput = {
      name,
      notes: str(b.notes) ?? null,
      regionCode: upper(b.regionCode) ?? null,
      bbox: parseBbox(b.bbox),
      runOpts: {
        minConfidence: num(b.runOpts?.minConfidence) ?? 0,
        dedupe: Boolean(b.runOpts?.dedupe),
        biofouling: Boolean(b.runOpts?.biofouling),
      },
      result: b.result ?? null,
    };
    const area = await areas.createArea(input, req.user?.sub ?? null);
    res.status(201).json({ data: area });
  }),
);

// PATCH /api/areas/:id
router.patch(
  '/:id',
  ...canManage,
  asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const name = b.name !== undefined ? str(b.name) : undefined;
    if (b.name !== undefined && !name) throw ApiError.badRequest('name cannot be empty');

    const area = await areas.updateArea(req.params.id, {
      ...(name !== undefined ? { name } : {}),
      ...(b.notes !== undefined ? { notes: str(b.notes) ?? null } : {}),
      ...(b.result !== undefined ? { result: b.result } : {}),
    });
    if (!area) throw ApiError.notFound('Saved area not found');
    res.json({ data: area });
  }),
);

// DELETE /api/areas/:id
router.delete(
  '/:id',
  ...canManage,
  asyncHandler(async (req, res) => {
    const ok = await areas.deleteArea(req.params.id);
    if (!ok) throw ApiError.notFound('Saved area not found');
    res.status(204).end();
  }),
);

// POST /api/areas/:id/forecast — the headline feature: 72h plastic drift.
router.post(
  '/:id/forecast',
  ...canManage,
  asyncHandler(async (req, res) => {
    const area = await areas.getArea(req.params.id);
    if (!area) throw ApiError.notFound('Saved area not found');

    // Release point: explicit body coords → strongest plastic hotspot → highest-
    // confidence plastic detection. NEVER the AOI centroid — drifting an empty /
    // algae-only / inland box's centre produced a senseless "drift" with no plastic
    // to carry. The drift models plastic parcels, so with no plastic there is
    // nothing to forecast.
    const result = (area.result ?? {}) as {
      hotspots?: { centroidLat: number; centroidLon: number }[];
      detections?: { lat: number; lon: number; classification: string; confidence: number }[];
    };
    const top = result.hotspots?.[0];
    const strongestPlastic = (result.detections ?? [])
      .filter((d) => d.classification === 'Plastic')
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
    const lat = num(req.body?.lat) ?? top?.centroidLat ?? strongestPlastic?.lat;
    const lon = num(req.body?.lon) ?? top?.centroidLon ?? strongestPlastic?.lon;
    if (lat == null || lon == null) {
      throw new ApiError(422, 'No plastic in this area to forecast drift from. The 72-hour drift models plastic parcels carried by ocean currents — scan an area with confirmed plastic first.');
    }
    const horizonHours = clampInt(req.body?.horizonHours, 72, 6, 240);

    let forecast: EngineForecast;
    try {
      const raw = await callEngine(
        '/forecast/trajectory',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat, lon, horizonHours }),
        },
        35_000,
      );
      forecast = (raw ?? {}) as EngineForecast;
    } catch (err) {
      throw new ApiError(503, `Drift engine unavailable: ${(err as Error).message}`);
    }

    // Inland / non-marine release point → the engine refuses (ocean currents don't
    // apply to a landlocked reservoir). Surface its honest reason, don't store it.
    const marine = forecast as EngineForecast & { marine?: boolean; reason?: string };
    if (marine.marine === false) {
      throw new ApiError(422, marine.reason ?? 'This area is inland / non-marine — the ocean drift model does not apply here.');
    }
    if (!Array.isArray(forecast.points) || forecast.points.length === 0) {
      throw new ApiError(502, 'Drift engine returned no trajectory points');
    }

    const saved = await areas.addForecast(req.params.id, {
      originLat: lat,
      originLon: lon,
      horizonHours: forecast.horizonHours ?? horizonHours,
      landfallProbability: forecast.landfall?.probability ?? 0,
      etaHours: forecast.etaHours ?? null,
      dataSource: forecast.dataSource ?? 'demo',
      pathData: {
        points: forecast.points,
        cone: forecast.cone ?? [],
        landfall: forecast.landfall ?? {},
        windageCoeffs: forecast.windageCoeffs ?? [],
        backtrack: forecast.backtrack ?? null,
        // Landfall-clamp provenance — where/why the drawn path ends, and the
        // coastline model used. Older rows predate these and read as undefined.
        pathEndHours: forecast.pathEndHours ?? null,
        pathEndReason: forecast.pathEndReason ?? 'horizon',
        coastLon: forecast.coastLon ?? null,
        coastModel: forecast.coastModel ?? null,
      },
    });
    if (!saved) throw ApiError.notFound('Saved area not found');

    res.status(201).json({ data: saved });
  }),
);

export default router;
