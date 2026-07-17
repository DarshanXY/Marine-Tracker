import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Satellite, LineChart, Cpu, Boxes, Wind, BellRing, Play, Check,
  Wifi, WifiOff, Info, Clock, Sparkles,
} from 'lucide-react';
import { PageHeader, Card, StatCard, Badge, SeverityPill } from '@/components';
import { usePipelineRun, usePipelineStatus, useRegions, useScenes } from '@/hooks/useApi';
import { LiveScanProgress } from '@/components/pipeline/LiveScanProgress';
import type { ModelInfo, PipelineStage } from '@/types';

const STAGE_META: Record<string, { icon: typeof Satellite; label: string }> = {
  DOWNLOAD: { icon: Satellite, label: 'Ingest Sentinel-2' },
  FDI: { icon: LineChart, label: 'Floating Debris Index' },
  CNN: { icon: Cpu, label: 'MLP classification' },
  DBSCAN: { icon: Boxes, label: 'DBSCAN hotspots' },
  CLAY: { icon: Sparkles, label: 'Clay tier-2 (GPU)' },
  DRIFT: { icon: Wind, label: 'Drift forecast' },
  ALERT: { icon: BellRing, label: 'Alerts' },
};

export default function Pipeline() {
  const [region, setRegion] = useState('');
  const regions = useRegions();
  const status = usePipelineStatus();
  const run = usePipelineRun();

  const result = run.data?.result;
  const engine = run.data?.engine;
  const engineOnline = status.data?.engine === 'online';
  const modelLoaded = status.data?.model_loaded ?? result?.stats.modelLoaded ?? false;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Detection Pipeline"
        subtitle="Run the full FDI → CNN → DBSCAN → drift pipeline. In demo mode it processes synthetic Sentinel-2 scenes; the algorithms are real."
        badge={
          <span className="flex items-center gap-2">
            <Badge variant={engineOnline ? 'success' : 'warn'} dot>
              {engineOnline ? 'engine online' : 'engine offline'}
            </Badge>
            <Badge variant={modelLoaded ? 'success' : 'neutral'} dot>
              {modelLoaded ? 'CNN: trained' : 'CNN: heuristic'}
            </Badge>
          </span>
        }
      />

      {/* Live streamed scan */}
      <LiveScanProgress />

      {/* Controls */}
      <Card className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Region</span>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="rounded-lg border border-border bg-white/80 px-3 py-2 text-sm text-slate-700 outline-none focus:border-ocean-400"
          >
            <option value="">All regions</option>
            {(regions.data ?? []).map((r) => (
              <option key={r.code} value={r.code}>{r.code} — {r.displayName}</option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => run.mutate({ region: region || undefined })}
          disabled={run.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow-glow-primary transition-transform hover:-translate-y-0.5 disabled:opacity-60"
        >
          {run.isPending ? (
            <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Running…</>
          ) : (
            <><Play size={16} /> Run pipeline</>
          )}
        </button>

        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-400">
          {engineOnline
            ? <><Wifi size={13} className="text-success-500" /> Python engine reachable</>
            : <><WifiOff size={13} className="text-amber-500" /> Using demo fallback (start the engine on :8000 for live runs)</>}
        </span>
      </Card>

      <ModelCard model={status.data?.model} online={engineOnline} />

      <ScenesPanel region={region} />

      {!result && !run.isPending && (
        <Card className="flex flex-col items-center gap-2 py-14 text-center">
          <Cpu size={30} className="text-ocean-300" />
          <p className="font-display text-lg font-semibold text-slate-700">Ready to run</p>
          <p className="max-w-md text-sm text-slate-400">
            Press <span className="font-semibold text-ocean-600">Run pipeline</span> to process a scene through all six stages and see live detections, hotspot clusters, and a 72-hour drift forecast.
          </p>
        </Card>
      )}

      <AnimatePresence>
        {result && (
          <motion.div
            key={result.runId}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Run meta */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <Badge variant="neutral">run {result.runId}</Badge>
              <Badge variant={engine === 'online' ? 'success' : 'warn'}>{engine === 'online' ? 'live engine' : 'demo fallback'}</Badge>
              <span className="inline-flex items-center gap-1"><Clock size={12} /> {new Date(result.generatedAt).toLocaleTimeString()}</span>
              {result.stats.modelLoaded ? (
                <span className="inline-flex items-center gap-1 text-success-700"><Cpu size={12} /> CNN: trained model (ONNX Runtime)</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-600"><Info size={12} /> CNN: heuristic (no trained model loaded)</span>
              )}
            </div>

            {/* Stages */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {result.stages.map((s, i) => (
                <StageCard key={s.stage} stage={s} index={i} />
              ))}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Candidate pixels" value={result.stats.candidatePixels} icon={<LineChart size={18} />} color="ocean" />
              <StatCard label="Plastic detections" value={result.stats.plastic} icon={<Cpu size={18} />} color="success" delay={0.05} />
              <StatCard label="Hotspots" value={result.stats.hotspots} icon={<Boxes size={18} />} color="danger" delay={0.1} />
              <StatCard label="Avg confidence" value={Math.round(result.stats.avgConfidence * 100)} unit="%" icon={<Check size={18} />} color="purple" delay={0.15} />
            </div>

            {/* Hotspots produced */}
            <Card accent padding="none" className="overflow-hidden">
              <div className="border-b border-border/60 px-4 py-3">
                <h3 className="font-display text-sm font-semibold text-slate-800">Hotspots produced this run</h3>
              </div>
              <div className="divide-y divide-border/50">
                {result.hotspots.slice(0, 8).map((h) => (
                  <div key={h.label} className="flex items-center gap-3 px-4 py-3">
                    <SeverityPill severity={h.severity} animated={h.severity === 'HIGH'} />
                    <span className="font-display text-sm font-semibold text-slate-700">{h.label}</span>
                    <span className="font-mono text-xs text-slate-400">{h.centroidLat.toFixed(3)}, {h.centroidLon.toFixed(3)}</span>
                    <div className="ml-auto flex items-center gap-4 text-xs text-slate-500">
                      <span>{h.detectionCount} detections</span>
                      <span>{Math.round(h.confidence * 100)}%</span>
                      <span className="w-16 text-right">{h.etaHours != null ? `ETA ${h.etaHours}h` : 'open sea'}</span>
                    </div>
                  </div>
                ))}
                {result.hotspots.length === 0 && (
                  <p className="px-4 py-8 text-center text-sm text-slate-400">No clusters reached the DBSCAN threshold this run.</p>
                )}
              </div>
            </Card>

            {result.trajectories[0] && (
              <Card className="flex items-center gap-3 text-sm text-slate-500">
                <Wind size={18} className="text-ocean-500" />
                <span>
                  72-hour Lagrangian drift computed for the top hotspot — {result.trajectories[0].points.length} hourly positions with a {result.trajectories[0].windageCoeffs.length}-member uncertainty cone.
                  Windage {result.trajectories[0].windageCoeffs.map((w) => `${(w * 100).toFixed(1)}%`).join(' / ')}.
                </span>
                {result.trajectories[0].dataSource === 'open-meteo' ? (
                  <Badge variant="success" dot>real currents + winds</Badge>
                ) : (
                  <Badge variant="neutral" dot>synthetic forcing</Badge>
                )}
              </Card>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function cloudClass(pct: number): string {
  return pct > 60 ? 'text-amber-600' : pct > 30 ? 'text-slate-500' : 'text-success-600';
}

function recallColor(r: number): string {
  return r >= 0.9 ? 'bg-success-500' : r >= 0.8 ? 'bg-ocean-500' : 'bg-amber-500';
}

function ModelCard({ model, online }: { model?: ModelInfo; online: boolean }) {
  // Heuristic fallback — no ONNX loaded (or engine offline).
  if (!model?.loaded || !model.metrics) {
    return (
      <Card accent className="space-y-1">
        <div className="flex items-center gap-2">
          <Cpu size={15} className="text-ocean-600" />
          <h3 className="font-display text-sm font-semibold text-slate-800">Classification model</h3>
          <Badge variant="neutral" dot>heuristic</Badge>
        </div>
        <p className="text-sm text-slate-500">
          {online
            ? 'No trained ONNX model is loaded — the pipeline uses the interpretable FDI/NDVI heuristic. Run the engine trainer (python -m app.ml.train) to load the baseline classifier.'
            : 'Start the Python engine on :8000 to load the trained classifier and see its evaluation metrics here.'}
        </p>
      </Card>
    );
  }

  const m = model.metrics;
  const classes = model.classes ?? Object.keys(m.perClass);

  return (
    <Card accent className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Cpu size={15} className="text-ocean-600" />
        <h3 className="font-display text-sm font-semibold text-slate-800">Classification model</h3>
        <Badge variant="success" dot>{model.mode}</Badge>
        {m.trainedOn === 'marida+mados'
          ? <Badge variant="success" dot>REAL data · MARIDA+MADOS</Badge>
          : m.trainedOn === 'marida'
            ? <Badge variant="success" dot>REAL data · MARIDA</Badge>
            : <Badge variant="warn" dot>synthetic baseline</Badge>}
        <span className="font-mono text-xs text-slate-400">{m.model}</span>
        <span className="ml-auto text-right">
          <span className="font-mono text-2xl font-bold text-ocean-700">{Math.round(m.testAccuracy * 100)}%</span>
          <span className="ml-1 text-xs text-slate-400">held-out{m.macroF1 != null ? ` · macro-F1 ${Math.round(m.macroF1 * 100)}%` : ' accuracy'}</span>
        </span>
      </div>

      <p className="text-xs leading-relaxed text-slate-500">
        <span className="font-medium text-slate-600">{m.arch}</span>, trained on {m.trainSamples.toLocaleString()}{' '}
        {m.trainedOn === 'marida+mados' || m.trainedOn === 'marida' ? 'hand-labelled Sentinel-2 pixels' : 'samples'} from{' '}
        {m.dataset ?? 'a synthetic Sentinel-2 dataset'}.
        {(m.trainedOn === 'marida' || m.trainedOn === 'marida+mados') && ' On a class-imbalanced benchmark, per-class recall and macro-F1 matter more than overall accuracy.'}
      </p>

      {/* Per-class recall */}
      <div className="grid gap-2 sm:grid-cols-2">
        {classes.map((c) => {
          const s = m.perClass[c];
          if (!s) return null;
          return (
            <div key={c} className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-xs font-medium text-slate-600">{c.replace('_', ' ')}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${recallColor(s.recall)}`} style={{ width: `${Math.round(s.recall * 100)}%` }} />
              </div>
              <span className="w-10 text-right font-mono text-xs text-slate-500">{Math.round(s.recall * 100)}%</span>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 pt-3 text-[11px] text-slate-400">
        <span>Classes: {classes.map((c) => c.replace('_', ' ')).join(', ')}</span>
        {m.onnxAgreement != null && <span>ONNX↔numpy: {Math.round(m.onnxAgreement * 100)}%</span>}
        {model.geometry && <span>Input: {model.geometry.size}×{model.geometry.size}×{model.geometry.channels} {model.geometry.layout}</span>}
        <span className="inline-flex items-center gap-1 text-ocean-600">
          <Info size={11} />
          {m.trainedOn === 'marida+mados'
            ? ' Real MARIDA+MADOS labels; validated on combined test split with per-dataset breakdown.'
            : m.trainedOn === 'marida'
              ? ' Real MARIDA labels; validated on the MARIDA test split. MADOS integration is the current upgrade.'
              : ' Synthetic baseline — a trained MARIDA/MADOS ResNet-50 drops in at the same contract.'}
        </span>
      </div>
      {m.note && <p className="text-[11px] italic text-amber-600/90">Note: {m.note}</p>}
    </Card>
  );
}

function ScenesPanel({ region }: { region: string }) {
  const { data, isLoading } = useScenes(region || undefined);
  const source = data?.source;
  const badge =
    source === 'stac'
      ? { variant: 'success' as const, label: 'live · AWS STAC' }
      : source === 'mock'
        ? { variant: 'warn' as const, label: 'offline · mock' }
        : { variant: 'ocean' as const, label: 'demo scenes' };

  return (
    <Card accent padding="none" className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-slate-800">
          <Satellite size={15} className="text-ocean-600" /> Recent Sentinel-2 imagery
        </h3>
        <Badge variant={badge.variant} dot>{badge.label}</Badge>
      </div>
      <div className="divide-y divide-border/50">
        {isLoading && <p className="px-4 py-6 text-center text-sm text-slate-400">Loading scenes…</p>}
        {(data?.data ?? []).slice(0, 6).map((s) => (
          <div key={s.sceneId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span className="font-mono text-xs font-medium text-slate-700">{s.tile || '—'}</span>
            <span className="text-xs text-slate-400">{s.platform}</span>
            <div className="ml-auto flex items-center gap-4 text-xs text-slate-500">
              <span>{s.acquisitionDate.slice(0, 10)}</span>
              <span className={cloudClass(s.cloudCoverPct)}>{Math.round(s.cloudCoverPct)}% cloud</span>
            </div>
          </div>
        ))}
        {data && data.data.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-slate-400">No recent scenes for this region.</p>
        )}
      </div>
      {source === 'stac' && (
        <p className="border-t border-border/60 px-4 py-2 text-[11px] leading-relaxed text-slate-400">
          Live discovery via Element84 Earth Search (AWS Open Data, no key). High cloud cover is expected during
          the Indian monsoon — a real limitation of optical satellites.
        </p>
      )}
    </Card>
  );
}

function StageCard({ stage, index }: { stage: PipelineStage; index: number }) {
  const meta = STAGE_META[stage.stage] ?? { icon: Cpu, label: stage.stage };
  const Icon = meta.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.35 }}
      className="glass card-accent relative p-4"
    >
      <div className="flex items-center justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ocean-50 text-ocean-600">
          <Icon size={17} />
        </span>
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: index * 0.08 + 0.2, type: 'spring', stiffness: 300 }}
          className="flex h-5 w-5 items-center justify-center rounded-full bg-success-500 text-white"
        >
          <Check size={12} />
        </motion.span>
      </div>
      <p className="mt-3 font-mono text-[10px] text-ocean-500">{stage.stage} · {stage.durationMs}ms</p>
      <p className="font-display text-sm font-bold text-slate-800">{meta.label}</p>
      <p className="mt-1 text-xs leading-snug text-slate-500">{stage.detail}</p>
    </motion.div>
  );
}
