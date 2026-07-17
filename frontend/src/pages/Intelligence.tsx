/**
 * Intelligence — a home for the Clay foundation-model features that were previously
 * reachable only by clicking a hotspot on the map: per-site nearest neighbours,
 * MLP+Clay confidence fusion, temporal change, a by-class explorer, and raw-embedding
 * search. Same ocean/teal theme + UI kit as the rest of the app.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Sparkles, Compass, ShieldCheck, TrendingUp, TrendingDown, AlertTriangle,
  MapPin, Clock, Search, ChevronRight,
} from 'lucide-react';
import { PageHeader, Card, Badge, InfoTip } from '@/components';
import { cn } from '@/lib/utils';
import {
  useSimilarityInfo, useSimilaritySites, useSimilarityHotspot, useSimilarityChange,
  useSimilarityDemo, useSimilaritySearch,
} from '@/hooks/useApi';
import type { SimilarityNeighbour } from '@/types';

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

export default function Intelligence({ embedded = false }: { embedded?: boolean }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [exploreCls, setExploreCls] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [raw, setRaw] = useState('');

  const info = useSimilarityInfo();
  const sitesQ = useSimilaritySites();
  const hs = useSimilarityHotspot(selectedKey, 8);
  const change = useSimilarityChange(selectedKey, Boolean(selectedKey));
  const demo = useSimilarityDemo(exploreCls, 8, !selectedKey);
  const search = useSimilaritySearch();

  const indexReady = info.data?.available;
  const store = info.data?.siteStore;
  const sites = sitesQ.data?.sites ?? [];
  const site = hs.data;
  const trueMode = Boolean(site?.available && !site?.pending && (site?.neighbours?.length ?? 0) > 0);
  const trend = change.data && (change.data.observations ?? 0) > 1 && change.data.trend ? change.data : null;

  const runSearch = () => {
    try {
      const arr = JSON.parse(raw) as number[];
      if (Array.isArray(arr) && arr.length > 8) search.mutate({ embedding: arr, k: 8 });
    } catch { /* invalid JSON — button stays idle, hint shown below */ }
  };

  return (
    <div className="space-y-6">
      {!embedded && (
        <PageHeader
          title="Similarity & Fusion"
          subtitle="Compare each site against places we already know — find its closest matches, see how sure we are, and watch how it changes over time."
          badge={
            indexReady
              ? <Badge variant="ocean">{info.data?.size?.toLocaleString()} reference locations</Badge>
              : <Badge variant="warn">library unavailable</Badge>
          }
        />
      )}

      {/* Index panel */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <Stat
            label="Model"
            value={indexReady ? 'Clay v1.5' : '—'}
            sub="visual fingerprint (Clay)"
            tip="Clay turns a patch of satellite imagery into a list of 1,024 numbers — the AI's visual fingerprint of a site. Two fingerprints are compared by how similar their directions are (cosine similarity)."
          />
          <Stat
            label="Reference locations"
            value={info.data?.size?.toLocaleString() ?? '—'}
            sub="labelled places to compare against"
            tip="A library of sites we already have a confirmed label for. A new site is matched against these to guess what it is."
          />
          <Stat label="Fingerprinted sites" value={String(store?.embeddedSites ?? 0)} sub={`${store?.observations ?? 0} observations`} />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Class mix</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {info.data?.classMix
                ? Object.entries(info.data.classMix).map(([c, n]) => (
                    <span key={c} className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600">
                      {c.replace('_', ' ')} {n.toLocaleString()}
                    </span>
                  ))
                : <span className="text-sm text-slate-400">—</span>}
            </div>
          </div>
        </Card>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
        {/* Left — embedded sites picker */}
        <Card className="flex flex-col">
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-ocean-600" />
            <h3 className="font-display text-sm font-bold text-slate-800">Fingerprinted sites</h3>
            <Badge variant="neutral">{sites.length}</Badge>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Sites the AI has taken a visual fingerprint of. Pick one to see its closest matches, how sure we are, and how it
            has changed over time.
          </p>
          <div className="mt-3 max-h-[420px] space-y-1.5 overflow-y-auto">
            {sites.length === 0 && (
              <div className="rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-500">
                No sites have been fingerprinted yet. Once a scan runs and the AI processes it, sites will appear here. In
                the meantime, explore the reference library by surface type on the right.
              </div>
            )}
            {sites.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSelectedKey(s.key)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition',
                  selectedKey === s.key
                    ? 'border-ocean-300 bg-ocean-50'
                    : 'border-border/70 bg-white/60 hover:border-ocean-200 hover:bg-ocean-50/50',
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-semibold text-slate-700">{s.region}</span>
                    {s.observations > 1 && (
                      <span className="rounded bg-amber-100 px-1.5 text-[10px] font-medium text-amber-700">
                        {s.observations}×
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-[11px] text-slate-400">{s.lat.toFixed(3)}, {s.lon.toFixed(3)}</span>
                </div>
                <ChevronRight size={14} className="shrink-0 text-slate-300" />
              </button>
            ))}
          </div>
        </Card>

        {/* Right — site intelligence OR by-class explorer */}
        <Card className="flex min-h-[420px] flex-col">
          {selectedKey ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-ocean-600" />
                  <h3 className="font-display text-sm font-bold text-slate-800">Site intelligence</h3>
                  <span className="font-mono text-[11px] text-slate-400">{selectedKey}</span>
                </div>
                <button type="button" onClick={() => setSelectedKey(null)} className="text-xs text-slate-400 hover:text-slate-600">
                  Clear
                </button>
              </div>

              {hs.isLoading && <div className="flex-1 py-10 text-center text-sm text-slate-400">Loading fingerprint…</div>}
              {site?.pending && (
                <div className="mt-3 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">
                  This site is waiting in line to be fingerprinted by the AI. Check back shortly — its matches and confidence
                  will appear here once it{"'"}s done.
                </div>
              )}

              {trueMode && (
                <div className="mt-3 space-y-3">
                  {site?.fusion && (
                    <div className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
                      FUSION_STYLE[site.fusion.tier] ?? 'border-slate-200 bg-slate-50 text-slate-600')}>
                      <ShieldCheck size={14} className="mt-0.5 shrink-0" />
                      <div>
                        <span className="font-semibold">{site.fusion.tier} confidence</span>
                        <InfoTip>
                          Two AI models vote on what this site is: a classifier that reads the light bands (MLP), and Clay,
                          which matches the site{"'"}s visual fingerprint to known places. When they agree, confidence is
                          High; when they disagree, it drops to Medium or Low.
                        </InfoTip>{' '}
                        <span className="opacity-70">
                          · classifier (MLP) says {site.mlpClass} at {Math.round((site.mlpConfidence ?? 0) * 100)}%,
                          fingerprint match (Clay) says {site.knnClass}{' '}
                          ({site.fusion.agreement ? 'they agree' : 'they differ'})
                        </span>
                        {site.fusion.reasons?.[0] && <div className="mt-0.5 opacity-70">{site.fusion.reasons.join(' · ')}</div>}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                      <Compass size={12} /> closest match <span className="font-semibold text-slate-800">{site?.knnClass}</span>
                    </span>
                    {site?.novel && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-700">
                        <AlertTriangle size={12} /> unusual ({site?.anomaly?.toFixed(2)})
                      </span>
                    )}
                    {site?.observedAt && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-slate-500">
                        <Clock size={12} /> {site.observedAt.slice(0, 10)}
                      </span>
                    )}
                  </div>

                  {trend && (
                    <div className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-xs', TREND[trend.trend!]?.cls)}>
                      {TREND[trend.trend!]?.up === true ? <TrendingUp size={14} className="mt-0.5 shrink-0" />
                        : TREND[trend.trend!]?.up === false ? <TrendingDown size={14} className="mt-0.5 shrink-0" />
                        : <Compass size={14} className="mt-0.5 shrink-0" />}
                      <div>
                        <span className="font-semibold">{TREND[trend.trend!]?.label} over time</span>
                        <InfoTip>
                          How this site has changed across repeat satellite passes: intensifying (looking more like
                          plastic), clearing (looking less like it), shifted (its fingerprint moved to a different type),
                          or stable (little change).
                        </InfoTip>{' '}
                        <span className="opacity-70">· {trend.observations} passes, {trend.from?.slice(0, 10)} → {trend.to?.slice(0, 10)}</span>
                        <div className="mt-0.5 opacity-70">
                          how plastic-like {Math.round((trend.plasticAffinityFrom ?? 0) * 100)}% →{' '}
                          {Math.round((trend.plasticAffinityTo ?? 0) * 100)}% · movement since last pass {trend.latestDrift?.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Closest known locations
                      <InfoTip>The labelled sites whose visual fingerprint most resembles this one. The bar shows how close the match is (higher is more alike).</InfoTip>
                    </p>
                    <div className="space-y-2">
                      {(site?.neighbours ?? []).map((n, i) => <NeighbourRow key={i} n={n} />)}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Compass size={16} className="text-ocean-600" />
                <h3 className="font-display text-sm font-bold text-slate-800">Explore by surface type</h3>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Pick a surface type to see the labelled locations that look most like it. This works straight away. To dig
                into one specific site instead, choose a fingerprinted site on the left.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {CLASSES.map((c, i) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setExploreCls(i)}
                    className={cn('rounded-full px-3 py-1 text-xs font-medium transition',
                      exploreCls === i ? 'bg-ocean-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
                  >
                    {c.replace('_', ' ')}
                  </button>
                ))}
              </div>
              <div className="mt-3 space-y-2">
                {demo.isLoading && <div className="py-6 text-center text-sm text-slate-400">Finding the closest matches…</div>}
                {demo.isError && (
                  <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-700">
                    <AlertTriangle size={15} /> The reference library isn{"'"}t loaded yet — it needs to be built before matches can be shown.
                  </div>
                )}
                {demo.data?.available && (demo.data.neighbours ?? []).map((n, i) => <NeighbourRow key={i} n={n} />)}
                {demo.data?.available && (demo.data.neighbours ?? []).length === 0 && !demo.isLoading && (
                  <div className="py-6 text-center text-sm text-slate-400">No labelled locations for this surface type yet.</div>
                )}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Advanced — raw embedding search (surfaces the raw similarity/search endpoint) */}
      <Card>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex w-full items-center gap-2 text-left text-sm font-semibold text-slate-700"
        >
          <Search size={15} className="text-ocean-600" />
          Advanced — search by a raw visual fingerprint (Clay embedding)
          <ChevronRight size={14} className={cn('ml-auto text-slate-400 transition-transform', showAdvanced && 'rotate-90')} />
        </button>
        {showAdvanced && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-slate-500">
              For advanced users: paste a site{"'"}s raw visual fingerprint — the 1,024 numbers the AI produces (Clay
              embedding) — as a JSON array, and we{"'"}ll find its closest known locations, its best-guess type, and
              whether it looks unusual.
            </p>
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="[0.12, -0.03, … 1024 numbers]"
              className="h-24 w-full rounded-lg border border-border bg-white/80 p-3 font-mono text-xs text-slate-700 outline-none focus:border-ocean-400"
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={runSearch}
                disabled={search.isPending}
                className="rounded-lg bg-ocean-600 px-4 py-2 text-sm font-medium text-white hover:bg-ocean-700 disabled:opacity-60"
              >
                {search.isPending ? 'Searching…' : 'Find similar'}
              </button>
              {search.isError && <span className="text-xs text-rose-600">Search failed — make sure the fingerprint is a list of 1,024 numbers.</span>}
            </div>
            {search.data?.available && search.data.neighbours && (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">closest match {search.data.knnClass}</span>
                  {search.data.novel && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-700">unusual ({search.data.anomaly?.toFixed(2)})</span>}
                </div>
                {search.data.neighbours.map((n, i) => <NeighbourRow key={i} n={n} />)}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, sub, tip }: { label: string; value: string; sub: string; tip?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}{tip && <InfoTip>{tip}</InfoTip>}
      </p>
      <p className="mt-0.5 font-display text-xl font-bold text-slate-800">{value}</p>
      <p className="text-[11px] text-slate-400">{sub}</p>
    </div>
  );
}
