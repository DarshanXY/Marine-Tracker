/**
 * Report generation — CSV + PDF, built from live/demo DB data.
 *
 * Free, dependency-light deliverables a Coast Guard / NCCR officer can actually
 * file: a detections spreadsheet, a hotspot situation report, and a per-operation
 * mission dossier. PDFs use `pdfkit` (already a backend dependency); CSV is
 * hand-built (no extra dep) with correct RFC-4180 escaping.
 *
 * The route owns the HTTP stream: it creates the PDFDocument, sets headers, pipes
 * to the response, calls a writer here, then ends the doc.
 */
import type { DetectionDto, HotspotDto, OperationDto } from '../types/domain';

// Advisory disclaimer printed on every report — keeps the pilot honest.
const DISCLAIMER =
  'Advisory product. Sentinel-2 Floating Debris Index screening is a decision aid that ' +
  'COMPLEMENTS — it does not replace — in-situ verification and patrols. Detections are ' +
  'candidate signals, not confirmed plastic.';

// ── CSV ───────────────────────────────────────────────────────────────────────
function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const lines = [headers.map(csvCell).join(',')];
  for (const r of rows) lines.push(r.map(csvCell).join(','));
  // CRLF + trailing newline (RFC 4180) — opens cleanly in Excel.
  return lines.join('\r\n') + '\r\n';
}

export function detectionsCsv(rows: DetectionDto[]): string {
  return toCsv(
    ['id', 'lat', 'lon', 'classification', 'confidence', 'fdiScore', 'areaSqKm', 'pixelCount', 'status', 'regionCode', 'regionName', 'createdAt'],
    rows.map((d) => [
      d.id, d.lat, d.lon, d.classification, d.confidence, d.fdiScore,
      d.areaSqKm, d.pixelCount, d.status, d.regionCode, d.regionName, d.createdAt,
    ]),
  );
}

// ── PDF helpers ───────────────────────────────────────────────────────────────
const MARGIN = 50;
const CONTENT_W = 595.28 - MARGIN * 2; // A4 width in pt − margins ≈ 495

// Global type from @types/pdfkit (no import needed).
type Doc = PDFKit.PDFDocument;

function heading(doc: Doc, title: string, subtitle?: string): void {
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(18).text(title, MARGIN, MARGIN);
  if (subtitle) doc.font('Helvetica').fontSize(10).fillColor('#475569').text(subtitle);
  doc.moveTo(MARGIN, doc.y + 4).lineTo(MARGIN + CONTENT_W, doc.y + 4).strokeColor('#cbd5e1').stroke();
  doc.moveDown(1).fillColor('#0f172a');
}

/** Write one table row at the current y; returns the y after the row. */
function tableRow(doc: Doc, cols: { text: string; w: number }[], opts: { header?: boolean } = {}): void {
  const y = doc.y;
  // Page-break guard.
  if (y > 780) {
    doc.addPage();
  }
  const yy = doc.y;
  let x = MARGIN;
  doc.font(opts.header ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.header ? 9 : 9)
    .fillColor(opts.header ? '#334155' : '#0f172a');
  let maxH = 0;
  for (const c of cols) {
    const h = doc.heightOfString(c.text, { width: c.w - 6 });
    if (h > maxH) maxH = h;
  }
  for (const c of cols) {
    doc.text(c.text, x, yy, { width: c.w - 6, ellipsis: true });
    x += c.w;
  }
  doc.y = yy + Math.max(maxH, 12) + 4;
  doc.moveTo(MARGIN, doc.y - 2).lineTo(MARGIN + CONTENT_W, doc.y - 2).strokeColor('#eef2f7').stroke();
}

function footer(doc: Doc): void {
  doc.moveDown(1.5);
  doc.font('Helvetica-Oblique').fontSize(8).fillColor('#64748b')
    .text(DISCLAIMER, MARGIN, doc.y, { width: CONTENT_W });
  doc.font('Helvetica').fontSize(7).fillColor('#94a3b8')
    .text('Marine Plastic Tracker · Sentinel-2 L2A · generated automatically', MARGIN, doc.y + 4, { width: CONTENT_W });
}

const fmt = (n: number | null | undefined, digits = 2): string =>
  n === null || n === undefined ? '—' : n.toFixed(digits);
const when = (s: string | null): string => (s ? new Date(s).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—');

// ── Hotspot situation report ──────────────────────────────────────────────────
export function writeHotspotReport(
  doc: Doc,
  data: { hotspots: HotspotDto[]; region: string | null; generatedAt: string },
): void {
  const { hotspots, region, generatedAt } = data;
  heading(
    doc,
    'Hotspot Situation Report',
    `${region ? `Region: ${region}` : 'All monitored regions'}  ·  ${hotspots.length} hotspot(s)  ·  ${when(generatedAt)}`,
  );

  const high = hotspots.filter((h) => h.severity === 'HIGH').length;
  const med = hotspots.filter((h) => h.severity === 'MEDIUM').length;
  const low = hotspots.filter((h) => h.severity === 'LOW').length;
  doc.font('Helvetica').fontSize(10).fillColor('#0f172a')
    .text(`Severity breakdown:  HIGH ${high}   ·   MEDIUM ${med}   ·   LOW ${low}`, { width: CONTENT_W });
  doc.moveDown(0.8);

  const cols = (h: HotspotDto | null) => [
    { text: h ? h.label : 'Label', w: 70 },
    { text: h ? (h.regionCode ?? '—') : 'Region', w: 60 },
    { text: h ? h.severity : 'Severity', w: 60 },
    { text: h ? String(h.detectionCount) : 'Det.', w: 40 },
    { text: h ? `${(h.confidence * 100).toFixed(0)}%` : 'Conf.', w: 45 },
    { text: h ? `${h.centroidLat.toFixed(3)}, ${h.centroidLon.toFixed(3)}` : 'Centroid', w: 120 },
    { text: h ? (h.etaHours != null ? `${h.etaHours.toFixed(0)} h` : 'open sea') : 'Coast ETA', w: 70 },
  ];
  tableRow(doc, cols(null), { header: true });
  if (hotspots.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor('#64748b').text('No hotspots match the current filter.', MARGIN, doc.y + 2);
  } else {
    for (const h of hotspots) tableRow(doc, cols(h));
  }
  footer(doc);
}

// ── Operation / mission dossier ───────────────────────────────────────────────
export function writeOperationDossier(doc: Doc, op: OperationDto): void {
  heading(doc, `Field Operation — ${op.code}`, op.title);

  const field = (label: string, value: string) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#475569').text(label, MARGIN, doc.y, { continued: true, width: 140 });
    doc.font('Helvetica').fontSize(9).fillColor('#0f172a').text(`  ${value}`);
  };
  field('Status', op.status);
  field('Priority', op.priority);
  field('Region', op.regionCode ?? '—');
  field('Target', op.targetLat != null && op.targetLon != null ? `${op.targetLat.toFixed(4)}, ${op.targetLon.toFixed(4)}` : '—');
  field('Assigned team', op.assignedTeam ?? '—');
  field('Planned', when(op.plannedAt));
  field('Dispatched', when(op.dispatchedAt));
  field('Completed', when(op.completedAt));
  if (op.notes) field('Notes', op.notes);

  // Event timeline
  doc.moveDown(0.8).font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text('Timeline');
  doc.moveDown(0.3);
  if (op.events && op.events.length) {
    for (const e of op.events) {
      doc.font('Helvetica').fontSize(9).fillColor('#334155')
        .text(`${when(e.at)}  ·  ${e.status ?? 'note'}${e.note ? ` — ${e.note}` : ''}`, { width: CONTENT_W });
    }
  } else {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor('#64748b').text('No timeline events recorded.');
  }

  // Mission report
  doc.moveDown(0.8).font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text('Mission report');
  doc.moveDown(0.3);
  if (op.report) {
    const r = op.report;
    doc.font('Helvetica').fontSize(9).fillColor('#0f172a').text(r.summary, { width: CONTENT_W });
    doc.moveDown(0.4);
    field('Outcome', r.outcome);
    field('Plastic collected', r.plasticCollectedKg != null ? `${fmt(r.plasticCollectedKg, 1)} kg` : '—');
    field('Area cleared', r.areaClearedSqKm != null ? `${fmt(r.areaClearedSqKm)} km²` : '—');
    field('Team size', r.teamSize != null ? String(r.teamSize) : '—');
    field('Photos', String(r.photosCount));
    field('Filed', when(r.filedAt));
  } else {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor('#64748b').text('No mission report filed yet.');
  }
  footer(doc);
}
