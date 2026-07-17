/**
 * Pipeline routes — proxy to the Python detection engine (FDI → CNN → DBSCAN →
 * drift). If the engine is not running, returns an equivalent result built from
 * the bundled demo dataset so the frontend keeps working (marked engine=offline).
 */
import { Readable } from 'stream';
import { Router, type RequestHandler } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { env } from '../lib/env';
import { logger } from '../lib/logger';
import { callEngine } from '../lib/engine';
import { publishLive } from '../lib/live';
import { enqueueRun, jobStatus, queueAvailable, queueCounts } from '../lib/queue';
import { str } from '../utils/query';
import * as mock from '../data/mock';
import { persistRun, type EngineResult, type PersistSummary } from '../services/pipelinePersist.service';

const router = Router();

// GET /api/pipeline/stream?north=&south=&east=&west=&scene_size= — pipe the engine's
// live-scan SSE straight to the browser (per-stage progress as an AOI scan runs).
router.get('/stream', asyncHandler(async (req, res) => {
  const params = new URLSearchParams();
  for (const k of ['north', 'south', 'east', 'west', 'scene_size']) {
    const v = str(req.query[k]);
    if (v !== undefined) params.set(k, v);
  }
  try {
    const upstream = await fetch(`${env.pythonEngineUrl}/pipeline/stream?${params.toString()}`);
    if (!upstream.ok || !upstream.body) {
      res.status(502).json({ error: { status: 502, message: 'engine stream unavailable' } });
      return;
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    const stream = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]);
    stream.pipe(res);
    req.on('close', () => stream.destroy());
  } catch {
    if (!res.headersSent) res.status(502).json({ error: { status: 502, message: 'engine stream unavailable' } });
  }
}));

/** Best-effort persistence — a broken DB must never break a pipeline run. */
async function tryPersist(data: unknown): Promise<PersistSummary | null> {
  try {
    return await persistRun(data as EngineResult);
  } catch (err) {
    logger.warn(`pipeline persistence failed: ${(err as Error).message}`);
    return null;
  }
}

function demoPipelineResult(region?: string): Record<string, unknown> {
  const dets = region ? mock.detections.filter((d) => d.regionCode === region) : mock.detections;
  const hots = region ? mock.hotspots.filter((h) => h.regionCode === region) : mock.hotspots;
  const traj = mock.trajectories[0];
  const plastic = dets.filter((d) => d.classification === 'Plastic').length;

  return {
    runId: `run_demo_${Date.now().toString(36)}`,
    region: region ?? null,
    generatedAt: new Date().toISOString(),
    demoMode: true,
    stages: [
      { stage: 'DOWNLOAD', status: 'COMPLETED', durationMs: 5, detail: `${dets.length * 3} pixels (offline — Python engine unreachable)` },
      { stage: 'FDI',      status: 'COMPLETED', durationMs: 2, detail: `${dets.length} candidate pixels above FDI 0.02` },
      { stage: 'CNN',      status: 'COMPLETED', durationMs: 4, detail: `${plastic} plastic classified (model_loaded=false)` },
      { stage: 'DBSCAN',   status: 'COMPLETED', durationMs: 1, detail: `${hots.length} hotspot cluster(s)` },
      { stage: 'DRIFT',    status: 'COMPLETED', durationMs: 6, detail: '1 trajectory, 72h horizon' },
      { stage: 'ALERT',    status: 'COMPLETED', durationMs: 1, detail: `${hots.filter((h) => h.severity !== 'LOW').length} alert(s)` },
    ],
    detections: dets.map((d) => ({
      lat: d.lat, lon: d.lon, classification: d.classification, confidence: d.confidence,
      fdiScore: d.fdiScore, areaSqKm: d.areaSqKm, status: d.status,
    })),
    hotspots: hots.map((h) => ({
      label: h.label, centroidLat: h.centroidLat, centroidLon: h.centroidLon,
      detectionCount: h.detectionCount, severity: h.severity, confidence: h.confidence, etaHours: h.etaHours,
    })),
    trajectories: traj
      ? [{ detectionIndex: 0, points: traj.points, cone: traj.cone, windageCoeffs: traj.windageCoeffs, horizonHours: traj.horizonHours, dataSource: 'demo' }]
      : [],
    stats: {
      candidatePixels: dets.length,
      detections: dets.length,
      plastic,
      hotspots: hots.length,
      avgConfidence: +(dets.reduce((s, d) => s + d.confidence, 0) / (dets.length || 1)).toFixed(3),
      totalAreaSqKm: +dets.reduce((s, d) => s + d.areaSqKm, 0).toFixed(4),
      provider: 'demo',
      modelLoaded: false,
    },
  };
}

/** A bbox {north,south,east,west} from the request, or undefined if not a valid AOI. */
function parseBbox(raw: unknown): { north: number; south: number; east: number; west: number } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const b = raw as Record<string, unknown>;
  const n = Number(b.north), s = Number(b.south), e = Number(b.east), w = Number(b.west);
  if ([n, s, e, w].some((v) => !Number.isFinite(v))) return undefined;
  if (s >= n || w >= e) return undefined;
  return { north: n, south: s, east: e, west: w };
}

/** Engine-offline marker for an AOI run — no fabricated detections (all data is
 *  computed live by the engine; when it's down we say so rather than show statics). */
function offlineAoiResult(bbox: { north: number; south: number; east: number; west: number }): Record<string, unknown> {
  const stage = (s: string, detail: string) => ({ stage: s, status: 'SKIPPED', durationMs: 0, detail });
  return {
    runId: `aoi_offline_${Date.now().toString(36)}`,
    region: null,
    generatedAt: new Date().toISOString(),
    demoMode: true,
    engineOffline: true,
    bbox,
    scene: null,
    stages: ['DOWNLOAD', 'FDI', 'CNN', 'DBSCAN', 'DRIFT', 'ALERT'].map((s) =>
      stage(s, 'Python engine unreachable — start it on :8000 to analyze this area'),
    ),
    detections: [],
    hotspots: [],
    trajectories: [],
    stats: {
      candidatePixels: 0, detections: 0, plastic: 0, hotspots: 0,
      avgConfidence: 0, totalAreaSqKm: 0, provider: 'offline', modelLoaded: false,
    },
  };
}

// POST /api/pipeline/run — triggers a real engine scan that persists detections;
// gated behind a signed-in user so it can't be hammered anonymously.
router.post(
  '/run',
  authenticate,
  asyncHandler(async (req, res) => {
    const region = str(req.body?.region);
    const sceneSize = Number(req.body?.sceneSize) || 48;
    const bbox = parseBbox(req.body?.bbox);
    // Opt-in run modifiers (forwarded to the engine; all default off).
    const opts = {
      minConfidence: Number(req.body?.minConfidence) || 0,
      dedupe: req.body?.dedupe === true,
      biofouling: req.body?.biofouling === true,
    };

    // Queued mode (BullMQ): return a job id immediately; the worker runs the
    // engine + persistence with retries. Requires Redis (falls through if down).
    if (req.body?.queued === true && (await queueAvailable())) {
      const jobId = await enqueueRun(bbox ? 'aoi-run' : `region-${region ?? 'all'}`, { region, bbox, sceneSize });
      res.status(202).json({ data: { jobId, queued: true }, meta: { engine: 'queued' } });
      return;
    }

    try {
      // 120s: a cold real-satellite run = OAuth token + 256×256 Process API
      // fetch + STAC scene lookup + drift forcing — 20s aborts genuine runs.
      const data = await callEngine('/pipeline/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bbox ? { bbox, sceneSize, ...opts } : { region, sceneSize, ...opts }),
      }, 120_000);
      // Real-time persistence: land this run's detections/hotspots/alerts in
      // PostgreSQL so the dashboards reflect accumulated real results.
      const persisted = await tryPersist(data);
      res.json({ data, meta: { engine: 'online', persisted } });
    } catch {
      res.json({ data: bbox ? offlineAoiResult(bbox) : demoPipelineResult(region), meta: { engine: 'offline' } });
    }
  }),
);

// GET /api/pipeline/logs — recent per-stage pipeline log rows (operations board).
router.get(
  '/logs',
  asyncHandler(async (req, res) => {
    const limit = Number(req.query.limit) || 30;
    const { listPipelineLogs } = await import('../data/repo');
    res.json({ data: await listPipelineLogs(Math.min(Math.max(limit, 1), 100)) });
  }),
);

// GET /api/pipeline/jobs/:id — status/result of a queued run.
router.get(
  '/jobs/:id',
  asyncHandler(async (req, res) => {
    if (!(await queueAvailable())) {
      res.status(503).json({ error: { status: 503, message: 'queue unavailable (Redis down)' } });
      return;
    }
    const status = await jobStatus(req.params.id);
    if (!status) {
      res.status(404).json({ error: { status: 404, message: 'job not found' } });
      return;
    }
    res.json({ data: status });
  }),
);

// POST|GET /api/pipeline/scheduled-run — external-scheduler entry point
// (GitHub Actions cron / cron-job.org / Task Scheduler hit this URL). Runs the
// engine for every monitored region and persists the results. Guarded by
// SCHEDULER_TOKEN when set (query ?token= or X-Scheduler-Token header).
const scheduledRun = asyncHandler(async (req, res) => {
  const token = env.schedulerToken;
  const given = str(req.query.token) ?? str(req.headers['x-scheduler-token']);
  if (token && given !== token) {
    res.status(401).json({ error: { status: 401, message: 'Invalid scheduler token' } });
    return;
  }

  // One engine run PER region so every persisted row carries its regionId
  // (a combined all-regions result can't attribute detections to regions).
  let codes: string[] = [];
  try {
    const { prisma } = await import('../lib/prisma');
    codes = (await prisma.region.findMany({ select: { code: true } })).map((r) => r.code);
  } catch {
    codes = [];
  }
  if (codes.length === 0) codes = ['MUM', 'GOA', 'KCH', 'CHN', 'AND'];

  // Preferred path (architecture spec): ENQUEUE one job per region and ack the
  // cron immediately — the BullMQ worker executes with retries/backoff.
  if (await queueAvailable()) {
    const jobs: Record<string, string> = {};
    for (const code of codes) {
      jobs[code] = await enqueueRun(`region-${code}`, { region: code, sceneSize: 64 });
    }
    publishLive({ type: 'schedule', regions: codes.length, mode: 'queued' });
    res.status(202).json({
      data: { enqueuedAt: new Date().toISOString(), mode: 'queued', jobs },
    });
    return;
  }

  // Fallback (Redis down): run serially inline, blocking until done.
  const runs: Record<string, unknown>[] = [];
  for (const code of codes) {
    try {
      const data = await callEngine('/pipeline/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region: code, sceneSize: 64 }),
      }, 120_000);
      const persisted = await tryPersist(data);
      const stats = (data as { stats?: Record<string, unknown> }).stats ?? {};
      runs.push({ region: code, persisted, plastic: stats.plastic, hotspots: stats.hotspots });
    } catch (err) {
      runs.push({ region: code, error: (err as Error).message });
    }
  }
  const ok = runs.filter((r) => !r.error).length;
  res.status(ok > 0 ? 200 : 503).json({
    data: { ranAt: new Date().toISOString(), mode: 'direct', regions: codes.length, succeeded: ok, runs },
  });
});
// Allow a valid scheduler token (external cron) OR a signed-in user (the in-app
// "Run all regions" button). Anonymous callers with neither are rejected — no
// more default-open expensive-scan trigger.
const schedulerOrAuth: RequestHandler = (req, res, next) => {
  const token = env.schedulerToken;
  const given = str(req.query.token) ?? str(req.headers['x-scheduler-token']);
  if (token && given === token) return next();
  return authenticate(req, res, next);
};

router.post('/scheduled-run', schedulerOrAuth, scheduledRun);
router.get('/scheduled-run', schedulerOrAuth, scheduledRun); // cron-job.org free tier only does GET

// GET /api/pipeline/status — engine reachability + queue health.
router.get(
  '/status',
  asyncHandler(async (_req, res) => {
    const queue = (await queueAvailable())
      ? { state: 'up', counts: await queueCounts() }
      : { state: 'down', counts: null };
    const scheduler = {
      enabled: env.scheduler.enabled,
      intervalMinutes: Math.round(env.scheduler.intervalMs / 60_000),
    };
    try {
      const health = (await callEngine('/health', {}, 4000)) as Record<string, unknown>;
      res.json({ data: { engine: 'online', queue, scheduler, ...health } });
    } catch {
      res.json({ data: { engine: 'offline', queue, scheduler, demoMode: true, phase: 'engine not running' } });
    }
  }),
);

export default router;
