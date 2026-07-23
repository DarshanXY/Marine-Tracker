/**
 * LiveStatusRail — the pulse of the platform across the top of the Dashboard:
 * engine, model, scan queue, satellite feed and the Clay embedding store. Auto-
 * refreshes through the underlying React-Query polling, so it always reads live.
 * Pure ocean/teal system; a soft ping ring marks a healthy signal.
 */
import { motion } from 'framer-motion';
import { Cpu, BrainCircuit, ListChecks, Satellite, ShieldCheck, type LucideIcon } from 'lucide-react';
import { usePipelineStatus, useSatelliteStatus, useSimilarityInfo } from '@/hooks/useApi';
import { cn } from '@/lib/utils';

type Tone = 'ok' | 'warn' | 'off' | 'info';
const DOT: Record<Tone, string> = { ok: 'bg-teal-500', warn: 'bg-amber-500', off: 'bg-rose-500', info: 'bg-ocean-400' };

function StatusTile({ icon: Icon, label, value, tone, i }: {
  icon: LucideIcon; label: string; value: string; tone: Tone; i: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
      className="flex min-w-[150px] flex-1 items-center gap-3 rounded-xl border border-border/70 bg-white/70 px-3.5 py-3"
    >
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-ocean-50 text-ocean-600">
        <Icon size={17} />
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            {tone === 'ok' && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-60" />}
            <span className={cn('relative inline-flex h-2 w-2 rounded-full', DOT[tone])} />
          </span>
          <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
        </div>
        <p className="truncate text-sm font-semibold text-slate-700">{value}</p>
      </div>
    </motion.div>
  );
}

export function LiveStatusRail() {
  const pipeline = usePipelineStatus();
  const sat = useSatelliteStatus();
  const sim = useSimilarityInfo();

  const p = pipeline.data;
  const engineOnline = p?.engine === 'online';
  const modelLoaded = p?.model_loaded ?? p?.model?.loaded ?? false;
  const queue = p?.queue;
  const satLive = sat.data?.mode === 'live';
  const embedded = sim.data?.siteStore?.embeddedSites ?? 0;
  // Clay 2nd-stage verifier: available ⇒ every scan gets CONFIRMED/POSSIBLE tiers
  // (≈0.92 plastic precision). Enabled-but-offline is a LOUD warn, not a silent gap.
  const clayAvailable = p?.clay?.available ?? false;
  const clayEnabled = p?.clay?.enabled ?? false;

  const queueValue = queue
    ? queue.state === 'up'
      ? `Ready${queue.counts ? ` · ${Object.values(queue.counts).reduce((a, b) => a + b, 0)} jobs` : ''}`
      : 'Down'
    : engineOnline ? 'Idle' : '—';

  return (
    <div className="flex flex-wrap gap-3">
      <StatusTile i={0} icon={Cpu} label="Engine" tone={engineOnline ? 'ok' : 'off'}
        value={engineOnline ? (p?.phase ?? 'Online') : 'Offline'} />
      <StatusTile i={1} icon={BrainCircuit} label="Model" tone={modelLoaded ? 'ok' : 'warn'}
        value={modelLoaded ? (p?.model?.mode ?? 'Loaded') : 'Heuristic'} />
      <StatusTile i={2} icon={ListChecks} label="Scan queue" tone={queue?.state === 'down' ? 'warn' : engineOnline ? 'ok' : 'off'}
        value={queueValue} />
      <StatusTile i={3} icon={Satellite} label="Satellite" tone={satLive ? 'ok' : 'info'}
        value={satLive ? 'Live feed' : 'Demo data'} />
      <StatusTile i={4} icon={ShieldCheck} label="Clay verifier"
        tone={clayAvailable ? 'ok' : clayEnabled ? 'off' : 'info'}
        value={clayAvailable ? `Verifying${embedded > 0 ? ` · ${embedded} sites` : ''}` : clayEnabled ? 'OFFLINE — start sidecar' : 'Disabled'} />
    </div>
  );
}
