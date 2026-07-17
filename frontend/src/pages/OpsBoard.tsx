import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity, BellRing, Check, Flame, Layers, Loader2, Play,
  Satellite, ScanLine, Server, Wifi, WifiOff,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader, Card, Badge, SeverityPill } from '@/components';
import {
  useAlerts, useAckAlert, useDetections, useHotspots, usePipelineLogs,
  usePipelineStatus, useSatelliteStatus,
} from '@/hooks/useApi';
import { useLiveFeed, type LiveEvent } from '@/hooks/useLiveFeed';
import { api } from '@/lib/api';
import { formatCoords, cn } from '@/lib/utils';

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export default function OpsBoard() {
  const status = usePipelineStatus();
  const satellite = useSatelliteStatus();
  const alerts = useAlerts({ acked: false });
  const hotspots = useHotspots({ active: true });
  const pending = useDetections({ status: 'PENDING', limit: 8 });
  const logs = usePipelineLogs(18);
  const ack = useAckAlert();
  const feed = useLiveFeed();
  const [running, setRunning] = useState(false);

  const engineUp = status.data?.engine === 'online';
  const queueUp = status.data?.queue?.state === 'up';
  const counts = status.data?.queue?.counts;
  const live = satellite.data?.mode === 'live';

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

  // ETA-priority: hotspots heading for a coast first, soonest first.
  const priority = [...(hotspots.data ?? [])].sort((a, b) => {
    if (a.etaHours == null && b.etaHours == null) return b.detectionCount - a.detectionCount;
    if (a.etaHours == null) return 1;
    if (b.etaHours == null) return -1;
    return a.etaHours - b.etaHours;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations Board"
        subtitle="One screen for the duty officer — system health, open alerts, coast-bound hotspots, and the verification queue."
        badge={
          feed.connected
            ? <Badge variant="success" dot><span className="animate-pulse">LIVE</span> · WebSocket</Badge>
            : <Badge variant="neutral" dot>polling · socket reconnecting</Badge>
        }
        actions={
          <button
            type="button"
            onClick={runAllRegions}
            disabled={running || !engineUp}
            className="inline-flex items-center gap-2 rounded-xl bg-ocean-600 px-4 py-2 text-sm font-semibold text-white shadow-glow-primary transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            title={engineUp ? 'Run the pipeline for every monitored region' : 'Engine offline'}
          >
            {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
            Run all regions
          </button>
        }
      />

      {/* Health tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <HealthTile
          icon={Server} label="Python engine"
          ok={engineUp} okText="online" badText="offline"
          detail={status.data?.model?.mode ?? '—'}
        />
        <HealthTile
          icon={Layers} label="Queue (BullMQ)"
          ok={queueUp} okText="up" badText="down · direct mode"
          detail={counts ? `${counts.waiting ?? 0} waiting · ${counts.active ?? 0} active · ${counts.completed ?? 0} done` : 'runs execute synchronously'}
        />
        <HealthTile
          icon={Satellite} label="Satellite source"
          ok={live} okText="live Sentinel-2" badText="demo scenes"
          detail={satellite.data?.provider ?? '—'}
        />
        <HealthTile
          icon={BellRing} label="Open alerts"
          ok={(alerts.data?.length ?? 0) === 0} okText="all clear" badText={`${alerts.data?.length ?? 0} need attention`}
          detail={`${(alerts.data ?? []).filter((a) => a.severity === 'HIGH').length} high severity`}
          invert
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Open alerts */}
        <Card accent padding="none" className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-slate-800">
              <BellRing size={15} className="text-ocean-600" /> Open alerts
            </h3>
            <Badge variant={(alerts.data?.length ?? 0) > 0 ? 'danger' : 'success'}>{alerts.data?.length ?? 0}</Badge>
          </div>
          <div className="max-h-72 divide-y divide-border/50 overflow-y-auto">
            {(alerts.data ?? []).map((a) => (
              <div key={a.id} className="flex items-start gap-3 px-4 py-2.5">
                <SeverityPill severity={a.severity} animated={a.severity === 'HIGH'} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-700">{a.title}</p>
                  <p className="text-[11px] text-slate-400">{timeAgo(a.createdAt)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => ack.mutate(a.id)}
                  disabled={ack.isPending}
                  aria-label={`Acknowledge alert: ${a.title}`}
                  title="Acknowledge"
                  className="rounded-lg border border-border px-2 py-1 text-xs text-slate-500 hover:border-ocean-300 hover:text-ocean-700 disabled:opacity-50"
                >
                  <Check size={13} />
                </button>
              </div>
            ))}
            {alerts.data?.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-400">No open alerts.</p>}
          </div>
        </Card>

        {/* Coast-bound hotspots */}
        <Card accent padding="none" className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-slate-800">
              <Flame size={15} className="text-ocean-600" /> Priority hotspots <span className="text-xs font-normal text-slate-400">(soonest landfall first)</span>
            </h3>
          </div>
          <div className="max-h-72 divide-y divide-border/50 overflow-y-auto">
            {priority.slice(0, 8).map((h) => (
              <div key={h.id ?? h.label} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <SeverityPill severity={h.severity} />
                <span className="font-display font-semibold text-slate-700">{h.label}</span>
                <span className="font-mono text-[11px] text-slate-400">{formatCoords(h.centroidLat, h.centroidLon)}</span>
                <span className={cn(
                  'ml-auto font-mono text-xs',
                  h.etaHours != null && h.etaHours <= 24 ? 'font-bold text-red-600' : h.etaHours != null ? 'text-amber-600' : 'text-slate-400',
                )}>
                  {h.etaHours != null ? `⏱ coast in ~${Math.round(h.etaHours)}h` : 'open ocean'}
                </span>
              </div>
            ))}
            {priority.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-400">No active hotspots.</p>}
          </div>
        </Card>
      </div>

      {/* Live event feed (WebSocket push) */}
      <Card accent padding="none" className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-slate-800">
            <span className={cn('h-2 w-2 rounded-full', feed.connected ? 'animate-pulse bg-success-500' : 'bg-slate-300')} />
            Live event feed
          </h3>
          <span className="text-[11px] text-slate-400">
            {feed.connected ? 'pushed over WebSocket the moment they happen' : 'socket down — dashboards fall back to polling'}
          </span>
        </div>
        <div className="max-h-52 divide-y divide-border/50 overflow-y-auto">
          {feed.events.map((e, i) => <LiveEventRow key={`${e.at}-${i}`} event={e} />)}
          {feed.events.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-400">
              Waiting for events — run the pipeline (or draw an AOI on the map) and watch them land here instantly.
            </p>
          )}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Verification queue */}
        <Card accent padding="none" className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-slate-800">
              <ScanLine size={15} className="text-ocean-600" /> Awaiting verification
            </h3>
            <Badge variant="warn">{pending.data?.total ?? 0} pending</Badge>
          </div>
          <div className="max-h-64 divide-y divide-border/50 overflow-y-auto">
            {(pending.data?.data ?? []).map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <Badge variant={d.classification === 'Plastic' ? 'ocean' : 'neutral'}>{d.classification.replace('_', ' ')}</Badge>
                <span className="font-mono text-[11px] text-slate-400">{formatCoords(d.lat, d.lon)}</span>
                <span className="ml-auto font-mono text-xs text-slate-500">{Math.round(d.confidence * 100)}% · FDI {d.fdiScore.toFixed(3)}</span>
              </div>
            ))}
            {pending.data?.data?.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-400">Verification queue is empty.</p>}
          </div>
        </Card>

        {/* Pipeline activity */}
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
                <span className={cn(
                  'h-2 w-2 shrink-0 rounded-full',
                  l.status === 'COMPLETED' ? 'bg-success-500' : l.status === 'FAILED' ? 'bg-red-500' : 'bg-amber-400',
                )} />
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

function HealthTile({ icon: Icon, label, ok, okText, badText, detail, invert = false }: {
  icon: typeof Server; label: string; ok: boolean; okText: string; badText: string; detail: string; invert?: boolean;
}) {
  const good = ok;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass card-accent p-4">
      <div className="flex items-center justify-between">
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', good ? 'bg-success-100 text-success-700' : invert ? 'bg-red-50 text-red-500' : 'bg-amber-100 text-amber-600')}>
          <Icon size={16} />
        </span>
        {good ? <Wifi size={14} className="text-success-500" /> : <WifiOff size={14} className={invert ? 'text-red-400' : 'text-amber-500'} />}
      </div>
      <p className="mt-2 font-display text-sm font-bold text-slate-800">{label}</p>
      <p className={cn('text-xs font-semibold', good ? 'text-success-700' : invert ? 'text-red-600' : 'text-amber-600')}>
        {good ? okText : badText}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-slate-400">{detail}</p>
    </motion.div>
  );
}
