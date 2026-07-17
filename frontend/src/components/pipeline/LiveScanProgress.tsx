/**
 * LiveScanProgress — watch a scan happen. Streams real per-stage events from the
 * engine over SSE (/api/pipeline/stream) and lights up each stage as it completes,
 * with its genuine duration, then shows the result. Same ocean/teal system.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Satellite, LineChart, Cpu, Boxes, Wind, BellRing, Play, Check, Radio, Loader2, Sparkles, Minus } from 'lucide-react';
import { Card, Badge } from '@/components';
import { useRegions } from '@/hooks/useApi';
import { cn } from '@/lib/utils';

const STAGES: { key: string; label: string; icon: typeof Satellite; optional?: boolean }[] = [
  { key: 'DOWNLOAD', label: 'Ingest Sentinel-2', icon: Satellite },
  { key: 'FDI', label: 'Floating Debris Index', icon: LineChart },
  { key: 'CNN', label: 'Classify (MLP)', icon: Cpu },
  { key: 'DBSCAN', label: 'Cluster hotspots', icon: Boxes },
  { key: 'CLAY', label: 'Clay tier-2 (GPU)', icon: Sparkles, optional: true },
  { key: 'DRIFT', label: 'Drift forecast', icon: Wind },
  { key: 'ALERT', label: 'Raise alerts', icon: BellRing },
];

const DEFAULT_BBOX = { north: 13.3, south: 12.9, east: 80.5, west: 80.1 }; // Chennai
const API = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

interface StageDone { durationMs: number; detail: string }
interface ScanResult { detections: number; plastic: number; hotspots: number; avgConfidence: number; provider: string }

export function LiveScanProgress() {
  const regions = useRegions();
  const [region, setRegion] = useState('');
  const [running, setRunning] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, StageDone>>({});
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const finished = useRef(false);

  useEffect(() => () => esRef.current?.close(), []);

  const start = () => {
    esRef.current?.close();
    setRunning(true); setActive(null); setDone({}); setResult(null); setError(null); setEnded(false);
    finished.current = false;

    const r = regions.data?.find((x) => x.code === region);
    const b = r?.boundingBox ?? DEFAULT_BBOX;
    const qs = `north=${b.north}&south=${b.south}&east=${b.east}&west=${b.west}&scene_size=48`;
    const es = new EventSource(`${API}/api/pipeline/stream?${qs}`);
    esRef.current = es;

    es.onmessage = (ev) => {
      const d = JSON.parse(ev.data) as Record<string, unknown>;
      const type = d.type as string;
      if (type === 'start') setActive(STAGES[0].key);
      else if (type === 'stage') {
        const stage = d.stage as string;
        setDone((m) => ({ ...m, [stage]: { durationMs: d.durationMs as number, detail: d.detail as string } }));
        const idx = STAGES.findIndex((s) => s.key === stage);
        setActive(STAGES[idx + 1]?.key ?? null);
      } else if (type === 'result') {
        setResult({
          detections: d.detections as number, plastic: d.plastic as number, hotspots: d.hotspots as number,
          avgConfidence: d.avgConfidence as number, provider: d.provider as string,
        });
      } else if (type === 'error') {
        setError((d.message as string) ?? 'Scan failed'); finished.current = true; es.close(); setRunning(false); setEnded(true);
      } else if (type === 'done') {
        finished.current = true; es.close(); setRunning(false); setActive(null); setEnded(true);
      }
    };
    es.onerror = () => {
      if (!finished.current) { setError('Live scan stream lost — is the engine running?'); setRunning(false); }
      es.close();
    };
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-ocean-50 text-ocean-600"><Radio size={16} /></span>
          <div>
            <h3 className="font-display text-sm font-bold text-slate-800">Live scan</h3>
            <p className="text-[11px] text-slate-400">Streamed stage-by-stage from the engine</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={region} onChange={(e) => setRegion(e.target.value)} disabled={running}
            aria-label="Region to scan"
            className="rounded-lg border border-border bg-white/80 px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-ocean-400 disabled:opacity-60"
          >
            <option value="">Chennai (default AOI)</option>
            {(regions.data ?? []).map((r) => <option key={r.code} value={r.code}>{r.code} — {r.displayName}</option>)}
          </select>
          <button
            type="button" onClick={start} disabled={running}
            className="inline-flex items-center gap-1.5 rounded-lg bg-ocean-600 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-ocean-700 disabled:opacity-60"
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {running ? 'Scanning…' : 'Run live scan'}
          </button>
        </div>
      </div>

      {/* Stage stepper */}
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {STAGES.map((s) => {
          const d = done[s.key];
          const isActive = active === s.key;
          const skipped = !d && !isActive && s.optional && ended;
          const state = d ? 'done' : isActive ? 'active' : skipped ? 'skipped' : 'pending';
          const Icon = s.icon;
          return (
            <div key={s.key}
              className={cn('flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                state === 'done' ? 'border-teal-200 bg-teal-50/60'
                  : state === 'active' ? 'border-ocean-300 bg-ocean-50'
                    : state === 'skipped' ? 'border-border/50 bg-slate-50/60 opacity-70'
                      : 'border-border/60 bg-white/50')}>
              <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg',
                state === 'done' ? 'bg-teal-500 text-white'
                  : state === 'active' ? 'bg-ocean-500 text-white'
                    : state === 'skipped' ? 'bg-slate-100 text-slate-300' : 'bg-slate-100 text-slate-400')}>
                {state === 'done' ? <Check size={16} /> : state === 'active' ? <Loader2 size={15} className="animate-spin" />
                  : state === 'skipped' ? <Minus size={15} /> : <Icon size={15} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn('truncate text-xs font-semibold', state === 'pending' || state === 'skipped' ? 'text-slate-400' : 'text-slate-700')}>{s.label}</p>
                <p className="truncate text-[11px] text-slate-400">
                  {d ? `${(d.durationMs / 1000).toFixed(1)}s · ${d.detail}`
                    : isActive ? 'running…' : skipped ? 'skipped · GPU sidecar offline' : 'queued'}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {error && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</motion.p>
        )}
        {result && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-teal-200 bg-teal-50/60 px-4 py-3">
            <Metric label="Detections" value={result.detections} />
            <Metric label="Plastic" value={result.plastic} />
            <Metric label="Hotspots" value={result.hotspots} />
            <Metric label="Avg confidence" value={`${Math.round(result.avgConfidence * 100)}%`} />
            <Badge variant={result.provider === 'sentinelhub' ? 'success' : 'neutral'}>
              {result.provider === 'sentinelhub' ? 'REAL Sentinel-2' : result.provider}
            </Badge>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="font-display text-lg font-bold text-slate-800">{value}</p>
      <p className="text-[11px] text-slate-400">{label}</p>
    </div>
  );
}
