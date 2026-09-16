import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Activity, BellRing, Check, Flame, Layers, Loader2, Play, Radar, ScanLine,
  Satellite, Server, ChevronDown, ArrowRight, Map as MapIcon, Send,
  CheckCircle2, Globe2, Waves, Target, Sparkles, type LucideIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader, Card, Badge, SeverityPill, StatCard, InfoTip } from '@/components';
import {
  useOverview, useAlerts, useAckAlert, useCapabilities, useDetections, useHotspots,
  usePipelineLogs, usePipelineStatus, useSatelliteStatus, useServices,
} from '@/hooks/useApi';
import { useLiveFeed, type LiveEvent } from '@/hooks/useLiveFeed';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { formatCoords, cn } from '@/lib/utils';
import type { Alert, EngineCapabilities, Hotspot, PipelineStatusInfo, Severity } from '@/types';

// Backing services surfaced as READ-ONLY status chips. Starting/stopping them is
// deliberately not a UI action — the services are owned by the host (start-all.cmd
// / the watchdog), so the dashboard reports their state rather than driving it.
const SVC_CHIPS: { name: string; label: string; icon: LucideIcon }[] = [
  { name: 'engine', label: 'engine', icon: Server },
  { name: 'redis', label: 'queue', icon: Layers },
  { name: 'clay', label: 'Clay GPU', icon: Sparkles },
];

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'On the night watch';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// Role-specific quick actions (routes point at the consolidated IA v2 pages).
const ROLE_ACTIONS: Record<string, { to: string; label: string; icon: LucideIcon }[]> = {
  ADMIN:      [{ to: '/app/pipeline', label: 'Pipeline health', icon: Activity }, { to: '/app/analytics', label: 'Analytics & Reports', icon: Layers }, { to: '/app/ai-lab', label: 'AI Lab', icon: Sparkles }],
  COASTGUARD: [{ to: '/app/records', label: 'Priority hotspots', icon: Flame }, { to: '/app/map', label: 'Live AOI scan', icon: MapIcon }, { to: '/app/operations', label: 'Field Ops', icon: Send }],
  FIELD:      [{ to: '/app/map', label: 'Map', icon: MapIcon }, { to: '/app/records', label: 'Verification queue', icon: ScanLine }, { to: '/app/operations', label: 'Field Ops', icon: Send }],
};

type StatusFilter = 'all' | 'open' | 'acked';
const SEV_FILTERS: { value: '' | Severity; label: string }[] = [
  { value: '', label: 'All' }, { value: 'HIGH', label: 'High' }, { value: 'MEDIUM', label: 'Medium' }, { value: 'LOW', label: 'Low' },
];

export default function CommandCenter() {
  const user = useAuthStore((s) => s.user);
  const overview = useOverview();
  const status = usePipelineStatus();
  const satellite = useSatelliteStatus();
  const hotspots = useHotspots({ active: true });
  const pending = useDetections({ status: 'PENDING', limit: 8 });
  const logs = usePipelineLogs(16);
  const feed = useLiveFeed();
  const ack = useAckAlert();
  const caps = useCapabilities();
  const services = useServices();
  const [running, setRunning] = useState(false);
  const [focus, setFocus] = useState(false);

  // Inbox filters (folds the old standalone Alerts page in here).
  const [severity, setSeverity] = useState<'' | Severity>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const inbox = useAlerts({
    severity: severity || undefined,
    acked: statusFilter === 'all' ? undefined : statusFilter === 'acked',
  });
  const allOpen = useAlerts({ acked: false }); // for the situation score, unfiltered

  const o = overview.data;
  const engineUp = status.data?.engine === 'online';
  const queueUp = status.data?.queue?.state === 'up';
  const live = satellite.data?.mode === 'live';
  const roleActions = ROLE_ACTIONS[user?.role ?? ''] ?? null;

  // ETA-priority: coast-bound hotspots, soonest first.
  const priority = useMemo(() => [...(hotspots.data ?? [])].sort((a, b) => {
    if (a.etaHours == null && b.etaHours == null) return b.detectionCount - a.detectionCount;
    if (a.etaHours == null) return 1;
    if (b.etaHours == null) return -1;
    return a.etaHours - b.etaHours;
  }), [hotspots.data]);

  // ── Situation Level: one fused live threat score ──────────────────
  const situation = useMemo(() => {
    const open = allOpen.data ?? [];
    const openHigh = open.filter((a) => a.severity === 'HIGH').length;
    const openMed = open.filter((a) => a.severity === 'MEDIUM').length;
    const imminent = priority.filter((h) => h.etaHours != null && h.etaHours <= 24).length;
    const soon = priority.filter((h) => h.etaHours != null && h.etaHours > 24 && h.etaHours <= 72).length;
    const raw = openHigh * 26 + imminent * 22 + openMed * 8 + soon * 6;
    return { score: Math.max(0, Math.min(100, raw)), openHigh, openMed, imminent, soon };
  }, [allOpen.data, priority]);

  const pendingCount = pending.data?.total ?? 0;

  // Focus mode = "what needs me now": actionable inbox + coast-bound hotspots only.
  const inboxRows = useMemo(() => {
    const rows = inbox.data ?? [];
    if (!focus) return rows;
    return rows.filter((a) => !a.isAcked && (a.severity === 'HIGH' || a.severity === 'MEDIUM'));
  }, [inbox.data, focus]);
  const hotspotRows = useMemo(() => (focus ? priority.filter((h) => h.etaHours != null) : priority), [priority, focus]);

  const runAllRegions = async () => {
    setRunning(true);
    try {
      const { mode } = await api.scheduledRun();
      toast.success(mode === 'queued'
        ? 'All-region run enqueued — the worker is processing it now.'
        : 'All-region run completed (direct mode).');
    } catch {
      toast.error('Could not trigger the run — is the backend up?');
    } finally {
      setRunning(false);
    }
  };

  const focusInbox = (sev: '' | Severity) => { setSeverity(sev); setStatusFilter('open'); };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Command Center"
        subtitle="Your duty-officer home — one live situation, the alert inbox, coast-bound hotspots, and the fleet trigger, all on one screen."
        badge={
          feed.connected
            ? <Badge variant="success" dot><span className="animate-pulse">LIVE</span> · updating instantly</Badge>
            : <Badge variant="neutral" dot>reconnecting · checking on a timer</Badge>
        }
      />

      {/* ══════════ PREMIUM HERO ══════════ */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="glass card-accent relative overflow-hidden p-5 lg:p-7"
      >
        {/* ambient depth glow */}
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-ocean-300/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-sky-400/10 blur-3xl" />

        <div className="relative grid items-center gap-6 lg:grid-cols-[minmax(0,300px)_1fr]">
          {/* Gauge */}
          <SituationGauge {...situation} loading={allOpen.isLoading || hotspots.isLoading} />

          {/* Right column */}
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-xl font-bold text-slate-900">
                  {greeting()}{user ? `, ${user.displayName.split(' ')[0]}` : ''}.
                </p>
                <p className="mt-0.5 text-sm text-slate-500">
                  {situation.score >= 67 ? 'Multiple situations need attention right now.'
                    : situation.score >= 34 ? 'A few things are worth a look.'
                    : 'All quiet on the monitored regions.'}
                </p>
              </div>
              <LiveClock />
            </div>

            {/* Live vitals — clickable */}
            <div className="grid grid-cols-3 gap-3">
              <Vital
                icon={BellRing} tone="danger" value={situation.openHigh} label="Open HIGH alerts"
                onClick={() => focusInbox('HIGH')} title="Filter the inbox to open HIGH alerts"
              />
              <Vital
                icon={Waves} tone="warn" value={situation.imminent} label="Reaches coast ≤ 24h"
                to="/app/records" title="Coast-bound hotspots in Records"
              />
              <Vital
                icon={ScanLine} tone="ocean" value={pendingCount} label="Awaiting verify"
                to="/app/records" title="Open the verification queue"
              />
            </div>

            {/* Actions + health */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={runAllRegions}
                disabled={running || !engineUp}
                className="group inline-flex items-center gap-2 rounded-xl bg-ocean-600 px-4 py-2.5 text-sm font-semibold text-white shadow-glow-primary transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                title={engineUp ? 'Run the pipeline for every monitored region' : 'Engine offline'}
              >
                {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} className="transition-transform group-hover:scale-110" />}
                Run all regions
              </button>

              <button
                type="button"
                onClick={() => setFocus((v) => !v)}
                aria-pressed={focus}
                className={cn('inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors',
                  focus ? 'border-ocean-500 bg-ocean-50 text-ocean-700' : 'border-border bg-white/70 text-slate-500 hover:border-ocean-300 hover:text-ocean-700')}
                title="Show only what needs action right now"
              >
                <Target size={15} className={cn(focus && 'text-ocean-600')} /> {focus ? 'Focus: on' : 'Needs me now'}
              </button>

              <div className="ml-auto flex flex-wrap items-center gap-2">
                {services.data && services.data.length > 0 ? (
                  SVC_CHIPS.map(({ name, label, icon }) => {
                    const s = services.data!.find((x) => x.name === name);
                    if (!s) return null;
                    return (
                      <HealthChip
                        key={name}
                        icon={icon}
                        ok={s.running}
                        okText={label}
                        badText={`${label} · off`}
                      />
                    );
                  })
                ) : (
                  <>
                    <HealthChip icon={Server} ok={engineUp} okText="engine" badText="engine down" />
                    <HealthChip icon={Layers} ok={queueUp} okText="queue" badText="direct mode" />
                  </>
                )}
                <HealthChip icon={Satellite} ok={live} okText="live satellite (S-2)" badText="demo imagery" />
              </div>
            </div>

            {roleActions && (
              <div className="flex flex-wrap gap-2 border-t border-border/50 pt-4">
                {roleActions.map(({ to, label, icon: Icon }) => (
                  <Link
                    key={to + label}
                    to={to}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-ocean-50 hover:text-ocean-700"
                  >
                    <Icon size={14} className="text-ocean-500" /> {label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.section>

      {/* ── Data provenance: what is real, right now ── */}
      <ProvenanceStrip caps={caps.data} status={status.data} />

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total detections" value={o?.totalDetections ?? 0} icon={<ScanLine size={18} />} color="ocean" delay={0} />
        <StatCard label="Confirmed plastic" value={o?.plasticDetections ?? 0} icon={<CheckCircle2 size={18} />} color="success" delay={0.05} />
        <StatCard label="Active hotspots" value={o?.activeHotspots ?? 0} icon={<Flame size={18} />} color="danger" trend={o ? o.highSeverityHotspots : undefined} trendLabel="high severity" delay={0.1} />
        <StatCard label="Regions monitored" value={o?.regionsMonitored ?? 0} icon={<Globe2 size={18} />} color="purple" delay={0.15} />
      </div>

      {/* ── Inbox + priority hotspots ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card accent padding="none" className="flex flex-col overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
            <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-slate-800">
              <BellRing size={15} className="text-ocean-600" /> Alert inbox
              {focus && <Badge variant="ocean">focus</Badge>}
            </h3>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-white/70 p-0.5">
              {(['open', 'all', 'acked'] as StatusFilter[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={cn('rounded-md px-2.5 py-1 text-xs font-semibold capitalize transition-colors',
                    statusFilter === s ? 'bg-ocean-600 text-white' : 'text-slate-500 hover:text-ocean-600')}
                >
                  {s === 'acked' ? 'Ack' : s}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1 border-b border-border/50 px-4 py-2">
            <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Severity</span>
            {SEV_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setSeverity(f.value)}
                className={cn('rounded-md px-2 py-0.5 text-xs font-semibold transition-colors',
                  severity === f.value ? 'bg-ocean-100 text-ocean-700' : 'text-slate-400 hover:text-ocean-600')}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="max-h-80 flex-1 divide-y divide-border/50 overflow-y-auto">
            <AnimatePresence initial={false}>
              {inboxRows.map((a) => (
                <InboxRow key={a.id} alert={a} onAck={() => ack.mutate(a.id)} acking={ack.isPending} />
              ))}
            </AnimatePresence>
            {inboxRows.length === 0 && <p className="px-4 py-10 text-center text-sm text-slate-400">{focus ? 'Nothing needs you right now — you’re clear.' : 'Nothing matches these filters.'}</p>}
          </div>
        </Card>

        <Card accent padding="none" className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-slate-800">
              <Flame size={15} className="text-ocean-600" /> Priority hotspots
              <span className="text-xs font-normal text-slate-400">soonest to reach the coast first</span>
            </h3>
            <Link to="/app/records" className="inline-flex items-center gap-1 text-xs font-semibold text-ocean-600 hover:text-ocean-700">
              All records <ArrowRight size={13} />
            </Link>
          </div>
          <div className="max-h-[22rem] divide-y divide-border/50 overflow-y-auto">
            {hotspotRows.slice(0, 9).map((h) => <HotspotRow key={h.id ?? h.label} hotspot={h} />)}
            {hotspotRows.length === 0 && <p className="px-4 py-10 text-center text-sm text-slate-400">No active hotspots.</p>}
          </div>
        </Card>
      </div>

      {/* ── Live event feed (WebSocket) ── */}
      <Card accent padding="none" className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-slate-800">
            <span className={cn('h-2 w-2 rounded-full', feed.connected ? 'animate-pulse bg-success-500' : 'bg-slate-300')} />
            Live event feed
          </h3>
          <span className="text-[11px] text-slate-400">
            {feed.connected ? 'shown live, the moment they happen' : 'live feed down — checking for updates on a timer'}
          </span>
        </div>
        <div className="max-h-52 divide-y divide-border/50 overflow-y-auto">
          {feed.events.map((e, i) => <LiveEventRow key={`${e.at}-${i}`} event={e} />)}
          {feed.events.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-400">
              Nothing yet. Press “Run all regions” above, or draw <InfoTip term="an AOI">an area of interest (AOI) — the box you draw on the map to scan just that patch of sea.</InfoTip> on the map, and new events will appear here live.
            </p>
          )}
        </div>
      </Card>

      {/* ── Verification queue + pipeline activity ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card accent padding="none" className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-slate-800">
              <ScanLine size={15} className="text-ocean-600" /> Awaiting verification
            </h3>
            <Badge variant="warn">{pendingCount} pending</Badge>
          </div>
          <div className="max-h-64 divide-y divide-border/50 overflow-y-auto">
            {(pending.data?.data ?? []).map((d) => (
              <Link key={d.id} to={`/app/detections/${d.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-ocean-50/60">
                <Badge variant={d.classification === 'Plastic' ? 'ocean' : 'neutral'}>{d.classification.replace('_', ' ')}</Badge>
                <span className="font-mono text-[11px] text-slate-400">{formatCoords(d.lat, d.lon)}</span>
                <span className="ml-auto font-mono text-xs text-slate-500">{Math.round(d.confidence * 100)}% · <InfoTip term="plastic signal">The Floating Debris Index (FDI) — near-infrared reflectance sits above the water baseline, a spectral clue that material is floating on the surface, not below it.</InfoTip> {d.fdiScore.toFixed(3)}</span>
              </Link>
            ))}
            {pending.data?.data?.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-400">Verification queue is empty.</p>}
          </div>
        </Card>

        <Card accent padding="none" className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-slate-800">
              <Activity size={15} className="text-ocean-600" /> Pipeline activity
            </h3>
            <Badge variant="neutral">last {(logs.data ?? []).length} stages</Badge>
          </div>
          <div className="max-h-64 divide-y divide-border/50 overflow-y-auto">
            {(logs.data ?? []).map((l) => (
              <div key={l.id} className="flex items-center gap-3 px-4 py-2 text-xs" title={l.detail}>
                <span className={cn('h-2 w-2 shrink-0 rounded-full',
                  l.status === 'COMPLETED' ? 'bg-success-500' : l.status === 'FAILED' ? 'bg-red-500' : 'bg-amber-400')} />
                <span className="w-20 font-mono font-semibold text-ocean-700">{l.stage}</span>
                <span className="truncate text-slate-500">{l.detail || '—'}</span>
                <span className="ml-auto shrink-0 font-mono text-slate-400">{l.durationMs}ms · {timeAgo(l.at)}</span>
              </div>
            ))}
            {logs.data?.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-400">No pipeline runs logged yet.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Situation Level — the Command Center's signature interactive widget.
   A premium semicircular risk meter: a green→amber→red graduated arc that
   fills to a live 0–100 threat score, a spring-driven needle, a pulse halo
   when CRITICAL, and a click-to-expand contributor breakdown.
   ───────────────────────────────────────────────────────────────────── */
function SituationGauge({
  score, openHigh, openMed, imminent, soon, loading,
}: { score: number; openHigh: number; openMed: number; imminent: number; soon: number; loading: boolean }) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const shown = useCountUp(Math.round(score), 900, !reduce);

  const level = score >= 67 ? { label: 'CRITICAL', color: '#EF4444' }
    : score >= 34 ? { label: 'ELEVATED', color: '#F59E0B' }
    : { label: 'CALM', color: '#10B981' };

  const f = score / 100;                    // 0..1
  const CX = 120, CY = 120, R = 92;
  const ARC = Math.PI * R;                  // semicircle length
  const L = 76;
  const tipX = CX - L * Math.cos(f * Math.PI);
  const tipY = CY - L * Math.sin(f * Math.PI);

  const contributors = [
    { label: 'Open HIGH alerts', n: openHigh, weight: '×26', color: '#EF4444' },
    { label: 'Reaches coast soon (≤24h)', n: imminent, weight: '×22', color: '#F97316' },
    { label: 'Open MEDIUM alerts', n: openMed, weight: '×8', color: '#F59E0B' },
    { label: 'Approaching coast (≤72h)', n: soon, weight: '×6', color: '#0891B2' },
  ];

  // Ticks at 0 / 33 / 67 / 100
  const ticks = [0, 0.33, 0.67, 1].map((t) => {
    const a = t * Math.PI;
    return {
      x1: CX - (R - 12) * Math.cos(a), y1: CY - (R - 12) * Math.sin(a),
      x2: CX - (R + 2) * Math.cos(a), y2: CY - (R + 2) * Math.sin(a),
    };
  });

  return (
    <div className="flex flex-col items-center">
      <div className="mb-1 flex w-full items-center justify-between">
        <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-slate-800">
          <span className="relative flex h-5 w-5 items-center justify-center">
            <Radar size={16} className="text-ocean-600" />
          </span>
          Situation level
        </h3>
        <Badge variant={score >= 67 ? 'danger' : score >= 34 ? 'warn' : 'success'} dot>{loading ? '…' : level.label}</Badge>
      </div>

      <div className="relative w-full max-w-[280px]">
        {/* pulse halo when critical */}
        {score >= 67 && !reduce && (
          <motion.span
            aria-hidden
            className="absolute left-1/2 top-[53%] -z-0 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(239,68,68,.28), transparent 70%)' }}
            animate={{ scale: [1, 1.35, 1], opacity: [0.7, 0, 0.7] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        <svg viewBox="0 0 240 180" className="relative w-full">
          <defs>
            <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#10B981" />
              <stop offset="48%" stopColor="#F59E0B" />
              <stop offset="100%" stopColor="#EF4444" />
            </linearGradient>
          </defs>
          {/* faint track */}
          <path d={`M${CX - R} ${CY} A${R} ${R} 0 0 1 ${CX + R} ${CY}`} fill="none" stroke="#E7EEF0" strokeWidth="16" strokeLinecap="round" />
          {/* graduated value arc — fills to score */}
          <motion.path
            d={`M${CX - R} ${CY} A${R} ${R} 0 0 1 ${CX + R} ${CY}`}
            fill="none" stroke="url(#gaugeGrad)" strokeWidth="16" strokeLinecap="round"
            strokeDasharray={ARC}
            initial={{ strokeDashoffset: ARC }}
            animate={{ strokeDashoffset: ARC * (1 - f) }}
            transition={{ type: 'spring', stiffness: 55, damping: 16 }}
          />
          {/* ticks */}
          {ticks.map((t, i) => (
            <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
          ))}
          {/* needle */}
          <motion.line
            x1={CX} y1={CY}
            stroke="#0F172A" strokeWidth="4" strokeLinecap="round"
            initial={{ x2: CX - L, y2: CY }}
            animate={{ x2: tipX, y2: tipY }}
            transition={{ type: 'spring', stiffness: 55, damping: 13 }}
          />
          <motion.circle
            r="5" fill={level.color}
            initial={{ cx: CX - L, cy: CY }}
            animate={{ cx: tipX, cy: tipY }}
            transition={{ type: 'spring', stiffness: 55, damping: 13 }}
          />
          <circle cx={CX} cy={CY} r="8" fill="#0F172A" />
          <circle cx={CX} cy={CY} r="3.5" fill="#fff" />
          {/* zone labels — pinned under the arc ends, flanking the readout */}
          <text x="28" y="138" className="fill-slate-400 font-mono text-[9px] font-semibold">CALM</text>
          <text x="212" y="138" textAnchor="end" className="fill-slate-400 font-mono text-[9px] font-semibold">CRITICAL</text>
          {/* readout — lives in the SVG below the pivot, so the needle, the hub
              and the score can never collide at any width or any score. */}
          <text x={CX} y="172" textAnchor="middle">
            <tspan className="font-display text-[38px] font-bold tabular-nums" fill={loading ? '#94A3B8' : level.color}>
              {loading ? '—' : shown}
            </tspan>
            <tspan dx="4" className="fill-slate-400 font-mono text-[13px] font-medium">/100</tspan>
          </text>
        </svg>
      </div>

      <p className="mt-1 max-w-[260px] text-center text-[11px] leading-snug text-slate-400">
        A single 0–100 score of how much needs your attention right now — higher means more open alerts and coast-bound plastic.
      </p>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1 inline-flex items-center justify-center gap-1 text-xs font-semibold text-ocean-600 transition-colors hover:text-ocean-700"
        aria-expanded={open}
      >
        {open ? 'Hide breakdown' : 'What drives this?'}
        <ChevronDown size={13} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-2 w-full space-y-1.5 overflow-hidden text-xs"
          >
            {contributors.map((c) => (
              <li key={c.label} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                <span className="text-slate-600">{c.label}</span>
                <span className="ml-auto font-mono text-slate-400">{c.weight}</span>
                <span className={cn('w-6 text-right font-mono font-semibold', c.n > 0 ? 'text-slate-700' : 'text-slate-300')}>{c.n}</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/* Clickable live vital — big animated number that acts as a shortcut. */
function Vital({ icon: Icon, tone, value, label, to, onClick, title }: {
  icon: LucideIcon; tone: 'danger' | 'warn' | 'ocean'; value: number; label: string;
  to?: string; onClick?: () => void; title?: string;
}) {
  const reduce = useReducedMotion();
  const shown = useCountUp(value, 800, !reduce);
  const toneCls = {
    danger: 'text-red-600 bg-red-50 group-hover:border-red-300',
    warn: 'text-amber-600 bg-amber-50 group-hover:border-amber-300',
    ocean: 'text-ocean-700 bg-ocean-50 group-hover:border-ocean-300',
  }[tone];
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', toneCls)}><Icon size={16} /></span>
        <ArrowRight size={13} className="text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-ocean-500" />
      </div>
      <p className={cn('mt-2 font-display text-2xl font-bold tabular-nums', tone === 'danger' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : 'text-ocean-700')}>{shown}</p>
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
    </>
  );
  const cls = 'group rounded-xl border border-border bg-white/70 p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-glass';
  if (to) return <Link to={to} title={title} className={cls}>{inner}</Link>;
  return <button type="button" onClick={onClick} title={title} className={cls}>{inner}</button>;
}

/* ─────────────────────────────────────────────────────────────────────
   Data provenance — one glance shows what is REAL right now, per stage.
   Green = live real data · amber = fallback/demo. Driven by the engine's
   /capabilities (satellite, model, Clay sidecar, drift forcing) and the
   backend's scheduler status — never hardcoded.
   ───────────────────────────────────────────────────────────────────── */
function ProvenanceStrip({ caps, status }: { caps?: EngineCapabilities; status?: PipelineStatusInfo }) {
  const c = caps?.config;
  const sched = status?.scheduler;
  const items: { label: string; value: string; ok: boolean; tip: string }[] = c ? [
    {
      label: 'Satellite', ok: c.realIngest,
      value: c.realIngest ? `Sentinel-2 · ${c.provider.toUpperCase()}` : 'demo imagery',
      tip: c.realIngest
        ? 'Real Sentinel-2 surface reflectance from the Copernicus Data Space (CDSE), cloud/land-masked via SCL.'
        : 'No satellite credentials — scans use generated demo pixels, clearly labelled.',
    },
    {
      label: 'Detector', ok: c.modelLoaded,
      value: c.modelLoaded ? 'MLP · MARIDA+MADOS' : 'heuristic (un-benchmarked)',
      tip: c.modelLoaded
        ? 'The trained per-pixel MLP (macro-F1 0.79 on real held-out MARIDA+MADOS) is classifying detections.'
        : 'No trained model loaded — detections use simple hand-written rules with no benchmark behind them.',
    },
    {
      label: 'Clay tier-2', ok: Boolean(c.clayLive),
      value: c.clayLive ? 'live on GPU' : 'offline · MLP-only',
      tip: c.clayLive
        ? 'The Clay foundation model is live on the GPU sidecar: every hotspot gets a second-model vote (CONFIRMED/POSSIBLE).'
        : 'Clay sidecar not running — hotspots keep their single-model result until it returns.',
    },
    {
      label: 'Drift', ok: c.griddedForcing,
      value: c.griddedForcing ? 'CMEMS gridded currents' : 'Open-Meteo point',
      tip: c.griddedForcing
        ? 'Forecasts sample real Copernicus Marine ocean currents along the drift track (RK4). ETAs are not yet validated against drifter tracks.'
        : 'Forecasts use the real Open-Meteo current/wind series at the release point.',
    },
    {
      label: 'Scanning', ok: Boolean(sched?.enabled),
      value: sched?.enabled ? `auto · every ${sched.intervalMinutes >= 60 ? `${Math.round(sched.intervalMinutes / 60)}h` : `${sched.intervalMinutes}m`}` : 'manual runs',
      tip: sched?.enabled
        ? 'The internal scheduler sweeps every monitored region automatically on this interval.'
        : 'Continuous scanning is off (SCHEDULER_ENABLED) — scans run when you trigger them.',
    },
  ] : [];

  return (
    <Card padding="sm" className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Data provenance</span>
      {items.length === 0 && <span className="text-xs text-slate-400">engine unreachable — provenance unknown</span>}
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5 text-xs" title={it.tip}>
          <span className={cn('h-2 w-2 rounded-full', it.ok ? 'bg-success-500' : 'bg-amber-400')} />
          <span className="text-slate-400">{it.label}</span>
          <span className={cn('font-semibold', it.ok ? 'text-slate-700' : 'text-amber-700')}>{it.value}</span>
        </span>
      ))}
    </Card>
  );
}

function HealthChip({ icon: Icon, ok, okText, badText }: { icon: LucideIcon; ok: boolean; okText: string; badText: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold',
        ok ? 'bg-success-100 text-success-700' : 'bg-amber-100 text-amber-700')}
      title={ok ? okText : badText}
    >
      <Icon size={12} />
      <span className={cn('h-1.5 w-1.5 rounded-full', ok ? 'bg-success-500' : 'bg-amber-500')} />
      {ok ? okText : badText}
    </span>
  );
}

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="text-right">
      <p className="font-mono text-lg font-semibold tabular-nums text-slate-700">
        {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </p>
      <p className="text-[11px] text-slate-400">
        {now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} · Indian Ocean
      </p>
    </div>
  );
}

function InboxRow({ alert: a, onAck, acking }: { alert: Alert; onAck: () => void; acking: boolean }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className={cn('group flex items-start gap-3 px-4 py-2.5', a.isAcked && 'opacity-60')}
    >
      <SeverityPill severity={a.severity} animated={a.severity === 'HIGH' && !a.isAcked} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-700">{a.title}</p>
        <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-400">{a.message}</p>
      </div>
      <span className="shrink-0 whitespace-nowrap font-mono text-[10px] text-slate-400">{timeAgo(a.createdAt)}</span>
      {a.isAcked ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-success-700"><Check size={13} /></span>
      ) : (
        <div className="flex shrink-0 items-center gap-1">
          {/* Dispatch appears on hover — one hop from alert to a field response */}
          <Link
            to="/app/operations"
            title="Dispatch a field response"
            aria-label={`Dispatch response for: ${a.title}`}
            className="hidden rounded-lg border border-border p-1.5 text-slate-500 transition-colors hover:border-ocean-300 hover:text-ocean-700 group-hover:inline-flex"
          >
            <Send size={13} />
          </Link>
          <button
            type="button"
            onClick={onAck}
            disabled={acking}
            aria-label={`Acknowledge: ${a.title}`}
            title="Acknowledge"
            className="rounded-lg border border-border p-1.5 text-slate-500 transition-colors hover:border-ocean-300 hover:text-ocean-700 disabled:opacity-50"
          >
            <Check size={13} />
          </button>
        </div>
      )}
    </motion.div>
  );
}

function HotspotRow({ hotspot: h }: { hotspot: Hotspot }) {
  const urgent = h.etaHours != null && h.etaHours <= 24;
  return (
    <Link
      to={h.id ? `/app/hotspots/${h.id}` : '/app/records'}
      className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-ocean-50/60"
    >
      <SeverityPill severity={h.severity} />
      <span className="font-display font-semibold text-slate-700">{h.label}</span>
      <span className="font-mono text-[11px] text-slate-400">{formatCoords(h.centroidLat, h.centroidLon)}</span>
      <span className={cn('ml-auto inline-flex items-center gap-1 font-mono text-xs',
        urgent ? 'font-bold text-red-600' : h.etaHours != null ? 'text-amber-600' : 'text-slate-400')}>
        {urgent && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />}
        {h.etaHours != null ? `reaches coast in ~${Math.round(h.etaHours)}h` : 'still in open ocean'}
      </span>
    </Link>
  );
}

function LiveEventRow({ event }: { event: LiveEvent }) {
  const t = new Date(event.at).toLocaleTimeString();
  if (event.type === 'run') {
    return (
      <div className="flex items-center gap-2 px-4 py-2 text-xs">
        <Badge variant="ocean">run</Badge>
        <span className="text-slate-600">
          <b>{String(event.region)}</b> — {Number(event.detections)} detections, {Number(event.hotspots)} hotspots
          {Number(event.alerts) > 0 && <span className="font-semibold text-red-600"> · {Number(event.alerts)} new alert(s)</span>}
        </span>
        <span className="ml-auto shrink-0 font-mono text-slate-400">{t}</span>
      </div>
    );
  }
  if (event.type === 'alert') {
    return (
      <div className="flex items-center gap-2 px-4 py-2 text-xs">
        <Badge variant="danger">alert</Badge>
        <span className="truncate font-medium text-slate-700">{String(event.title)}</span>
        <span className="ml-auto shrink-0 font-mono text-slate-400">{t}</span>
      </div>
    );
  }
  if (event.type === 'job') {
    return (
      <div className="flex items-center gap-2 px-4 py-2 text-xs">
        <Badge variant={event.state === 'completed' ? 'success' : 'warn'}>job</Badge>
        <span className="text-slate-500">{String(event.name)} · {String(event.state)}</span>
        <span className="ml-auto shrink-0 font-mono text-slate-400">{t}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 px-4 py-2 text-xs">
      <Badge variant="neutral">{event.type}</Badge>
      <span className="text-slate-500">{Number(event.regions) || ''} region run(s) enqueued</span>
      <span className="ml-auto shrink-0 font-mono text-slate-400">{t}</span>
    </div>
  );
}

/* Local count-up for the gauge + vitals (mirrors StatCard's easing). */
function useCountUp(target: number, duration = 900, active = true) {
  const [n, setN] = useState(active ? 0 : target);
  const raf = useRef(0);
  useEffect(() => {
    if (!active) { setN(target); return; }
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setN(Math.round(from + (target - from) * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration, active]);
  return n;
}
