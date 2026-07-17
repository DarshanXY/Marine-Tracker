import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Flame, MapPin, Clock, Target, TrendingUp, ArrowRight } from 'lucide-react';
import { PageHeader, Card, Badge, SeverityPill, SkeletonCard, InfoTip } from '@/components';
import { useHotspots } from '@/hooks/useApi';
import type { Hotspot, Severity } from '@/types';

const SEV_FILTERS: { value: '' | Severity; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];

export default function Hotspots({ embedded = false }: { embedded?: boolean }) {
  const [severity, setSeverity] = useState<'' | Severity>('');
  const { data, isLoading } = useHotspots({ severity: severity || undefined, active: true });

  const sevFilter = (
    <div className="flex items-center gap-1 rounded-xl border border-border bg-white/70 p-1">
      {SEV_FILTERS.map((f) => (
        <button
          key={f.value}
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
  );

  return (
    <div className="space-y-6">
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-500">
            Nearby detections{' '}
            <InfoTip term="grouped into clusters">
              We group detections that sit within about 0.09° of each other when at least 3 are close together (DBSCAN).
            </InfoTip>
            , ranked by how much they need your attention, with the{' '}
            <InfoTip term="time to coast">
              An estimate of how long until the floating plastic reaches the shore.
            </InfoTip>
            .
          </p>
          {sevFilter}
        </div>
      ) : (
        <PageHeader
          title="Hotspots"
          subtitle="Nearby detections grouped into clusters (DBSCAN), ranked by how much they need your attention, with an estimated time to reach the coast."
          badge={data && <Badge variant="danger" dot>{data.length} active</Badge>}
          actions={sevFilter}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {isLoading && Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        {(data ?? []).map((h, i) => <HotspotCard key={h.id} hotspot={h} index={i} />)}
      </div>

      {data && data.length === 0 && (
        <Card className="py-12 text-center text-slate-400">
          No hotspots match this filter right now. Try switching to “All”, or check back later as new detections come in.
        </Card>
      )}
    </div>
  );
}

function HotspotCard({ hotspot: h, index }: { hotspot: Hotspot; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.4 }}
    >
      <Card accent hoverable className="flex h-full flex-col gap-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ocean-50 text-ocean-600">
              <Flame size={18} />
            </span>
            <div>
              <p className="font-display text-base font-bold text-slate-800">{h.label}</p>
              <p className="flex items-center gap-1 text-xs text-slate-400">
                <MapPin size={11} /> {h.regionName ?? h.regionCode}
              </p>
            </div>
          </div>
          <SeverityPill severity={h.severity} animated={h.severity === 'HIGH'} />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Metric icon={<Target size={13} />} label="Detections" value={String(h.detectionCount)} />
          <Metric icon={<TrendingUp size={13} />} label="Confidence" value={`${Math.round(h.confidence * 100)}%`} />
          <Metric
            icon={<Clock size={13} />}
            label="Time to coast"
            value={h.etaHours != null ? `${h.etaHours}h` : 'Open sea'}
          />
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-border/60 pt-3">
          <span className="font-mono text-xs text-slate-400">
            {h.centroidLat.toFixed(3)}, {h.centroidLon.toFixed(3)}
          </span>
          <Link
            to={`/app/hotspots/${h.id}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-ocean-600 hover:text-ocean-700"
          >
            Details <ArrowRight size={13} />
          </Link>
        </div>
      </Card>
    </motion.div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50/70 p-2.5 text-center">
      <span className="mx-auto mb-1 flex items-center justify-center text-ocean-500">{icon}</span>
      <p className="font-display text-sm font-bold text-slate-800">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}
