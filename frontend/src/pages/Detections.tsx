import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, X, Cpu, Activity, AlertTriangle, Check, Ban, RotateCcw, Download, ShieldCheck, ArrowUpRight } from 'lucide-react';
import { PageHeader, Card, Table, Badge, SeverityPill, InfoTip, type ColumnDef } from '@/components';
import { useDetections, useLabelDetection, usePipelineStatus, useRegions } from '@/hooks/useApi';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { formatArea, formatCoords } from '@/lib/utils';
import { ROLE_LEVEL } from '@/types';
import type { Detection, DetectionStatus, ModelInfo } from '@/types';

const STATUS_OPTIONS: { value: '' | DetectionStatus; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'FALSE_ALARM', label: 'False alarm' },
];

const CLASS_OPTIONS = ['', 'Plastic', 'Algae', 'Sea_Foam', 'Water'];
const CONF_OPTIONS = [
  { value: 0, label: 'Any confidence' },
  { value: 0.6, label: '≥ 60%' },
  { value: 0.8, label: '≥ 80%' },
  { value: 0.9, label: '≥ 90%' },
];

function StatusChip({ status }: { status: DetectionStatus }) {
  const map = { CONFIRMED: 'success', PENDING: 'warn', FALSE_ALARM: 'neutral' } as const;
  return <Badge variant={map[status]}>{status.replace('_', ' ').toLowerCase()}</Badge>;
}

export default function Detections({ embedded = false }: { embedded?: boolean }) {
  const [region, setRegion] = useState('');
  const [status, setStatus] = useState<'' | DetectionStatus>('');
  const [classification, setClassification] = useState('');
  const [minConfidence, setMinConfidence] = useState(0);
  const [days, setDays] = useState(0); // 0 = all time
  const [selected, setSelected] = useState<Detection | null>(null);

  const { user } = useAuthStore();
  const canValidate = (user?.level ?? 0) >= ROLE_LEVEL.COASTGUARD;
  const regions = useRegions();
  const pipelineStatus = usePipelineStatus();
  const { data, isLoading } = useDetections({
    region: region || undefined,
    status: status || undefined,
    classification: classification || undefined,
    minConfidence: minConfidence || undefined,
    days: days || undefined,
    limit: 200,
  });

  const columns: ColumnDef<Detection>[] = [
    { key: 'region', header: 'Region', accessor: (d) => <span className="font-semibold text-slate-700">{d.regionCode ?? '—'}</span>, sortable: true },
    { key: 'class', header: 'Class', accessor: (d) => <Badge variant={d.classification === 'Plastic' ? 'ocean' : 'neutral'}>{d.classification.replace('_', ' ')}</Badge> },
    { key: 'coords', header: 'Location', accessor: (d) => <span className="font-mono text-xs text-slate-500">{formatCoords(d.lat, d.lon)}</span> },
    { key: 'conf', header: 'Confidence', accessor: (d) => <ConfidenceBar value={d.confidence} />, sortable: true },
    { key: 'fdi', header: 'FDI', accessor: (d) => <span className="font-mono text-xs">{d.fdiScore.toFixed(3)}</span>, sortable: true },
    { key: 'area', header: 'Area', accessor: (d) => <span className="font-mono text-xs">{formatArea(d.areaSqKm)}</span>, sortable: true },
    { key: 'status', header: 'Status', accessor: (d) => <StatusChip status={d.status} /> },
    { key: 'date', header: 'Detected', accessor: (d) => <span className="text-xs text-slate-400">{new Date(d.createdAt).toLocaleDateString('en-IN')}</span>, sortable: true },
    {
      key: 'why', header: '',
      accessor: (d) => (
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => setSelected(d)}
            aria-label={`Explain detection at ${formatCoords(d.lat, d.lon)}`}
            title="Why was this classified this way?"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-ocean-50 hover:text-ocean-600"
          >
            <HelpCircle size={15} />
          </button>
          <Link
            to={`/app/detections/${d.id}`}
            aria-label={`Open detail for detection ${d.id}`}
            title="Open full detail"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-ocean-50 hover:text-ocean-600"
          >
            <ArrowUpRight size={15} />
          </Link>
        </div>
      ),
    },
  ];

  const toolbar = (
    <div className="flex items-center gap-2">
      {data && <Badge variant="ocean">{data.total} total</Badge>}
      {canValidate && (
        <button
          type="button"
          onClick={() => { void api.exportTrainingLabels(); }}
          title="Download the human-checked detections (confirmed + false alarm) as a CSV used to retrain the model"
          className="inline-flex items-center gap-1.5 rounded-lg border border-ocean-200 bg-ocean-50 px-3 py-1.5 text-xs font-medium text-ocean-700 hover:bg-ocean-100"
        >
          <Download size={13} /> Export labeled set
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-500">
            Every possible piece of floating debris spotted in free satellite imagery (Sentinel-2), with its
            plastic signal (FDI) and how sure the model is.
          </p>
          {toolbar}
        </div>
      ) : (
        <PageHeader
          title="Detections"
          subtitle="Every possible piece of floating debris found in free satellite imagery (Sentinel-2), with its plastic signal (FDI) and how sure the model is."
          badge={toolbar}
        />
      )}

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="flex flex-wrap items-end gap-4">
          <Filter label="Region">
            <select aria-label="Filter by region" value={region} onChange={(e) => setRegion(e.target.value)} className={selectCls}>
              <option value="">All regions</option>
              {(regions.data ?? []).map((r) => (
                <option key={r.code} value={r.code}>{r.code} — {r.displayName}</option>
              ))}
            </select>
          </Filter>
          <Filter label="Status">
            <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value as '' | DetectionStatus)} className={selectCls}>
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Filter>
          <Filter label="Classification">
            <select aria-label="Filter by classification" value={classification} onChange={(e) => setClassification(e.target.value)} className={selectCls}>
              {CLASS_OPTIONS.map((c) => <option key={c} value={c}>{c === '' ? 'All classes' : c.replace('_', ' ')}</option>)}
            </select>
          </Filter>
          <Filter label="Min. confidence">
            <select aria-label="Filter by minimum confidence" value={minConfidence} onChange={(e) => setMinConfidence(Number(e.target.value))} className={selectCls}>
              {CONF_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Filter>
          {/* Time-window slider */}
          <Filter label={days === 0 ? 'Time window · all time' : `Time window · last ${days} day${days > 1 ? 's' : ''}`}>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={90}
                step={1}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="h-2 w-44 cursor-pointer appearance-none rounded-full bg-slate-200 accent-ocean-600"
                aria-label="Only show detections from the last N days (0 = all time)"
              />
              <span className="w-14 font-mono text-xs text-slate-500">{days === 0 ? 'all' : `${days}d`}</span>
            </div>
          </Filter>
          {(region || status || classification || minConfidence > 0 || days > 0) && (
            <button
              type="button"
              onClick={() => { setRegion(''); setStatus(''); setClassification(''); setMinConfidence(0); setDays(0); }}
              className="ml-auto rounded-lg border border-border px-3 py-2 text-sm text-slate-500 hover:border-ocean-300 hover:text-ocean-700"
            >
              Clear filters
            </button>
          )}
        </Card>
      </motion.div>

      <Card accent padding="none" className="overflow-hidden">
        <Table
          columns={columns}
          data={data?.data ?? []}
          rowKey={(d) => d.id}
          loading={isLoading}
          emptyMessage="Nothing matches these filters yet. Try widening the time window or lowering the minimum confidence to see more."
        />
      </Card>

      <p className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <SeverityPill severity="LOW" /> The{' '}
        <InfoTip term="FDI">A “Floating Debris Index” — a spectral clue that material is floating on the water rather than below it. Higher means a stronger plastic signal.</InfoTip>{' '}
        column is the plastic signal for each spot. Confidence is{' '}
        <InfoTip term="Confidence">How sure the model is about the class it chose, from 0 to 100%. It is not a guarantee the spot is plastic.</InfoTip>{' '}
        the model{"'"}s certainty. “Confirmed” rows have been checked by a person. Click{' '}
        <HelpCircle size={13} className="inline" /> on any row for a step-by-step explanation.
      </p>

      <ExplainDrawer detection={selected} model={pipelineStatus.data?.model} canValidate={canValidate} onClose={() => setSelected(null)} />
    </div>
  );
}

/** "Why this detection?" — the transparent, examiner-friendly explanation of a
 *  single classification, built from real values (FDI vs threshold, model card). */
function ExplainDrawer({ detection: d, model, canValidate, onClose }: {
  detection: Detection | null; model?: ModelInfo; canValidate: boolean; onClose: () => void;
}) {
  const THRESHOLD = 0.02;
  const recall = d && model?.metrics?.perClass?.[d.classification]?.recall;
  const label = useLabelDetection();
  // The list row is a stale copy until refetch; reflect the new verdict locally.
  const [localStatus, setLocalStatus] = useState<DetectionStatus | null>(null);
  useEffect(() => { setLocalStatus(null); }, [d?.id]);
  const status = localStatus ?? d?.status ?? 'PENDING';
  const applyLabel = (next: DetectionStatus) => {
    if (!d) return;
    setLocalStatus(next);
    label.mutate({ id: d.id, status: next });
  };
  return (
    <AnimatePresence>
      {d && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-slate-900/30"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: 420 }} animate={{ x: 0 }} exit={{ x: 420 }}
            transition={{ type: 'tween', duration: 0.25 }}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-border/70 bg-white p-5 shadow-glass"
            aria-label="Detection explanation"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-slate-800">Why this detection?</h3>
              <button type="button" onClick={onClose} aria-label="Close explanation" className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>
            <p className="mt-1 font-mono text-xs text-slate-400">{formatCoords(d.lat, d.lon)} · {d.regionCode ?? 'AOI'} · {new Date(d.createdAt).toLocaleString('en-IN')}</p>

            {/* Step 1 — FDI */}
            <div className="mt-5 space-y-2 rounded-xl border border-border/70 p-4">
              <p className="flex items-center gap-2 font-display text-sm font-bold text-slate-700">
                <Activity size={14} className="text-ocean-600" /> 1 · Plastic signal{' '}
                <InfoTip term="FDI">“Floating Debris Index” — a spectral clue that material is floating on the water rather than below it.</InfoTip>
              </p>
              <p className="text-xs leading-relaxed text-slate-500">
                We look at how the water reflects near-infrared light. Floating material reflects more than the
                surrounding water, so it stands out above the water{"'"}s baseline. The plastic signal (FDI)
                measures that gap — the satellite compares band B08 against a baseline drawn between bands B06 and B11.
              </p>
              <div className="relative mt-2 h-3 rounded-full bg-slate-100">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-ocean-300 to-ocean-600"
                  style={{ width: `${Math.min(100, (d.fdiScore / 0.08) * 100)}%` }}
                />
                <div className="absolute inset-y-0 w-0.5 bg-red-400" style={{ left: `${(THRESHOLD / 0.08) * 100}%` }} title={`Cut-off for a candidate: ${THRESHOLD}`} />
              </div>
              <p className="text-[11px] text-slate-400">
                The red line is the cut-off. Spots to the right of it have a strong enough signal to be worth a closer look.
              </p>
              <p className="font-mono text-xs text-slate-600">
                FDI <b>{d.fdiScore.toFixed(4)}</b> {d.fdiScore > THRESHOLD ? '>' : '≤'} cut-off {THRESHOLD} →{' '}
                <b className={d.fdiScore > THRESHOLD ? 'text-ocean-700' : 'text-slate-500'}>
                  {d.fdiScore > THRESHOLD ? 'strong enough to check' : 'below the cut-off'}
                </b>
              </p>
            </div>

            {/* Step 2 — classification */}
            <div className="mt-3 space-y-2 rounded-xl border border-border/70 p-4">
              <p className="flex items-center gap-2 font-display text-sm font-bold text-slate-700">
                <Cpu size={14} className="text-ocean-600" /> 2 · What the AI thinks it is
              </p>
              <p className="text-xs leading-relaxed text-slate-500">
                {model?.loaded
                  ? <>The trained AI model (<b>{model.mode}</b>, {model.metrics?.arch ?? 'ONNX model'}) read the colours reflected at this spot and sorted it into a class.</>
                  : <>A simpler rule-based check (using the plastic signal, plant-greenness and brightness) sorted this spot — no trained AI model was loaded at the time, so treat it with extra care.</>}
              </p>
              <div className="flex items-center gap-2">
                <Badge variant={d.classification === 'Plastic' ? 'ocean' : 'neutral'}>{d.classification.replace('_', ' ')}</Badge>
                <span className="font-mono text-sm font-bold text-slate-700">{Math.round(d.confidence * 100)}%{' '}
                  <InfoTip term="confidence">How sure the model is about the class it chose. Higher is more certain, but it is not proof the spot is plastic.</InfoTip>
                </span>
              </div>
              {model?.metrics && (
                <p className="text-[11px] text-slate-400">
                  On unseen test data (held-out), the model was right about{' '}
                  {Math.round((model.metrics.testAccuracy ?? 0) * 100)}% of the time
                  {recall != null && <> · of the real {d.classification.replace('_', ' ')} spots it caught {Math.round(recall * 100)}%</>}
                  {' '}(measured on the real MARIDA + MADOS test set).
                </p>
              )}
            </div>

            {/* Step 3 — status + honest caveats */}
            <div className="mt-3 space-y-2 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
              <p className="flex items-center gap-2 font-display text-sm font-bold text-amber-700">
                <AlertTriangle size={14} /> Read this before acting
              </p>
              <ul className="list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-amber-800/90">
                <li>Status is <b>{status.replace('_', ' ').toLowerCase()}</b> — {status === 'CONFIRMED' ? 'a person has confirmed this as real plastic.' : status === 'FALSE_ALARM' ? 'a person marked this a false alarm.' : 'no one has checked it yet, so it is the AI’s guess for now.'}</li>
                <li>Muddy, <b>sediment-heavy water</b> near the coast and thin haze can push the plastic signal up on their own. So false alarms tend to bunch up near river mouths during the monsoon.</li>
                <li>
                  The main model is a small neural network that looks at each pixel{"'"}s colours (a{' '}
                  <InfoTip term="per-pixel MLP">A multilayer perceptron with layers 11→64→32→16→4: it takes 11 spectral inputs and sorts each pixel into one of four classes.</InfoTip>),
                  trained on the real MARIDA + MADOS datasets. It scores{' '}
                  <b>98.9% accuracy on unseen test data</b> and a{' '}
                  <InfoTip term="0.79 macro-F1">A balanced accuracy score that averages performance across all four classes, so rare classes count as much as common ones (0–1, higher is better).</InfoTip>{' '}
                  of <b>0.79</b>. A second AI model (<InfoTip term="Clay">A foundation model that builds a visual “fingerprint” of a site and compares it against known reference locations.</InfoTip>)
                  casts a wider net to flag <b>“possible plastic”</b> the first model may miss.
                </li>
                <li>Detected footprint: <b>{formatArea(d.areaSqKm)}</b> — the physical area of the flagged pixels at 10 m resolution, not a measured slick size.</li>
              </ul>
            </div>

            {/* Step 4 — analyst validation → active learning */}
            <div className="mt-3 space-y-2 rounded-xl border border-border/70 p-4">
              <p className="flex items-center gap-2 font-display text-sm font-bold text-slate-700">
                <ShieldCheck size={14} className="text-ocean-600" /> Analyst validation
              </p>
              <p className="text-xs leading-relaxed text-slate-500">
                Your decision becomes a trusted example. Confirmed and false-alarm labels are exported and fed
                back in to retrain the model, so it learns from your calls and improves over time (active learning).
                {canValidate ? ' Saved against your account.' : ''}
              </p>
              {canValidate ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  <LabelBtn active={status === 'CONFIRMED'} tone="confirm" busy={label.isPending}
                    onClick={() => applyLabel('CONFIRMED')}>
                    <Check size={13} /> Confirm plastic
                  </LabelBtn>
                  <LabelBtn active={status === 'FALSE_ALARM'} tone="reject" busy={label.isPending}
                    onClick={() => applyLabel('FALSE_ALARM')}>
                    <Ban size={13} /> False alarm
                  </LabelBtn>
                  {status !== 'PENDING' && (
                    <LabelBtn active={false} tone="neutral" busy={label.isPending}
                      onClick={() => applyLabel('PENDING')}>
                      <RotateCcw size={13} /> Reset
                    </LabelBtn>
                  )}
                </div>
              ) : (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                  Sign in as Coast Guard or Admin to validate detections.
                </p>
              )}
              {label.isError && (
                <p className="text-[11px] text-rose-600">Could not save — check you are signed in with validation rights.</p>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function LabelBtn({ active, tone, busy, onClick, children }: {
  active: boolean; tone: 'confirm' | 'reject' | 'neutral'; busy: boolean;
  onClick: () => void; children: React.ReactNode;
}) {
  const tones = {
    confirm: active ? 'bg-teal-600 text-white border-teal-600' : 'border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100',
    reject: active ? 'bg-rose-600 text-white border-rose-600' : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
    neutral: 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100',
  } as const;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-60 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

const selectCls =
  'rounded-lg border border-border bg-white/80 px-3 py-2 text-sm text-slate-700 outline-none focus:border-ocean-400 focus:input-glow';

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 85 ? '#0D9488' : pct >= 70 ? '#14B8A6' : '#F59E0B';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="font-mono text-xs text-slate-500">{pct}%</span>
    </div>
  );
}
