/**
 * Report export routes — downloadable deliverables built from live/demo data.
 *
 *   GET /api/export/detections.csv     detections spreadsheet (same filters as /detections)
 *   GET /api/export/hotspots.pdf       hotspot situation report (?region=)
 *   GET /api/export/operations/:id.pdf per-operation mission dossier
 *
 * Public (consistent with the underlying read endpoints) so the demo can produce
 * a report without a login.
 */
import { Router } from 'express';
import PDFDocument from 'pdfkit';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { clampInt, num, str, upper } from '../utils/query';
import * as repo from '../data/repo';
import { getOperation } from '../data/operations.repo';
import { detectionsCsv, writeHotspotReport, writeOperationDossier } from '../services/report.service';

const router = Router();

const stamp = (): string => new Date().toISOString().slice(0, 10);

// GET /api/export/detections.csv
router.get(
  '/detections.csv',
  asyncHandler(async (req, res) => {
    const { data } = await repo.listDetections({
      region: upper(req.query.region),
      status: upper(req.query.status),
      classification: str(req.query.classification),
      minConfidence: num(req.query.minConfidence),
      days: num(req.query.days),
      limit: clampInt(req.query.limit, 5000, 1, 50_000),
      offset: 0,
    });
    const csv = detectionsCsv(data);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="detections-${stamp()}.csv"`);
    res.send(csv);
  }),
);

// GET /api/export/hotspots.pdf
router.get(
  '/hotspots.pdf',
  asyncHandler(async (req, res) => {
    const region = upper(req.query.region);
    const hotspots = await repo.listHotspots({ region, active: true });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="hotspot-report-${region ?? 'all'}-${stamp()}.pdf"`);

    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    doc.pipe(res);
    writeHotspotReport(doc, { hotspots, region: region ?? null, generatedAt: new Date().toISOString() });
    doc.end();
  }),
);

// GET /api/export/operations/:id.pdf
router.get(
  '/operations/:id.pdf',
  asyncHandler(async (req, res) => {
    const op = await getOperation(req.params.id);
    if (!op) throw ApiError.notFound('Operation not found');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="operation-${op.code}.pdf"`);

    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    doc.pipe(res);
    writeOperationDossier(doc, op);
    doc.end();
  }),
);

export default router;
