import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Waves, Anchor, ServerCog, BellRing, Check, Clock, Inbox } from 'lucide-react';
import { PageHeader, Card, Badge, SeverityPill, SkeletonCard } from '@/components';
import { useAlerts, useAckAlert } from '@/hooks/useApi';
import type { Alert, AlertType, Severity } from '@/types';

const TYPE_META: Record<AlertType, { icon: typeof Flame; label: string }> = {
  HOTSPOT: { icon: Flame, label: 'Hotspot' },
  COAST_PROXIMITY: { icon: Waves, label: 'Coast proximity' },
  INFRASTRUCTURE: { icon: Anchor, label: 'Infrastructure' },
  SYSTEM: { icon: ServerCog, label: 'System' },
};

const SEV_FILTERS: { value: '' | Severity; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];

type StatusFilter = 'all' | 'open' | 'acked';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function Alerts() {
  const [severity, setSeverity] = useState<'' | Severity>('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const { data, isLoading } = useAlerts({
    severity: severity || undefined,
    acked: status === 'all' ? undefined : status === 'acked',
  });
  const ack = useAckAlert();

  const alerts = data ?? [];
  const openCount = alerts.filter((a) => !a.isAcked).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alerts"
        subtitle="Hotspot, drift, and system notifications — acknowledge to clear them from the active queue."
        badge={<Badge variant={openCount > 0 ? 'danger' : 'success'} dot>{openCount} open</Badge>}
        actions={
          <div className="flex items-center gap-1 rounded-xl border border-border bg-white/70 p-1">
            {(['all', 'open', 'acked'] as StatusFilter[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={
                  'rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ' +
                  (status === s ? 'bg-ocean-600 text-white' : 'text-slate-500 hover:text-ocean-600')
                }
              >
                {s === 'acked' ? 'Acknowledged' : s}
              </button>
            ))}
          </div>
        }
      />

      {/* Severity filter */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Severity</span>
        <div className="flex items-center gap-1 rounded-xl border border-border bg-white/70 p-1">
          {SEV_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setSeverity(f.value)}
              className={
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ' +
                (severity === f.value ? 'bg-ocean-600 text-white' : 'text-slate-500 hover:text-ocean-600')
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {isLoading && Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}

        <AnimatePresence initial={false}>
          {alerts.map((alert, i) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              index={i}
              onAck={() => ack.mutate(alert.id)}
              acking={ack.isPending && ack.variables === alert.id}
            />
          ))}
        </AnimatePresence>

        {!isLoading && alerts.length === 0 && (
          <Card className="flex flex-col items-center gap-2 py-14 text-center">
            <Inbox size={30} className="text-ocean-300" />
            <p className="font-display text-lg font-semibold text-slate-700">No alerts</p>
            <p className="max-w-sm text-sm text-slate-400">
              Nothing matches these filters. New hotspot and drift alerts will appear here as the pipeline runs.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

function AlertRow({
  alert, index, onAck, acking,
}: { alert: Alert; index: number; onAck: () => void; acking: boolean }) {
  const meta = TYPE_META[alert.type] ?? { icon: BellRing, label: alert.type };
  const Icon = meta.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ delay: index * 0.03, duration: 0.3 }}
    >
      <Card accent hoverable className={'flex items-start gap-4 ' + (alert.isAcked ? 'opacity-70' : '')}>
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-ocean-50 text-ocean-600">
          <Icon size={20} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityPill severity={alert.severity} animated={alert.severity === 'HIGH' && !alert.isAcked} />
            <Badge variant="neutral">{meta.label}</Badge>
            <span className="inline-flex items-center gap-1 text-xs text-slate-400">
              <Clock size={11} /> {timeAgo(alert.createdAt)}
            </span>
          </div>
          <p className="mt-2 font-display text-sm font-bold text-slate-800">{alert.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">{alert.message}</p>
        </div>

        <div className="flex-shrink-0 self-center">
          {alert.isAcked ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-success-100 px-3 py-1.5 text-xs font-semibold text-success-700">
              <Check size={13} /> Acknowledged
            </span>
          ) : (
            <button
              type="button"
              onClick={onAck}
              disabled={acking}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-ocean-300 hover:text-ocean-700 disabled:opacity-50"
            >
              {acking ? 'Acknowledging…' : 'Acknowledge'}
            </button>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
