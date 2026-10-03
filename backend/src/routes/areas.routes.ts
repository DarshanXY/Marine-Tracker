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
 *   POST   /api/areas/:id/forecast/example  what-if plastic drift, NOT stored (auth, ≥ FIELD)
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
import { env } from '../lib/env';
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


/**
 * TEMPORARY DEMO (env DEMO_PLASTIC, default on): the live detector currently finds
 * no plastic, which leaves the Areas drift forecast with nothing to release. When
 * a saved scan has no plastic, add a small SYNTHETIC plastic cluster over open
 * water inside the box. Everything injected is flagged — `demo: true` on each
 * detection/hotspot and `demoPlastic` on the result — so the UI labels it and it
 * can never be mistaken for a real detection. Real plastic is never overwritten.
 */
async function withDemoPlastic(result: unknown, bbox: BoundingBox): Promise<unknown> {
  if (!env.demoPlastic) return result;
  const r = { ...((result ?? {}) as Record<string, unknown>) };
  const dets = (Array.isArray(r.detections) ? r.detections : []) as {
    classification?: string; confidence?: number; areaSqKm?: number;
  }[];
  if (dets.some((d) => d?.classification === 'Plastic')) return result;

  // Seed on open water so the drift engine accepts the release point; fall back
  // to the box centre when the engine (or its coastline) is unavailable.
  let lat = (bbox.north + bbox.south) / 2;
  let lon = (bbox.east + bbox.west) / 2;
  try {
    const pick = (await callEngine(
      '/forecast/open-water',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bbox) },
      20_000,
    )) as { found?: boolean; lat?: number; lon?: number };
    if (pick.found && pick.lat != null && pick.lon != null) {
      lat = pick.lat;
      lon = pick.lon;
    }
  } catch {
    /* engine offline — keep the centre */
  }

  // Deterministic scatter (seeded by the seed point) so re-saving the same box
  // yields the same cluster. Radius ≤ ~1 km and never outside the box.
  let seed = Math.abs(Math.round(lat * 1e5) * 31 + Math.round(lon * 1e5)) || 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const radius = Math.min(0.01, (bbox.north - bbox.south) / 8, (bbox.east - bbox.west) / 8);
  const clampLat = (v: number) => Math.min(bbox.north, Math.max(bbox.south, v));
  const clampLon = (v: number) => Math.min(bbox.east, Math.max(bbox.west, v));
  const fake = Array.from({ length: 12 }, (_, i) => {
    const ang = rand() * Math.PI * 2;
    const dist = i === 0 ? 0 : radius * Math.sqrt(rand());
    const confidence = +(0.66 + rand() * 0.26).toFixed(3);
    return {
      lat: +clampLat(lat + dist * Math.sin(ang)).toFixed(5),
      lon: +clampLon(lon + dist * Math.cos(ang)).toFixed(5),
      classification: 'Plastic',
      confidence,
      fdiScore: +(0.02 + rand() * 0.04).toFixed(4),
      areaSqKm: 0.0001 * (1 + Math.floor(rand() * 4)),
      status: 'PENDING',
      highConfidence: confidence >= 0.648,
      demo: true,
    };
  });
  const avgFake = fake.reduce((a, d) => a + d.confidence, 0) / fake.length;
  const hotspot = {
    label: 'Demo plastic cluster',
    centroidLat: lat,
    centroidLon: lon,
    detectionCount: fake.length,
    severity: 'HIGH',
    confidence: +avgFake.toFixed(3),
    etaHours: null,
    tier: null,
    demo: true,
  };

  const allDets = [...fake, ...dets];
  const stats = (r.stats ?? {}) as Record<string, unknown>;
  const hotspots = [hotspot, ...((Array.isArray(r.hotspots) ? r.hotspots : []) as unknown[])];
  return {
    ...r,
    // The scan payload now carries content, so it is no longer an offline stub.
    engineOffline: false,
    demoPlastic: true,
    detections: allDets,
    hotspots,
    stats: {
      ...stats,
      candidatePixels: Number(stats.candidatePixels ?? 0) + fake.length,
      detections: allDets.length,
      plastic: fake.length,
      hotspots: hotspots.length,
      avgConfidence: +(allDets.reduce((a, d) => a + (d.confidence ?? 0), 0) / allDets.length).toFixed(3),
      totalAreaSqKm: +allDets.reduce((a, d) => a + (d.areaSqKm ?? 0), 0).toFixed(4),
      provider: String(stats.provider ?? 'demo'),
    },
  };
}

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
      result: null,
    };
    input.result = await withDemoPlastic(b.result ?? null, input.bbox);
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

    // A re-scan that again finds no plastic keeps the demo cluster (see withDemoPlastic).
    let result: unknown = undefined;
    if (b.result !== undefined) {
      const existing = await areas.getArea(req.params.id);
      if (!existing) throw ApiError.notFound('Saved area not found');
      // Never replace a REAL stored scan with the "engine offline" placeholder a re-scan
      // returns while the engine is down — that silently destroyed the saved scan.
      const incoming = (b.result ?? {}) as { engineOffline?: boolean; stats?: { provider?: string } };
      const incomingIsStub = incoming.engineOffline === true || incoming.stats?.provider === 'offline';
      if (incomingIsStub && existing.lastScanAt && existing.stats.provider !== 'offline') {
        throw new ApiError(409, 'The detection engine returned no scan (offline or timed out), so this re-scan was not saved — your stored scan was kept. Check the engine and re-scan.');
      }
      result = await withDemoPlastic(b.result, existing.bbox);
    }

    const area = await areas.updateArea(req.params.id, {
      ...(name !== undefined ? { name } : {}),
      ...(b.notes !== undefined ? { notes: str(b.notes) ?? null } : {}),
      ...(result !== undefined ? { result } : {}),
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
    const explicitLat = num(req.body?.lat);
    const explicitLon = num(req.body?.lon);
    // Ordered release candidates: an explicit point (used alone), else every
    // hotspot centroid then the strongest plastic detections. A wide AOI often has
    // its top hotspot on land / an aquaculture pond, so we walk down the list until
    // the engine confirms one is over open water rather than failing on the first.
    const candidates: { lat: number; lon: number }[] = [];
    if (explicitLat != null && explicitLon != null) {
      candidates.push({ lat: explicitLat, lon: explicitLon });
    } else {
      for (const h of result.hotspots ?? []) candidates.push({ lat: h.centroidLat, lon: h.centroidLon });
      (result.detections ?? [])
        .filter((d) => d.classification === 'Plastic')
        .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
        .slice(0, 40)
        .forEach((d) => candidates.push({ lat: d.lat, lon: d.lon }));
    }
    if (candidates.length === 0) {
      throw new ApiError(422, 'No plastic in this area to forecast drift from. The 72-hour drift models plastic parcels carried by ocean currents — scan an area with confirmed plastic first.');
    }
    const horizonHours = clampInt(req.body?.horizonHours, 72, 6, 240);

    let forecast: EngineForecast | null = null;
    let lat = candidates[0].lat;
    let lon = candidates[0].lon;
    let refusal: string | undefined;
    for (const c of candidates) {
      let raw: unknown;
      try {
        raw = await callEngine(
          '/forecast/trajectory',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: c.lat, lon: c.lon, horizonHours }),
          },
          120_000, // cold gridded-CMEMS load ≈ 30-40 s
        );
      } catch (err) {
        throw new ApiError(503, `Drift engine unavailable: ${(err as Error).message}`);
      }
      const attempt = (raw ?? {}) as EngineForecast & { marine?: boolean; reason?: string };
      // Land / inland-water release point → the engine refuses (ocean currents don't
      // apply there). Remember why and try the next candidate.
      if (attempt.marine === false) {
        refusal = attempt.reason;
        continue;
      }
      forecast = attempt;
      lat = c.lat;
      lon = c.lon;
      break;
    }
    if (!forecast) {
      throw new ApiError(
        422,
        candidates.length === 1
          ? (refusal ?? 'This release point is on land — the ocean drift model does not apply here.')
          : `None of this area's ${candidates.length} plastic candidates are over open water — they sit on land or inland water (e.g. aquaculture ponds), so there is nothing for ocean currents to carry. Scan an area that includes open sea.`,
      );
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

/** Illustrative floating-plastic types for the what-if release. Windage = fraction of
 *  the 10 m wind a floating item picks up on top of the current. These are ASSUMED,
 *  typical-range values (real items vary with shape, fouling and how deep they float),
 *  each spread over three members so the cone reflects that uncertainty. */
const PLASTIC_TYPES = {
  bottle: { label: 'Plastic bottle', windage: [0.015, 0.02, 0.025] },
  bag: { label: 'Plastic bag / film', windage: [0.005, 0.01, 0.015] },
  net: { label: 'Fishing net / rope', windage: [0.0, 0.003, 0.006] },
  foam: { label: 'Foam / polystyrene', windage: [0.03, 0.04, 0.05] },
} as const;
type PlasticTypeKey = keyof typeof PLASTIC_TYPES;

// POST /api/areas/:id/forecast/example — WHAT-IF: drift of a virtual plastic item released
// over open water in this area. A simulation, not a detection: never stored, needs no
// plastic in the scan. Body: { type?, lat?, lon?, horizonHours? } (no lat/lon = auto-pick).
router.post(
  '/:id/forecast/example',
  ...canManage,
  asyncHandler(async (req, res) => {
    const area = await areas.getArea(req.params.id);
    if (!area) throw ApiError.notFound('Saved area not found');

    const typeKey = (str(req.body?.type) ?? 'bottle') as PlasticTypeKey;
    const type = PLASTIC_TYPES[typeKey];
    if (!type) throw ApiError.badRequest(`type must be one of ${Object.keys(PLASTIC_TYPES).join(', ')}`);
    const horizonHours = clampInt(req.body?.horizonHours, 72, 6, 240);

    let lat = num(req.body?.lat);
    let lon = num(req.body?.lon);
    let autoPicked = false;
    if (lat === undefined || lon === undefined) {
      let pick: { found?: boolean; lat?: number; lon?: number; reason?: string };
      try {
        pick = (await callEngine(
          '/forecast/open-water',
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(area.bbox) },
          20_000,
        )) as typeof pick;
      } catch (err) {
        throw new ApiError(503, `Drift engine unavailable: ${(err as Error).message}`);
      }
      if (!pick.found || pick.lat == null || pick.lon == null) {
        throw new ApiError(422, `No open water in this area to drop an example into (${pick.reason ?? 'unknown'}). Click a point on the sea in the map instead.`);
      }
      lat = pick.lat;
      lon = pick.lon;
      autoPicked = true;
    }

    let forecast: EngineForecast & { marine?: boolean; reason?: string };
    try {
      forecast = (await callEngine(
        '/forecast/trajectory',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat, lon, horizonHours, windage: type.windage, includeBacktrack: false }),
        },
        120_000, // cold gridded-CMEMS load ≈ 30-40 s
      )) as typeof forecast;
    } catch (err) {
      throw new ApiError(503, `Drift engine unavailable: ${(err as Error).message}`);
    }
    if (forecast.marine === false) {
      throw new ApiError(422, forecast.reason ?? 'That point is on land — pick a point over the sea.');
    }
    if (!Array.isArray(forecast.points) || forecast.points.length === 0) {
      throw new ApiError(502, 'Drift engine returned no trajectory points');
    }

    res.json({
      data: {
        id: 'example',
        areaId: area.id,
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
          backtrack: null,
          pathEndHours: forecast.pathEndHours ?? null,
          pathEndReason: forecast.pathEndReason ?? 'horizon',
          coastLon: forecast.coastLon ?? null,
          coastModel: forecast.coastModel ?? null,
        },
        computedAt: new Date().toISOString(),
        example: { type: typeKey, label: type.label, windage: [...type.windage], autoPicked },
      },
    });
  }),
);

export default router;
