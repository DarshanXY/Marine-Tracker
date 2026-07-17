import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { FileDown, FileText, Printer, Table2, Flame, Database, Globe2, FileType2 } from 'lucide-react';
import { PageHeader, Card, Button, Badge, SeverityPill } from '@/components';
import { useDetections, useHotspots, useOverview, useByRegion } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { formatCoords } from '@/lib/utils';

function csvEscape(v: string | number | null): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  return [headers.map(csvEscape).join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n');
}

function download(filename: string, content: string, type = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Reports({ embedded = false }: { embedded?: boolean }) {
  const overview = useOverview();
  const detections = useDetections({ limit: 500 });
  const hotspots = useHotspots({ active: true });
  const byRegion = useByRegion();

  const stamp = new Date().toISOString().slice(0, 10);
  const o = overview.data;

  const exportDetections = () => {
    const rows = (detections.data?.data ?? []).map((d) => [
      d.id, d.regionCode ?? '', d.classification, d.confidence, d.fdiScore, d.areaSqKm, d.status, d.lat, d.lon, d.createdAt,
    ]);
    download(
      `detections_${stamp}.csv`,
      toCsv(['id', 'region', 'class', 'confidence', 'fdi', 'area_km2', 'status', 'lat', 'lon', 'detected_at'], rows),
    );
  };

  const exportHotspots = () => {
    const rows = (hotspots.data ?? []).map((h) => [
      h.label, h.regionCode ?? '', h.severity, h.detectionCount, h.confidence, h.etaHours ?? 'open sea', h.centroidLat, h.centroidLon,
    ]);
    download(
      `hotspots_${stamp}.csv`,
      toCsv(['label', 'region', 'severity', 'detections', 'confidence', 'eta_hours', 'lat', 'lon'], rows),
    );
  };

  const exportSnapshot = () => {
    download(
      `snapshot_${stamp}.json`,
      JSON.stringify({ generatedAt: new Date().toISOString(), overview: o, detections: detections.data?.data, hotspots: hotspots.data, byRegion: byRegion.data }, null, 2),
      'application/json',
    );
  };

  // GIS-ready FeatureCollection (QGIS / ArcGIS / geojson.io) — detections as
  // points, hotspots as points with severity properties.
  const exportGeojson = () => {
    const features = [
      ...(detections.data?.data ?? []).map((d) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [d.lon, d.lat] },
        properties: {
          kind: 'detection', id: d.id, region: d.regionCode ?? null, class: d.classification,
          confidence: d.confidence, fdi: d.fdiScore, area_km2: d.areaSqKm, status: d.status, detected_at: d.createdAt,
        },
      })),
      ...(hotspots.data ?? []).map((h) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [h.centroidLon, h.centroidLat] },
        properties: {
          kind: 'hotspot', label: h.label, region: h.regionCode ?? null, severity: h.severity,
          detections: h.detectionCount, confidence: h.confidence, eta_hours: h.etaHours,
        },
      })),
    ];
    download(
      `marine_plastic_${stamp}.geojson`,
      JSON.stringify({ type: 'FeatureCollection', features }, null, 2),
      'application/geo+json',
    );
  };

  // Server-generated PDF situation report (real PDF via pdfkit, not browser print).
  const exportHotspotPdf = () => {
    void toast.promise(api.exportHotspotsPdf(), {
      loading: 'Building situation report…',
      success: 'Situation report (PDF) downloaded.',
      error: 'Export failed — the backend is needed for the server PDF.',
    });
  };

  return (
    <div className="space-y-6">
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-500">
            Export exactly what you just analysed — data downloads or a printable situation report.
          </p>
          <Button variant="primary" size="sm" icon={<Printer size={15} />} onClick={() => window.print()}>
            Print / Save as PDF
          </Button>
        </div>
      ) : (
        <PageHeader
          title="Reports & Export"
          subtitle="Download detection and hotspot data, or produce a printable situation report."
          actions={
            <Button variant="primary" size="sm" icon={<Printer size={15} />} onClick={() => window.print()}>
              Print / Save as PDF
            </Button>
          }
        />
      )}

      {/* Export actions */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ExportCard icon={<Table2 size={18} />} title="Detections (CSV)" desc={`${detections.data?.total ?? 0} rows — full detection table with FDI, confidence, status.`} onClick={exportDetections} />
        <ExportCard icon={<Flame size={18} />} title="Hotspots (CSV)" desc={`${hotspots.data?.length ?? 0} clusters — severity, ETA, centroid.`} onClick={exportHotspots} />
        <ExportCard icon={<Globe2 size={18} />} title="GeoJSON (GIS)" desc="Detections + hotspots as a FeatureCollection — opens in QGIS / ArcGIS / geojson.io." onClick={exportGeojson} />
        <ExportCard icon={<Database size={18} />} title="Full snapshot (JSON)" desc="Everything in one file — stats, detections, hotspots, regions." onClick={exportSnapshot} />
        <ExportCard icon={<FileType2 size={18} />} title="Situation report (PDF)" desc="Server-built hotspot situation report — a proper, briefing-ready PDF (not a browser print)." onClick={exportHotspotPdf} />
      </div>

      {/* Printable situation report */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Card accent className="space-y-5">
          <div className="flex items-center justify-between border-b border-border/60 pb-4">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-800">Situation Report</h2>
              <p className="text-xs text-slate-400">Marine Plastic Tracker · generated {new Date().toLocaleString('en-IN')}</p>
            </div>
            <Badge variant="ocean" dot>{o?.model.version ?? 'demo'}</Badge>
          </div>

          {/* Summary grid */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Metric label="Total detections" value={o?.totalDetections ?? 0} />
            <Metric label="Confirmed plastic" value={o?.plasticDetections ?? 0} />
            <Metric label="Active hotspots" value={o?.activeHotspots ?? 0} />
            <Metric label="High severity" value={o?.highSeverityHotspots ?? 0} />
          </div>

          {/* Region breakdown */}
          <div>
            <h3 className="mb-2 flex items-center gap-2 font-display text-sm font-semibold text-slate-700">
              <FileText size={14} /> Regional breakdown
            </h3>
            <div className="overflow-hidden rounded-xl border border-border/70">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-2">Region</th>
                    <th className="px-4 py-2">Detections</th>
                    <th className="px-4 py-2">Hotspots</th>
                    <th className="px-4 py-2">High severity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {(byRegion.data ?? []).map((r) => (
                    <tr key={r.code}>
                      <td className="px-4 py-2 font-medium text-slate-700">{r.code} — {r.name}</td>
                      <td className="px-4 py-2">{r.detections}</td>
                      <td className="px-4 py-2">{r.hotspots}</td>
                      <td className="px-4 py-2">{r.highSeverity > 0 ? <Badge variant="danger">{r.highSeverity}</Badge> : <span className="text-slate-300">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top hotspots */}
          <div>
            <h3 className="mb-2 flex items-center gap-2 font-display text-sm font-semibold text-slate-700">
              <Flame size={14} /> Priority hotspots
            </h3>
            <div className="space-y-2">
              {(hotspots.data ?? []).slice(0, 6).map((h) => (
                <div key={h.label} className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm">
                  <SeverityPill severity={h.severity} />
                  <span className="font-semibold text-slate-700">{h.label}</span>
                  <span className="font-mono text-xs text-slate-400">{formatCoords(h.centroidLat, h.centroidLon)}</span>
                  <span className="ml-auto text-xs text-slate-500">{h.detectionCount} detections · {h.etaHours != null ? `ETA ${h.etaHours}h` : 'open sea'}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="border-t border-border/60 pt-3 text-xs leading-relaxed text-slate-400">
            Decision-support pilot. Sentinel-2 revisits every ~5 days at 10 m and cannot see through cloud or at night —
            this report complements, and does not replace, patrols and field verification.
          </p>
        </Card>
      </motion.div>
    </div>
  );
}

function ExportCard({ icon, title, desc, onClick }: { icon: React.ReactNode; title: string; desc: string; onClick: () => void }) {
  return (
    <Card hoverable className="flex flex-col gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ocean-50 text-ocean-600">{icon}</span>
      <div>
        <p className="font-display text-sm font-bold text-slate-800">{title}</p>
        <p className="mt-1 text-xs leading-snug text-slate-500">{desc}</p>
      </div>
      <Button variant="outline" size="sm" icon={<FileDown size={15} />} onClick={onClick} className="mt-auto self-start">
        Download
      </Button>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50/70 p-3 text-center">
      <p className="font-display text-2xl font-bold text-ocean-700">{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}
