/**
 * Repository layer. Every function tries a live Prisma query and transparently
 * falls back to the bundled demo dataset when the DB is unavailable (or when
 * DEMO_MODE=true). Routes never touch Prisma or the mock arrays directly.
 */
import { prisma } from '../lib/prisma';
import { strictReal, dataMode } from '../lib/dataMode';
import { env } from '../lib/env';
import { logger } from '../lib/logger';
import * as mock from './mock';
import type {
  AlertDto,
  ClassStat,
  DetectionDto,
  HotspotDto,
  OverviewStats,
  RegionDto,
  RegionStat,
  SatelliteScene,
  TrendPoint,
} from '../types/domain';

/** Run the live query, falling back to demo data on any failure.
 *  Under DATA_STRICT (real deployments) a DB outage or query error is surfaced
 *  instead of silently returning mock. */
async function pick<T>(live: () => Promise<T>, demo: () => T): Promise<T> {
  if (env.DEMO_MODE) return demo();            // explicitly demo — always mock
  if (!dataMode.dbHealthy) {
    if (strictReal()) throw new Error('DATA_STRICT: database unavailable and demo fallback is disabled.');
    return demo();
  }
  try {
    return await live();
  } catch (err) {
    if (strictReal()) throw err;               // surface the real error, don't mask it with mock
    logger.warn('Live query failed — falling back to demo data.', err);
    return demo();
  }
}

const iso = (d: Date | null | undefined): string | null =>
  d ? d.toISOString() : null;

// ── Filters ──────────────────────────────────────────────────────────────────
export interface DetectionFilters {
  region?: string;
  status?: string;
  classification?: string;
  minConfidence?: number;
  /** Only detections from the last N days (time-slider window). */
  days?: number;
  limit: number;
  offset: number;
}
export interface HotspotFilters {
  region?: string;
  severity?: string;
  active?: boolean;
}
export interface AlertFilters {
  acked?: boolean;
  severity?: string;
  type?: string;
}

// ── Stats ────────────────────────────────────────────────────────────────────
export function getOverview(): Promise<OverviewStats> {
  return pick(
    async () => {
      const [
        totalDetections, confirmedDetections, pendingDetections, falseAlarms,
        plasticDetections, agg, activeHotspots, highSeverityHotspots,
        regionsMonitored, openAlerts, model,
      ] = await Promise.all([
        prisma.detection.count(),
        prisma.detection.count({ where: { status: 'CONFIRMED' } }),
        prisma.detection.count({ where: { status: 'PENDING' } }),
        prisma.detection.count({ where: { status: 'FALSE_ALARM' } }),
        prisma.detection.count({ where: { classification: 'Plastic' } }),
        prisma.detection.aggregate({ _avg: { confidence: true }, _sum: { areaSqKm: true } }),
        prisma.hotspot.count({ where: { isActive: true } }),
        prisma.hotspot.count({ where: { isActive: true, severity: 'HIGH' } }),
        prisma.region.count({ where: { isActive: true } }),
        prisma.alert.count({ where: { isAcked: false } }),
        prisma.modelVersion.findFirst({ where: { isActive: true } }),
      ]);
      return {
        totalDetections, confirmedDetections, pendingDetections, falseAlarms,
        plasticDetections,
        avgConfidence: +(agg._avg.confidence ?? 0).toFixed(3),
        totalAreaSqKm: +(agg._sum.areaSqKm ?? 0).toFixed(4),
        activeHotspots, highSeverityHotspots, regionsMonitored, openAlerts,
        lastUpdated: new Date().toISOString(),
        model: {
          name: model?.name ?? mock.modelVersion.name,
          version: model?.version ?? mock.modelVersion.version,
          f1Score: model?.f1Score ?? mock.modelVersion.f1Score,
        },
      };
    },
    () => {
      const d = mock.detections;
      const conf = d.reduce((s, x) => s + x.confidence, 0) / (d.length || 1);
      return {
        totalDetections: d.length,
        confirmedDetections: d.filter((x) => x.status === 'CONFIRMED').length,
        pendingDetections: d.filter((x) => x.status === 'PENDING').length,
        falseAlarms: d.filter((x) => x.status === 'FALSE_ALARM').length,
        plasticDetections: d.filter((x) => x.classification === 'Plastic').length,
        avgConfidence: +conf.toFixed(3),
        totalAreaSqKm: +d.reduce((s, x) => s + x.areaSqKm, 0).toFixed(4),
        activeHotspots: mock.hotspots.filter((h) => h.isActive).length,
        highSeverityHotspots: mock.hotspots.filter((h) => h.isActive && h.severity === 'HIGH').length,
        regionsMonitored: mock.regions.length,
        openAlerts: mock.alerts.filter((a) => !a.isAcked).length,
        lastUpdated: new Date().toISOString(),
        model: mock.modelVersion,
      };
    },
  );
}

export function getTrend(days: number): Promise<TrendPoint[]> {
  return pick(
    async () => {
      const rows = await prisma.$queryRaw<{ day: Date; count: bigint; confirmed: bigint }[]>`
        SELECT date_trunc('day', created_at) AS day,
               count(*) AS count,
               count(*) FILTER (WHERE status = 'CONFIRMED') AS confirmed
        FROM detections
        WHERE created_at >= now() - make_interval(days => ${days}::int)
        GROUP BY 1 ORDER BY 1`;
      return rows.map((r) => ({
        date: r.day.toISOString().slice(0, 10),
        detections: Number(r.count),
        confirmed: Number(r.confirmed),
      }));
    },
    () => buildTrend(days),
  );
}

function buildTrend(days: number): TrendPoint[] {
  const buckets = new Map<string, { detections: number; confirmed: number }>();
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const key = new Date(today.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    buckets.set(key, { detections: 0, confirmed: 0 });
  }
  for (const d of mock.detections) {
    const key = d.createdAt.slice(0, 10);
    const b = buckets.get(key);
    if (!b) continue;
    b.detections += 1;
    if (d.status === 'CONFIRMED') b.confirmed += 1;
  }
  return Array.from(buckets.entries()).map(([date, v]) => ({ date, ...v }));
}

export function getByRegion(): Promise<RegionStat[]> {
  return pick(
    async () => {
      const regions = await prisma.region.findMany({
        where: { isActive: true },
        include: {
          _count: { select: { detections: true, hotspots: true } },
          hotspots: { where: { severity: 'HIGH', isActive: true }, select: { id: true } },
        },
      });
      return regions.map((r) => ({
        code: r.code,
        name: r.displayName,
        detections: r._count.detections,
        hotspots: r._count.hotspots,
        highSeverity: r.hotspots.length,
      }));
    },
    () =>
      mock.regions.map((r) => ({
        code: r.code,
        name: r.displayName,
        detections: r.detectionCount,
        hotspots: r.hotspotCount,
        highSeverity: mock.hotspots.filter(
          (h) => h.regionCode === r.code && h.severity === 'HIGH',
        ).length,
      })),
  );
}

export function getByClass(): Promise<ClassStat[]> {
  return pick(
    async () => {
      const grouped = await prisma.detection.groupBy({
        by: ['classification'],
        _count: { _all: true },
      });
      const total = grouped.reduce((s, g) => s + g._count._all, 0) || 1;
      return grouped
        .map((g) => ({
          classification: g.classification,
          count: g._count._all,
          pct: +((g._count._all / total) * 100).toFixed(1),
        }))
        .sort((a, b) => b.count - a.count);
    },
    () => {
      const counts = new Map<string, number>();
      for (const d of mock.detections) {
        counts.set(d.classification, (counts.get(d.classification) ?? 0) + 1);
      }
      const total = mock.detections.length || 1;
      return Array.from(counts.entries())
        .map(([classification, count]) => ({
          classification,
          count,
          pct: +((count / total) * 100).toFixed(1),
        }))
        .sort((a, b) => b.count - a.count);
    },
  );
}

// ── Detections ───────────────────────────────────────────────────────────────
export function listDetections(
  f: DetectionFilters,
): Promise<{ data: DetectionDto[]; total: number }> {
  return pick(
    async () => {
      const where = {
        ...(f.region ? { region: { code: f.region } } : {}),
        ...(f.status ? { status: f.status as never } : {}),
        ...(f.classification ? { classification: f.classification } : {}),
        ...(f.minConfidence ? { confidence: { gte: f.minConfidence } } : {}),
        ...(f.days ? { createdAt: { gte: new Date(Date.now() - f.days * 86_400_000) } } : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.detection.findMany({
          where,
          include: { region: { select: { code: true, displayName: true } } },
          orderBy: { createdAt: 'desc' },
          take: f.limit,
          skip: f.offset,
        }),
        prisma.detection.count({ where }),
      ]);
      return {
        data: rows.map(
          (r): DetectionDto => ({
            id: r.id,
            lat: r.lat,
            lon: r.lon,
            classification: r.classification,
            confidence: r.confidence,
            fdiScore: r.fdiScore,
            areaSqKm: r.areaSqKm,
            pixelCount: r.pixelCount,
            status: r.status,
            regionCode: r.region?.code ?? null,
            regionName: r.region?.displayName ?? null,
            createdAt: r.createdAt.toISOString(),
          }),
        ),
        total,
      };
    },
    () => {
      let rows = [...mock.detections];
      if (f.region) rows = rows.filter((d) => d.regionCode === f.region);
      if (f.status) rows = rows.filter((d) => d.status === f.status);
      if (f.classification) rows = rows.filter((d) => d.classification === f.classification);
      if (f.minConfidence) rows = rows.filter((d) => d.confidence >= f.minConfidence!);
      if (f.days) {
        const cutoff = new Date(Date.now() - f.days * 86_400_000).toISOString();
        rows = rows.filter((d) => d.createdAt >= cutoff);
      }
      rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const total = rows.length;
      return { data: rows.slice(f.offset, f.offset + f.limit), total };
    },
  );
}

// ── Pipeline logs (operations board) ─────────────────────────────────────────
export interface PipelineLogDto {
  id: string;
  stage: string;
  status: string;
  durationMs: number;
  at: string;
  detail: string;
  sceneId: string | null;
}

const STAGE_SEQ = ['DOWNLOAD', 'FDI', 'CNN', 'DBSCAN', 'DRIFT', 'ALERT'];

export function listPipelineLogs(limit = 30): Promise<PipelineLogDto[]> {
  return pick(
    async () => {
      const rows = await prisma.pipelineLog.findMany({
        orderBy: { startedAt: 'desc' },
        take: limit,
        include: { image: { select: { sceneId: true } } },
      });
      return rows.map((r): PipelineLogDto => ({
        id: r.id,
        stage: r.stage as string,
        status: r.status as string,
        durationMs: r.durationMs ?? 0,
        at: (r.completedAt ?? r.startedAt).toISOString(),
        detail: (r.metadata as { detail?: string })?.detail ?? '',
        sceneId: r.image?.sceneId ?? null,
      }));
    },
    () =>
      // Demo: one plausible completed run, most recent stage first.
      STAGE_SEQ.map((stage, i) => ({
        id: `demo-log-${i}`,
        stage,
        status: 'COMPLETED',
        durationMs: [3200, 45, 120, 60, 800, 12][i],
        at: new Date(Date.now() - (STAGE_SEQ.length - i) * 60_000).toISOString(),
        detail: 'demo pipeline run (engine offline or DEMO_MODE=true)',
        sceneId: null,
      })).reverse().slice(0, limit),
  );
}

export function getDetection(id: string): Promise<DetectionDto | null> {
  return pick(
    async () => {
      const r = await prisma.detection.findUnique({
        where: { id },
        include: { region: { select: { code: true, displayName: true } } },
      });
      if (!r) return null;
      return {
        id: r.id,
        lat: r.lat,
        lon: r.lon,
        classification: r.classification,
        confidence: r.confidence,
        fdiScore: r.fdiScore,
        areaSqKm: r.areaSqKm,
        pixelCount: r.pixelCount,
        status: r.status,
        regionCode: r.region?.code ?? null,
        regionName: r.region?.displayName ?? null,
        createdAt: r.createdAt.toISOString(),
      };
    },
    () => mock.detections.find((d) => d.id === id) ?? null,
  );
}

// ── Analyst labeling → active learning ───────────────────────────────────────
const LABEL_STATUSES = ['PENDING', 'CONFIRMED', 'FALSE_ALARM'] as const;
export type LabelStatus = (typeof LABEL_STATUSES)[number];
export const isLabelStatus = (s: string): s is LabelStatus =>
  (LABEL_STATUSES as readonly string[]).includes(s);

/** Human validation of a detection: CONFIRMED / FALSE_ALARM / (reset to) PENDING.
 *  Stamps validatedBy/validatedAt on a real verdict; clears them on reset. These
 *  labels are the ground truth an active-learning loop retrains on. */
export function labelDetection(
  id: string, status: LabelStatus, userId: string | null,
): Promise<DetectionDto | null> {
  const validated = status !== 'PENDING';
  return pick(
    async () => {
      const r = await prisma.detection.update({
        where: { id },
        data: {
          status: status as never,
          validatedBy: validated ? userId : null,
          validatedAt: validated ? new Date() : null,
        },
        include: { region: { select: { code: true, displayName: true } } },
      });
      return {
        id: r.id, lat: r.lat, lon: r.lon, classification: r.classification,
        confidence: r.confidence, fdiScore: r.fdiScore, areaSqKm: r.areaSqKm,
        pixelCount: r.pixelCount, status: r.status,
        regionCode: r.region?.code ?? null, regionName: r.region?.displayName ?? null,
        createdAt: r.createdAt.toISOString(),
      };
    },
    () => {
      const d = mock.detections.find((x) => x.id === id);
      if (!d) return null;
      d.status = status;
      return d;
    },
  );
}

export interface TrainingLabel {
  id: string;
  lat: number;
  lon: number;
  classification: string;
  confidence: number;
  fdiScore: number;
  areaSqKm: number;
  label: LabelStatus;          // CONFIRMED = positive, FALSE_ALARM = negative
  regionCode: string | null;
  validatedAt: string | null;
  rawBandValues: Record<string, number> | null;
}

/** The human-validated set (CONFIRMED + FALSE_ALARM) as an active-learning export:
 *  each row pairs a detection's spectral evidence with its analyst verdict, ready
 *  to augment the next training round. */
export function exportTrainingLabels(): Promise<TrainingLabel[]> {
  return pick(
    async () => {
      const rows = await prisma.detection.findMany({
        where: { status: { in: ['CONFIRMED', 'FALSE_ALARM'] } },
        include: { region: { select: { code: true } } },
        orderBy: { validatedAt: 'desc' },
      });
      return rows.map((r): TrainingLabel => ({
        id: r.id, lat: r.lat, lon: r.lon, classification: r.classification,
        confidence: r.confidence, fdiScore: r.fdiScore, areaSqKm: r.areaSqKm,
        label: r.status as LabelStatus, regionCode: r.region?.code ?? null,
        validatedAt: iso(r.validatedAt),
        rawBandValues: (r.rawBandValues as Record<string, number>) ?? null,
      }));
    },
    () =>
      mock.detections
        .filter((d) => d.status === 'CONFIRMED' || d.status === 'FALSE_ALARM')
        .map((d): TrainingLabel => ({
          id: d.id, lat: d.lat, lon: d.lon, classification: d.classification,
          confidence: d.confidence, fdiScore: d.fdiScore, areaSqKm: d.areaSqKm,
          label: d.status as LabelStatus, regionCode: d.regionCode ?? null,
          validatedAt: null, rawBandValues: null,
        })),
  );
}

// ── Hotspots ─────────────────────────────────────────────────────────────────
export function listHotspots(f: HotspotFilters): Promise<HotspotDto[]> {
  return pick(
    async () => {
      const rows = await prisma.hotspot.findMany({
        where: {
          ...(f.region ? { region: { code: f.region } } : {}),
          ...(f.severity ? { severity: f.severity as never } : {}),
          ...(f.active !== undefined ? { isActive: f.active } : {}),
        },
        include: { region: { select: { code: true, displayName: true } } },
        orderBy: { detectionCount: 'desc' },
      });
      return rows.map(
        (h): HotspotDto => ({
          id: h.id,
          label: h.label,
          centroidLat: h.centroidLat,
          centroidLon: h.centroidLon,
          detectionCount: h.detectionCount,
          severity: h.severity,
          confidence: h.confidence,
          etaHours: h.etaHours,
          regionCode: h.region?.code ?? null,
          regionName: h.region?.displayName ?? null,
          isActive: h.isActive,
          firstDetected: h.firstDetected.toISOString(),
          lastDetected: h.lastDetected.toISOString(),
          trajectory: null,
        }),
      );
    },
    () => {
      let rows = [...mock.hotspots];
      if (f.region) rows = rows.filter((h) => h.regionCode === f.region);
      if (f.severity) rows = rows.filter((h) => h.severity === f.severity);
      if (f.active !== undefined) rows = rows.filter((h) => h.isActive === f.active);
      return rows.sort((a, b) => b.detectionCount - a.detectionCount);
    },
  );
}

export function getHotspot(id: string): Promise<HotspotDto | null> {
  return pick(
    async () => {
      const h = await prisma.hotspot.findUnique({
        where: { id },
        include: { region: { select: { code: true, displayName: true } } },
      });
      if (!h) return null;
      return {
        id: h.id,
        label: h.label,
        centroidLat: h.centroidLat,
        centroidLon: h.centroidLon,
        detectionCount: h.detectionCount,
        severity: h.severity,
        confidence: h.confidence,
        etaHours: h.etaHours,
        regionCode: h.region?.code ?? null,
        regionName: h.region?.displayName ?? null,
        isActive: h.isActive,
        firstDetected: h.firstDetected.toISOString(),
        lastDetected: h.lastDetected.toISOString(),
        trajectory: null,
      };
    },
    () => mock.hotspots.find((h) => h.id === id) ?? null,
  );
}

// ── Regions ──────────────────────────────────────────────────────────────────
export function listRegions(): Promise<RegionDto[]> {
  return pick(
    async () => {
      const rows = await prisma.region.findMany({
        where: { isActive: true },
        include: { _count: { select: { detections: true, hotspots: true } } },
        orderBy: { code: 'asc' },
      });
      return rows.map(
        (r): RegionDto => ({
          id: r.id,
          code: r.code,
          name: r.name,
          displayName: r.displayName,
          centerLat: r.centerLat,
          centerLon: r.centerLon,
          zoomLevel: r.zoomLevel,
          boundingBox: r.boundingBox as unknown as RegionDto['boundingBox'],
          detectionCount: r._count.detections,
          hotspotCount: r._count.hotspots,
        }),
      );
    },
    () => mock.regions,
  );
}

export function getRegion(code: string): Promise<RegionDto | null> {
  return pick(
    async () => {
      const r = await prisma.region.findUnique({
        where: { code },
        include: { _count: { select: { detections: true, hotspots: true } } },
      });
      if (!r) return null;
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        displayName: r.displayName,
        centerLat: r.centerLat,
        centerLon: r.centerLon,
        zoomLevel: r.zoomLevel,
        boundingBox: r.boundingBox as unknown as RegionDto['boundingBox'],
        detectionCount: r._count.detections,
        hotspotCount: r._count.hotspots,
      };
    },
    () => mock.regions.find((r) => r.code === code) ?? null,
  );
}

// ── Alerts ───────────────────────────────────────────────────────────────────
export function listAlerts(f: AlertFilters): Promise<AlertDto[]> {
  return pick(
    async () => {
      const rows = await prisma.alert.findMany({
        where: {
          ...(f.acked !== undefined ? { isAcked: f.acked } : {}),
          ...(f.severity ? { severity: f.severity as never } : {}),
          ...(f.type ? { type: f.type as never } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(
        (a): AlertDto => ({
          id: a.id,
          type: a.type,
          severity: a.severity,
          title: a.title,
          message: a.message,
          isAcked: a.isAcked,
          ackedAt: iso(a.ackedAt),
          createdAt: a.createdAt.toISOString(),
          detectionId: a.detectionId,
        }),
      );
    },
    () => {
      let rows = [...mock.alerts];
      if (f.acked !== undefined) rows = rows.filter((a) => a.isAcked === f.acked);
      if (f.severity) rows = rows.filter((a) => a.severity === f.severity);
      if (f.type) rows = rows.filter((a) => a.type === f.type);
      return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  );
}

export function ackAlert(id: string): Promise<AlertDto | null> {
  return pick(
    async () => {
      const a = await prisma.alert.update({
        where: { id },
        data: { isAcked: true, ackedAt: new Date() },
      });
      return {
        id: a.id,
        type: a.type,
        severity: a.severity,
        title: a.title,
        message: a.message,
        isAcked: a.isAcked,
        ackedAt: iso(a.ackedAt),
        createdAt: a.createdAt.toISOString(),
        detectionId: a.detectionId,
      };
    },
    () => {
      const a = mock.alerts.find((x) => x.id === id);
      if (!a) return null;
      a.isAcked = true;
      a.ackedAt = new Date().toISOString();
      return a;
    },
  );
}

// ── Satellite scenes (demo passthrough) ──────────────────────────────────────
export function listScenes(): Promise<SatelliteScene[]> {
  return pick(
    async () => {
      const rows = await prisma.satelliteImage.findMany({
        orderBy: { acquisitionDate: 'desc' },
        take: 10,
        include: { region: { select: { code: true } } },
      });
      return rows.map(
        (s): SatelliteScene => ({
          sceneId: s.sceneId,
          platform: s.platform,
          tile: s.tile,
          acquisitionDate: s.acquisitionDate.toISOString(),
          cloudCoverPct: s.cloudCoverPct,
          regionCode: s.region?.code ?? null,
          isProcessed: s.isProcessed,
        }),
      );
    },
    () => mock.scenes,
  );
}
