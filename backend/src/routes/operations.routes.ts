/**
 * Field-operations routes — turn a detection/hotspot into an actionable task and
 * track it to a filed mission report.
 *
 *   GET   /api/operations                 list (filter ?status= ?region= ?limit=)
 *   GET   /api/operations/stats           board summary counts
 *   GET   /api/operations/:id             one op with its event timeline + report
 *   POST  /api/operations                 create            (auth, level ≥ FIELD)
 *   PATCH /api/operations/:id/status      transition status (auth, level ≥ FIELD)
 *   POST  /api/operations/:id/report      file mission report (auth, level ≥ FIELD)
 *
 * Reads are public so the board renders in the demo without a login; writes are
 * privileged (field crews / coast guard / ministry / admin).
 */
import { Router } from 'express';
import { ApiError, asyncHandler } from '../middleware/errorHandler';
import { authenticate, requireMinLevel } from '../middleware/auth';
import { ROLE_LEVEL } from '../types/auth';
import { clampInt, num, str, upper } from '../utils/query';
import * as ops from '../data/operations.repo';
import type {
  CreateOperationInput,
  FileReportInput,
  OperationOutcome,
  OperationStatus,
  Severity,
} from '../types/domain';

const router = Router();

const STATUSES: OperationStatus[] = ['PLANNED', 'DISPATCHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const OUTCOMES: OperationOutcome[] = ['CLEARED', 'PARTIAL', 'NOT_FOUND', 'STOOD_DOWN'];
const SEVERITIES: Severity[] = ['HIGH', 'MEDIUM', 'LOW'];

// Field crews and above may manage operations.
const canManage = [authenticate, requireMinLevel(ROLE_LEVEL.FIELD)];

// GET /api/operations
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const data = await ops.listOperations({
      status: upper(req.query.status),
      region: upper(req.query.region),
      limit: clampInt(req.query.limit, 100, 1, 200),
    });
    res.json({ data, meta: { count: data.length } });
  }),
);

// GET /api/operations/stats  (declared before :id so "stats" isn't read as an id)
router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    res.json({ data: await ops.getOperationStats() });
  }),
);

// GET /api/operations/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const op = await ops.getOperation(req.params.id);
    if (!op) throw ApiError.notFound('Operation not found');
    res.json({ data: op });
  }),
);

// POST /api/operations
router.post(
  '/',
  ...canManage,
  asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const title = str(b.title);
    if (!title) throw ApiError.badRequest('title is required');

    const priority = upper(b.priority);
    if (priority && !SEVERITIES.includes(priority as Severity)) {
      throw ApiError.badRequest(`priority must be one of ${SEVERITIES.join(', ')}`);
    }

    const input: CreateOperationInput = {
      title,
      priority: (priority as Severity) ?? undefined,
      hotspotId: str(b.hotspotId) ?? null,
      detectionId: str(b.detectionId) ?? null,
      regionCode: upper(b.regionCode) ?? null,
      targetLat: num(b.targetLat) ?? null,
      targetLon: num(b.targetLon) ?? null,
      assignedTeam: str(b.assignedTeam) ?? null,
      assignedToId: str(b.assignedToId) ?? null,
      notes: str(b.notes) ?? null,
    };
    const op = await ops.createOperation(input, req.user?.sub ?? null);
    res.status(201).json({ data: op });
  }),
);

// PATCH /api/operations/:id/status
router.patch(
  '/:id/status',
  ...canManage,
  asyncHandler(async (req, res) => {
    const status = upper(req.body?.status) as OperationStatus | undefined;
    if (!status || !STATUSES.includes(status)) {
      throw ApiError.badRequest(`status must be one of ${STATUSES.join(', ')}`);
    }
    const op = await ops.updateStatus(req.params.id, status, str(req.body?.note) ?? null, req.user?.sub ?? null);
    if (!op) throw ApiError.notFound('Operation not found');
    res.json({ data: op });
  }),
);

// POST /api/operations/:id/report
router.post(
  '/:id/report',
  ...canManage,
  asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const summary = str(b.summary);
    if (!summary) throw ApiError.badRequest('summary is required');
    const outcome = upper(b.outcome) as OperationOutcome | undefined;
    if (!outcome || !OUTCOMES.includes(outcome)) {
      throw ApiError.badRequest(`outcome must be one of ${OUTCOMES.join(', ')}`);
    }
    const input: FileReportInput = {
      summary,
      outcome,
      plasticCollectedKg: num(b.plasticCollectedKg) ?? null,
      areaClearedSqKm: num(b.areaClearedSqKm) ?? null,
      teamSize: num(b.teamSize) ?? null,
      photosCount: num(b.photosCount) ?? 0,
    };
    const op = await ops.fileReport(req.params.id, input, req.user?.sub ?? null);
    if (!op) throw ApiError.notFound('Operation not found');
    res.json({ data: op });
  }),
);

export default router;
