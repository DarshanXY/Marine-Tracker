/**
 * Model Health — the AI's report card: active classifier, per-class recall, a live
 * confusion matrix, on-demand held-out evaluation, and the engine's self-described
 * capabilities. Surfaces model/info + model/evaluate + the /capabilities dead-end.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Gauge, Play, Loader2, CheckCircle2, Cpu, Layers, Sparkles, FlaskConical, ShieldCheck, AlertTriangle } from 'lucide-react';
import { PageHeader, Card, Badge, InfoTip } from '@/components';
import { usePipelineStatus, useModelEval, useCapabilities, useModelValidation } from '@/hooks/useApi';
import { cn } from '@/lib/utils';
import type { ModelValidation } from '@/types';

const DATASETS = ['marida', 'mados'];

export default function ModelHealth({ embedded = false }: { embedded?: boolean }) {
  const status = usePipelineStatus();
  const evalM = useModelEval();
  const caps = useCapabilities();
  const validation = useModelValidation();
  const [dataset, setDataset] = useState('marida');

  const model = status.data?.model;
  const metrics = model?.metrics;
  const labels = model?.classes?.length ? model.classes : ['Plastic', 'Algae', 'Sea_Foam', 'Water'];

  // Prefer the live eval result once run; else the shipped held-out metrics.
  const live = evalM.data;
  const confusion = live?.confusion ?? metrics?.confusion;
  const perClass = live?.perClass ?? metrics?.perClass;
  const accuracy = live?.accuracy ?? metrics?.testAccuracy;
  const macroF1 = live?.macroF1 ?? metrics?.macroF1;

  return (
    <div className="space-y-6">
      {!embedded && (
        <PageHeader
          title="Model Health"
          subtitle="The AI’s report card — how well it spots plastic in each category, what it mixes up, and how it scores on unseen test data."
          badge={
            <Badge variant={model?.loaded ? 'success' : 'warn'} dot>
              {model?.loaded ? (model.mode ?? 'model loaded') : (
                <>heuristic <InfoTip>No trained model is loaded, so detections fall back to simple hand-written rules on the spectral bands — a rough stand-in, less accurate than the AI classifier.</InfoTip></>
              )}
            </Badge>
          }
        />
      )}

      {/* Heuristic-mode warning — the scores below are for the trained model, not
          the rule-based fallback the user may currently be seeing. */}
      {!model?.loaded && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-amber-800">You’re seeing the rule-based fallback, not the trained model</p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-800/80">
              No trained model is loaded right now, so detections use a simple hand-written rule (plastic signal + greenness +
              brightness). The accuracy and balanced-score figures below describe the <b>trained</b> model — they do not apply
              to the output you’re currently seeing. Load the model or run the live engine to see benchmarked detections.
            </p>
          </div>
        </div>
      )}

      {/* Model card */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile icon={Cpu} label="Classifier" value={model?.mode ?? '—'} sub={metrics?.arch ?? 'ONNX'} />
        <StatTile icon={Gauge} label="Held-out accuracy" value={accuracy != null ? `${Math.round(accuracy * 100)}%` : '—'} sub={live ? `live · ${live.samples} px` : 'shipped metric'} />
        <StatTile icon={CheckCircle2} label="Macro-F1" value={macroF1 != null ? macroF1.toFixed(2) : '—'} sub="class-balanced" />
        <StatTile icon={Layers} label="Trained on" value={metrics?.trainedOn ?? metrics?.dataset ?? 'MARIDA+MADOS'} sub={`${labels.length} classes`} />
      </div>
      <p className="text-xs leading-relaxed text-slate-400">
        Two headline scores. <b>Held-out accuracy</b> is how often the model is right on unseen test data it never trained on.
        The <b>balanced accuracy score (macro-F1)</b> averages accuracy across all four classes, so a rare class (like plastic)
        counts as much as a common one (like water) — it ranges 0 to 1, higher is better.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Per-class */}
        <Card>
          <h3 className="font-display text-sm font-bold text-slate-700">How well it spots each type</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            For each material, two numbers: <b>R</b> is <InfoTip term="recall">Recall — of the real cases out there, how many the model actually caught.</InfoTip>{' '}
            and <b>P</b> is <InfoTip term="precision">Precision — of the cases it flagged, how many were genuinely right.</InfoTip> The bar shows recall.
          </p>
          <div className="mt-3 space-y-3">
            {perClass ? labels.map((c) => {
              const m = perClass[c];
              if (!m) return null;
              return (
                <div key={c}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-600">{c.replace('_', ' ')}</span>
                    <span className="font-mono text-slate-400">R {Math.round(m.recall * 100)}% · P {Math.round(m.precision * 100)}%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                    <motion.div className="h-full rounded-full bg-ocean-500" initial={{ width: 0 }} animate={{ width: `${m.recall * 100}%` }} transition={{ duration: 0.5 }} />
                  </div>
                </div>
              );
            }) : <p className="text-sm text-slate-400">No scores yet. Run an evaluation (using the button on the right) to see how the model does on each material.</p>}
          </div>
        </Card>

        {/* Confusion matrix */}
        <Card>
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-slate-700">What it mixes up <InfoTip term="confusion matrix">A grid comparing the true material (rows) with the model’s guess (columns). Numbers off the diagonal are mistakes, showing which types get confused for each other.</InfoTip></h3>
            <div className="flex items-center gap-2">
              <select value={dataset} onChange={(e) => setDataset(e.target.value)} aria-label="Evaluation dataset"
                className="rounded-lg border border-border bg-white/80 px-2 py-1 text-xs text-slate-700 outline-none focus:border-ocean-400">
                {DATASETS.map((d) => <option key={d} value={d}>{d.toUpperCase()}</option>)}
              </select>
              <button type="button" onClick={() => evalM.mutate({ dataset })} disabled={evalM.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-ocean-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-ocean-700 disabled:opacity-60">
                {evalM.isPending ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Evaluate
              </button>
            </div>
          </div>
          {confusion ? <ConfusionMatrix matrix={confusion} labels={labels} /> : (
            <p className="mt-4 text-sm text-slate-400">Nothing to show yet. Pick a test dataset and press Evaluate to see where the model gets confused.</p>
          )}
          {evalM.isError && <p className="mt-2 text-xs text-amber-600">Couldn’t run the evaluation — the detection engine needs to be running first.</p>}
        </Card>
      </div>

      {/* Operating regime & independent validation */}
      {validation.data?.available && <OperatingRegime v={validation.data} />}

      {/* Capabilities */}
      <Card>
        <h3 className="flex items-center gap-2 font-display text-sm font-bold text-slate-700"><Sparkles size={15} className="text-ocean-600" /> Engine capabilities</h3>
        {caps.data ? (
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Configuration</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Chip on={caps.data.config.realIngest}>Real Sentinel-2 <InfoTip term="Sentinel-2">Free, public satellite imagery from the European Space Agency — the source pictures this app scans for plastic.</InfoTip></Chip>
                <Chip on={caps.data.config.modelLoaded}>Trained model</Chip>
                <Chip on={caps.data.config.griddedForcing}>Gridded forcing</Chip>
                <Chip on={!caps.data.config.demoMode}>Live mode</Chip>
              </div>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Spectral indices <InfoTip>Recipes that combine a satellite’s colour bands into a single number that highlights floating material — for example the plastic signal (FDI), where near-infrared light sits above the water baseline.</InfoTip></p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {caps.data.indices.map((i) => <span key={i} className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600">{i}</span>)}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Features</p>
              <ul className="mt-1.5 space-y-1.5">
                {Object.entries(caps.data.features).map(([k, v]) => (
                  <li key={k} className="text-xs text-slate-500"><span className="font-medium text-slate-700">{k}:</span> {v}</li>
                ))}
              </ul>
              <p className="mt-3 font-mono text-[11px] text-slate-400">engine v{caps.data.version} · {caps.data.regions.length} regions</p>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-400">Can’t reach the detection engine right now, so its settings aren’t available. Start the engine to see them here.</p>
        )}
      </Card>
    </div>
  );
}

function pct(x: number | undefined | null): string {
  return x == null ? '—' : `${Math.round(x * 100)}%`;
}

/** Operating regime & validation — the evidence behind CONFIRMED/POSSIBLE, and the
 *  honest boundary of the method (where Clay tier-2 helps and where it can't). */
function OperatingRegime({ v }: { v: ModelValidation }) {
  const f = v.fusion;
  const plp = v.plp;
  const cf = v.clayFusion;
  const hdpe = cf?.HDPE;
  const wood = cf?.wood;
  return (
    <Card>
      <div className="flex items-center gap-2">
        <FlaskConical size={15} className="text-ocean-600" />
        <h3 className="font-display text-sm font-bold text-slate-700">Where you can trust it (and where to be careful)</h3>
        <Badge variant="ocean">independent evidence</Badge>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        A detection is labelled <b>CONFIRMED</b> or <b>POSSIBLE</b> by having{' '}
        <InfoTip term="two AI models vote">A per-pixel classifier (MLP) looks at the colours in each pixel, while the Clay foundation model judges the visual “fingerprint” of the whole scene. When both agree it’s plastic, the site is CONFIRMED; when only one flags it, it stays POSSIBLE.</InfoTip>{' '}
        two AI models vote — when they agree it’s <b>confirmed</b>, when only one flags it it stays <b>possible</b>. The scores
        below were tuned on unseen test data and checked against a real plastic target put in the water on purpose. It works
        well in a specific setting — stated honestly below.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {/* Calibration */}
        {f && (
          <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4">
            <p className="flex items-center gap-2 text-xs font-bold text-teal-800">
              <ShieldCheck size={14} /> How reliable is “confirmed”?
            </p>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
              <Kv k="of confirmed sites, how many are real (precision)" v={pct(f.confirmedPrecision)} />
              <Kv k="of real plastic, how much it confirms (recall)" v={pct(f.confirmedRecall)} />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-teal-800/80">
              These were tuned on {f.calibratedOn ?? 'unseen MARIDA + MADOS test data'} to keep the CONFIRMED label precise;
              anything less certain falls to POSSIBLE (the wider, catch-more net). A site is confirmed only when the
              pixel model is at least {pct(f.conf_high)} sure, Clay’s plastic-affinity is at least {pct(f.aff_min)}, and it
              doesn’t look too unusual (novelty ≤ {f.anomaly_tau}).
            </p>
          </div>
        )}

        {/* PLP independent validation */}
        {plp && (
          <div className="rounded-xl border border-border/70 bg-slate-50/60 p-4">
            <p className="text-xs font-bold text-slate-700">Tested against a real target — {plp.dataset ?? 'PLP deployed target'}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              A known plastic target was placed in the sea, so we can check the model against ground truth it never saw.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2">
              <Kv k="plastic signal (FDI) spotted the target" v={pct(plp.fdiGateRate)} />
              <Kv k="pixel model hit the real target" v={pct(plp.hdpeHitRate)} />
              <Kv k="floating wood wrongly called plastic" v={pct(plp.woodAsPlasticRate)} />
              <Kv k="typical false alarms across a scene" v={pct((plp.medianSceneFpPct ?? 0) / 100)} />
            </div>
          </div>
        )}
      </div>

      {/* The honest boundary */}
      {cf && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-3">
            <p className="flex items-center gap-1.5 text-xs font-bold text-teal-800"><CheckCircle2 size={13} /> Where it works well</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
              <b>Larger patches</b> (slicks or hotspots big enough to fill much of a 640 m image tile):{' '}
              <InfoTip term="Clay">Clay is a foundation model that turns a satellite scene into a visual “fingerprint”, so the app can tell whether a patch looks like plastic it has seen before.</InfoTip>{' '}
              Clay recognises the plastic-like fingerprint, so both models agree and the site is CONFIRMED at about{' '}
              {pct(f?.confirmedPrecision)} precision.
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
            <p className="flex items-center gap-1.5 text-xs font-bold text-amber-700"><AlertTriangle size={13} /> Where to be careful</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
              <b>Tiny, single-point targets</b> (the deployed target is about 28 m — just 2–3 pixels): the image tile is
              ~99% water, so Clay sees almost no plastic fingerprint for
              {hdpe ? ` the target (${hdpe.confirmedByFusion}/${hdpe.n} confirmed)` : ' the target'}
              {wood ? ` or the wood control (${wood.mlpCalledPlastic} wrongly called plastic by the pixel model, all downgraded to POSSIBLE)` : ''}.
              Here the pixel model plus the plastic signal (FDI) does the detecting, and the site stays POSSIBLE until
              someone checks it in the field.
            </p>
          </div>
        </div>
      )}

      {cf?.finding && (
        <p className="mt-3 border-l-2 border-ocean-300 bg-ocean-50/40 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
          {cf.finding}
        </p>
      )}
      <p className="mt-2 font-mono text-[10px] text-slate-400">
        Evidence: models/fusion_thresholds.json · models/plp_clay_validation.json · metrics.json['plpValidation']
      </p>
    </Card>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="font-display text-sm font-bold text-slate-800">{v}</p>
      <p className="text-[11px] text-slate-400">{k}</p>
    </div>
  );
}

function ConfusionMatrix({ matrix, labels }: { matrix: number[][]; labels: string[] }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="border-collapse text-xs">
        <thead>
          <tr>
            <th className="p-1.5"><span className="sr-only">actual vs predicted</span></th>
            {labels.map((l) => <th key={l} className="p-1.5 text-[10px] font-semibold text-slate-400">{l.replace('_', ' ').slice(0, 6)}</th>)}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => {
            const sum = row.reduce((a, b) => a + b, 0) || 1;
            return (
              <tr key={i}>
                <td className="p-1.5 text-right text-[10px] font-semibold text-slate-400">{labels[i]?.replace('_', ' ').slice(0, 6)}</td>
                {row.map((v, j) => {
                  const frac = v / sum;
                  const correct = i === j;
                  const bg = correct
                    ? `rgba(13,148,136,${0.12 + frac * 0.7})`
                    : v > 0 ? `rgba(225,29,72,${0.08 + frac * 0.5})` : 'transparent';
                  return (
                    <td key={j} className="p-0.5">
                      <div className="grid h-9 w-12 place-items-center rounded font-mono text-[11px] text-slate-700"
                        style={{ background: bg }} title={`${labels[i]} → ${labels[j]}: ${v}`}>
                        {v}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-1.5 text-[11px] text-slate-400">Each row is the true material; each column is the model’s guess. The teal diagonal is where it got it right — brighter red cells off the diagonal are the most common mix-ups to watch.</p>
    </div>
  );
}

function StatTile({ icon: Icon, label, value, sub }: { icon: typeof Cpu; label: string; value: string; sub: string }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-ocean-50 text-ocean-600"><Icon size={17} /></span>
        <div className="min-w-0">
          <p className="truncate font-display text-base font-bold text-slate-800">{value}</p>
          <p className="text-[11px] text-slate-400">{label}</p>
        </div>
      </div>
      <p className="mt-2 truncate text-[11px] text-slate-400">{sub}</p>
    </Card>
  );
}

function Chip({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium',
      on ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-400')}>
      <span className={cn('h-1.5 w-1.5 rounded-full', on ? 'bg-teal-500' : 'bg-slate-300')} />
      {children}
    </span>
  );
}
