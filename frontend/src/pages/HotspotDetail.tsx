/**
 * HotspotDetail — a deep-linkable page for one hotspot (/app/hotspots/:id).
 * Summary, a drift forecast + landfall for the cluster centroid, and jump-offs to
 * field ops and the fingerprint space. Exposes the previously-unused useHotspot hook.
 */
import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Flame, ArrowLeft, Wind, Ship, Sparkles, MapPin, Clock, Crosshair } from 'lucide-react';
import { PageHeader, Card, Badge, SeverityPill } from '@/components';
import { useHotspot, useForecast, useBacktrack } from '@/hooks/useApi';
import { formatCoords, forcingLabel } from '@/lib/utils';

export default function HotspotDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: h, isLoading } = useHotspot(id);
  const forecast = useForecast();
  const backtrack = useBacktrack();

  useEffect(() => {
    if (h) forecast.mutate({ lat: h.centroidLat, lon: h.centroidLon, horizon: 72 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h?.id]);

  if (isLoading) return <div className="py-20 text-center text-sm text-slate-400">Loading hotspot…</div>;
  if (!h) return (
    <div className="py-20 text-center">
      <p className="text-sm text-slate-500">Hotspot not found.</p>
      <Link to="/app/records" className="mt-2 inline-block text-sm text-ocean-600">← Back to records</Link>
    </div>
  );

  const fc = forecast.data;

  return (
    <div className="space-y-6">
      <Link to="/app/records" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-ocean-700">
        <ArrowLeft size={15} /> Hotspots
      </Link>

      <PageHeader
        title={h.label}
        subtitle={`${h.regionName ?? h.regionCode ?? 'Region'} · ${formatCoords(h.centroidLat, h.centroidLon)}`}
        badge={<div className="flex items-center gap-2"><Flame size={16} className="text-ocean-500" /><SeverityPill severity={h.severity} /></div>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Cluster</p>
          <p className="mt-1 font-display text-3xl font-bold text-slate-800">{h.detectionCount}</p>
          <p className="text-xs text-slate-400">detections · avg confidence {Math.round(h.confidence * 100)}%</p>
          <div className="mt-3 flex items-center gap-2">
            <Badge variant={h.isActive ? 'success' : 'neutral'} dot>{h.isActive ? 'active' : 'inactive'}</Badge>
          </div>
        </Card>

        <Card>
          <h3 className="flex items-center gap-2 font-display text-sm font-bold text-slate-700"><Wind size={15} className="text-ocean-600" /> Drift forecast</h3>
          {forecast.isPending && <p className="mt-3 text-sm text-slate-400">Computing drift…</p>}
          {forecast.isError && <p className="mt-3 text-sm text-amber-600">Drift unavailable (engine offline).</p>}
          {fc && (
            <div className="mt-3 space-y-2">
              <Metric label="Coast ETA" value={fc.etaHours != null ? `${Math.round(fc.etaHours)} h` : (h.etaHours != null ? `${Math.round(h.etaHours)} h` : 'open ocean')} />
              <Metric label="Landfall probability" value={`${Math.round((fc.landfall?.probability ?? 0) * 100)}%`} />
              <Metric label="Data source" value={forcingLabel(fc.dataSource)} />
            </div>
          )}
        </Card>

        <Card>
          <h3 className="flex items-center gap-2 font-display text-sm font-bold text-slate-700"><Clock size={15} className="text-ocean-600" /> Timeline</h3>
          <div className="mt-3 space-y-2 text-xs text-slate-500">
            <p>First detected <span className="font-mono text-slate-700">{new Date(h.firstDetected).toLocaleString('en-IN')}</span></p>
            <p>Last updated <span className="font-mono text-slate-700">{new Date(h.lastDetected).toLocaleString('en-IN')}</span></p>
          </div>
        </Card>
      </div>

      {/* Source trace (back-track) */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 font-display text-sm font-bold text-slate-700">
            <Crosshair size={15} className="text-ocean-600" /> Likely source
          </h3>
          <button type="button" onClick={() => h && backtrack.mutate({ lat: h.centroidLat, lon: h.centroidLon, horizon: 48 })}
            disabled={backtrack.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ocean-200 bg-ocean-50 px-3 py-1.5 text-xs font-medium text-ocean-700 hover:bg-ocean-100 disabled:opacity-60">
            {backtrack.isPending ? 'Tracing…' : 'Trace 48h upstream'}
          </button>
        </div>
        {backtrack.isError && <p className="mt-3 text-sm text-amber-600">Back-track unavailable (engine offline).</p>}
        {backtrack.data && backtrack.data.points.length > 1 && (() => {
          const origin = backtrack.data.points[backtrack.data.points.length - 1];
          return (
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
              <Metric label="Traced origin" value={formatCoords(origin.lat, origin.lon)} />
              <Metric label="Window" value={`${backtrack.data.horizonHours} h back`} />
              <Metric label="Forcing" value={forcingLabel(backtrack.data.dataSource)} />
            </div>
          );
        })()}
        {!backtrack.data && !backtrack.isPending && (
          <p className="mt-3 text-xs text-slate-500">Trace where this cluster likely drifted from, using the reverse drift model.</p>
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        <Link to="/app/operations" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white/70 px-3 py-2 text-sm text-slate-600 hover:border-ocean-300 hover:text-ocean-700">
          <Ship size={14} className="text-ocean-500" /> Dispatch field operation
        </Link>
        <Link to="/app/map" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white/70 px-3 py-2 text-sm text-slate-600 hover:border-ocean-300 hover:text-ocean-700">
          <MapPin size={14} className="text-ocean-500" /> View on map
        </Link>
        <Link to="/app/ai-lab" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white/70 px-3 py-2 text-sm text-slate-600 hover:border-ocean-300 hover:text-ocean-700">
          <Sparkles size={14} className="text-ocean-500" /> Similar sites
        </Link>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="font-display text-sm font-bold text-slate-800">{value}</span>
    </div>
  );
}
