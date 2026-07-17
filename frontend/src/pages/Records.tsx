import { lazy, Suspense, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers, Rows3, Grid2x2, ScanLine, Flame, CheckCircle2, AlertTriangle } from 'lucide-react';
import { PageHeader, Badge, Card, StatCard, SkeletonCard, InfoTip } from '@/components';
import { useHotspots, useOverview } from '@/hooks/useApi';
import { formatCoords, cn } from '@/lib/utils';
import type { Hotspot } from '@/types';

// Reuse the full Detections table + Hotspots cluster grid, headerless.
const Detections = lazy(() => import('@/pages/Detections'));
const Hotspots = lazy(() => import('@/pages/Hotspots'));

type View = 'raw' | 'clustered';

const SEV_COLOR: Record<string, string> = { HIGH: '#EF4444', MEDIUM: '#F59E0B', LOW: '#10B981' };

/**
 * Records — the single catalog of model outputs (IA v2 merge of Detections +
 * Hotspots). One dataset, two granularities: a Raw↔Clustered toggle zooms the
 * same results between per-pixel detection rows and DBSCAN cluster cards. The
 * clustered view adds a brushable Severity × landfall-ETA scatter.
 */
export default function Records() {
  const [view, setView] = useState<View>('raw');
  const overview = useOverview();
  const hotspots = useHotspots({ active: true });
  const o = overview.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Records"
        subtitle="One catalog of everything the model found — zoom between raw detections and the clusters they form."
        badge={<Badge variant="ocean" dot>{hotspots.data?.length ?? '—'} clusters</Badge>}
        actions={<GranularityToggle view={view} onChange={setView} />}
      />

      {/* Premium summary band */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total detections" value={o?.totalDetections ?? 0} icon={<ScanLine size={18} />} color="ocean" delay={0} />
        <StatCard label="Confirmed plastic" value={o?.plasticDetections ?? 0} icon={<CheckCircle2 size={18} />} color="success" delay={0.05} />
        <StatCard label="Active clusters" value={o?.activeHotspots ?? 0} icon={<Flame size={18} />} color="warn" delay={0.1} />
        <StatCard label="High-severity" value={o?.highSeverityHotspots ?? 0} icon={<AlertTriangle size={18} />} color="danger" delay={0.15} />
      </div>

      {/* Granularity rail — visual explainer of the current zoom */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <span className={cn('inline-flex items-center gap-1.5 font-semibold', view === 'raw' ? 'text-ocean-700' : '')}>
          <ScanLine size={13} /> Raw detections
        </span>
        <span className="h-px w-8 bg-gradient-to-r from-ocean-300 to-transparent" />
        <span>
          nearby detections grouped together{' '}
          <InfoTip term="DBSCAN eps 0.09° · min 3">Detections within about 0.09° of each other are grouped into a cluster once at least 3 of them sit close together (DBSCAN).</InfoTip>
        </span>
        <span className="h-px w-8 bg-gradient-to-l from-ocean-300 to-transparent" />
        <span className={cn('inline-flex items-center gap-1.5 font-semibold', view === 'clustered' ? 'text-ocean-700' : '')}>
          <Flame size={13} /> Clustered hotspots
        </span>
      </div>

      {/* Signature interactive: severity × ETA scatter (clustered view only) */}
      <AnimatePresence>
        {view === 'clustered' && (hotspots.data?.length ?? 0) > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <SeverityEtaScatter hotspots={hotspots.data ?? []} />
          </motion.div>
        )}
        {view === 'clustered' && !hotspots.isLoading && (hotspots.data?.length ?? 0) === 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <Card accent className="text-center">
              <Flame size={22} className="mx-auto text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-700">No clusters yet</p>
              <p className="mx-auto mt-1 max-w-md text-xs text-slate-400">
                Nothing has grouped together into a cluster so far. As more detections land close to one another, they will appear here. In the meantime, switch to Raw to browse every individual detection.
              </p>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
        >
          <Suspense fallback={<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>}>
            {view === 'raw' ? <Detections embedded /> : <Hotspots embedded />}
          </Suspense>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function GranularityToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const opts: { key: View; label: string; icon: typeof Rows3 }[] = [
    { key: 'raw', label: 'Raw', icon: Rows3 },
    { key: 'clustered', label: 'Clustered', icon: Grid2x2 },
  ];
  return (
    <div className="relative flex items-center gap-1 rounded-xl border border-border bg-white/70 p-1">
      <Layers size={14} className="ml-1 mr-0.5 text-ocean-500" />
      {opts.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            'relative z-10 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
            view === key ? 'text-white' : 'text-slate-500 hover:text-ocean-600',
          )}
        >
          {view === key && (
            <motion.span
              layoutId="records-toggle"
              className="absolute inset-0 -z-10 rounded-lg bg-ocean-600 shadow-glow-primary"
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            />
          )}
          <Icon size={13} /> {label}
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Severity × landfall-ETA — a premium, interactive triage scatter.
   x = hours to coast (imminent on the left), y = cluster size (detections),
   colour = severity, radius ∝ size. The "imminent & large" danger corner is
   tinted; hover a bubble for its stats, click to open the hotspot.
   ───────────────────────────────────────────────────────────────────── */
function SeverityEtaScatter({ hotspots }: { hotspots: Hotspot[] }) {
  const [hover, setHover] = useState<string | null>(null);

  const W = 680, H = 300, M = { top: 20, right: 90, bottom: 40, left: 46 };
  const plotW = W - M.left - M.right, plotH = H - M.top - M.bottom;
  const ETA_MAX = 72; // hours; beyond this or null → "open ocean" lane on the right

  const maxDet = Math.max(6, ...hotspots.map((h) => h.detectionCount));

  const points = useMemo(() => hotspots.map((h) => {
    const openOcean = h.etaHours == null || h.etaHours > ETA_MAX;
    const etaClamped = openOcean ? ETA_MAX : Math.max(0, h.etaHours as number);
    // x: 0h at left, ETA_MAX at right edge of plot; open-ocean parked in the right lane
    const x = openOcean ? M.left + plotW + 34 : M.left + (etaClamped / ETA_MAX) * plotW;
    const y = M.top + plotH - (h.detectionCount / maxDet) * plotH;
    const r = 5 + (h.detectionCount / maxDet) * 10;
    return { h, x, y, r, openOcean };
  }), [hotspots, maxDet, plotW, plotH]);

  const hovered = points.find((p) => (p.h.id ?? p.h.label) === hover);
  // gridlines at 0/12/24/48/72h
  const xticks = [0, 12, 24, 48, 72];

  return (
    <Card accent className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-slate-800">
          <Flame size={15} className="text-ocean-600" /> Severity vs time to coast
          <InfoTip term="landfall ETA">The estimated time until a cluster drifts ashore (landfall ETA).</InfoTip>
        </h3>
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          {(['HIGH', 'MEDIUM', 'LOW'] as const).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: SEV_COLOR[s] }} /> {s.toLowerCase()}
            </span>
          ))}
          <span className="text-slate-400">· bubble size = cluster</span>
        </div>
      </div>

      <div className="relative mt-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 520 }} role="img" aria-label="Hotspot severity versus coast ETA scatter plot">
          {/* danger corner: imminent (≤24h) tint */}
          <rect x={M.left} y={M.top} width={(24 / ETA_MAX) * plotW} height={plotH} fill="rgba(239,68,68,0.06)" />
          <text x={M.left + 6} y={M.top + 14} style={{ font: '600 10px monospace' }} className="fill-red-400">IMMINENT</text>

          {/* axes */}
          <line x1={M.left} y1={M.top + plotH} x2={M.left + plotW + 60} y2={M.top + plotH} stroke="#CBD5E1" strokeWidth="1" />
          <line x1={M.left} y1={M.top} x2={M.left} y2={M.top + plotH} stroke="#CBD5E1" strokeWidth="1" />

          {/* x gridlines + labels */}
          {xticks.map((t) => {
            const x = M.left + (t / ETA_MAX) * plotW;
            return (
              <g key={t}>
                <line x1={x} y1={M.top} x2={x} y2={M.top + plotH} stroke="#EEF3F4" strokeWidth="1" />
                <text x={x} y={M.top + plotH + 16} textAnchor="middle" style={{ font: '500 10px monospace' }} className="fill-slate-400">{t}h</text>
              </g>
            );
          })}
          {/* open-ocean lane */}
          <line x1={M.left + plotW + 20} y1={M.top} x2={M.left + plotW + 20} y2={M.top + plotH} stroke="#E2E8F0" strokeDasharray="3 3" />
          <text x={M.left + plotW + 34} y={M.top + plotH + 16} textAnchor="middle" style={{ font: '500 9px monospace' }} className="fill-slate-400">open</text>

          {/* axis titles */}
          <text x={M.left + plotW / 2} y={H - 4} textAnchor="middle" style={{ font: '600 10px monospace' }} className="fill-slate-500">hours to coast →</text>
          <text x={14} y={M.top + plotH / 2} transform={`rotate(-90 14 ${M.top + plotH / 2})`} textAnchor="middle" style={{ font: '600 10px monospace' }} className="fill-slate-500">cluster size →</text>

          {/* bubbles */}
          {points.map((p, i) => {
            const key = p.h.id ?? p.h.label;
            const active = hover === key;
            return (
              <motion.circle
                key={key}
                cx={p.x} cy={p.y}
                fill={SEV_COLOR[p.h.severity] ?? '#0D9488'}
                fillOpacity={active ? 0.95 : 0.62}
                stroke="#fff" strokeWidth={active ? 2 : 1}
                initial={{ r: 0, opacity: 0 }}
                animate={{ r: active ? p.r + 3 : p.r, opacity: 1 }}
                transition={{ delay: Math.min(i * 0.03, 0.4), type: 'spring', stiffness: 200, damping: 18 }}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHover(key)}
                onMouseLeave={() => setHover((h) => (h === key ? null : h))}
              />
            );
          })}
        </svg>

        <p className="mt-1 text-xs text-slate-400">
          Each bubble is one cluster. Left to right shows the time until it reaches the coast (sooner on the left), higher up means a bigger cluster, and the colour shows severity. Hover a bubble for details, or click to open the hotspot.
        </p>

        {/* hover tooltip + click-through */}
        {hovered && (
          <Link
            to={hovered.h.id ? `/app/hotspots/${hovered.h.id}` : '/app/records'}
            className="absolute z-10 block w-52 -translate-x-1/2 -translate-y-full rounded-xl border border-border bg-white/95 p-3 shadow-glass backdrop-blur"
            style={{ left: `${(hovered.x / W) * 100}%`, top: `${(hovered.y / H) * 100}%` }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-display text-sm font-bold text-slate-800">{hovered.h.label}</span>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase text-white" style={{ background: SEV_COLOR[hovered.h.severity] }}>{hovered.h.severity}</span>
            </div>
            <p className="mt-1 font-mono text-[11px] text-slate-400">{formatCoords(hovered.h.centroidLat, hovered.h.centroidLon)}</p>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
              <span>{hovered.h.detectionCount} detections</span>
              <span className={cn('font-mono', hovered.openOcean ? 'text-slate-400' : (hovered.h.etaHours as number) <= 24 ? 'font-bold text-red-600' : 'text-amber-600')}>
                {hovered.openOcean ? 'open ocean' : `~${Math.round(hovered.h.etaHours as number)}h to coast`}
              </span>
            </div>
            <p className="mt-1.5 text-[10px] font-semibold text-ocean-600">Open hotspot →</p>
          </Link>
        )}
      </div>
    </Card>
  );
}
