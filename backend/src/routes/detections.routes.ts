import { Router } from 'express';
import { ApiError, asyncHandler } from '../middleware/errorHandler';
import { authenticate, requireMinLevel } from '../middleware/auth';
import { ROLE_LEVEL } from '../types/auth';
import { clampInt, num, str, upper } from '../utils/query';
import * as repo from '../data/repo';

const router = Router();

// Coast Guard and Admin (analysts) may validate detections.
const canValidate = [authenticate, requireMinLevel(ROLE_LEVEL.COASTGUARD)];

const CSV_COLS = [
  'id', 'lat', 'lon', 'classification', 'confidence', 'fdiScore', 'areaSqKm',
  'label', 'regionCode', 'validatedAt',
] as const;

function toCsv(rows: repo.TrainingLabel[]): string {
  const head = CSV_COLS.join(',');
  const body = rows.map((r) => CSV_COLS.map((c) => {
    const v = (r as unknown as Record<string, unknown>)[c];
    return v === null || v === undefined ? '' : String(v);
  }).join(','));
  return [head, ...body].join('\n');
}

// GET /api/detections?region=MUM&status=CONFIRMED&classification=Plastic
//                     &minConfidence=0.8&days=7&limit=50&offset=0
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const limit = clampInt(req.query.limit, 50, 1, 500);
    const offset = clampInt(req.query.offset, 0, 0, 100_000);
    const days = req.query.days !== undefined ? clampInt(req.query.days, 30, 1, 365) : undefined;
    const { data, total } = await repo.listDetections({
      region: upper(req.query.region),
      status: upper(req.query.status),
      classification: str(req.query.classification),
      minConfidence: num(req.query.minConfidence),
      days,
      limit,
      offset,
    });
    res.json({ data, meta: { total, limit, offset, days } });
  }),
);

// GET /api/detections/labels/export?format=json|csv — active-learning label set
// (declared before /:id so "labels" isn't captured as an id).
router.get(
  '/labels/export',
  asyncHandler(async (req, res) => {
    const rows = await repo.exportTrainingLabels();
    if (str(req.query.format) === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="training_labels.csv"');
      res.send(toCsv(rows));
      return;
    }
    const confirmed = rows.filter((r) => r.label === 'CONFIRMED').length;
    res.json({
      data: rows,
      meta: { total: rows.length, confirmed, falseAlarm: rows.length - confirmed },
    });
  }),
);

// GET /api/detections/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const detection = await repo.getDetection(req.params.id);
    if (!detection) throw ApiError.notFound('Detection not found');
    res.json({ data: detection });
  }),
);

// POST /api/detections/:id/label { status } — human validation (auth, Coast Guard+)
router.post(
  '/:id/label',
  ...canValidate,
  asyncHandler(async (req, res) => {
    const status = upper(req.body?.status);
    if (!status || !repo.isLabelStatus(status)) {
      throw ApiError.badRequest('status must be one of PENDING, CONFIRMED, FALSE_ALARM');
    }
    const detection = await repo.labelDetection(req.params.id, status, req.user?.sub ?? null);
    if (!detection) throw ApiError.notFound('Detection not found');
    res.json({ data: detection });
  }),
);

export default router;
