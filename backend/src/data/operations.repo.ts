/**
 * Field-operations repository.
 *
 * Like data/repo.ts, every function prefers a live Prisma query and falls back
 * to an in-memory demo store when the DB is unavailable (or DEMO_MODE=true), so
 * the operations board — including create / dispatch / file-report — works with
 * no database at all for the pilot demo. Demo writes mutate the module-level
 * arrays (same approach as repo.ackAlert); they reset on restart, which is the
 * honest behaviour for a no-DB demo.
 */
import { prisma } from '../lib/prisma';
import { isDemo } from '../lib/dataMode';
import { logger } from '../lib/logger';
import type {
  CreateOperationInput,
  FileReportInput,
  MissionReportDto,
  OperationDto,
  OperationEventDto,
  OperationOutcome,
  OperationStats,
  OperationStatus,
  Severity,
} from '../types/domain';

async function pick<T>(live: () => Promise<T>, demo: () => T): Promise<T> {
  if (isDemo()) return demo();
  try {
    return await live();
  } catch (err) {
    logger.warn('Operations live query failed — using demo store.', err);
    return demo();
  }
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

const ALL_STATUSES: OperationStatus[] = [
  'PLANNED', 'DISPATCHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED',
];

export interface OperationFilters {
  status?: string;
  region?: string;
  limit?: number;
}

// ── Prisma row → DTO mappers ──────────────────────────────────────────────────
type EventRow = {
  id: string;
  status: string | null;
  note: string | null;
  byId: string | null;
  at: Date;
};
type ReportRow = {
  id: string;
  summary: string;
  outcome: string;
  plasticCollectedKg: number | null;
  areaClearedSqKm: number | null;
  teamSize: number | null;
  photosCount: number;
  filedById: string | null;
  filedAt: Date;
};
type OpRow = {
  id: string;
  code: string;
  title: string;
  status: string;
  priority: string;
  hotspotId: string | null;
  detectionId: string | null;
  regionCode: string | null;
  targetLat: number | null;
  targetLon: number | null;
  assignedTeam: string | null;
  assignedToId: string | null;
  notes: string | null;
  plannedAt: Date | null;
  dispatchedAt: Date | null;
  completedAt: Date | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  events?: EventRow[];
  report?: ReportRow | null;
};

function mapEvent(e: EventRow): OperationEventDto {
  return {
    id: e.id,
    status: (e.status as OperationStatus) ?? null,
    note: e.note,
    by: e.byId,
    at: e.at.toISOString(),
  };
}

function mapReport(r: ReportRow): MissionReportDto {
  return {
    id: r.id,
    summary: r.summary,
    outcome: r.outcome as OperationOutcome,
    plasticCollectedKg: r.plasticCollectedKg,
    areaClearedSqKm: r.areaClearedSqKm,
    teamSize: r.teamSize,
    photosCount: r.photosCount,
    filedBy: r.filedById,
    filedAt: r.filedAt.toISOString(),
  };
}

function mapOp(o: OpRow): OperationDto {
  return {
    id: o.id,
    code: o.code,
    title: o.title,
    status: o.status as OperationStatus,
    priority: o.priority as Severity,
    hotspotId: o.hotspotId,
    detectionId: o.detectionId,
    regionCode: o.regionCode,
    targetLat: o.targetLat,
    targetLon: o.targetLon,
    assignedTeam: o.assignedTeam,
    assignedToId: o.assignedToId,
    notes: o.notes,
    plannedAt: iso(o.plannedAt),
    dispatchedAt: iso(o.dispatchedAt),
    completedAt: iso(o.completedAt),
    createdById: o.createdById,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    ...(o.events ? { events: o.events.map(mapEvent) } : {}),
    ...(o.report !== undefined ? { report: o.report ? mapReport(o.report) : null } : {}),
  };
}

/** Timestamp side-effects of a status transition. */
function stampFor(status: OperationStatus): {
  dispatchedAt?: Date;
  completedAt?: Date;
} {
  const now = new Date();
  if (status === 'DISPATCHED') return { dispatchedAt: now };
  if (status === 'COMPLETED') return { completedAt: now };
  return {};
}

async function nextCode(): Promise<string> {
  const year = new Date().getFullYear();
  const n = await prisma.operation.count({ where: { code: { startsWith: `OP-${year}-` } } });
  return `OP-${year}-${String(n + 1).padStart(4, '0')}`;
}

// ── Demo store (no DB) ────────────────────────────────────────────────────────
let demoSeq = 2;
const demoOps: OperationDto[] = [
  {
    id: 'demo-op-1',
    code: 'OP-2026-0001',
    title: 'Mumbai coast — HIGH-severity debris sweep',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    hotspotId: null,
    detectionId: null,
    regionCode: 'MUM',
    targetLat: 19.02,
    targetLon: 72.81,
    assignedTeam: 'ICG Vessel Samudra + shore crew',
    assignedToId: null,
    notes: 'Dispatched after 14-detection cluster near Worli. Demo record.',
    plannedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    dispatchedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    completedAt: null,
    createdById: null,
    createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 86_400_000).toISOString(),
    events: [
      { id: 'demo-ev-1', status: 'PLANNED', note: 'Operation created from hotspot MUM-H1', by: null, at: new Date(Date.now() - 3 * 86_400_000).toISOString() },
      { id: 'demo-ev-2', status: 'DISPATCHED', note: 'Crew dispatched', by: null, at: new Date(Date.now() - 2 * 86_400_000).toISOString() },
      { id: 'demo-ev-3', status: 'IN_PROGRESS', note: 'On-site, collection underway', by: null, at: new Date(Date.now() - 1 * 86_400_000).toISOString() },
    ],
    report: null,
  },
  {
    id: 'demo-op-2',
    code: 'OP-2026-0002',
    title: 'Goa — patrol verification of MEDIUM cluster',
    status: 'COMPLETED',
    priority: 'MEDIUM',
    hotspotId: null,
    detectionId: null,
    regionCode: 'GOA',
    targetLat: 15.42,
    targetLon: 73.79,
    assignedTeam: 'Coastal cleanup crew',
    assignedToId: null,
    notes: 'Demo record.',
    plannedAt: new Date(Date.now() - 8 * 86_400_000).toISOString(),
    dispatchedAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
    completedAt: new Date(Date.now() - 6 * 86_400_000).toISOString(),
    createdById: null,
    createdAt: new Date(Date.now() - 8 * 86_400_000).toISOString(),
    updatedAt: new Date(Date.now() - 6 * 86_400_000).toISOString(),
    events: [
      { id: 'demo-ev-4', status: 'PLANNED', note: 'Created', by: null, at: new Date(Date.now() - 8 * 86_400_000).toISOString() },
      { id: 'demo-ev-5', status: 'COMPLETED', note: 'Report filed', by: null, at: new Date(Date.now() - 6 * 86_400_000).toISOString() },
    ],
    report: {
      id: 'demo-rep-1',
      summary: 'Confirmed floating debris; recovered mixed plastics along 1.2 km stretch.',
      outcome: 'PARTIAL',
      plasticCollectedKg: 340,
      areaClearedSqKm: 0.6,
      teamSize: 6,
      photosCount: 12,
      filedBy: null,
      filedAt: new Date(Date.now() - 6 * 86_400_000).toISOString(),
    },
  },
];

function demoList(f: OperationFilters): OperationDto[] {
  let rows = demoOps.map((o) => ({ ...o, events: undefined, report: o.report ?? null }));
  if (f.status) rows = rows.filter((o) => o.status === f.status);
  if (f.region) rows = rows.filter((o) => o.regionCode === f.region);
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return typeof f.limit === 'number' ? rows.slice(0, f.limit) : rows;
}

// ── Public API ────────────────────────────────────────────────────────────────
export function listOperations(f: OperationFilters): Promise<OperationDto[]> {
  return pick(
    async () => {
      const rows = await prisma.operation.findMany({
        where: {
          ...(f.status ? { status: f.status as never } : {}),
          ...(f.region ? { regionCode: f.region } : {}),
        },
        include: { report: true },
        orderBy: { createdAt: 'desc' },
        take: f.limit && f.limit > 0 ? Math.min(f.limit, 200) : 100,
      });
      return rows.map(mapOp);
    },
    () => demoList(f),
  );
}

export function getOperation(id: string): Promise<OperationDto | null> {
  return pick(
    async () => {
      const o = await prisma.operation.findUnique({
        where: { id },
        include: { report: true, events: { orderBy: { at: 'asc' } } },
      });
      return o ? mapOp(o) : null;
    },
    () => demoOps.find((o) => o.id === id) ?? null,
  );
}

export function createOperation(
  input: CreateOperationInput,
  userId: string | null,
): Promise<OperationDto> {
  return pick(
    async () => {
      const code = await nextCode();
      const o = await prisma.operation.create({
        data: {
          code,
          title: input.title,
          priority: (input.priority ?? 'MEDIUM') as never,
          status: 'PLANNED',
          hotspotId: input.hotspotId ?? null,
          detectionId: input.detectionId ?? null,
          regionCode: input.regionCode ?? null,
          targetLat: input.targetLat ?? null,
          targetLon: input.targetLon ?? null,
          assignedTeam: input.assignedTeam ?? null,
          assignedToId: input.assignedToId ?? null,
          notes: input.notes ?? null,
          plannedAt: new Date(),
          createdById: userId,
          events: {
            create: {
              status: 'PLANNED',
              note: 'Operation created',
              byId: userId,
            },
          },
        },
        include: { report: true, events: { orderBy: { at: 'asc' } } },
      });
      return mapOp(o);
    },
    () => {
      demoSeq += 1;
      const now = new Date().toISOString();
      const op: OperationDto = {
        id: `demo-op-${demoSeq}`,
        code: `OP-${new Date().getFullYear()}-${String(demoSeq).padStart(4, '0')}`,
        title: input.title,
        status: 'PLANNED',
        priority: input.priority ?? 'MEDIUM',
        hotspotId: input.hotspotId ?? null,
        detectionId: input.detectionId ?? null,
        regionCode: input.regionCode ?? null,
        targetLat: input.targetLat ?? null,
        targetLon: input.targetLon ?? null,
        assignedTeam: input.assignedTeam ?? null,
        assignedToId: input.assignedToId ?? null,
        notes: input.notes ?? null,
        plannedAt: now,
        dispatchedAt: null,
        completedAt: null,
        createdById: userId,
        createdAt: now,
        updatedAt: now,
        events: [{ id: `demo-ev-${demoSeq}-0`, status: 'PLANNED', note: 'Operation created', by: userId, at: now }],
        report: null,
      };
      demoOps.unshift(op);
      return op;
    },
  );
}

export function updateStatus(
  id: string,
  status: OperationStatus,
  note: string | null,
  userId: string | null,
): Promise<OperationDto | null> {
  return pick(
    async () => {
      const exists = await prisma.operation.findUnique({ where: { id }, select: { id: true } });
      if (!exists) return null;
      const o = await prisma.operation.update({
        where: { id },
        data: {
          status: status as never,
          ...stampFor(status),
          events: { create: { status: status as never, note, byId: userId } },
        },
        include: { report: true, events: { orderBy: { at: 'asc' } } },
      });
      return mapOp(o);
    },
    () => {
      const op = demoOps.find((o) => o.id === id);
      if (!op) return null;
      const now = new Date().toISOString();
      op.status = status;
      if (status === 'DISPATCHED') op.dispatchedAt = now;
      if (status === 'COMPLETED') op.completedAt = now;
      op.updatedAt = now;
      op.events = [...(op.events ?? []), { id: `demo-ev-${op.id}-${(op.events?.length ?? 0)}`, status, note, by: userId, at: now }];
      return op;
    },
  );
}

export function fileReport(
  id: string,
  input: FileReportInput,
  userId: string | null,
): Promise<OperationDto | null> {
  return pick(
    async () => {
      const exists = await prisma.operation.findUnique({ where: { id }, select: { id: true } });
      if (!exists) return null;
      await prisma.missionReport.upsert({
        where: { operationId: id },
        create: {
          operationId: id,
          summary: input.summary,
          outcome: input.outcome as never,
          plasticCollectedKg: input.plasticCollectedKg ?? null,
          areaClearedSqKm: input.areaClearedSqKm ?? null,
          teamSize: input.teamSize ?? null,
          photosCount: input.photosCount ?? 0,
          filedById: userId,
        },
        update: {
          summary: input.summary,
          outcome: input.outcome as never,
          plasticCollectedKg: input.plasticCollectedKg ?? null,
          areaClearedSqKm: input.areaClearedSqKm ?? null,
          teamSize: input.teamSize ?? null,
          photosCount: input.photosCount ?? 0,
          filedById: userId,
        },
      });
      // Filing a report completes the operation.
      const o = await prisma.operation.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          events: { create: { status: 'COMPLETED', note: 'Mission report filed', byId: userId } },
        },
        include: { report: true, events: { orderBy: { at: 'asc' } } },
      });
      return mapOp(o);
    },
    () => {
      const op = demoOps.find((o) => o.id === id);
      if (!op) return null;
      const now = new Date().toISOString();
      op.report = {
        id: `demo-rep-${op.id}`,
        summary: input.summary,
        outcome: input.outcome,
        plasticCollectedKg: input.plasticCollectedKg ?? null,
        areaClearedSqKm: input.areaClearedSqKm ?? null,
        teamSize: input.teamSize ?? null,
        photosCount: input.photosCount ?? 0,
        filedBy: userId,
        filedAt: now,
      };
      op.status = 'COMPLETED';
      op.completedAt = now;
      op.updatedAt = now;
      op.events = [...(op.events ?? []), { id: `demo-ev-${op.id}-r`, status: 'COMPLETED', note: 'Mission report filed', by: userId, at: now }];
      return op;
    },
  );
}

export function getOperationStats(): Promise<OperationStats> {
  return pick(
    async () => {
      const [grouped, reports, openHigh] = await Promise.all([
        prisma.operation.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.missionReport.aggregate({ _sum: { plasticCollectedKg: true, areaClearedSqKm: true } }),
        prisma.operation.count({
          where: { priority: 'HIGH', status: { in: ['PLANNED', 'DISPATCHED', 'IN_PROGRESS'] } },
        }),
      ]);
      const byStatus = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as Record<OperationStatus, number>;
      let total = 0;
      for (const g of grouped) {
        byStatus[g.status as OperationStatus] = g._count._all;
        total += g._count._all;
      }
      return {
        total,
        byStatus,
        openHighPriority: openHigh,
        plasticCollectedKg: +(reports._sum.plasticCollectedKg ?? 0).toFixed(1),
        areaClearedSqKm: +(reports._sum.areaClearedSqKm ?? 0).toFixed(2),
      };
    },
    () => {
      const byStatus = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as Record<OperationStatus, number>;
      let plastic = 0;
      let area = 0;
      for (const o of demoOps) {
        byStatus[o.status] += 1;
        if (o.report) {
          plastic += o.report.plasticCollectedKg ?? 0;
          area += o.report.areaClearedSqKm ?? 0;
        }
      }
      return {
        total: demoOps.length,
        byStatus,
        openHighPriority: demoOps.filter((o) => o.priority === 'HIGH' && ['PLANNED', 'DISPATCHED', 'IN_PROGRESS'].includes(o.status)).length,
        plasticCollectedKg: +plastic.toFixed(1),
        areaClearedSqKm: +area.toFixed(2),
      };
    },
  );
}
