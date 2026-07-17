/**
 * Pipeline persistence — write a Python-engine PipelineResult into PostgreSQL.
 *
 * This is what makes the system genuinely real-time: every run (region or
 * user-drawn AOI) lands as SatelliteImage + Detections + Hotspots + Trajectory
 * + Alerts + PipelineLog rows, so the Dashboard / Detections / Alerts pages
 * reflect accumulated REAL results instead of the seed dataset.
 *
 * Persistence is strictly best-effort: any failure is caught by the caller and
 * the run response is returned regardless — a broken DB must never break a run.
 */
import { prisma } from '../lib/prisma';
import { isDemo } from '../lib/dataMode';
import { publishLive } from '../lib/live';

// Engine PipelineResult (camelCase JSON) — the subset persistence needs.
interface EngineStage { stage: string; status: string; durationMs: number; detail: string }
interface EngineDetection {
  lat: number; lon: number; classification: string; confidence: number;
  fdiScore: number; areaSqKm: number; status: string;
}
interface EngineHotspot {
  label: string; centroidLat: number; centroidLon: number; detectionCount: number;
  severity: string; confidence: number; etaHours: number | null;
}
interface EngineTrajectory {
  detectionIndex: number; points: unknown[]; cone: unknown[];
  windageCoeffs: number[]; horizonHours: number; dataSource: string;
}
interface EngineScene {
  sceneId: string; platform: string; tile: string; acquisitionDate: string;
  cloudCoverPct: number; thumbnail: string | null; source: string;
}
export interface EngineResult {
  runId: string;
  region: string | null;
  generatedAt: string;
  stages: EngineStage[];
  detections: EngineDetection[];
  hotspots: EngineHotspot[];
  trajectories: EngineTrajectory[];
  stats: { provider: string; modelLoaded: boolean };
  bbox?: { north: number; south: number; east: number; west: number } | null;
  scene?: EngineScene | null;
}

export interface PersistSummary {
  imageId: string;
  detections: number;
  hotspots: number;
  alerts: number;
}

const SEVERITIES = new Set(['HIGH', 'MEDIUM', 'LOW']);
const STATUSES = new Set(['PENDING', 'CONFIRMED', 'FALSE_ALARM']);
const STAGES = new Set(['DOWNLOAD', 'FDI', 'CNN', 'DBSCAN', 'DRIFT', 'ALERT']);

/** Persist one engine run. Returns null when the DB is not in play (demo mode). */
export async function persistRun(result: EngineResult): Promise<PersistSummary | null> {
  if (isDemo()) return null;

  const region = result.region
    ? await prisma.region.findUnique({ where: { code: result.region } })
    : null;
  const regionId = region?.id ?? null;

  // ── Satellite image (upsert — one row per real scene, reused across runs) ──
  const scene = result.scene;
  const sceneId = scene?.sceneId ?? `RUN_${result.runId}`;
  const acquired = scene?.acquisitionDate ? new Date(scene.acquisitionDate) : new Date(result.generatedAt);
  const image = await prisma.satelliteImage.upsert({
    where: { sceneId },
    update: { isProcessed: true },
    create: {
      sceneId,
      platform: scene?.platform ?? 'sentinel-2',
      tile: scene?.tile ?? (result.region ?? 'AOI'),
      acquisitionDate: acquired,
      cloudCoverPct: scene?.cloudCoverPct ?? 0,
      regionId,
      isProcessed: true,
      bandsMeta: {
        provider: result.stats.provider,
        sceneSource: scene?.source ?? 'none',
        thumbnail: scene?.thumbnail ?? null,
        bbox: result.bbox ?? null,
        runId: result.runId,
      },
    },
  });

  // ── Detections (bulk) ──────────────────────────────────────────────────────
  await prisma.detection.createMany({
    data: result.detections.map((d) => ({
      imageId: image.id,
      regionId,
      lat: d.lat,
      lon: d.lon,
      classification: d.classification,
      confidence: d.confidence,
      fdiScore: d.fdiScore,
      areaSqKm: d.areaSqKm,
      status: (STATUSES.has(d.status) ? d.status : 'PENDING') as 'PENDING',
      rawBandValues: { runId: result.runId },
    })),
  });

  // ── Hotspots — stable labels (region runs) update in place; AOI labels get
  //    a run suffix so different drawn areas never collide ────────────────────
  const aoi = !result.region;
  let hotspotCount = 0;
  const persistedHotspots: { id: string; label: string; hs: EngineHotspot }[] = [];
  for (const h of result.hotspots) {
    const label = aoi ? h.label.replace(/^AOI/, `AOI-${result.runId.slice(-4)}`) : h.label;
    const severity = (SEVERITIES.has(h.severity) ? h.severity : 'LOW') as 'LOW';
    const existing = aoi
      ? null
      : await prisma.hotspot.findFirst({ where: { label, isActive: true } });
    const row = existing
      ? await prisma.hotspot.update({
          where: { id: existing.id },
          data: {
            centroidLat: h.centroidLat, centroidLon: h.centroidLon,
            detectionCount: h.detectionCount, severity, confidence: h.confidence,
            etaHours: h.etaHours,
          },
        })
      : await prisma.hotspot.create({
          data: {
            label, regionId,
            centroidLat: h.centroidLat, centroidLon: h.centroidLon,
            detectionCount: h.detectionCount, severity, confidence: h.confidence,
            etaHours: h.etaHours, isActive: true,
            firstDetected: new Date(result.generatedAt),
          },
        });
    persistedHotspots.push({ id: row.id, label, hs: h });
    hotspotCount += 1;
  }

  // ── Trajectories — link each to the persisted detection nearest its hotspot ─
  if (result.trajectories.length > 0) {
    const runDetections = await prisma.detection.findMany({
      where: { imageId: image.id, classification: 'Plastic' },
      select: { id: true, lat: true, lon: true },
      orderBy: { createdAt: 'desc' },
      take: result.detections.length || 1,
    });
    for (const t of result.trajectories) {
      const h = result.hotspots[t.detectionIndex];
      const anchor = h
        ? runDetections.reduce(
            (best, d) => {
              const dist = (d.lat - h.centroidLat) ** 2 + (d.lon - h.centroidLon) ** 2;
              return dist < best.dist ? { d, dist } : best;
            },
            { d: runDetections[0], dist: Number.POSITIVE_INFINITY },
          ).d
        : runDetections[0];
      if (!anchor) continue;
      await prisma.trajectory.create({
        data: {
          detectionId: anchor.id,
          pathData: { points: t.points, cone: t.cone } as object,
          windageCoeffs: t.windageCoeffs,
          horizonHours: t.horizonHours,
          dataSource: t.dataSource,
        },
      });
    }
  }

  // ── Alerts for HIGH/MEDIUM hotspots (deduped per label per 24 h) ───────────
  let alertCount = 0;
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
  for (const { label, hs } of persistedHotspots) {
    if (hs.severity !== 'HIGH' && hs.severity !== 'MEDIUM') continue;
    const title = `${hs.severity} plastic hotspot ${label}`;
    const recent = await prisma.alert.findFirst({
      where: { title, isAcked: false, createdAt: { gte: dayAgo } },
    });
    if (recent) continue;
    const nearCoast = hs.etaHours != null && hs.etaHours <= 48;
    await prisma.alert.create({
      data: {
        type: nearCoast ? 'COAST_PROXIMITY' : 'HOTSPOT',
        severity: hs.severity as 'HIGH',
        title,
        message:
          `${hs.detectionCount} plastic detections clustered at ` +
          `${hs.centroidLat.toFixed(3)}, ${hs.centroidLon.toFixed(3)}` +
          (hs.etaHours != null ? ` — coast ETA ~${Math.round(hs.etaHours)} h.` : ' (open ocean).'),
        sentVia: ['dashboard'],
        sentAt: new Date(),
      },
    });
    alertCount += 1;
    publishLive({ type: 'alert', severity: hs.severity, title, etaHours: hs.etaHours });
  }

  // ── Pipeline log (one row per stage) ───────────────────────────────────────
  await prisma.pipelineLog.createMany({
    data: result.stages
      .filter((s) => STAGES.has(s.stage))
      .map((s) => ({
        imageId: image.id,
        stage: s.stage as 'DOWNLOAD',
        status: (s.status === 'COMPLETED' ? 'COMPLETED' : 'FAILED') as 'COMPLETED',
        durationMs: s.durationMs,
        completedAt: new Date(),
        metadata: { detail: s.detail, runId: result.runId },
      })),
  });

  const summary = {
    imageId: image.id,
    detections: result.detections.length,
    hotspots: hotspotCount,
    alerts: alertCount,
  };
  publishLive({
    type: 'run',
    runId: result.runId,
    region: result.region ?? 'AOI',
    provider: result.stats.provider,
    ...summary,
  });
  return summary;
}
