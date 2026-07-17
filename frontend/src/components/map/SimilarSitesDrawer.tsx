/**
 * SimilarSitesDrawer — "find sites like this hotspot" using Clay foundation-model
 * embeddings. Slides in when a hotspot is selected on the Map Explorer.
 *
 * Two modes, chosen automatically:
 *   • TRUE per-hotspot — if this site has been embedded (its chip drained from the
 *     queue by the GPU node), show the nearest reference sites to THIS hotspot's
 *     own 1024-d fingerprint, plus its retrieval class + novelty score.
 *   • Class explorer (fallback) — otherwise explore the reference neighbourhood by
 *     surface class while the embedding is queued. Honest, and runs at ₹0.
 */
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Compass, Layers, ShieldCheck, Sparkles, TrendingDown, TrendingUp, X } from 'lucide-react';
import { Badge } from '@/components';
import { cn } from '@/lib/utils';
import {
  useSimilarityChange, useSimilarityDemo, useSimilarityHotspot, useSimilarityInfo,
} from '@/hooks/useApi';
import type { PipelineHotspot, SimilarityNeighbour } from '@/types';

const CLASSES = ['Plastic', 'Algae', 'Sea_Foam', 'Water'];

const FUSION_STYLE: Record<string, string> = {
  High: 'border-teal-200 bg-teal-50 text-teal-800',
  Medium: 'border-amber-200 bg-amber-50 text-amber-800',
  Low: 'border-rose-200 bg-rose-50 text-rose-700',
};

const TREND: Record<string, { label: string; cls: string; up?: boolean }> = {
  intensifying: { label: 'Intensifying', cls: 'border-rose-200 bg-rose-50 text-rose-700', up: true },
  clearing: { label: 'Clearing', cls: 'border-teal-200 bg-teal-50 text-teal-800', up: false },
  shifted: { label: 'Shifted', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  stable: { label: 'Stable', cls: 'border-slate-200 bg-slate-50 text-slate-600' },
};

function SimBar({ sim }: { sim: number }) {
  const pct = Math.round(sim * 100);
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

function NeighbourRow({ n }: { n: SimilarityNeighbour }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-white/60 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Badge variant={n.class === 'Plastic' ? 'ocean' : 'neutral'}>{n.class.replace('_', ' ')}</Badge>
        <span className="truncate font-mono text-[11px] text-slate-400">{n.source}</span>
      </div>
      <SimBar sim={n.similarity} />
    </div>
  );
}

export default function SimilarSitesDrawer({
  hotspot,
  onClose,
}: {
  hotspot: PipelineHotspot | null;
  onClose: () => void;
}) {
  const [cls, setCls] = useState(0);
  const info = useSimilarityInfo(Boolean(hotspot));
  const hs = useSimilarityHotspot(hotspot?.embedKey, 8);
  const demo = useSimilarityDemo(cls, 8, Boolean(hotspot));
  const indexReady = info.data?.available;

  // TRUE per-hotspot mode when this site's own embedding is available.
  const site = hs.data;
  const trueMode = Boolean(site?.available && !site?.pending && (site?.neighbours?.length ?? 0) > 0);
  const change = useSimilarityChange(hotspot?.embedKey, trueMode);
  const trend = change.data && (change.data.observations ?? 0) > 1 && change.data.trend
    ? change.data : null;
  const pending = Boolean(hotspot?.embedKey && (site?.pending || (indexReady && !trueMode && !hs.isError)));

  return (
    <AnimatePresence>
      {hotspot && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-slate-900/30"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: 440 }}
            animate={{ x: 0 }}
            exit={{ x: 440 }}
            transition={{ type: 'tween', duration: 0.25 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-y-auto border-l border-border/70 bg-white p-5 shadow-glass"
            aria-label="Similar sites"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-ocean-600" />
                  <h3 className="font-display text-lg font-bold text-slate-800">Similar sites</h3>
                  {trueMode && <Badge variant="ocean">this hotspot</Badge>}
                </div>
                <p className="mt-1 font-mono text-xs text-slate-400">
                  {hotspot.label} · {hotspot.severity} · {hotspot.detectionCount} detections
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="Close similar sites"
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2 rounded-lg bg-ocean-50 px-3 py-2 text-xs text-ocean-800">
              <Layers size={14} />
              {indexReady ? (
                <span>
                  {info.data?.model ?? 'Clay v1.5'} ·{' '}
                  <span className="font-mono">{info.data?.size?.toLocaleString()}</span> reference sites
                  {info.data?.siteStore ? (
                    <> · <span className="font-mono">{info.data.siteStore.embeddedSites}</span> embedded</>
                  ) : null}
                </span>
              ) : (
                <span>Foundation-model index unavailable</span>
              )}
            </div>

            {trueMode ? (
              /* ── TRUE per-hotspot neighbours ── */
              <>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  Nearest reference sites to <span className="font-semibold text-ocean-700">this hotspot's own</span>{' '}
                  Clay fingerprint.
                </p>

                {site?.fusion && (
                  <div
                    className={cn(
                      'mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
                      FUSION_STYLE[site.fusion.tier] ?? 'border-slate-200 bg-slate-50 text-slate-600',
                    )}
                  >
                    <ShieldCheck size={14} className="mt-0.5 shrink-0" />
                    <div>
                      <span className="font-semibold">{site.fusion.tier} confidence</span>{' '}
                      <span className="opacity-70">
                        · MLP {site.mlpClass} @ {Math.round((site.mlpConfidence ?? 0) * 100)}% +{' '}
                        Clay {site.knnClass} ({site.fusion.agreement ? 'agree' : 'differ'})
                      </span>
                      {site.fusion.reasons?.[0] && (
                        <div className="mt-0.5 opacity-70">{site.fusion.reasons.join(' · ')}</div>
                      )}
                    </div>
                  </div>
                )}

                {trend && (
                  <div className={cn('mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
                    TREND[trend.trend!]?.cls)}>
                    {TREND[trend.trend!]?.up === true ? <TrendingUp size={14} className="mt-0.5 shrink-0" />
                      : TREND[trend.trend!]?.up === false ? <TrendingDown size={14} className="mt-0.5 shrink-0" />
                      : <Compass size={14} className="mt-0.5 shrink-0" />}
                    <div>
                      <span className="font-semibold">{TREND[trend.trend!]?.label} over time</span>{' '}
                      <span className="opacity-70">· {trend.observations} passes, {trend.from?.slice(0, 10)} → {trend.to?.slice(0, 10)}</span>
                      <div className="mt-0.5 opacity-70">
                        plastic-affinity {Math.round((trend.plasticAffinityFrom ?? 0) * 100)}% →{' '}
                        {Math.round((trend.plasticAffinityTo ?? 0) * 100)}% · drift {trend.latestDrift?.toFixed(2)}
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                    <Compass size={12} /> retrieval class{' '}
                    <span className="font-semibold text-slate-800">{site?.knnClass}</span>
                  </span>
                  {site?.novel && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-700">
                      <AlertTriangle size={12} /> unusual (novelty {site?.anomaly?.toFixed(2)})
                    </span>
                  )}
                  {typeof site?.observations === 'number' && site.observations > 1 && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                      {site.observations} observations
                    </span>
                  )}
                </div>
                <div className="mt-3 space-y-2">
                  {(site?.neighbours ?? []).map((n, i) => <NeighbourRow key={i} n={n} />)}
                </div>
              </>
            ) : (
              /* ── Class-neighbourhood fallback ── */
              <>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  Nearest sites in the <span className="font-semibold text-ocean-700">Clay foundation-model</span>{' '}
                  fingerprint space. Pick a surface class to explore its reference neighbourhood.
                </p>
                {pending && (
                  <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
                    This hotspot's own fingerprint is <span className="font-medium">queued for embedding</span> on the
                    GPU node — showing the class neighbourhood meanwhile.
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {CLASSES.map((c, i) => (
                    <button
                      key={c}
                      onClick={() => setCls(i)}
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-medium transition',
                        cls === i ? 'bg-ocean-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                      )}
                    >
                      {c.replace('_', ' ')}
                    </button>
                  ))}
                </div>

                <div className="mt-3 space-y-2">
                  {demo.isLoading && (
                    <div className="py-6 text-center text-sm text-slate-400">Searching fingerprints…</div>
                  )}
                  {demo.isError && (
                    <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-700">
                      <AlertTriangle size={15} /> Index unavailable — start the engine with clay_index.npz built.
                    </div>
                  )}
                  {demo.data?.available &&
                    (demo.data.neighbours ?? []).map((n, i) => <NeighbourRow key={i} n={n} />)}
                  {demo.data?.available && (demo.data.neighbours ?? []).length === 0 && !demo.isLoading && (
                    <div className="py-6 text-center text-sm text-slate-400">No reference sites for this class.</div>
                  )}
                </div>
              </>
            )}

            <div className="mt-auto pt-4">
              <p className="rounded-lg border border-border/60 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
                {trueMode
                  ? 'This site was embedded by the GPU node; the ₹0 engine serves its nearest neighbours over the prebuilt index.'
                  : 'Retrieval quality: neighbour-vote classification reaches 0.66 macro-F1 with no trained head. Per-hotspot embedding runs in the GPU service; this panel explores the reference neighbourhood meanwhile.'}
              </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
