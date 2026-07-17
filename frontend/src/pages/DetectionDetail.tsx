/**
 * DetectionDetail — a deep-linkable page for one detection (/app/detections/:id).
 * Surfaces the full evidence (FDI, classification, model card), a per-detection
 * drift forecast, and analyst actions. Exposes the previously-unused useDetection
 * hook. Same ocean/teal UI kit.
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Activity, Cpu, Wind, ShieldCheck, Check, Ban, MapPin, AlertTriangle } from 'lucide-react';
import { PageHeader, Card, Badge } from '@/components';
import { useDetection, useForecast, useLabelDetection } from '@/hooks/useApi';
import { useAuthStore } from '@/stores/authStore';
import { formatArea, formatCoords } from '@/lib/utils';
import { ROLE_LEVEL } from '@/types';
import type { DetectionStatus } from '@/types';

const THRESHOLD = 0.02;

export default function DetectionDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: d, isLoading } = useDetection(id);
  const forecast = useForecast();
  const label = useLabelDetection();
  const { user } = useAuthStore();
  const canValidate = (user?.level ?? 0) >= ROLE_LEVEL.COASTGUARD;
  const [localStatus, setLocalStatus] = useState<DetectionStatus | null>(null);

  useEffect(() => { setLocalStatus(null); }, [id]);
  useEffect(() => {
    if (d) forecast.mutate({ lat: d.lat, lon: d.lon, horizon: 72 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.id]);

  if (isLoading) return <div className="py-20 text-center text-sm text-slate-400">Loading detection…</div>;
  if (!d) return (
    <div className="py-20 text-center">
      <p className="text-sm text-slate-500">Detection not found.</p>
      <Link to="/app/records" className="mt-2 inline-block text-sm text-ocean-600">← Back to records</Link>
    </div>
  );

  const status = localStatus ?? d.status;
  const fc = forecast.data;

  return (
    <div className="space-y-6">
      <Link to="/app/records" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-ocean-700">
        <ArrowLeft size={15} /> Detections
      </Link>

      <PageHeader
        title={`${d.classification.replace('_', ' ')} detection`}
        subtitle={`${formatCoords(d.lat, d.lon)} · ${d.regionCode ?? 'AOI'} · ${new Date(d.createdAt).toLocaleString('en-IN')}`}
        badge={<StatusBadge status={status} />}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* FDI evidence */}
        <Card>
          <h3 className="flex items-center gap-2 font-display text-sm font-bold text-slate-700"><Activity size={15} className="text-ocean-600" /> Spectral anomaly (FDI)</h3>
          <div className="relative mt-3 h-3 rounded-full bg-slate-100">
            <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-ocean-300 to-ocean-600" style={{ width: `${Math.min(100, (d.fdiScore / 0.08) * 100)}%` }} />
            <div className="absolute inset-y-0 w-0.5 bg-red-400" style={{ left: `${(THRESHOLD / 0.08) * 100}%` }} title={`threshold ${THRESHOLD}`} />
          </div>
          <p className="mt-2 font-mono text-xs text-slate-600">
            FDI <b>{d.fdiScore.toFixed(4)}</b> {d.fdiScore > THRESHOLD ? '>' : '≤'} threshold {THRESHOLD} →{' '}
            <b className={d.fdiScore > THRESHOLD ? 'text-ocean-700' : 'text-slate-500'}>{d.fdiScore > THRESHOLD ? 'candidate pixel' : 'below candidacy'}</b>
          </p>
          <p className="mt-2 text-[11px] text-slate-400">Detected footprint {formatArea(d.areaSqKm)} — the flagged pixels’ physical area at 10 m resolution, not a measured slick size.</p>
        </Card>

        {/* Classification */}
        <Card>
          <h3 className="flex items-center gap-2 font-display text-sm font-bold text-slate-700"><Cpu size={15} className="text-ocean-600" /> Classification</h3>
          <div className="mt-3 flex items-center gap-2">
            <Badge variant={d.classification === 'Plastic' ? 'ocean' : 'neutral'}>{d.classification.replace('_', ' ')}</Badge>
            <span className="font-mono text-sm font-bold text-slate-700">{Math.round(d.confidence * 100)}% confidence</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Scored by the per-pixel model on this pixel's spectral features. Confirmed detections are human-validated;
            coastal turbidity and haze can inflate FDI near river mouths.
          </p>
        </Card>

        {/* Drift forecast */}
        <Card>
          <h3 className="flex items-center gap-2 font-display text-sm font-bold text-slate-700"><Wind size={15} className="text-ocean-600" /> Drift forecast (72h)</h3>
          {forecast.isPending && <p className="mt-3 text-sm text-slate-400">Computing drift…</p>}
          {forecast.isError && <p className="mt-3 text-sm text-amber-600">Drift unavailable (engine offline).</p>}
          {fc && (
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
              <Metric label="Coast ETA" value={fc.etaHours != null ? `${Math.round(fc.etaHours)} h` : 'open ocean'} />
              <Metric label="Landfall prob." value={`${Math.round((fc.landfall?.probability ?? 0) * 100)}%`} />
              <Metric label="Data source" value={fc.dataSource === 'open-meteo' ? 'REAL winds+currents' : fc.dataSource} />
            </div>
          )}
        </Card>

        {/* Analyst actions */}
        <Card>
          <h3 className="flex items-center gap-2 font-display text-sm font-bold text-slate-700"><ShieldCheck size={15} className="text-ocean-600" /> Analyst validation</h3>
          <p className="mt-2 text-xs text-slate-500">Your verdict feeds the active-learning retrain set. Status: <b>{status.replace('_', ' ').toLowerCase()}</b>.</p>
          {canValidate ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={label.isPending} onClick={() => { setLocalStatus('CONFIRMED'); label.mutate({ id: d.id, status: 'CONFIRMED' }); }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-100 disabled:opacity-60">
                <Check size={13} /> Confirm plastic
              </button>
              <button type="button" disabled={label.isPending} onClick={() => { setLocalStatus('FALSE_ALARM'); label.mutate({ id: d.id, status: 'FALSE_ALARM' }); }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-60">
                <Ban size={13} /> False alarm
              </button>
            </div>
          ) : (
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">Sign in as Coast Guard or Admin to validate.</p>
          )}
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link to="/app/map" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white/70 px-3 py-2 text-sm text-slate-600 hover:border-ocean-300 hover:text-ocean-700">
          <MapPin size={14} className="text-ocean-500" /> View on map
        </Link>
        <Link to="/app/ai-lab" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white/70 px-3 py-2 text-sm text-slate-600 hover:border-ocean-300 hover:text-ocean-700">
          <AlertTriangle size={14} className="text-ocean-500" /> Explore fingerprint space
        </Link>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: DetectionStatus }) {
  const map = { CONFIRMED: 'success', PENDING: 'warn', FALSE_ALARM: 'neutral' } as const;
  return <Badge variant={map[status]}>{status.replace('_', ' ').toLowerCase()}</Badge>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-display text-base font-bold text-slate-800">{value}</p>
      <p className="text-[11px] text-slate-400">{label}</p>
    </div>
  );
}
