/**
 * Active Learning — the human-in-the-loop that was buried in a detection drawer.
 * Coast Guard / Admin review PENDING detections, confirm real plastic or flag
 * false alarms, and export the validated set to retrain the model. Same ocean/teal
 * theme + UI kit; labelling is role-gated (level >= COASTGUARD).
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Ban, Download, GraduationCap, Inbox, CircleCheck, CircleX, Target } from 'lucide-react';
import { PageHeader, Card, Badge } from '@/components';
import { useDetections, useLabelDetection, useTrainingLabels, useRegions } from '@/hooks/useApi';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { cn, formatCoords } from '@/lib/utils';
import { ROLE_LEVEL } from '@/types';
import type { Detection } from '@/types';

const CLASS_OPTIONS = ['', 'Plastic', 'Algae', 'Sea_Foam', 'Water'];
const RETRAIN_TARGET = 50; // labels needed before a retrain round is worthwhile

export default function ActiveLearning() {
  const { user } = useAuthStore();
  const canValidate = (user?.level ?? 0) >= ROLE_LEVEL.COASTGUARD;
  const [region, setRegion] = useState('');
  const [classification, setClassification] = useState('');

  const regions = useRegions();
  const queue = useDetections({
    status: 'PENDING',
    region: region || undefined,
    classification: classification || undefined,
    limit: 100,
  });
  const labels = useTrainingLabels();
  const label = useLabelDetection();

  const pending = queue.data?.total ?? 0;
  const confirmed = labels.data?.confirmed ?? 0;
  const falseAlarm = labels.data?.falseAlarm ?? 0;
  const totalLabelled = labels.data?.total ?? 0;
  const readiness = Math.min(100, Math.round((totalLabelled / RETRAIN_TARGET) * 100));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Active Learning"
        subtitle="Review pending detections, confirm real plastic or flag false alarms, and export the validated set to retrain the model."
        badge={
          <div className="flex items-center gap-2">
            <Badge variant="warn">{pending} pending</Badge>
            {canValidate && (
              <button
                type="button"
                onClick={() => { void api.exportTrainingLabels(); }}
                title="Download the validated set (CONFIRMED + FALSE_ALARM) as CSV"
                className="inline-flex items-center gap-1.5 rounded-lg border border-ocean-200 bg-ocean-50 px-3 py-1.5 text-xs font-medium text-ocean-700 hover:bg-ocean-100"
              >
                <Download size={13} /> Export labelled set
              </button>
            )}
          </div>
        }
      />

      {/* Stat tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile icon={Inbox} tone="amber" value={pending} label="Awaiting review" sub="pending detections" />
        <StatTile icon={CircleCheck} tone="teal" value={confirmed} label="Confirmed plastic" sub="positive labels" />
        <StatTile icon={CircleX} tone="rose" value={falseAlarm} label="False alarms" sub="negative labels" />
        <Card>
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-ocean-50 text-ocean-600"><Target size={17} /></span>
            <div>
              <p className="font-display text-xl font-bold text-slate-800">{totalLabelled}<span className="text-sm font-medium text-slate-400"> / {RETRAIN_TARGET}</span></p>
              <p className="text-[11px] text-slate-400">retrain readiness</p>
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <motion.div
              className={cn('h-full rounded-full', readiness >= 100 ? 'bg-teal-500' : 'bg-ocean-500')}
              initial={{ width: 0 }} animate={{ width: `${readiness}%` }} transition={{ duration: 0.6 }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            {readiness >= 100 ? 'Enough labels for a retrain round.' : `${RETRAIN_TARGET - totalLabelled} more to a retrain round.`}
          </p>
        </Card>
      </div>

      {/* Filters + queue */}
      <Card padding="none" accent className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-border/70 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <GraduationCap size={16} className="text-ocean-600" /> Review queue
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter by region" value={region} onChange={(e) => setRegion(e.target.value)}
              className="rounded-lg border border-border bg-white/80 px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-ocean-400"
            >
              <option value="">All regions</option>
              {(regions.data ?? []).map((r) => <option key={r.code} value={r.code}>{r.code}</option>)}
            </select>
            <select
              aria-label="Filter by class" value={classification} onChange={(e) => setClassification(e.target.value)}
              className="rounded-lg border border-border bg-white/80 px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-ocean-400"
            >
              {CLASS_OPTIONS.map((c) => <option key={c} value={c}>{c === '' ? 'All classes' : c.replace('_', ' ')}</option>)}
            </select>
          </div>
        </div>

        {!canValidate && (
          <div className="border-b border-border/70 bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
            You're viewing the queue read-only. Sign in as <span className="font-semibold">Coast Guard</span> or
            <span className="font-semibold"> Admin</span> to confirm or reject detections.
          </div>
        )}

        <div className="divide-y divide-border/60">
          {queue.isLoading && <div className="px-4 py-10 text-center text-sm text-slate-400">Loading queue…</div>}
          {!queue.isLoading && (queue.data?.data.length ?? 0) === 0 && (
            <div className="px-4 py-12 text-center">
              <CircleCheck className="mx-auto text-teal-500" size={28} />
              <p className="mt-2 text-sm font-medium text-slate-600">Queue clear</p>
              <p className="text-xs text-slate-400">No pending detections match these filters.</p>
            </div>
          )}
          {(queue.data?.data ?? []).map((d) => (
            <QueueRow key={d.id} d={d} canValidate={canValidate}
              busy={label.isPending && label.variables?.id === d.id}
              onLabel={(status) => label.mutate({ id: d.id, status })} />
          ))}
        </div>
      </Card>

      <p className="text-xs text-slate-400">
        Confirmed and false-alarm labels are the ground truth the next training round learns from — the loop that turns
        analyst review into model improvement.
      </p>
    </div>
  );
}

function QueueRow({ d, canValidate, busy, onLabel }: {
  d: Detection; canValidate: boolean; busy: boolean;
  onLabel: (s: 'CONFIRMED' | 'FALSE_ALARM') => void;
}) {
  const pct = Math.round(d.confidence * 100);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-ocean-50/40">
      <span className="w-10 font-mono text-xs font-semibold text-slate-500">{d.regionCode ?? '—'}</span>
      <Badge variant={d.classification === 'Plastic' ? 'ocean' : 'neutral'}>{d.classification.replace('_', ' ')}</Badge>
      <span className="font-mono text-xs text-slate-500">{formatCoords(d.lat, d.lon)}</span>
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 85 ? '#0D9488' : pct >= 70 ? '#14B8A6' : '#F59E0B' }} />
        </div>
        <span className="font-mono text-xs text-slate-500">{pct}%</span>
      </div>
      <span className="font-mono text-[11px] text-slate-400">FDI {d.fdiScore.toFixed(3)}</span>
      {canValidate && (
        <div className="ml-auto flex gap-2">
          <button type="button" disabled={busy} onClick={() => onLabel('CONFIRMED')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700 transition hover:bg-teal-100 disabled:opacity-60">
            <Check size={13} /> Confirm
          </button>
          <button type="button" disabled={busy} onClick={() => onLabel('FALSE_ALARM')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-60">
            <Ban size={13} /> False alarm
          </button>
        </div>
      )}
    </div>
  );
}

function StatTile({ icon: Icon, tone, value, label, sub }: {
  icon: typeof Inbox; tone: 'amber' | 'teal' | 'rose'; value: number; label: string; sub: string;
}) {
  const tones = {
    amber: 'bg-amber-50 text-amber-600',
    teal: 'bg-teal-50 text-teal-600',
    rose: 'bg-rose-50 text-rose-600',
  } as const;
  return (
    <Card>
      <div className="flex items-center gap-3">
        <span className={cn('grid h-9 w-9 place-items-center rounded-lg', tones[tone])}><Icon size={17} /></span>
        <div>
          <p className="font-display text-2xl font-bold text-slate-800">{value}</p>
          <p className="text-[11px] text-slate-400">{label}</p>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">{sub}</p>
    </Card>
  );
}
