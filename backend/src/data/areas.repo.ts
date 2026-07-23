/**
 * Saved study-area repository.
 *
 * Same contract as operations.repo: prefer a live Prisma query, fall back to an
 * in-memory store when the DB is unavailable (or DEMO_MODE=true), so saving and
 * forecasting an area still works with no database. Demo writes reset on
 * restart — the honest behaviour for a no-DB run, and the route says so.
 *
 * The demo store starts EMPTY rather than seeded: a saved area is something the
 * analyst chose to keep, so inventing fake ones would misrepresent the record.
 */
import { prisma } from '../lib/prisma';
import { isDemo } from '../lib/dataMode';
import { logger } from '../lib/logger';
import type {
  AreaForecastDto,
  BoundingBox,
  CreateAreaInput,
  SavedAreaDto,
  SaveForecastInput,
  UpdateAreaInput,
} from '../types/domain';

async function pick<T>(live: () => Promise<T>, demo: () => T): Promise<T> {
  if (isDemo()) return demo();
  try {
    return await live();
  } catch (err) {
    logger.warn('Saved-area live query failed — using demo store.', err);
    return demo();
  }
}

/** Approximate AOI area in km², with the cos(latitude) correction that a naive
 *  degrees→km conversion drops (a 1° box near the equator is far larger than one
 *  at high latitude). */
export function bboxAreaSqKm(b: BoundingBox): number {
  const midLat = ((b.north + b.south) / 2) * (Math.PI / 180);
  const widthKm = Math.abs(b.east - b.west) * 111.32 * Math.cos(midLat);
  const heightKm = Math.abs(b.north - b.south) * 110.57;
  return +(widthKm * heightKm).toFixed(3);
}

/** Shape of the bits of a PipelineResult we denormalise onto the row. */
type ResultLike = {
  detections?: { classification?: string }[];
  hotspots?: unknown[];
  stats?: {
    candidatePixels?: number;
    detections?: number;
    plastic?: number;
    hotspots?: number;
    avgConfidence?: number;
    provider?: string;
  };
};

/** Pull headline figures out of a stored scan, tolerating a missing/partial
 *  payload (an area can be saved before it has ever been scanned). */
function summarise(result: unknown): {
  candidatePixels: number;
  detectionCount: number;
  plasticCount: number;
  hotspotCount: number;
  avgConfidence: number;
  provider: string;
} {
  const r = (result ?? {}) as ResultLike;
  const s = r.stats ?? {};
  const dets = Array.isArray(r.detections) ? r.detections : [];
  return {
    candidatePixels: s.candidatePixels ?? 0,
    detectionCount: s.detections ?? dets.length,
    plasticCount: s.plastic ?? dets.filter((d) => d?.classification === 'Plastic').length,
    hotspotCount: s.hotspots ?? (Array.isArray(r.hotspots) ? r.hotspots.length : 0),
    avgConfidence: s.avgConfidence ?? 0,
    provider: s.provider ?? 'synthetic',
  };
}

/** True when the payload carries an actual scan (not `{}` or engine-offline). */
function hasScan(result: unknown): boolean {
  const r = (result ?? {}) as ResultLike & { engineOffline?: boolean };
  if (r.engineOffline) return false;
  return Boolean(r.stats || (Array.isArray(r.detections) && r.detections.length));
}

// ── Prisma row → DTO ──────────────────────────────────────────────────────────
type ForecastRow = {
  id: string;
  areaId: string;
  originLat: number;
  originLon: number;
  horizonHours: number;
  landfallProbability: number;
  etaHours: number | null;
  dataSource: string;
  pathData: unknown;
  computedAt: Date;
};

type AreaRow = {
  id: string;
  name: string;
  notes: string | null;
  regionCode: string | null;
  north: number;
  south: number;
  east: number;
  west: number;
  minConfidence: number;
  dedupe: boolean;
  biofouling: boolean;
  candidatePixels: number;
  detectionCount: number;
  plasticCount: number;
  hotspotCount: number;
  avgConfidence: number;
  areaSqKm: number;
  provider: string;
  result?: unknown;
  lastScanAt: Date | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  forecasts?: ForecastRow[];
  _count?: { forecasts: number };
};

function mapForecast(f: ForecastRow): AreaForecastDto {
  return {
    id: f.id,
    areaId: f.areaId,
    originLat: f.originLat,
    originLon: f.originLon,
    horizonHours: f.horizonHours,
    landfallProbability: f.landfallProbability,
    etaHours: f.etaHours,
    dataSource: f.dataSource,
    pathData: f.pathData,
    computedAt: f.computedAt.toISOString(),
  };
}

/** `withResult` is opt-in: the PipelineResult JSON is large, so the list route
 *  omits it and only the detail route pays for it. */
function mapArea(a: AreaRow, withResult = false): SavedAreaDto {
  return {
    id: a.id,
    name: a.name,
    notes: a.notes,
    regionCode: a.regionCode,
    bbox: { north: a.north, south: a.south, east: a.east, west: a.west },
    runOpts: { minConfidence: a.minConfidence, dedupe: a.dedupe, biofouling: a.biofouling },
    stats: {
      candidatePixels: a.candidatePixels,
      detections: a.detectionCount,
      plastic: a.plasticCount,
      hotspots: a.hotspotCount,
      avgConfidence: a.avgConfidence,
      areaSqKm: a.areaSqKm,
      provider: a.provider,
    },
    lastScanAt: a.lastScanAt ? a.lastScanAt.toISOString() : null,
    createdById: a.createdById,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    ...(withResult ? { result: a.result ?? null } : {}),
    ...(a.forecasts ? { forecasts: a.forecasts.map(mapForecast) } : {}),
    ...(a._count ? { forecastCount: a._count.forecasts } : {}),
  };
}

// ── Demo store (no DB) ────────────────────────────────────────────────────────
interface DemoArea extends SavedAreaDto {
  result: unknown;
  forecasts: AreaForecastDto[];
}
const demoAreas: DemoArea[] = [];
let demoSeq = 0;

const stripDetail = (a: DemoArea): SavedAreaDto => {
  const { result, forecasts, ...rest } = a;
  void result;
  return { ...rest, forecastCount: forecasts.length };
};

// ── Public API ────────────────────────────────────────────────────────────────

export interface AreaFilters {
  region?: string;
  limit?: number;
}

export function listAreas(f: AreaFilters): Promise<SavedAreaDto[]> {
  return pick(
    async () => {
      const rows = await prisma.savedArea.findMany({
        where: { ...(f.region ? { regionCode: f.region } : {}) },
        select: {
          id: true, name: true, notes: true, regionCode: true,
          north: true, south: true, east: true, west: true,
          minConfidence: true, dedupe: true, biofouling: true,
          candidatePixels: true, detectionCount: true, plasticCount: true,
          hotspotCount: true, avgConfidence: true, areaSqKm: true, provider: true,
          lastScanAt: true, createdById: true, createdAt: true, updatedAt: true,
          _count: { select: { forecasts: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: f.limit && f.limit > 0 ? Math.min(f.limit, 200) : 100,
      });
      return rows.map((r) => mapArea(r as AreaRow));
    },
    () => {
      let rows = demoAreas.map(stripDetail);
      if (f.region) rows = rows.filter((a) => a.regionCode === f.region);
      return typeof f.limit === 'number' ? rows.slice(0, f.limit) : rows;
    },
  );
}

export function getArea(id: string): Promise<SavedAreaDto | null> {
  return pick(
    async () => {
      const a = await prisma.savedArea.findUnique({
        where: { id },
        include: { forecasts: { orderBy: { computedAt: 'desc' }, take: 20 } },
      });
      return a ? mapArea(a as AreaRow, true) : null;
    },
    () => demoAreas.find((a) => a.id === id) ?? null,
  );
}

export function createArea(input: CreateAreaInput, userId: string | null): Promise<SavedAreaDto> {
  const sum = summarise(input.result);
  const areaSqKm = bboxAreaSqKm(input.bbox);
  const scanned = hasScan(input.result);
  const opts = {
    minConfidence: input.runOpts?.minConfidence ?? 0,
    dedupe: input.runOpts?.dedupe ?? false,
    biofouling: input.runOpts?.biofouling ?? false,
  };

  return pick(
    async () => {
      const a = await prisma.savedArea.create({
        data: {
          name: input.name,
          notes: input.notes ?? null,
          regionCode: input.regionCode ?? null,
          north: input.bbox.north,
          south: input.bbox.south,
          east: input.bbox.east,
          west: input.bbox.west,
          ...opts,
          ...sum,
          areaSqKm,
          result: (input.result ?? {}) as never,
          lastScanAt: scanned ? new Date() : null,
          createdById: userId,
        },
        include: { forecasts: true },
      });
      return mapArea(a as AreaRow, true);
    },
    () => {
      demoSeq += 1;
      const now = new Date().toISOString();
      const area: DemoArea = {
        id: `demo-area-${demoSeq}`,
        name: input.name,
        notes: input.notes ?? null,
        regionCode: input.regionCode ?? null,
        bbox: input.bbox,
        runOpts: opts,
        stats: {
          candidatePixels: sum.candidatePixels,
          detections: sum.detectionCount,
          plastic: sum.plasticCount,
          hotspots: sum.hotspotCount,
          avgConfidence: sum.avgConfidence,
          areaSqKm,
          provider: sum.provider,
        },
        lastScanAt: scanned ? now : null,
        createdById: userId,
        createdAt: now,
        updatedAt: now,
        result: input.result ?? null,
        forecasts: [],
      };
      demoAreas.unshift(area);
      return area;
    },
  );
}

export function updateArea(id: string, input: UpdateAreaInput): Promise<SavedAreaDto | null> {
  // A re-scan replaces the stored payload, so the denormalised figures and the
  // lastScanAt stamp must move with it or the list would show stale counts.
  const rescan = input.result !== undefined;
  const sum = rescan ? summarise(input.result) : null;
  const scanned = rescan && hasScan(input.result);

  return pick(
    async () => {
      const exists = await prisma.savedArea.findUnique({ where: { id }, select: { id: true } });
      if (!exists) return null;
      const a = await prisma.savedArea.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(rescan
            ? { result: (input.result ?? {}) as never, ...sum, ...(scanned ? { lastScanAt: new Date() } : {}) }
            : {}),
        },
        include: { forecasts: { orderBy: { computedAt: 'desc' }, take: 20 } },
      });
      return mapArea(a as AreaRow, true);
    },
    () => {
      const a = demoAreas.find((x) => x.id === id);
      if (!a) return null;
      if (input.name !== undefined) a.name = input.name;
      if (input.notes !== undefined) a.notes = input.notes;
      if (rescan && sum) {
        a.result = input.result ?? null;
        a.stats = { ...a.stats, ...{
          candidatePixels: sum.candidatePixels,
          detections: sum.detectionCount,
          plastic: sum.plasticCount,
          hotspots: sum.hotspotCount,
          avgConfidence: sum.avgConfidence,
          provider: sum.provider,
        } };
        if (scanned) a.lastScanAt = new Date().toISOString();
      }
      a.updatedAt = new Date().toISOString();
      return a;
    },
  );
}

export function deleteArea(id: string): Promise<boolean> {
  return pick(
    async () => {
      try {
        await prisma.savedArea.delete({ where: { id } }); // cascades to forecasts
        return true;
      } catch {
        return false; // not found
      }
    },
    () => {
      const i = demoAreas.findIndex((a) => a.id === id);
      if (i === -1) return false;
      demoAreas.splice(i, 1);
      return true;
    },
  );
}

/** Persist a 72h forecast against an area. Appends to history — never replaces
 *  the previous one, so successive runs stay comparable. */
export function addForecast(areaId: string, input: SaveForecastInput): Promise<AreaForecastDto | null> {
  return pick(
    async () => {
      const exists = await prisma.savedArea.findUnique({ where: { id: areaId }, select: { id: true } });
      if (!exists) return null;
      const f = await prisma.areaForecast.create({
        data: {
          areaId,
          originLat: input.originLat,
          originLon: input.originLon,
          horizonHours: input.horizonHours,
          landfallProbability: input.landfallProbability,
          etaHours: input.etaHours,
          dataSource: input.dataSource,
          pathData: (input.pathData ?? {}) as never,
        },
      });
      return mapForecast(f as ForecastRow);
    },
    () => {
      const a = demoAreas.find((x) => x.id === areaId);
      if (!a) return null;
      const f: AreaForecastDto = {
        id: `demo-fc-${a.id}-${a.forecasts.length + 1}`,
        areaId,
        originLat: input.originLat,
        originLon: input.originLon,
        horizonHours: input.horizonHours,
        landfallProbability: input.landfallProbability,
        etaHours: input.etaHours,
        dataSource: input.dataSource,
        pathData: input.pathData ?? {},
        computedAt: new Date().toISOString(),
      };
      a.forecasts.unshift(f);
      return f;
    },
  );
}
