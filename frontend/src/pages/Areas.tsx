/**
 * Areas — saved AOIs and plastic drift forecasting.
 *
 * Map Explorer is transient by design: you draw a box, the pipeline runs, and
 * the result dies with the session. This page is where a selection becomes a
 * durable record — the AOI bounds, the run options, and the full scan payload
 * are stored server-side, so an area can be revisited, re-scanned, and compared
 * against itself over time.
 *
 * The headline capability here is the 72-hour plastic trajectory forecast. It is
 * computed by the engine SERVER-SIDE (POST /api/areas/:id/forecast) and kept as
 * history rather than overwritten, so successive forecasts over the same water
 * stay comparable — which is what makes the drift model auditable instead of a
 * one-shot number.
 */
import { Component, useEffect, useMemo, useState, type ErrorInfo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CircleMarker, Polygon, Polyline, Popup, Rectangle, useMap } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import {
  LineChart, Line, ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid,
  Tooltip as RTooltip, ResponsiveContainer, Cell,
} from 'recharts';
import toast from 'react-hot-toast';
import {
  BookMarked, Navigation2, RefreshCw, Trash2, FileDown, MapPin, Loader2, Cpu,
  Clock, AlertTriangle, Satellite, History, Pencil, Check, X, Wind, Download,
  TrendingUp, TrendingDown, Minus, Sparkles, Activity, Target, Anchor,
  Ship, Share2, Printer, Search, Recycle, CloudSun,
} from 'lucide-react';
import { PageHeader, Card, Badge, Button, EmptyState, MapContainer, Modal, Tabs } from '@/components';
import {
  useAreas, useArea, useDeleteArea, useForecastArea, useRescanArea, useUpdateArea,
  useChangeDetection, useOperations, useScenesByBbox,
} from '@/hooks/useApi';
import { OperationForm, type OperationPrefill } from '@/components/operations/OperationForm';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { ROLE_LEVEL } from '@/types';
import type {
  AreaForecast, AoiBBox, SavedArea, PipelineHotspot, PipelineDetection, SurfaceComposition,
  Operation, SatelliteScene, SceneRef,
} from '@/types';
import { formatArea, formatCoords, cn } from '@/lib/utils';
import { CLASS_COLORS, CLASS_ORDER } from '@/lib/classColors';
import SimilarSitesDrawer from '@/components/map/SimilarSitesDrawer';

// Class palette shared with Map Explorer (single source of truth) — uniform across
// the app. Plastic = salient teal; Algae = distinct lime (never near plastic teal).
const SEV_COLORS: Record<string, string> = { HIGH: '#EF4444', MEDIUM: '#F59E0B', LOW: '#14B8A6' };

/** Fit the map to whichever area is selected. */
function FitArea({ bbox }: { bbox: AoiBBox | null }) {
  const map = useMap();
  useEffect(() => {
    if (bbox) {
      map.fitBounds([[bbox.south, bbox.west], [bbox.north, bbox.east]], { padding: [30, 30], maxZoom: 11 });
    }
  }, [bbox, map]);
  return null;
}

/** Leaflet sizes its tiles at init; inside a flex card the box is often measured
 *  after that. Force a resize on mount so the map fills its container. */
function MapResize() {
  const map = useMap();
  useEffect(() => {
    const fix = () => map.invalidateSize();
    const raf = requestAnimationFrame(fix);
    const t = setTimeout(fix, 300);
    window.addEventListener('resize', fix);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); window.removeEventListener('resize', fix); };
  }, [map]);
  return null;
}

function relTime(iso: string | null): string {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86_400)}d ago`;
}

/** Provenance of the drift forcing — the difference between a real forecast and
 *  a modelled placeholder, so it is never left implicit. */
function ForcingBadge({ source }: { source: string }) {
  if (source === 'cmems') return <Badge variant="success" dot>real CMEMS currents</Badge>;
  if (source === 'open-meteo') return <Badge variant="success" dot>real currents + winds</Badge>;
  return <Badge variant="warn" dot>synthetic forcing</Badge>;
}

export default function Areas() {
  const user = useAuthStore((s) => s.user);
  const canManage = (user?.level ?? 0) >= ROLE_LEVEL.FIELD;

  const list = useAreas();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // "Similar sites" (Clay) drawer + "dispatch operation" form — both lifted to
  // the page root so they render ABOVE the full-screen modal (the modal panel is
  // transformed by framer-motion, which would otherwise trap a fixed child).
  const [simHotspot, setSimHotspot] = useState<PipelineHotspot | null>(null);
  const [dispatchPrefill, setDispatchPrefill] = useState<OperationPrefill | null>(null);
  // OperationForm seeds its fields from `prefill` via one-shot useState
  // initializers, so it must REMOUNT to pick up a new prefill — this nonce keys
  // it, bumping on each dispatch (stable during a single open→cancel session).
  const [dispatchNonce, setDispatchNonce] = useState(0);
  const openDispatch = (p: OperationPrefill) => { setDispatchPrefill(p); setDispatchNonce((n) => n + 1); };
  const detail = useArea(selectedId ?? undefined);

  // Shareable deep link: /app/areas?area=<id> opens straight into the detail.
  const [params, setParams] = useSearchParams();
  const urlArea = params.get('area');
  useEffect(() => {
    if (urlArea && urlArea !== selectedId) setSelectedId(urlArea);
  }, [urlArea]); // eslint-disable-line react-hooks/exhaustive-deps

  const rescan = useRescanArea();
  const forecast = useForecastArea();
  const remove = useDeleteArea();
  const update = useUpdateArea();

  const areas = useMemo(() => list.data ?? [], [list.data]);
  const area = detail.data ?? null;

  // Gallery triage: search + region filter + sort.
  const [query, setQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<'priority' | 'recent' | 'plastic' | 'name'>('priority');
  const regionsPresent = useMemo(
    () => Array.from(new Set(areas.map((a) => a.regionCode).filter(Boolean))) as string[],
    [areas],
  );
  const visibleAreas = useMemo(() => {
    let rows = areas;
    const q = query.trim().toLowerCase();
    if (q) rows = rows.filter((a) => a.name.toLowerCase().includes(q) || (a.regionCode ?? '').toLowerCase().includes(q));
    if (regionFilter) rows = rows.filter((a) => a.regionCode === regionFilter);
    const sorted = [...rows];
    if (sort === 'priority') sorted.sort((a, b) => areaPriority(b) - areaPriority(a));
    else if (sort === 'recent') sorted.sort((a, b) => (b.lastScanAt ?? b.createdAt).localeCompare(a.lastScanAt ?? a.createdAt));
    else if (sort === 'plastic') sorted.sort((a, b) => b.stats.plastic - a.stats.plastic);
    else sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }, [areas, query, regionFilter, sort]);

  const openArea = (id: string) => {
    setSelectedId(id);
    setParams((p) => { const n = new URLSearchParams(p); n.set('area', id); return n; });
  };
  const closeDetail = () => {
    setSelectedId(null);
    setParams((p) => { const n = new URLSearchParams(p); n.delete('area'); return n; }, { replace: true });
  };

  const runForecast = (horizonHours = 72) => {
    if (!area) return;
    forecast.mutate(
      { id: area.id, horizonHours },
      {
        onSuccess: (fc) =>
          toast.success(
            `${horizonHours}h forecast stored — landfall ${Math.round(fc.landfallProbability * 100)}%` +
            (fc.etaHours != null ? ` · ETA ${Math.round(fc.etaHours)}h` : ''),
          ),
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Forecast failed'),
      },
    );
  };

  const runRescan = () => {
    if (!area) return;
    rescan.mutate(
      { id: area.id, bbox: area.bbox, runOpts: area.runOpts },
      {
        onSuccess: () => toast.success('Area re-scanned — stored scan updated'),
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Re-scan failed'),
      },
    );
  };

  const doDelete = () => {
    if (!area) return;
    if (!window.confirm(`Delete "${area.name}"? Its stored scan and forecast history go with it.`)) return;
    remove.mutate(area.id, {
      onSuccess: () => { toast.success('Area deleted'); setSelectedId(null); },
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Delete failed'),
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Areas — saved AOIs & drift forecasting"
        subtitle="Every area you keep from Map Explorer is stored with its full scan: bounds, run options, detections, hotspots. Re-scan it to track the same water over time, and run the 72-hour plastic trajectory forecast — each forecast is kept as history so runs stay comparable."
        badge={<Badge variant="ocean" dot>{areas.length} saved</Badge>}
      />

      {list.isLoading && <p className="text-sm text-slate-400">Loading saved areas…</p>}

      {/* Triage toolbar — turns a 5-or-500 tile wall into a searchable surface. */}
      {!list.isLoading && areas.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search areas…"
              className="w-full rounded-xl border border-border bg-white/80 py-2 pl-8 pr-3 text-sm text-slate-700 focus:border-ocean-400 focus:outline-none"
            />
          </div>
          {regionsPresent.length > 1 && (
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => setRegionFilter(null)}
                className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', regionFilter === null ? 'bg-ocean-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200')}
              >
                All
              </button>
              {regionsPresent.map((rc) => (
                <button
                  key={rc}
                  type="button"
                  onClick={() => setRegionFilter(rc)}
                  className={cn('rounded-full px-2.5 py-1 font-mono text-xs font-semibold', regionFilter === rc ? 'bg-ocean-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200')}
                >
                  {rc}
                </button>
              ))}
            </div>
          )}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            title="Sort areas"
            className="rounded-xl border border-border bg-white/80 px-2.5 py-2 text-sm text-slate-600 focus:border-ocean-400 focus:outline-none"
          >
            <option value="priority">Sort: priority</option>
            <option value="recent">Sort: most recent</option>
            <option value="plastic">Sort: most plastic</option>
            <option value="name">Sort: name</option>
          </select>
        </div>
      )}

      {!list.isLoading && areas.length === 0 ? (
        <EmptyState
          icon={<BookMarked size={26} />}
          title="No saved areas yet"
          description={
            canManage
              ? 'Draw an area in Map Explorer, let the scan finish, then press "Save area" to keep it here for re-scanning and drift forecasting.'
              : 'Areas saved by an analyst from Map Explorer will appear here.'
          }
          action={{ label: 'Open Map Explorer', icon: <MapPin size={15} />, onClick: () => { window.location.href = '/app/map'; } }}
        />
      ) : visibleAreas.length === 0 ? (
        <Card className="text-center text-sm text-slate-400">No areas match your search or filter.</Card>
      ) : (
        <motion.div
          className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]"
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.045 } } }}
        >
          {visibleAreas.map((a) => (
            <motion.div
              key={a.id}
              variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="flex"
            >
              <AreaTile area={a} onOpen={() => openArea(a.id)} />
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Full detail opens on click — the gallery stays the home view, so 5
          areas or 500 look the same. */}
      <Modal open={Boolean(selectedId)} onClose={closeDetail} size="full">
        {area ? (
          <DetailErrorBoundary areaId={area.id} onClose={closeDetail}>
            <AreaDetail
              area={area}
              canManage={canManage}
              busy={{ rescan: rescan.isPending, forecast: forecast.isPending, remove: remove.isPending }}
              onClose={closeDetail}
              onRescan={runRescan}
              onForecast={runForecast}
              onDelete={doDelete}
              onOpenSimilar={setSimHotspot}
              onDispatch={openDispatch}
              onRename={(name, notes) =>
                update.mutate({ id: area.id, name, notes }, {
                  onSuccess: () => toast.success('Area updated'),
                  onError: (e) => toast.error(e instanceof Error ? e.message : 'Update failed'),
                })
              }
            />
          </DetailErrorBoundary>
        ) : detail.isError ? (
          <DetailFallback
            title="Couldn't load this area"
            message={detail.error instanceof Error ? detail.error.message : 'The backend may be busy or offline.'}
            onRetry={() => detail.refetch()}
            onClose={closeDetail}
          />
        ) : (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 size={24} className="animate-spin text-ocean-500" />
            <span className="text-sm">Loading area…</span>
          </div>
        )}
      </Modal>

      {/* Clay "similar sites" drawer + dispatch form — rendered at the page root
          so they float above the full-screen detail modal. */}
      <SimilarSitesDrawer hotspot={simHotspot} onClose={() => setSimHotspot(null)} />
      <OperationForm
        key={dispatchNonce}
        open={Boolean(dispatchPrefill)}
        prefill={dispatchPrefill ?? undefined}
        onClose={() => setDispatchPrefill(null)}
      />
    </div>
  );
}

/** Esri World Imagery static export of the AOI — a real satellite thumbnail at
 *  the box's true bounds. Same free service as the basemap tiles (no key). */
function satelliteThumbUrl(b: AoiBBox, w = 440, h = 300): string {
  const bbox = `${b.west},${b.south},${b.east},${b.north}`;
  return 'https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/export'
    + `?bbox=${bbox}&bboxSR=4326&imageSR=4326&size=${w},${h}&format=jpg&f=image`;
}

/** Great-circle distance between two lat/lon points, in km. */
function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function bboxContains(b: AoiBBox, lat: number, lon: number): boolean {
  return lat >= b.south && lat <= b.north && lon >= b.west && lon <= b.east;
}

/** Triage score for the gallery: plastic weighted up, hotspots and confidence
 *  amplify, area gives a mild boost — so the busiest, most-confident areas rank
 *  first. Purely a client-side ranking aid, not a scientific metric. */
function areaPriority(a: SavedArea): number {
  const s = a.stats;
  return s.plastic * 10 + s.hotspots * 6 + Math.round(s.avgConfidence * 10) + Math.min(5, s.areaSqKm / 1000);
}

const htmlEscape = (str: string) =>
  str.replace(/[&<>"]/g, (c) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string));

/** Open a self-contained, print-ready one-page situational brief in a new window
 *  — hands a caveat-stamped briefing to a vessel or command post, no backend. */
function printAreaBrief(area: SavedArea) {
  const win = window.open('', '_blank', 'width=820,height=1040');
  if (!win) { toast.error('Pop-up blocked — allow pop-ups to print the brief'); return; }
  const f = (area.forecasts ?? [])[0] ?? null;
  const s = area.stats;
  const hotspots = (area.result?.hotspots ?? []).slice(0, 6);
  const verdict = f
    ? `<div class="verdict"><span class="big">${Math.round(f.landfallProbability * 100)}%</span><span class="vlabel">landfall risk · ${f.etaHours != null ? 'ETA ' + Math.round(f.etaHours) + 'h' : 'open ocean'} · ${f.pathData?.pathEndReason === 'landfall' ? 'beaches at coast' : 'stays offshore'}</span></div>`
    : '<div class="verdict"><span class="vlabel">No 72-hour drift forecast has been run for this area.</span></div>';
  const hsRows = hotspots.length
    ? hotspots.map((h) => `<tr><td>${htmlEscape(h.label)}</td><td>${h.severity}</td><td>${h.detectionCount}</td><td>${formatCoords(h.centroidLat, h.centroidLon)}</td></tr>`).join('')
    : '<tr><td colspan="4" style="color:#94a3b8">No hotspots detected</td></tr>';
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${htmlEscape(area.name)} — area brief</title>
<style>
 body{font-family:system-ui,-apple-system,sans-serif;color:#1e293b;margin:0;padding:32px;max-width:720px}
 h1{font-size:22px;margin:0 0 2px}
 .sub{color:#64748b;font-family:monospace;font-size:12px;margin:0 0 16px}
 img{width:100%;height:220px;object-fit:cover;border-radius:12px;border:1px solid #e2e8f0}
 .verdict{display:flex;align-items:baseline;gap:12px;margin:16px 0;padding:14px 16px;border:1px solid #ccfbf1;border-radius:12px;background:#f0fdfa}
 .big{font-size:40px;font-weight:800;color:#0d9488;font-family:monospace;line-height:1}
 .vlabel{color:#475569;font-size:13px}
 .stats{display:flex;gap:22px;margin:14px 0;flex-wrap:wrap}
 .stat b{display:block;font-size:20px;font-family:monospace;color:#0f766e}
 .stat span{font-size:11px;color:#94a3b8}
 h2{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;margin:18px 0 4px}
 table{width:100%;border-collapse:collapse;font-size:12px}
 th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #eef2f6}
 th{color:#94a3b8;font-weight:600;text-transform:uppercase;font-size:10px}
 .caveat{margin-top:18px;padding:10px 12px;border:1px solid #fde68a;background:#fffbeb;border-radius:10px;color:#92400e;font-size:11px}
 .foot{margin-top:20px;color:#94a3b8;font-size:10px}
 @media print{body{padding:0}}
</style></head><body>
 <h1>${htmlEscape(area.name)}</h1>
 <p class="sub">${area.regionCode ? area.regionCode + ' · ' : ''}${formatCoords(area.bbox.north, area.bbox.west)} → ${formatCoords(area.bbox.south, area.bbox.east)} · ${formatArea(s.areaSqKm)}</p>
 <img src="${satelliteThumbUrl(area.bbox, 720, 300)}" alt="satellite view" />
 ${verdict}
 <div class="stats">
  <div class="stat"><b>${s.plastic}</b><span>plastic detections</span></div>
  <div class="stat"><b>${s.hotspots}</b><span>hotspots</span></div>
  <div class="stat"><b>${Math.round(s.avgConfidence * 100)}%</b><span>avg confidence</span></div>
  <div class="stat"><b>${s.provider === 'sentinelhub' ? 'real' : 'synthetic'}</b><span>imagery</span></div>
 </div>
 <h2>Hotspots</h2>
 <table><thead><tr><th>Label</th><th>Severity</th><th>Detections</th><th>Centroid</th></tr></thead><tbody>${hsRows}</tbody></table>
 ${f ? `<div class="caveat">The drift forecast is a <b>modelled estimate</b> — not validated against real drifter tracks. Released from ${formatCoords(f.originLat, f.originLon)}. Use as guidance, not a guarantee.</div>` : ''}
 <p class="foot">Marine Plastic Tracker · area brief · scanned ${area.lastScanAt ? area.lastScanAt.slice(0, 10) : '—'}</p>
</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { try { win.print(); } catch { /* user can print manually */ } }, 500);
}

// Deterministic per-area layout for the fallback mini-map (no Math.random, so a
// tile looks the same on every render).
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** On-brand fallback when the satellite export can't be fetched (offline / Esri
 *  down): teal sea + the AOI box + representative detection dots. Keeps the
 *  gallery legible instead of showing a broken-image icon. */
function AreaMiniMap({ area }: { area: SavedArea }) {
  const rnd = mulberry32(hashSeed(area.id));
  const count = Math.min(14, Math.max(4, area.stats.plastic * 3 || 6));
  const dots = Array.from({ length: count }, () => ({
    x: 24 + rnd() * 52, y: 16 + rnd() * 38, r: 1.4 + rnd() * 2.4,
  }));
  const gid = `sea-${area.id}`;
  return (
    <svg viewBox="0 0 100 68" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0f766e" />
          <stop offset="0.6" stopColor="#0d9488" />
          <stop offset="1" stopColor="#14b8a6" />
        </linearGradient>
      </defs>
      <rect width="100" height="68" fill={`url(#${gid})`} />
      <rect
        x="18" y="10" width="64" height="48" rx="2"
        fill="#ffffff" fillOpacity="0.06" stroke="#ecfeff" strokeWidth="1" strokeDasharray="4 3"
      />
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="#0d9488" fillOpacity="0.55" stroke="#ecfeff" strokeWidth="0.4" />
      ))}
    </svg>
  );
}

/** A compact saved-area tile: a real satellite image of the AOI with the name
 *  and key figures overlaid. Click opens the full detail. */
function AreaTile({ area, onOpen }: { area: SavedArea; onOpen: () => void }) {
  const real = area.stats.provider === 'sentinelhub';
  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const pri = areaPriority(area);
  const tier = pri >= 60
    ? { label: 'high', cls: 'bg-red-500' }
    : pri >= 30
      ? { label: 'med', cls: 'bg-amber-500' }
      : { label: 'low', cls: 'bg-teal-500' };
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full overflow-hidden rounded-2xl border border-border bg-white/90 text-left shadow-glass transition-all hover:-translate-y-1 hover:border-ocean-400 hover:shadow-glow-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ocean-500"
    >
      <div className="relative aspect-[3/2] overflow-hidden bg-slate-800">
        {imgFailed ? (
          <AreaMiniMap area={area} />
        ) : (
          <>
            {!imgLoaded && <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-ocean-700 to-ocean-500" />}
            <img
              loading="lazy"
              src={satelliteThumbUrl(area.bbox)}
              alt={`Satellite view of ${area.name}`}
              onError={() => setImgFailed(true)}
              onLoad={() => setImgLoaded(true)}
              className={cn(
                'h-full w-full object-cover transition-all duration-500 group-hover:scale-105',
                imgLoaded ? 'opacity-100' : 'opacity-0',
              )}
            />
          </>
        )}

        <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-semibold text-ocean-700 shadow-glass backdrop-blur">
          <span className={cn('h-1.5 w-1.5 rounded-full', real ? 'bg-success-500' : 'bg-amber-400')} />
          {real ? 'real Sentinel-2' : 'synthetic'}
        </span>
        <span
          title="Triage priority (heuristic: plastic, hotspots, confidence, size)"
          className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-semibold text-slate-600 shadow-glass backdrop-blur"
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', tier.cls)} />
          {tier.label}
        </span>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900/85 via-slate-900/35 to-transparent px-3 pb-2.5 pt-7">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-white">{area.name}</span>
            {area.regionCode && (
              <span className="shrink-0 rounded bg-white/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white backdrop-blur">
                {area.regionCode}
              </span>
            )}
          </div>
          <div className="mt-0.5 font-mono text-[10.5px] text-white/80">
            {formatArea(area.stats.areaSqKm)} · scanned {relTime(area.lastScanAt)}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 py-2 font-mono text-[11px] text-slate-500">
        <span className="font-semibold text-ocean-700">{area.stats.plastic} plastic</span>
        <span className="text-slate-300">·</span>
        <span>{area.stats.hotspots} hotspot{area.stats.hotspots === 1 ? '' : 's'}</span>
        {(area.forecastCount ?? 0) > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 font-semibold text-ocean-600">
            <Navigation2 size={11} /> {area.forecastCount}
          </span>
        )}
      </div>
    </button>
  );
}

function AreaDetail({ area, canManage, busy, onClose, onRescan, onForecast, onDelete, onRename, onOpenSimilar, onDispatch }: {
  area: SavedArea;
  canManage: boolean;
  busy: { rescan: boolean; forecast: boolean; remove: boolean };
  onClose: () => void;
  onRescan: () => void;
  onForecast: (horizon?: number) => void;
  onDelete: () => void;
  onRename: (name: string, notes: string | null) => void;
  onOpenSimilar: (h: PipelineHotspot) => void;
  onDispatch: (prefill: OperationPrefill) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(area.name);
  const [notes, setNotes] = useState(area.notes ?? '');
  const [tab, setTab] = useState<'forecast' | 'scan' | 'activity' | 'tools'>('forecast');
  const [horizon, setHorizon] = useState(72);

  /** Build an OperationForm prefill from a hotspot in this area. */
  const dispatchHotspot = (h: PipelineHotspot) => onDispatch({
    title: `${area.name} — ${h.severity} debris sweep`,
    priority: h.severity,
    regionCode: area.regionCode,
    targetLat: h.centroidLat,
    targetLon: h.centroidLon,
  });

  const copyShareLink = async () => {
    const url = `${window.location.origin}/app/areas?area=${area.id}`;
    try { await navigator.clipboard.writeText(url); toast.success('Area link copied to clipboard'); }
    catch { toast.error('Could not copy the link'); }
  };

  const printBrief = () => printAreaBrief(area);

  // Reset the draft whenever a different area is selected.
  useEffect(() => { setName(area.name); setNotes(area.notes ?? ''); setEditing(false); }, [area.id, area.name, area.notes]);

  const result = area.result ?? null;
  const detections = result?.detections ?? [];
  const hotspots = result?.hotspots ?? [];
  // Suppress the MAP markers (not the data tabs) on a land/cloud-dominated
  // (not water-valid) scan — those are known false positives firing on
  // vegetation/cloud, not marine plastic. The reliability banner explains why.
  // Coastal 'degraded' scans keep their markers — they have real water.
  const scanUsable = !result?.stats?.surface || result.stats.surface.waterValid;
  // The 72h drift models PLASTIC parcels, so it may only run when this area has
  // real plastic to release from — never from an empty AOI centroid (which drew
  // a senseless drift for algae-only / no-detection / inland scans). Needs a
  // usable (water-valid) scan AND at least one plastic detection.
  const canForecast = scanUsable && area.stats.plastic > 0;
  const forecasts = area.forecasts ?? [];
  const latest = forecasts[0] ?? null;

  const exportGeojson = () => {
    const features = [
      ...detections.map((d) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [d.lon, d.lat] },
        properties: { kind: 'detection', class: d.classification, confidence: d.confidence, fdi: d.fdiScore },
      })),
      ...hotspots.map((h) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [h.centroidLon, h.centroidLat] },
        properties: { kind: 'hotspot', label: h.label, severity: h.severity, detections: h.detectionCount },
      })),
      ...forecasts.flatMap((f) => {
        const pts = f.pathData?.points ?? [];
        return pts.length > 1
          ? [{
              type: 'Feature' as const,
              geometry: { type: 'LineString' as const, coordinates: pts.map((p) => [p.lon, p.lat]) },
              properties: {
                kind: 'drift-forecast', computedAt: f.computedAt, horizonHours: f.horizonHours,
                landfallProbability: f.landfallProbability, etaHours: f.etaHours, forcing: f.dataSource,
              },
            }]
          : [];
      }),
      {
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[
            [area.bbox.west, area.bbox.south], [area.bbox.east, area.bbox.south],
            [area.bbox.east, area.bbox.north], [area.bbox.west, area.bbox.north],
            [area.bbox.west, area.bbox.south],
          ]],
        },
        properties: { kind: 'aoi', name: area.name },
      },
    ];
    const blob = new Blob([JSON.stringify({ type: 'FeatureCollection', features }, null, 2)], {
      type: 'application/geo+json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${area.name.replace(/[^\w-]+/g, '_')}.geojson`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* ── Sticky command bar — full-bleed (-mx-6 -mt-6 cancels the Modal's p-6)
          so the primary 72h-drift action never scrolls out of reach. ── */}
      <div className="sticky top-0 z-[30] -mx-6 -mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/70 bg-white/85 px-6 py-3 backdrop-blur-md">
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-ocean-300 px-2 py-1 font-display text-base font-bold text-slate-800"
            />
          ) : (
            <h2 className="truncate font-display text-base font-bold text-slate-800">{area.name}</h2>
          )}
          <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">
            {area.regionCode ? `${area.regionCode} · ` : ''}
            {formatCoords(area.bbox.north, area.bbox.west)} → {formatCoords(area.bbox.south, area.bbox.east)} · {formatArea(area.stats.areaSqKm)}
          </p>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          {latest && !editing && <ForcingBadge source={latest.dataSource} />}
          {canManage && !editing && canForecast && (
            <>
              <select
                value={horizon}
                onChange={(e) => setHorizon(Number(e.target.value))}
                title="Forecast horizon"
                disabled={busy.forecast}
                className="rounded-lg border border-border bg-white px-1.5 py-1.5 font-mono text-xs text-slate-600 disabled:opacity-50"
              >
                {[24, 48, 72, 120, 240].map((h) => <option key={h} value={h}>{h}h</option>)}
              </select>
              <Button
                variant="primary"
                size="sm"
                icon={busy.forecast ? <Loader2 size={15} className="animate-spin" /> : <Navigation2 size={15} />}
                disabled={busy.forecast}
                onClick={() => onForecast(horizon)}
                className="shadow-glow-primary"
              >
                {busy.forecast ? 'Forecasting…' : latest ? `Re-run ${horizon}h` : `Run ${horizon}h forecast`}
              </Button>
            </>
          )}
          {!editing && (
            <>
              <IconBtn title="Copy shareable link" onClick={copyShareLink}><Share2 size={14} /></IconBtn>
              <IconBtn title="Print area brief" onClick={printBrief}><Printer size={14} /></IconBtn>
            </>
          )}
          {canManage && (editing ? (
            <>
              <IconBtn title="Save changes" onClick={() => { onRename(name.trim() || area.name, notes.trim() || null); setEditing(false); }} className="border-ocean-300 text-ocean-700 hover:bg-ocean-50"><Check size={14} /></IconBtn>
              <IconBtn title="Discard" onClick={() => { setName(area.name); setNotes(area.notes ?? ''); setEditing(false); }}><X size={14} /></IconBtn>
            </>
          ) : (
            <>
              <IconBtn title="Re-scan area" onClick={onRescan} busy={busy.rescan}><RefreshCw size={14} /></IconBtn>
              <IconBtn title="Rename / edit notes" onClick={() => setEditing(true)}><Pencil size={14} /></IconBtn>
              <IconBtn title="Delete area" onClick={onDelete} busy={busy.remove} className="hover:text-red-600"><Trash2 size={14} /></IconBtn>
            </>
          ))}
          <IconBtn title="Close" onClick={onClose}><X size={14} /></IconBtn>
        </div>

        {editing && (
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Notes about this area…"
            className="w-full rounded-lg border border-border px-2 py-1.5 text-sm text-slate-700"
          />
        )}
      </div>

      {!editing && area.notes && (
        <p className="text-sm leading-relaxed text-slate-600">{area.notes}</p>
      )}

      {/* Honest scan-quality gate — FDI is only meaningful over clear water, so a
          cloud/land-dominated scan must say so before its detections are read. */}
      {!editing && (
        <ScanReliabilityBanner
          surface={result?.stats?.surface ?? null}
          scene={result?.scene ?? null}
          canManage={canManage}
          busy={busy.rescan}
          onRescan={onRescan}
        />
      )}

      {/* ── Hero: landfall verdict + drift map ── */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <VerdictRail latest={latest} canManage={canManage} busy={busy.forecast} onForecast={onForecast} canForecast={canForecast} />
        </div>
        <div className="lg:col-span-3">
          <Card accent padding="none" className="overflow-hidden">
            <div className="relative h-[52vh] min-h-[360px]">
              <MapContainer center={[(area.bbox.north + area.bbox.south) / 2, (area.bbox.east + area.bbox.west) / 2]} zoom={9} basemap="satellite">
                <MapResize />
                <FitArea bbox={area.bbox} />

                <Rectangle
                  bounds={[[area.bbox.south, area.bbox.west], [area.bbox.north, area.bbox.east]]}
                  pathOptions={{ color: '#14B8A6', weight: 2, fillOpacity: 0.04 }}
                />

                {scanUsable && detections.map((d, i) => {
                  // Three visual tiers: HIGH-CONFIDENCE plastic = the trusted signal
                  // (bold, ringed, solid); CANDIDATE plastic = review-queue maybe
                  // (dashed, hollow); non-plastic = faint context noise. So the map
                  // shows at a glance which plastic is dispatch-grade.
                  const isPlastic = d.classification === 'Plastic';
                  const hi = isPlastic && d.highConfidence;
                  const color = CLASS_COLORS[d.classification] ?? '#94A3B8';
                  return (
                    <CircleMarker
                      key={`${d.lat},${d.lon},${i}`}
                      center={[d.lat, d.lon]}
                      radius={isPlastic ? 4 + d.confidence * 4 : 2 + d.confidence * 1.5}
                      pathOptions={{
                        color: isPlastic ? '#0F766E' : color,
                        fillColor: color,
                        fillOpacity: hi ? 0.5 + d.confidence * 0.45 : isPlastic ? 0.08 : 0.12 + d.confidence * 0.18,
                        weight: isPlastic ? (hi ? 2 : 1.25) : 0.5,
                        dashArray: isPlastic && !hi ? '3 3' : undefined,
                      }}
                    >
                      <Popup>
                        <div className="text-xs">
                          <p className="font-semibold">
                            {d.classification.replace('_', ' ')}
                            {isPlastic ? (hi ? ' · HIGH confidence' : ' · candidate') : ' · not plastic'}
                          </p>
                          <p>{formatCoords(d.lat, d.lon)}</p>
                          <p>Confidence {Math.round(d.confidence * 100)}% · FDI {d.fdiScore.toFixed(3)}</p>
                          {isPlastic && !hi && <p className="text-amber-600">Below the ~90%-precision bar — review before dispatch.</p>}
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                })}

                {scanUsable && hotspots.map((h) => (
                  <CircleMarker
                    key={h.label}
                    center={[h.centroidLat, h.centroidLon]}
                    radius={10 + Math.min(h.detectionCount, 20)}
                    eventHandlers={{ click: () => onOpenSimilar(h) }}
                    pathOptions={{
                      color: SEV_COLORS[h.severity], fillColor: SEV_COLORS[h.severity],
                      fillOpacity: 0.15, weight: 2,
                    }}
                  >
                    <Popup>
                      <div className="text-xs">
                        <p className="font-semibold">{h.label} · {h.severity}</p>
                        <p>{h.detectionCount} detections · {Math.round(h.confidence * 100)}% conf.</p>
                        <button type="button" onClick={() => onOpenSimilar(h)} className="mt-1 block font-semibold text-ocean-600 hover:underline">
                          Find similar sites →
                        </button>
                        {canManage && (
                          <button type="button" onClick={() => dispatchHotspot(h)} className="mt-0.5 block font-semibold text-ocean-600 hover:underline">
                            Dispatch crew →
                          </button>
                        )}
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}

                {/* Every stored forecast: the newest solid, older ones faded, so
                    drift runs over the same water can be compared visually. */}
                {forecasts.map((f, i) => (
                  <ForecastPath key={f.id} forecast={f} primary={i === 0} />
                ))}
              </MapContainer>

              <MapLegend detections={detections} hasForecast={forecasts.length > 0} hasHotspot={hotspots.length > 0} suppressed={!scanUsable} />
            </div>
          </Card>
        </div>
      </div>

      {/* ── Tabs: everything else, so the hero stays the star ── */}
      <Tabs
        variant="pill"
        activeKey={tab}
        onChange={(k) => setTab(k as typeof tab)}
        items={[
          { key: 'forecast', label: 'Forecast runs', icon: <Navigation2 size={14} />, badge: forecasts.length || undefined },
          { key: 'scan', label: 'Scan & detections', icon: <Satellite size={14} />, badge: area.stats.plastic || undefined },
          { key: 'activity', label: 'Activity', icon: <Ship size={14} /> },
          { key: 'tools', label: 'Tools & export', icon: <Sparkles size={14} /> },
        ]}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {tab === 'forecast' && <ForecastRunsPanel forecasts={forecasts} latest={latest} />}
            {tab === 'scan' && (
              <ScanPanel area={area} detections={detections} hotspots={hotspots}
                canManage={canManage} onOpenSimilar={onOpenSimilar} onDispatch={dispatchHotspot} />
            )}
            {tab === 'activity' && <ActivityPanel area={area} canManage={canManage} onDispatch={dispatchHotspot} />}
            {tab === 'tools' && <ToolsPanel area={area} onExportGeojson={exportGeojson} />}
          </motion.div>
        </AnimatePresence>
      </Tabs>
    </div>
  );
}

/** One stored forecast drawn on the map: uncertainty cone, forward drift, and
 *  the back-track toward the likely source. */
function ForecastPath({ forecast, primary }: { forecast: AreaForecast; primary: boolean }) {
  const pts = forecast.pathData?.points ?? [];
  const cone = forecast.pathData?.cone ?? [];
  const back = forecast.pathData?.backtrack?.points ?? [];
  if (pts.length < 2) return null;

  const fwd = pts.map((p) => [p.lat, p.lon] as LatLngExpression);
  // Guard against pre-camelCase rows: a legacy cone carries snake_case keys, so
  // c.latMin is undefined and would feed NaN coordinates to Leaflet.
  const coneValid = cone.length > 1 && typeof cone[0]?.latMin === 'number';
  const conePoly: LatLngExpression[] | null = coneValid
    ? [
        ...cone.map((c) => [c.latMin, c.lonMin] as LatLngExpression),
        ...[...cone].reverse().map((c) => [c.latMax, c.lonMax] as LatLngExpression),
      ]
    : null;

  return (
    <>
      {primary && conePoly && (
        <Polygon
          positions={conePoly}
          pathOptions={{ color: '#0D9488', weight: 1, dashArray: '4 4', fillColor: '#14B8A6', fillOpacity: 0.10 }}
        />
      )}
      <Polyline
        positions={fwd}
        pathOptions={{ color: '#059669', weight: primary ? 3 : 1.5, opacity: primary ? 1 : 0.35, dashArray: '2 6' }}
      />
      {primary && back.length > 1 && (
        <Polyline
          positions={back.map((p) => [p.lat, p.lon] as LatLngExpression)}
          pathOptions={{ color: '#F59E0B', weight: 2, dashArray: '4 6' }}
        />
      )}
      {primary && (
        <CircleMarker
          center={fwd[fwd.length - 1]}
          radius={6}
          pathOptions={{ color: '#059669', fillColor: '#10B981', fillOpacity: 0.85, weight: 2 }}
        >
          <Popup>
            <div className="text-xs">
              {forecast.pathData?.pathEndReason === 'landfall' ? (
                <p className="font-semibold">Beaches at coast (+{Math.round(forecast.pathData?.pathEndHours ?? forecast.horizonHours)}h)</p>
              ) : (
                <p className="font-semibold">Forecast end (+{Math.round(forecast.pathData?.pathEndHours ?? forecast.horizonHours)}h)</p>
              )}
              <p>Landfall probability {Math.round(forecast.landfallProbability * 100)}%</p>
              {forecast.etaHours != null && <p>Coast ETA {Math.round(forecast.etaHours)}h</p>}
              <p className="mt-1 border-t border-slate-200 pt-1 text-[10px] italic text-slate-400">
                Modelled estimate — not yet validated against real drifter tracks. Guidance, not a guarantee.
              </p>
            </div>
          </Popup>
        </CircleMarker>
      )}
    </>
  );
}

/** Small square icon button used in the command bar. */
function IconBtn({ title, onClick, busy, className, children }: {
  title: string; onClick: () => void; busy?: boolean; className?: string; children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={busy}
      className={cn('rounded-lg border border-border p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50', className)}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : children}
    </button>
  );
}

/** teal→amber→red bar with a marker that springs to the modelled landfall
 *  probability. */
function RiskMeter({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div>
      <div className="relative h-2 w-full rounded-full" style={{ background: 'linear-gradient(90deg,#14b8a6,#f59e0b,#ef4444)' }}>
        <motion.div
          className="absolute h-3.5 w-3.5 rounded-full border-2 border-white bg-slate-800 shadow"
          style={{ top: '50%', x: '-50%', y: '-50%' }}
          initial={{ left: '0%' }}
          animate={{ left: `${clamped}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 18 }}
        />
      </div>
      <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">modelled probability</p>
    </div>
  );
}

function Fact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-ocean-50/60 px-3 py-2">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-400">{icon}{label}</p>
      <p className="mt-0.5 font-mono text-sm font-bold text-slate-700">{value}</p>
    </div>
  );
}

/** The hero decision aid: a big landfall-risk verdict, or an empty-state CTA. */
function VerdictRail({ latest, canManage, busy, onForecast, canForecast }: {
  latest: AreaForecast | null; canManage: boolean; busy: boolean; onForecast: () => void; canForecast: boolean;
}) {
  if (!latest) {
    // No plastic to release from → the drift model doesn't apply. Say so honestly
    // instead of offering a run that would drift an empty AOI centroid.
    if (!canForecast) {
      return (
        <Card accent className="flex h-full min-h-[360px] flex-col items-center justify-center gap-3 text-center">
          <div className="rounded-2xl bg-slate-100 p-4 text-slate-400"><Navigation2 size={26} /></div>
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-700">No plastic to forecast</h3>
            <p className="mx-auto mt-1 max-w-[34ch] text-xs leading-relaxed text-slate-500">
              The 72-hour drift models <b>plastic parcels</b> carried by ocean currents. This area has no plastic
              detection to release from, so there is nothing to forecast — scan an area with confirmed plastic first.
            </p>
          </div>
        </Card>
      );
    }
    return (
      <Card accent className="flex h-full min-h-[360px] flex-col items-center justify-center gap-4 text-center">
        <div className="rounded-2xl bg-ocean-50 p-4 text-ocean-500"><Navigation2 size={26} /></div>
        <div>
          <h3 className="font-display text-sm font-semibold text-slate-800">No 72-hour drift yet</h3>
          <p className="mx-auto mt-1 max-w-[32ch] text-xs leading-relaxed text-slate-500">
            Model where plastic from this area drifts over 72 hours, its landfall risk, and where it beaches.
          </p>
        </div>
        {canManage ? (
          <Button
            variant="primary"
            icon={busy ? <Loader2 size={15} className="animate-spin" /> : <Navigation2 size={15} />}
            disabled={busy}
            onClick={() => onForecast()}
            className={cn('shadow-glow-primary', !busy && 'animate-pulse')}
          >
            {busy ? 'Forecasting…' : 'Run 72h forecast'}
          </Button>
        ) : (
          <p className="text-[11px] text-slate-400">An analyst can run the forecast.</p>
        )}
      </Card>
    );
  }

  const prob = latest.landfallProbability;
  const pct = Math.round(prob * 100);
  const risk = prob > 0.7
    ? { label: 'HIGH RISK', color: '#EF4444', chip: 'bg-red-100 text-red-700' }
    : prob >= 0.3
      ? { label: 'MODERATE', color: '#F59E0B', chip: 'bg-amber-100 text-amber-700' }
      : { label: 'LOW RISK', color: '#0D9488', chip: 'bg-teal-100 text-teal-700' };
  const landed = latest.pathData?.pathEndReason === 'landfall';
  const endH = Math.round(latest.pathData?.pathEndHours ?? latest.horizonHours);

  // Plain-English readout of the numbers, so the % is legible to non-analysts.
  const backPts = latest.pathData?.backtrack?.points;
  const srcKm = backPts && backPts.length > 1
    ? Math.round(haversineKm(latest.originLat, latest.originLon, backPts[backPts.length - 1].lat, backPts[backPts.length - 1].lon))
    : null;
  const caption = (landed
    ? `${pct}% likely to beach in ~${endH}h`
    : `Stays offshore through +${endH}h — ${pct}% landfall within the horizon`)
    + (srcKm != null ? `; back-track points to a source ~${srcKm} km away.` : '.');

  return (
    <Card accent className="flex h-full min-h-[360px] flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          <Anchor size={12} className="text-ocean-500" /> Landfall risk
        </span>
        <ForcingBadge source={latest.dataSource} />
      </div>

      <div className="flex items-end gap-3">
        <span className="font-mono text-5xl font-bold leading-none" style={{ color: risk.color }}>
          <AnimatedNumber value={pct} /><span className="text-2xl">%</span>
        </span>
        <span className={cn('mb-1 rounded-full px-2.5 py-1 text-[11px] font-bold', risk.chip)}>{risk.label}</span>
      </div>

      <RiskMeter pct={pct} />

      <p className="text-xs font-medium leading-relaxed text-slate-600">{caption}</p>

      <div className="grid grid-cols-2 gap-2 border-t border-border/50 pt-3">
        <Fact icon={<Clock size={12} />} label="Coast ETA" value={latest.etaHours != null ? `${Math.round(latest.etaHours)} h` : 'open ocean'} />
        <Fact icon={<Target size={12} />} label={landed ? 'Beaches' : 'Ends'} value={landed ? `coast · +${endH}h` : `offshore · +${endH}h`} />
      </div>

      <p className="text-[11px] leading-relaxed text-slate-500">
        Released from {formatCoords(latest.originLat, latest.originLon)} · computed {relTime(latest.computedAt)}.
      </p>

      <div className="mt-auto flex items-start gap-1.5 rounded-lg border border-amber-200/70 bg-amber-50/60 px-2.5 py-2 text-[10.5px] leading-snug text-amber-800/90">
        <AlertTriangle size={12} className="mt-0.5 shrink-0" />
        Modelled estimate — not validated against real drifter tracks. Guidance, not a guarantee.
      </div>
    </Card>
  );
}

// ── Tab: forecast runs ────────────────────────────────────────────────────────
function ForecastRunsPanel({ forecasts, latest }: { forecasts: AreaForecast[]; latest: AreaForecast | null }) {
  if (!latest) {
    return (
      <EmptyState
        icon={<Navigation2 size={24} />}
        title="No forecast runs yet"
        description="Run the 72-hour drift forecast to populate this history. Every run is stored so successive runs stay comparable and the model stays auditable."
      />
    );
  }
  const back = latest.pathData?.backtrack?.points ?? [];
  const hasBacktrack = back.length > 1;
  return (
    <div className="space-y-4">
      {forecasts.length > 1 && <CompareRunsChart forecasts={[...forecasts].reverse()} />}
      {forecasts.length > 1 && <EnsembleAgreement forecasts={forecasts} />}

      <Card accent className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Navigation2 size={14} className="text-ocean-600" />
          <h3 className="font-display text-sm font-semibold text-slate-800">Latest run</h3>
          <span className="ml-auto text-xs text-slate-400">computed {relTime(latest.computedAt)}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Landfall prob." value={`${Math.round(latest.landfallProbability * 100)}%`} accent />
          <Metric label="Coast ETA" value={latest.etaHours != null ? `${Math.round(latest.etaHours)} h` : 'open ocean'} />
          <Metric label="Horizon" value={`${latest.horizonHours} h`} />
          <Metric label="Path points" value={latest.pathData?.points?.length ?? 0} />
        </div>
      </Card>

      {/* Back-track explainer — finally labels the amber track on the map. */}
      <Card className="flex items-start gap-3 border-amber-200/70 bg-amber-50/40">
        <div className="rounded-lg bg-amber-100 p-2 text-amber-700"><Wind size={15} /></div>
        <div className="text-xs leading-relaxed text-slate-600">
          <p className="font-semibold text-slate-800">Source back-track{hasBacktrack ? '' : ' — unavailable'}</p>
          {hasBacktrack ? (
            <p className="mt-0.5">
              The amber track on the map runs the drift model in reverse to infer where this plastic likely came
              {' '}<b>from</b> ~{latest.horizonHours}h earlier. This is an <b>inferred source estimate</b>, not a confirmed origin.
            </p>
          ) : (
            <p className="mt-0.5">This run has no stored back-track (an older forecast). Re-run the forecast to compute the likely upstream source.</p>
          )}
        </div>
      </Card>

      {forecasts.length > 1 && (
        <Card accent className="space-y-1">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <History size={12} /> Earlier runs
          </p>
          <div className="divide-y divide-border/50">
            <AnimatePresence initial={false}>
              {forecasts.slice(1).map((f) => (
                <motion.div
                  key={f.id}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1.5 text-xs text-slate-500"
                >
                  <span className="inline-flex items-center gap-1 text-slate-400"><Clock size={11} /> {relTime(f.computedAt)}</span>
                  <span>landfall <b className="text-slate-700">{Math.round(f.landfallProbability * 100)}%</b></span>
                  <span>ETA {f.etaHours != null ? `${Math.round(f.etaHours)}h` : '—'}</span>
                  <span className="ml-auto font-mono text-[10px] text-slate-400">{f.dataSource}</span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </Card>
      )}
    </div>
  );
}

/** Spatial spread of every stored run's path-end — turns the kept history into
 *  an honest uncertainty estimate: do successive forecasts agree on where the
 *  plastic ends up? */
function EnsembleAgreement({ forecasts }: { forecasts: AreaForecast[] }) {
  const ends = forecasts
    .map((f) => { const p = f.pathData?.points; return p && p.length ? p[p.length - 1] : null; })
    .filter((p): p is { t: number; lat: number; lon: number } => p != null);
  if (ends.length < 2) return null;
  const cLat = ends.reduce((s, p) => s + p.lat, 0) / ends.length;
  const cLon = ends.reduce((s, p) => s + p.lon, 0) / ends.length;
  const spread = Math.max(...ends.map((p) => haversineKm(cLat, cLon, p.lat, p.lon)));
  const agree = spread < 10;
  return (
    <Card accent className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Target size={14} className="text-ocean-600" />
        <h3 className="font-display text-sm font-semibold text-slate-800">Ensemble agreement</h3>
        <span className="text-xs text-slate-400">do the stored runs land in the same place?</span>
      </div>
      <div className={cn('flex items-center gap-3 rounded-xl border px-3 py-2',
        agree ? 'border-teal-200 bg-teal-50/60' : 'border-amber-200 bg-amber-50/60')}>
        {agree
          ? <Check size={20} className="shrink-0 text-teal-600" />
          : <AlertTriangle size={20} className="shrink-0 text-amber-600" />}
        <div className="text-xs text-slate-600">
          <p className="font-semibold text-slate-800">{ends.length} runs {agree ? 'agree' : 'disagree'} within ~{spread.toFixed(0)} km</p>
          <p>{agree
            ? 'Successive forecasts land in the same place — higher confidence in the call.'
            : 'Successive forecasts land in different places — treat the landfall estimate as uncertain.'}</p>
        </div>
      </div>
    </Card>
  );
}

function CompareRunsChart({ forecasts }: { forecasts: AreaForecast[] }) {
  const data = forecasts.map((f, i) => ({
    run: `#${i + 1}`,
    landfall: Math.round(f.landfallProbability * 100),
  }));
  return (
    <Card accent className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Activity size={14} className="text-ocean-600" />
        <h3 className="font-display text-sm font-semibold text-slate-800">Compare drift runs</h3>
        <span className="text-xs text-slate-400">landfall probability across successive forecasts</span>
      </div>
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 14, bottom: 2, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="run" tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} unit="%" />
            <RTooltip contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #ccfbf1' }} />
            <Line type="monotone" dataKey="landfall" name="Landfall %" stroke="#0d9488" strokeWidth={2.5} dot={{ r: 3, fill: '#0d9488' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-slate-400">Keeping every run makes the drift model auditable — watch how its landfall call shifts as the forcing updates.</p>
    </Card>
  );
}

// ── Tab: scan & detections ────────────────────────────────────────────────────
function ScanPanel({ area, detections, hotspots, canManage, onOpenSimilar, onDispatch }: {
  area: SavedArea; detections: PipelineDetection[]; hotspots: PipelineHotspot[];
  canManage: boolean; onOpenSimilar: (h: PipelineHotspot) => void; onDispatch: (h: PipelineHotspot) => void;
}) {
  const surface = area.result?.stats?.surface ?? null;
  return (
    <div className="space-y-4">
      <Card accent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Satellite size={15} className="text-ocean-600" />
          <h3 className="font-display text-sm font-semibold text-slate-800">Stored scan</h3>
          <span className="text-xs text-slate-400">scanned {relTime(area.lastScanAt)}</span>
          <span className="ml-auto">
            {area.stats.provider === 'sentinelhub'
              ? <Badge variant="success" dot>real Sentinel-2</Badge>
              : <Badge variant="warn" dot>synthetic pixels</Badge>}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Candidate px" value={area.stats.candidatePixels} />
          <Metric label="Plastic" value={area.stats.plastic} accent />
          <Metric label="Hotspots" value={area.stats.hotspots} />
          <Metric label="Avg conf." value={`${Math.round(area.stats.avgConfidence * 100)}%`} />
        </div>
        {surface && <SurfaceBar surface={surface} />}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 pt-2 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1"><Cpu size={11} /> min-confidence {Math.round(area.runOpts.minConfidence * 100)}%</span>
          <span>dedupe {area.runOpts.dedupe ? 'on' : 'off'}</span>
          <span>biofouling {area.runOpts.biofouling ? 'on' : 'off'}</span>
          <span className="ml-auto">saved {relTime(area.createdAt)}</span>
        </div>
        {!area.lastScanAt && (
          <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-2.5 text-xs text-amber-800">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            This area has no stored scan yet — re-scan it to populate detections before forecasting from a hotspot.
          </p>
        )}
      </Card>

      <DataQualityPanel area={area} />

      {detections.length > 0 && <SpectralScatter detections={detections} />}

      {hotspots.length > 0 && (
        <Card accent className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Target size={14} className="text-ocean-600" />
            <h3 className="font-display text-sm font-semibold text-slate-800">Hotspots</h3>
            <span className="text-xs text-slate-400">find lookalike sites (Clay){canManage ? ' or dispatch a crew' : ''}</span>
          </div>
          <div className="space-y-1.5">
            {hotspots.map((h) => (
              <div
                key={h.label}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border/70 bg-white/60 px-3 py-2"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SEV_COLORS[h.severity] }} />
                <span className="font-mono text-xs font-semibold text-slate-700">{h.label}</span>
                <span className="text-[11px] text-slate-400">{h.severity} · {h.detectionCount} det · {Math.round(h.confidence * 100)}%</span>
                <span className="ml-auto flex items-center gap-2">
                  <button type="button" onClick={() => onOpenSimilar(h)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-ocean-600 hover:underline">
                    <Sparkles size={12} /> similar
                  </button>
                  {canManage && (
                    <button type="button" onClick={() => onDispatch(h)} className="inline-flex items-center gap-1 rounded-md bg-ocean-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-ocean-700">
                      <Ship size={12} /> dispatch
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/** Data quality: grades the stored scan (real vs synthetic, cloud, surface) and
 *  lists recent real Sentinel-2 passes over the exact bbox so an analyst can
 *  decide whether to re-scan from a cleaner scene. */
function DataQualityPanel({ area }: { area: SavedArea }) {
  const scenesQ = useScenesByBbox(area.bbox, false);
  const scenes = (scenesQ.data?.data ?? []) as SatelliteScene[];
  const scene = area.result?.scene ?? null;
  const surface = area.result?.stats?.surface ?? null;
  const real = area.stats.provider === 'sentinelhub';
  // Grade from the SCL surface of the CLASSIFIED pixels, not a single pass's
  // tile-level cloud — the scan is a least-cloud composite, so its effective
  // cloud (SCL) is lower than any one scene's metadata. Fall back to the scene
  // metadata only when no SCL surface exists.
  const cloud = surface?.cloudPct ?? scene?.cloudCoverPct;

  const grade = !real
    ? { label: 'Synthetic', cls: 'bg-amber-100 text-amber-700', note: 'This scan used synthetic pixels — add real imagery for a graded result.' }
    : (surface?.reliability === 'unusable' || (cloud != null && cloud > 60))
      ? { label: 'Poor', cls: 'bg-red-100 text-red-700', note: 'Cloud- or land-dominated scene — detections may be false positives; re-scan from a clearer pass.' }
      : (surface?.reliability === 'degraded' || (cloud != null && cloud > 25))
        ? { label: 'Fair', cls: 'bg-amber-100 text-amber-700', note: 'Usable least-cloud composite, but part cloud/land — some detections may be algae or cloud rather than plastic.' }
        : { label: 'Good', cls: 'bg-teal-100 text-teal-700', note: 'Clear, real Sentinel-2 water — detections are trustworthy for this pass.' };

  return (
    <Card accent className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <CloudSun size={14} className="text-ocean-600" />
        <h3 className="font-display text-sm font-semibold text-slate-800">Data quality</h3>
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', grade.cls)}>{grade.label}</span>
        <span className="ml-auto font-mono text-[11px] text-slate-400">
          {scene?.acquisitionDate ? scene.acquisitionDate.slice(0, 10) : '—'}
          {cloud != null ? ` · ${Math.round(cloud)}% cloud` : ''}
          {surface ? ` · ${surface.waterPct}% water · ${surface.landPct}% land` : ''}
          {surface?.coveragePct != null && surface.coveragePct < 95 ? ` · ${Math.round(surface.coveragePct)}% observed` : ''}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-slate-500">{grade.note}</p>
      <div className="border-t border-border/50 pt-2">
        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          <Satellite size={11} /> Recent passes over this box
        </p>
        <p className="mb-1.5 text-[10px] leading-relaxed text-slate-400">
          Single-pass tile cloud below. The scan composites the least-cloud pixels across passes, so its effective cloud is lower.
        </p>
        {scenesQ.isLoading && <p className="py-2 text-center text-xs text-slate-400">Searching imagery…</p>}
        {!scenesQ.isLoading && scenes.length === 0 && (
          <p className="py-2 text-center text-xs text-slate-400">No Sentinel-2 passes found for this box in the last 30 days.</p>
        )}
        <div className="divide-y divide-border/50">
          {scenes.slice(0, 5).map((s) => (
            <div key={s.sceneId} className="flex items-center gap-3 py-1.5 text-xs">
              <span className="font-mono text-[11px] font-medium text-slate-600">{s.tile || '—'}</span>
              <span className="text-slate-400">{s.acquisitionDate.slice(0, 10)}</span>
              <span className={cn('ml-auto', s.cloudCoverPct > 60 ? 'text-red-500' : s.cloudCoverPct > 25 ? 'text-amber-600' : 'text-teal-600')}>
                {Math.round(s.cloudCoverPct)}% cloud
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

// ── Tab: activity (linked operations + cleanup ledger) ────────────────────────
const OP_STATUS_STYLE: Record<string, string> = {
  PLANNED: 'bg-slate-100 text-slate-600',
  DISPATCHED: 'bg-sky-100 text-sky-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-teal-100 text-teal-700',
  CANCELLED: 'bg-slate-100 text-slate-400',
};
function OpStatusPill({ status }: { status: string }) {
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', OP_STATUS_STYLE[status] ?? 'bg-slate-100 text-slate-600')}>
      {status.replace('_', ' ').toLowerCase()}
    </span>
  );
}

function ActivityPanel({ area, canManage, onDispatch }: {
  area: SavedArea; canManage: boolean; onDispatch: (h: PipelineHotspot) => void;
}) {
  const opsQ = useOperations(area.regionCode ? { region: area.regionCode } : {});
  const all = (opsQ.data ?? []) as Operation[];
  // Ops tied to THIS water: target coords inside the bbox, else a region-only
  // match (soft link — a hard areaId FK is the future upgrade).
  const linked = all.filter((o) =>
    o.targetLat != null && o.targetLon != null
      ? bboxContains(area.bbox, o.targetLat, o.targetLon)
      : o.regionCode === area.regionCode);
  const ledger = linked.reduce(
    (acc, o) => {
      if (o.report) {
        acc.kg += o.report.plasticCollectedKg ?? 0;
        acc.km2 += o.report.areaClearedSqKm ?? 0;
        acc.done += 1;
      }
      return acc;
    },
    { kg: 0, km2: 0, done: 0 },
  );
  const topHotspot = area.result?.hotspots?.[0] ?? null;

  return (
    <div className="space-y-4">
      <Card accent className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Recycle size={14} className="text-ocean-600" />
          <h3 className="font-display text-sm font-semibold text-slate-800">Cleanup impact</h3>
          <span className="text-xs text-slate-400">measured recovery from linked missions</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Metric label="Plastic recovered" value={ledger.kg ? `${ledger.kg.toFixed(0)} kg` : '—'} accent />
          <Metric label="Area cleared" value={ledger.km2 ? `${ledger.km2.toFixed(2)} km²` : '—'} />
          <Metric label="Missions done" value={ledger.done} />
        </div>
        <p className="text-[11px] text-slate-400">A hard measurement to set beside the modelled landfall forecast.</p>
      </Card>

      <Card accent className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Ship size={14} className="text-ocean-600" />
          <h3 className="font-display text-sm font-semibold text-slate-800">Field operations</h3>
          <span className="text-xs text-slate-400">missions targeting this water</span>
          {canManage && topHotspot && (
            <button
              type="button"
              onClick={() => onDispatch(topHotspot)}
              className="ml-auto inline-flex items-center gap-1 rounded-md bg-ocean-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-ocean-700"
            >
              <Ship size={12} /> Dispatch crew
            </button>
          )}
        </div>
        {opsQ.isLoading && <p className="py-2 text-center text-xs text-slate-400">Loading operations…</p>}
        {!opsQ.isLoading && linked.length === 0 && (
          <p className="py-2 text-xs text-slate-500">
            No field operations tied to this area yet.
            {canManage ? ' Dispatch a crew from a hotspot to start one.' : ''}
          </p>
        )}
        <div className="space-y-1.5">
          {linked.map((o) => (
            <div key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border/70 bg-white/60 px-3 py-2 text-xs">
              <span className="font-mono font-semibold text-slate-700">{o.code}</span>
              <span className="min-w-0 flex-1 truncate text-slate-600">{o.title}</span>
              {o.report?.plasticCollectedKg != null && <span className="font-semibold text-teal-700">{o.report.plasticCollectedKg} kg</span>}
              <OpStatusPill status={o.status} />
            </div>
          ))}
        </div>
        <p className="border-t border-border/50 pt-2 text-[10.5px] leading-relaxed text-slate-400">
          Linked by location (mission target inside this box) and region. A dispatched crew shows here through to its filed report.
        </p>
      </Card>
    </div>
  );
}

function SurfaceBar({ surface }: { surface: SurfaceComposition }) {
  const segs = [
    { key: 'water', pct: surface.waterPct, color: '#0EA5E9' },
    { key: 'land', pct: surface.landPct, color: '#84CC16' },
    { key: 'cloud', pct: surface.cloudPct, color: '#94A3B8' },
  ].filter((s) => s.pct > 0);
  return (
    <div className="space-y-1">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        {segs.map((s) => <div key={s.key} style={{ width: `${s.pct}%`, background: s.color }} title={`${s.key} ${s.pct}%`} />)}
      </div>
      <p className="font-mono text-[10.5px] text-slate-400">
        <span className="text-sky-600">water {surface.waterPct}%</span> ·{' '}
        <span className="text-lime-600">land {surface.landPct}%</span> · cloud {surface.cloudPct}%
      </p>
    </div>
  );
}

function SpectralScatter({ detections }: { detections: PipelineDetection[] }) {
  const data = detections.map((d) => ({ fdi: d.fdiScore, conf: Math.round(d.confidence * 100), cls: d.classification }));
  return (
    <Card accent className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Activity size={14} className="text-ocean-600" />
        <h3 className="font-display text-sm font-semibold text-slate-800">Spectral signature</h3>
        <span className="text-xs text-slate-400">FDI vs CNN confidence, by class</span>
      </div>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 14, bottom: 2, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis type="number" dataKey="fdi" name="FDI" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v: number) => v.toFixed(2)} />
            <YAxis type="number" dataKey="conf" name="conf" unit="%" domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <ZAxis range={[36, 36]} />
            <RTooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #ccfbf1' }} />
            <Scatter data={data}>
              {data.map((d, i) => <Cell key={i} fill={CLASS_COLORS[d.cls] ?? '#94a3b8'} fillOpacity={0.7} />)}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-slate-400">Built from this area&apos;s stored detections — high FDI + high confidence (top-right) are the strongest plastic candidates.</p>
    </Card>
  );
}

// ── Tab: tools & export ───────────────────────────────────────────────────────
function ToolsPanel({ area, onExportGeojson }: { area: SavedArea; onExportGeojson: () => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ChangeTool bbox={area.bbox} />
      <GeotiffTool bbox={area.bbox} />
      <Card accent className="space-y-2 md:col-span-2">
        <div className="flex items-center gap-2">
          <FileDown size={14} className="text-ocean-600" />
          <h3 className="font-display text-sm font-semibold text-slate-800">Export GeoJSON</h3>
        </div>
        <p className="text-xs leading-relaxed text-slate-500">
          Detections, hotspots, every stored drift path and the AOI outline as one FeatureCollection (QGIS / ArcGIS-ready).
        </p>
        <div>
          <Button variant="outline" size="sm" icon={<FileDown size={15} />} onClick={onExportGeojson}>Download GeoJSON</Button>
        </div>
      </Card>
    </div>
  );
}

/** Debris change: recent-vs-older candidate density. Real-imagery only, slow
 *  (~140s), and honestly degrades when no real scene is available. */
function ChangeTool({ bbox }: { bbox: AoiBBox }) {
  const change = useChangeDetection();
  const d = change.data;
  const trend = d?.trend;
  const TrendIcon = trend === 'increasing' ? TrendingUp : trend === 'decreasing' ? TrendingDown : Minus;
  return (
    <Card accent className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <TrendingUp size={14} className="text-ocean-600" />
        <h3 className="font-display text-sm font-semibold text-slate-800">Debris change</h3>
        <span className="text-xs text-slate-400">recent vs 6 months ago</span>
      </div>
      <p className="text-xs leading-relaxed text-slate-500">
        Compares candidate-debris density in this box now against an older window. Needs real satellite imagery; a cold run can take up to ~2 minutes.
      </p>
      <div>
        <Button
          variant="outline"
          size="sm"
          icon={change.isPending ? <Loader2 size={15} className="animate-spin" /> : <TrendingUp size={15} />}
          disabled={change.isPending}
          onClick={() => change.mutate(bbox)}
        >
          {change.isPending ? 'Comparing… (up to 2 min)' : 'Run change detection'}
        </Button>
      </div>
      {change.isError && <p className="text-xs text-red-600">Change detection needs the engine and real Sentinel Hub imagery.</p>}
      {d && !d.available && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          No real imagery available for this area — change detection can&apos;t run on synthetic pixels.
        </p>
      )}
      {d && d.available && (
        <div className={cn(
          'flex items-center gap-3 rounded-xl border px-3 py-2',
          trend === 'increasing' ? 'border-red-200 bg-red-50/60'
            : trend === 'decreasing' ? 'border-teal-200 bg-teal-50/60'
              : 'border-slate-200 bg-slate-50',
        )}>
          <TrendIcon size={20} className={trend === 'increasing' ? 'text-red-600' : trend === 'decreasing' ? 'text-teal-600' : 'text-slate-500'} />
          <div className="text-xs text-slate-600">
            <p className="font-semibold capitalize text-slate-800">{trend}</p>
            <p>recent {d.recent.candidatePixels} vs older {d.old.candidatePixels} candidates · density Δ {d.densityDelta.toExponential(1)}</p>
          </div>
        </div>
      )}
    </Card>
  );
}

/** Georeferenced index raster (FDI / NDVI / FAI) download. Real-imagery only. */
function GeotiffTool({ bbox }: { bbox: AoiBBox }) {
  const [layer, setLayer] = useState('fdi');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await api.exportGeotiff(bbox, layer);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed — needs real imagery and the engine');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card accent className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Download size={14} className="text-ocean-600" />
        <h3 className="font-display text-sm font-semibold text-slate-800">Export index raster</h3>
        <span className="text-xs text-slate-400">GeoTIFF</span>
      </div>
      <p className="text-xs leading-relaxed text-slate-500">
        Download a georeferenced spectral-index raster for this area (open in QGIS / ArcGIS). Real-imagery areas only; a cold export can take ~90s.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={layer}
          onChange={(e) => setLayer(e.target.value)}
          className="rounded-lg border border-border bg-white px-2 py-1.5 text-xs text-slate-700"
        >
          <option value="fdi">FDI · floating debris</option>
          <option value="ndvi">NDVI · vegetation</option>
          <option value="fai">FAI · algae</option>
        </select>
        <Button
          variant="outline"
          size="sm"
          icon={busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
          disabled={busy}
          onClick={run}
        >
          {busy ? 'Exporting…' : 'Download GeoTIFF'}
        </Button>
      </div>
    </Card>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-ocean-50/60 px-3 py-2">
      <p className={cn('font-mono text-xl font-bold', accent ? 'text-ocean-700' : 'text-slate-700')}>{value}</p>
      <p className="text-[11px] text-slate-400">{label}</p>
    </div>
  );
}

function LegendRow({ color, label, ring = false }: { color: string; label: string; ring?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={ring ? { border: `2px solid ${color}`, background: `${color}22` } : { background: color }}
      />
      <span className="text-slate-500">{label}</span>
    </div>
  );
}

/** Honest map legend: counts detections PER CLASS (so 108 algae never reads as
 *  108 plastic) and keeps the drift/back-track lines in a separate group. Only
 *  classes actually present are listed. */
function MapLegend({ detections, hasForecast, hasHotspot, suppressed = false }: {
  detections: PipelineDetection[]; hasForecast: boolean; hasHotspot: boolean; suppressed?: boolean;
}) {
  const counts = detections.reduce<Record<string, number>>((acc, d) => {
    acc[d.classification] = (acc[d.classification] ?? 0) + 1;
    return acc;
  }, {});
  const plasticHi = detections.filter((d) => d.classification === 'Plastic' && d.highConfidence).length;
  const present = CLASS_ORDER.filter((c) => counts[c] > 0);
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-[500] max-w-[13.5rem] rounded-xl border border-border/70 bg-white/90 p-2.5 text-[11px] shadow-glass backdrop-blur">
      <p className="mb-1 font-semibold text-slate-600">Detections by class</p>
      {suppressed && (
        <p className="text-amber-600">Markers hidden — land/cloud scene, detections aren&apos;t over water.</p>
      )}
      {!suppressed && present.length === 0 && <p className="text-slate-400">No detections in this scan</p>}
      {!suppressed && present.map((c) => (
        <div key={c}>
          <LegendRow
            color={CLASS_COLORS[c]}
            label={`${counts[c]} ${c.replace('_', ' ').toLowerCase()}${c === 'Plastic' ? '' : ' (not plastic)'}`}
          />
          {c === 'Plastic' && (
            <p className="ml-4 text-[10px] leading-tight text-slate-400">
              <span className="font-semibold text-ocean-700">{plasticHi} high-confidence</span> (~90% precise) · {counts.Plastic - plasticHi} candidate
            </p>
          )}
        </div>
      ))}
      {hasHotspot && <LegendRow color="#EF4444" label="High-severity hotspot" ring />}
      {(hasForecast || hasHotspot) && <div className="my-1 border-t border-border/60" />}
      {hasForecast && (
        <>
          <LegendRow color="#059669" label="72h forecast drift" />
          <LegendRow color="#F59E0B" label="Back-track to source" />
        </>
      )}
    </div>
  );
}

/** Honest scan-quality gate. FDI only detects plastic over clear water, so a
 *  cloud- or land-dominated scene must announce that its detections aren't
 *  trustworthy — instead of letting cloud/algae false positives read as plastic.
 *  Uses the backend reliability grade, falling back to a derived one for scans
 *  stored before the grade existed. */
function ScanReliabilityBanner({ surface, scene, canManage, busy, onRescan }: {
  surface: SurfaceComposition | null;
  scene: SceneRef | null;
  canManage: boolean;
  busy: boolean;
  onRescan: () => void;
}) {
  if (!surface) return null;
  const cov = surface.coveragePct;
  const grade = surface.reliability && surface.reliability !== 'unknown'
    ? surface.reliability
    : ((cov != null && cov < 25) || !surface.waterValid || surface.cloudPct >= 60 || surface.waterPct < 15
        ? 'unusable'
        : (cov == null || cov >= 60) && surface.cloudPct <= 20 && surface.waterPct >= 50 ? 'reliable' : 'degraded');

  const water = Math.round(surface.waterPct);
  const cloud = Math.round(surface.cloudPct);
  const land = Math.round(surface.landPct);
  const est = surface.source === 'geographic-estimate';
  const on = scene?.acquisitionDate ? ` Scene ${scene.acquisitionDate.slice(0, 10)}.` : '';
  // Composition is OF THE OBSERVED area, so note coverage when it's partial.
  const covNote = cov != null && cov < 95 ? ` ${Math.round(cov)}% of area observed —` : '';
  const comp = `${water}% water · ${land}% land · ${cloud}% cloud`;

  if (grade === 'reliable') {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-success-200/70 bg-success-50/50 px-3 py-2 text-xs text-success-800">
        <Check size={14} className="shrink-0" />
        <span>Clear scene —{covNote} {comp}{est ? ' (estimated)' : ''}. Detections are trustworthy for this pass.</span>
      </div>
    );
  }

  const unusable = grade === 'unusable';
  const lowCov = cov != null && cov < 40;
  const Icon = unusable ? AlertTriangle : CloudSun;
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2.5 text-xs',
      unusable ? 'border-red-200 bg-red-50/60 text-red-800' : 'border-amber-200 bg-amber-50/60 text-amber-800')}>
      <Icon size={16} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {unusable ? (lowCov ? 'Barely observed — not trustworthy' : "This scan isn't trustworthy") : 'Degraded scan — read with caution'}
        </p>
        <p className="mt-0.5 opacity-80">
          {covNote} of what was seen: {comp}{est ? ' (geographic estimate)' : ''}. FDI only detects plastic over clear water, so{' '}
          {unusable
            ? (lowCov ? 'too little of the area had a clear pass to trust these detections' : 'these detections are likely cloud/land false positives')
            : 'some detections may be cloud or algae rather than plastic'}.{on} Re-scan for a clearer pass.
        </p>
      </div>
      {canManage && (
        <Button variant="ghost" size="sm" icon={<RefreshCw size={13} />} disabled={busy} onClick={onRescan}>
          {busy ? 'Re-scanning…' : 'Re-scan'}
        </Button>
      )}
    </div>
  );
}

/** Counts up to `value` on mount / whenever it changes — the landfall % reads as
 *  a live readout rather than a static figure. Falls back to the raw value under
 *  reduced-motion and guards non-finite input. */
function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const safe = Number.isFinite(value) ? value : 0;
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => Math.round(v));
  useEffect(() => {
    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { mv.set(safe); return; }
    const controls = animate(mv, safe, { duration: 0.8, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [safe, mv]);
  return <motion.span className={className}>{rounded}</motion.span>;
}

/** Shared fallback panel (error / retry) for the detail modal. */
function DetailFallback({ title, message, onRetry, onClose }: {
  title: string; message: string; onRetry?: () => void; onClose: () => void;
}) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="rounded-2xl bg-red-50 p-3 text-red-500"><AlertTriangle size={24} /></div>
      <div>
        <h3 className="font-display text-sm font-semibold text-slate-800">{title}</h3>
        <p className="mx-auto mt-1 max-w-[42ch] text-xs leading-relaxed text-slate-500">{message}</p>
      </div>
      <div className="flex gap-2">
        {onRetry && (
          <Button variant="primary" size="sm" icon={<RefreshCw size={14} />} onClick={onRetry}>Try again</Button>
        )}
        <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}

/** Isolates a render crash in one area's detail so a single bad payload (a
 *  legacy forecast row, a malformed scan) shows a recoverable message instead of
 *  blanking the whole modal. Resets when a different area is opened. */
class DetailErrorBoundary extends Component<
  { areaId: string; onClose: () => void; children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { areaId: string }) {
    // Opening a different area clears a prior crash so it can render fresh.
    if (prev.areaId !== this.props.areaId && this.state.error) this.setState({ error: null });
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Area detail crashed:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <DetailFallback
          title="This area couldn't be displayed"
          message={`Something in the stored scan or forecast data didn't render. ${this.state.error.message}`}
          onRetry={() => this.setState({ error: null })}
          onClose={this.props.onClose}
        />
      );
    }
    return this.props.children;
  }
}
