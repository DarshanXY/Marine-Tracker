import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CircleMarker, ImageOverlay, Popup, Polyline, Polygon, Rectangle, useMap, useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import type { LatLng, LatLngBoundsExpression, LatLngExpression } from 'leaflet';
import 'leaflet.heat'; // augments L with L.heatLayer (see types/leaflet.heat.d.ts)
import { motion, AnimatePresence } from 'framer-motion';
import {
  Square, Radio, Loader2, Satellite, X, Info, MapPin, Cpu,
  Activity, Boxes, Wind, BellRing, Check, ScanLine, AlertTriangle,
  RefreshCw, FileDown, Layers, CloudOff, Flame, Droplets,
  Navigation2, TrendingUp, Download, SlidersHorizontal, Target,
} from 'lucide-react';
import { PageHeader, Card, Badge, MapContainer } from '@/components';
import { useAoiAnalysis, useScenesByBbox, useRegions, useForecast, useChangeDetection } from '@/hooks/useApi';
import { useMapStore, bboxKey } from '@/stores/mapStore';
import { api } from '@/lib/api';
import type {
  AoiBBox, PipelineHotspot, PipelineResult, PipelineStage, PipelineStats, SatelliteScene, TrajectoryForecast,
} from '@/types';
import { formatArea, formatCoords, cn } from '@/lib/utils';
import SimilarSitesDrawer from '@/components/map/SimilarSitesDrawer';

const CLASS_COLORS: Record<string, string> = {
  Plastic: '#0D9488',
  Algae: '#10B981',
  Sea_Foam: '#22D3EE',
  Water: '#94A3B8',
};
const ALL_CLASSES = ['Plastic', 'Algae', 'Sea_Foam', 'Water'];
const SEV_COLORS: Record<string, string> = { HIGH: '#EF4444', MEDIUM: '#F59E0B', LOW: '#14B8A6' };

const MIN_DEG = 0.01; // ignore accidental micro-drags
const LIVE_INTERVAL_MS = 30_000;

// The six real pipeline stages, in run order, for the live processing timeline.
const STAGE_ORDER = ['DOWNLOAD', 'FDI', 'CNN', 'DBSCAN', 'DRIFT', 'ALERT'] as const;
const STAGE_META: Record<string, { icon: typeof Satellite; label: string }> = {
  DOWNLOAD: { icon: Satellite, label: 'Scan scene' },
  FDI: { icon: Activity, label: 'FDI index' },
  CNN: { icon: Cpu, label: 'CNN predict' },
  DBSCAN: { icon: Boxes, label: 'Cluster' },
  DRIFT: { icon: Wind, label: 'Drift' },
  ALERT: { icon: BellRing, label: 'Alerts' },
};

/** Draw an AOI rectangle by dragging on the map (when `active`). */
function AoiSelector({ active, onComplete }: { active: boolean; onComplete: (b: AoiBBox) => void }) {
  const [start, setStart] = useState<LatLng | null>(null);
  const [bounds, setBounds] = useState<LatLngBoundsExpression | null>(null);

  const map = useMapEvents({
    mousedown(e) {
      if (!active) return;
      map.dragging.disable();
      setStart(e.latlng);
      setBounds([[e.latlng.lat, e.latlng.lng], [e.latlng.lat, e.latlng.lng]]);
    },
    mousemove(e) {
      if (!active || !start) return;
      setBounds([[start.lat, start.lng], [e.latlng.lat, e.latlng.lng]]);
    },
    mouseup(e) {
      if (!active || !start) return;
      map.dragging.enable();
      const b: AoiBBox = {
        north: Math.max(start.lat, e.latlng.lat),
        south: Math.min(start.lat, e.latlng.lat),
        east: Math.max(start.lng, e.latlng.lng),
        west: Math.min(start.lng, e.latlng.lng),
      };
      setStart(null);
      setBounds(null);
      if (b.north - b.south > MIN_DEG && b.east - b.west > MIN_DEG) onComplete(b);
    },
  });

  useEffect(() => {
    if (!active) { map.dragging.enable(); setStart(null); setBounds(null); }
  }, [active, map]);

  return bounds ? (
    <Rectangle bounds={bounds} pathOptions={{ color: '#0D9488', weight: 2, dashArray: '6 4', fillOpacity: 0.08 }} />
  ) : null;
}

/** Fit the map to the AOI whenever it changes. */
function FitBounds({ bbox }: { bbox: AoiBBox | null }) {
  const map = useMap();
  useEffect(() => {
    if (bbox) {
      map.fitBounds([[bbox.south, bbox.west], [bbox.north, bbox.east]], { padding: [40, 40], maxZoom: 11 });
    }
  }, [bbox, map]);
  return null;
}

/** Leaflet computes tile layout at init; inside a flex + rounded card the box is
 *  often sized AFTER that, leaving grey/half-rendered tiles. Force a resize on
 *  mount (twice, to cover late layout) and on every window resize so the map
 *  always fills its container. */
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

/** Human sentence about the scanned surface, from the real SCL composition. */
function maskInfo(result?: PipelineResult): string | null {
  const s = result?.stats?.surface;
  if (!s) return null;
  return `${s.waterPct}% of the scene was open water — ${s.landPct}% land, ${s.cloudPct}% cloud`;
}

const SURFACE_LABEL: Record<string, string> = {
  water: 'Open water', land: 'Land', cloud: 'Cloud-covered', mixed: 'Mixed water & land',
};

/** Real-time "what am I scanning" readout from Sentinel-2 SCL. FDI/marine
 *  classification is only valid over water, so this warns loudly when it isn't.
 *  Shows an honest note when the scan fell back to a synthetic scene (no real SCL). */
function SurfaceReadout({ stats }: { stats: PipelineStats }) {
  const surface = stats.surface;

  if (!surface) {
    if (stats.provider === 'sentinelhub') return null; // real run but no SCL — say nothing
    return (
      <Card className="flex items-start gap-3 border-slate-200 bg-slate-50/70 text-sm text-slate-600">
        <Info size={16} className="mt-0.5 shrink-0 text-slate-400" />
        <p className="text-xs leading-relaxed">
          <b>Surface unknown</b> — real Sentinel-2 imagery couldn&apos;t be fetched for this area right now, so this is a
          dynamic <b>synthetic</b> scene (a placeholder, not a real detection). The water / land / cloud readout appears
          whenever a real scene is available — try again, or pick an area with recent clear imagery.
        </p>
      </Card>
    );
  }

  const notWater = !surface.waterValid;
  const isEstimate = surface.source === 'geographic-estimate';
  const segs = [
    { key: 'water', pct: surface.waterPct, color: '#0EA5E9' },
    { key: 'land',  pct: surface.landPct,  color: '#84CC16' },
    { key: 'cloud', pct: surface.cloudPct, color: '#94A3B8' },
    { key: 'other', pct: surface.otherPct, color: '#E2E8F0' },
  ].filter((s) => s.pct > 0);

  return (
    <Card className={cn('space-y-2', notWater ? 'border-amber-300 bg-amber-50/60' : 'border-ocean-100 bg-ocean-50/40')}>
      <div className="flex flex-wrap items-center gap-2">
        {notWater
          ? <AlertTriangle size={16} className="shrink-0 text-amber-600" />
          : <Droplets size={16} className="shrink-0 text-ocean-600" />}
        <span className="font-display text-sm font-semibold text-slate-800">
          Scanning: {SURFACE_LABEL[surface.label] ?? surface.label}
        </span>
        {isEstimate && (
          <Badge variant="neutral" dot>estimated from terrain</Badge>
        )}
        <span className="ml-auto font-mono text-xs">
          <span className="text-sky-600">water {surface.waterPct}%</span>
          <span className="text-slate-300"> · </span>
          <span className="text-lime-600">land {surface.landPct}%</span>
          <span className="text-slate-300"> · </span>
          <span className="text-slate-500">{isEstimate ? 'cloud n/a' : `cloud ${surface.cloudPct}%`}</span>
        </span>
      </div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        {segs.map((s) => (
          <div key={s.key} style={{ width: `${s.pct}%`, background: s.color }} title={`${s.key} ${s.pct}%`} />
        ))}
      </div>
      {isEstimate && (
        <p className="text-xs leading-relaxed text-slate-500">
          Real Sentinel-2 imagery couldn&apos;t be fetched here, so land vs water is <b>estimated from terrain
          elevation</b> (keyless) — cloud can&apos;t be estimated without a real scene. Detections below are a
          <b> synthetic placeholder</b>. You still get an accurate land/water call for any area.
        </p>
      )}
      {notWater && (
        <p className="text-xs leading-relaxed text-amber-800/90">
          This tool detects <b>floating debris on water</b>. Only <b>{surface.waterPct}%</b> of this area is open
          water{isEstimate ? '' : ' — FDI and the classifier are firing on land/cloud'}, so the candidates below are
          {' '}<b>not real marine plastic</b>. Draw a box over open sea for meaningful results.
        </p>
      )}
    </Card>
  );
}

// Debris-intensity heat overlay. leaflet.heat draws on a single canvas, so it
// stays smooth with hundreds/thousands of points where that many CircleMarkers
// would stutter — and it reveals concentration (overlapping detections ramp up)
// the way discrete dots cannot.
const HEAT_GRADIENT: Record<number, string> = {
  0.2: '#22D3EE', 0.4: '#14B8A6', 0.6: '#F59E0B', 0.8: '#EF4444', 1.0: '#B91C1C',
};

function HeatLayer({ points, show }: { points: L.HeatLatLngTuple[]; show: boolean }) {
  const map = useMap();
  const ref = useRef<L.HeatLayer | null>(null);

  useEffect(() => {
    if (show && points.length) {
      if (ref.current) {
        ref.current.setLatLngs(points);
      } else {
        ref.current = L.heatLayer(points, {
          radius: 24, blur: 18, maxZoom: 12, minOpacity: 0.3, max: 1.4,
          gradient: HEAT_GRADIENT,
        }).addTo(map);
      }
    } else if (ref.current) {
      map.removeLayer(ref.current);
      ref.current = null;
    }
  }, [points, show, map]);

  // Always remove the canvas layer on unmount (leaving the map instance clean).
  useEffect(() => () => {
    if (ref.current) { map.removeLayer(ref.current); ref.current = null; }
  }, [map]);

  return null;
}

/** Render a 72h forecast: forward path (green), back-track to source (amber),
 *  and the forecast end-point with landfall probability. */
function ForecastPaths({ forecast }: { forecast?: TrajectoryForecast }) {
  if (!forecast) return null;
  const fwd = forecast.points.map((p) => [p.lat, p.lon] as LatLngExpression);
  const back = forecast.backtrack?.points.map((p) => [p.lat, p.lon] as LatLngExpression) ?? [];
  return (
    <>
      {fwd.length > 1 && (
        <Polyline positions={fwd} pathOptions={{ color: '#059669', weight: 3, dashArray: '2 6' }} />
      )}
      {back.length > 1 && (
        <Polyline positions={back} pathOptions={{ color: '#F59E0B', weight: 2, dashArray: '4 6' }} />
      )}
      {fwd.length > 0 && (
        <CircleMarker
          center={fwd[fwd.length - 1]}
          radius={6}
          pathOptions={{ color: '#059669', fillColor: '#10B981', fillOpacity: 0.85, weight: 2 }}
        >
          <Popup>
            <div className="text-xs">
              <p className="font-semibold">Forecast end (+{forecast.horizonHours}h)</p>
              <p>Landfall probability: {Math.round(forecast.landfall.probability * 100)}%</p>
              {forecast.etaHours != null && <p>Coast ETA: {Math.round(forecast.etaHours)}h</p>}
              <p className="mt-1 border-t border-slate-200 pt-1 text-[10px] italic text-slate-400">
                Modelled estimate — not yet validated against real drifter tracks. Use as guidance, not a guarantee.
              </p>
            </div>
          </Popup>
        </CircleMarker>
      )}
    </>
  );
}

export default function MapExplorer() {
  // Restore the last scan (selection + options) from the persisted session store
  // so leaving the page — or reloading — no longer wipes the results.
  const mapStore = useMapStore();
  const [bbox, setBbox] = useState<AoiBBox | null>(() => mapStore.bbox);
  const [drawing, setDrawing] = useState(false);
  const [live, setLive] = useState(() => mapStore.live);
  const [classFilter, setClassFilter] = useState<Set<string>>(new Set(ALL_CLASSES));
  const [showScene, setShowScene] = useState(false);
  const [showHeat, setShowHeat] = useState(false);
  const [runOpts, setRunOpts] = useState(() => mapStore.runOpts);
  const [exporting, setExporting] = useState(false);
  const [selectedHotspot, setSelectedHotspot] = useState<PipelineHotspot | null>(null);
  const regions = useRegions();

  // Seed the query with the saved snapshot only when it's for THIS exact box, so
  // returning shows results instantly (no re-scan); a new box scans fresh.
  const restored = mapStore.snapshot && bbox && bboxKey(bbox) === bboxKey(mapStore.bbox)
    ? { data: mapStore.snapshot, savedAt: mapStore.savedAt }
    : undefined;
  const aoi = useAoiAnalysis(bbox, live, runOpts, restored);
  const scenes = useScenesByBbox(bbox, live);
  const result = aoi.data?.result;

  // Persist the current selection whenever it changes.
  useEffect(() => { mapStore.setSelection(bbox, runOpts, live); }, [bbox, runOpts, live]); // eslint-disable-line react-hooks/exhaustive-deps
  // Persist a fresh scan result (skip the restored snapshot object itself).
  useEffect(() => {
    if (aoi.data && aoi.data !== mapStore.snapshot) mapStore.setSnapshot(aoi.data);
  }, [aoi.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const forecast = useForecast();
  const change = useChangeDetection();

  const onComplete = (b: AoiBBox) => { setBbox(b); setDrawing(false); };

  // Advanced-tool handlers (new engine features).
  const topHotspot = result?.hotspots?.[0];
  const runForecast = () => {
    const lat = topHotspot?.centroidLat ?? (bbox ? (bbox.north + bbox.south) / 2 : null);
    const lon = topHotspot?.centroidLon ?? (bbox ? (bbox.east + bbox.west) / 2 : null);
    if (lat != null && lon != null) forecast.mutate({ lat, lon, horizon: 72 });
  };
  const runChange = () => { if (bbox) change.mutate(bbox); };
  const doExport = async (layer: string) => {
    if (!bbox) return;
    setExporting(true);
    try { await api.exportGeotiff(bbox, layer); } finally { setExporting(false); }
  };

  const toggleClass = (c: string) =>
    setClassFilter((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });

  // Quick-start AOIs derived from monitored region centres (still dynamic per bbox).
  const quickAois = useMemo(
    () => (regions.data ?? []).slice(0, 5).map((r) => ({
      code: r.code, name: r.displayName,
      bbox: { north: r.centerLat + 0.3, south: r.centerLat - 0.3, east: r.centerLon + 0.35, west: r.centerLon - 0.35 } as AoiBBox,
    })),
    [regions.data],
  );

  const visibleDetections = (result?.detections ?? []).filter((d) => classFilter.has(d.classification));

  // Heat points respect the class filter, so toggling classes also refocuses the
  // heatmap. Weight: plastic counts most, scaled by CNN confidence (floor 0.15
  // so even low-confidence hits register faintly).
  const heatPoints = useMemo<L.HeatLatLngTuple[]>(() => {
    const dets = result?.detections ?? [];
    return dets
      .filter((d) => classFilter.has(d.classification))
      .map((d) => {
        const base = d.classification === 'Plastic' ? 1 : 0.5;
        return [d.lat, d.lon, Math.max(0.15, base * (0.4 + 0.6 * d.confidence))] as L.HeatLatLngTuple;
      });
  }, [result, classFilter]);

  // Scene preview overlay — only with REAL footprint bounds from STAC.
  const scene = result?.scene;
  const sceneBounds: LatLngBoundsExpression | null =
    scene?.thumbnail && scene.bbox && scene.bbox.length === 4
      ? [[scene.bbox[1], scene.bbox[0]], [scene.bbox[3], scene.bbox[2]]]
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Map Explorer — live AOI analysis"
        subtitle="Draw an area of interest on the real satellite map. The full FDI → CNN → DBSCAN → drift pipeline runs live for that area — every result is computed on the fly for your selection."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDrawing((d) => !d)}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors',
                drawing ? 'bg-ocean-600 text-white shadow-glow-primary' : 'border border-border bg-white/80 text-slate-700 hover:border-ocean-400',
              )}
            >
              <Square size={15} /> {drawing ? 'Drawing… drag on map' : 'Draw area'}
            </button>
            <button
              type="button"
              onClick={() => setLive((l) => !l)}
              disabled={!bbox}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50',
                live ? 'bg-success-500 text-white' : 'border border-border bg-white/80 text-slate-700 hover:border-ocean-400',
              )}
              title={bbox ? 'Auto-rescan every 30s' : 'Select an area first'}
            >
              <Radio size={15} className={live ? 'animate-pulse' : ''} /> {live ? 'Live' : 'Go live'}
            </button>
            {bbox && (
              <button
                type="button"
                onClick={() => aoi.refetch()}
                disabled={aoi.isFetching}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-white/80 px-3 py-2 text-sm text-slate-600 hover:border-ocean-400 hover:text-ocean-700 disabled:opacity-50"
                title="Re-scan this area now"
              >
                <RefreshCw size={15} className={aoi.isFetching ? 'animate-spin' : ''} /> Rescan
              </button>
            )}
            {bbox && (
              <button
                type="button"
                onClick={() => { setBbox(null); setLive(false); setShowScene(false); setSelectedHotspot(null); }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-white/80 px-3 py-2 text-sm text-slate-500 hover:text-red-500"
              >
                <X size={15} /> Clear
              </button>
            )}
          </div>
        }
      />

      {/* Quick-start AOIs */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Quick areas:</span>
        {quickAois.map((q) => (
          <button
            key={q.code}
            type="button"
            onClick={() => { setBbox(q.bbox); setDrawing(false); }}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white/70 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-ocean-400 hover:text-ocean-700"
          >
            <MapPin size={12} /> {q.code}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-400">or hold <b>Draw area</b> and drag a box anywhere</span>
      </div>

      {/* Scan failed — say so loudly instead of silently showing nothing. */}
      {aoi.isError && (
        <Card className="flex flex-wrap items-center gap-3 border-red-200 bg-red-50/60 text-sm text-red-700">
          <AlertTriangle size={18} className="shrink-0" />
          <span className="min-w-0 flex-1">
            The area scan failed{aoi.error instanceof Error ? ` — ${aoi.error.message}` : ''}. A cold satellite fetch can take
            up to two minutes; the engine may also be busy or offline.
          </span>
          <button
            type="button"
            onClick={() => aoi.refetch()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-1.5 text-xs font-semibold text-white"
          >
            <RefreshCw size={13} /> Try again
          </button>
        </Card>
      )}

      <Card accent padding="none" className="overflow-hidden">
        <div className={cn('relative h-[60vh] min-h-[440px] max-h-[760px]', drawing && '[&_.leaflet-container]:cursor-crosshair')}>
          <MapContainer center={[14.5, 80]} zoom={5} basemap="satellite">
            <MapResize />
            <FitBounds bbox={bbox} />
            <AoiSelector active={drawing} onComplete={onComplete} />

            {/* Real Sentinel-2 scene preview at its TRUE STAC footprint */}
            {showScene && sceneBounds && scene?.thumbnail && (
              <ImageOverlay url={scene.thumbnail} bounds={sceneBounds} opacity={0.75} />
            )}

            {/* Committed AOI outline */}
            {bbox && (
              <Rectangle
                bounds={[[bbox.south, bbox.west], [bbox.north, bbox.east]]}
                pathOptions={{ color: '#14B8A6', weight: 2, fillOpacity: 0.04 }}
              />
            )}

            {/* Debris-intensity heatmap (canvas) — reveals concentration */}
            <HeatLayer points={heatPoints} show={showHeat} />

            {/* Dynamic detections — size & opacity scale with CNN confidence */}
            {visibleDetections.map((d, i) => (
              <CircleMarker
                key={`${d.lat},${d.lon},${i}`}
                center={[d.lat, d.lon]}
                radius={3 + d.confidence * 4}
                pathOptions={{
                  color: CLASS_COLORS[d.classification] ?? '#94A3B8',
                  fillColor: CLASS_COLORS[d.classification] ?? '#94A3B8',
                  fillOpacity: 0.3 + d.confidence * 0.55,
                  weight: 1,
                }}
              >
                <Popup>
                  <div className="text-xs">
                    <p className="font-semibold">{d.classification.replace('_', ' ')}</p>
                    <p>{formatCoords(d.lat, d.lon)}</p>
                    <p>Confidence: {Math.round(d.confidence * 100)}% · FDI {d.fdiScore.toFixed(3)}</p>
                    <p>Footprint ≈ {formatArea(d.areaSqKm)} · {d.status.replace('_', ' ').toLowerCase()}</p>
                  </div>
                </Popup>
              </CircleMarker>
            ))}

            {/* Hotspots for the selected AOI */}
            {(result?.hotspots ?? []).map((h) => (
              <CircleMarker
                key={h.label}
                center={[h.centroidLat, h.centroidLon]}
                radius={10 + Math.min(h.detectionCount, 20)}
                eventHandlers={{ click: () => setSelectedHotspot(h) }}
                pathOptions={{
                  color: SEV_COLORS[h.severity],
                  fillColor: SEV_COLORS[h.severity],
                  fillOpacity: selectedHotspot?.label === h.label ? 0.32 : 0.15,
                  weight: selectedHotspot?.label === h.label ? 4 : 2,
                }}
              >
                <Popup>
                  <div className="text-xs">
                    <p className="font-semibold">{h.label} · {h.severity}</p>
                    <p>{h.detectionCount} detections · {Math.round(h.confidence * 100)}% conf.</p>
                    {h.tier && (
                      <p className="mt-1">
                        <span className={
                          'rounded px-1.5 py-0.5 font-semibold ' +
                          (h.tier === 'CONFIRMED' ? 'bg-teal-100 text-teal-700' : 'bg-amber-100 text-amber-700')
                        }>
                          {h.tier === 'CONFIRMED' ? 'CONFIRMED plastic' : 'POSSIBLE plastic'}
                        </span>{' '}
                        <span className="text-slate-500">MLP + Clay {h.fusion?.tier ?? ''}{h.fusion?.plasticAffinity != null ? ` · plastic-affinity ${Math.round(h.fusion.plasticAffinity * 100)}%` : ''}</span>
                      </p>
                    )}
                    <p className="mt-1">Coast ETA: {h.etaHours != null ? `${Math.round(h.etaHours)} h` : 'open ocean'}</p>
                    <button
                      type="button"
                      onClick={() => setSelectedHotspot(h)}
                      className="mt-1 font-semibold text-ocean-600 hover:underline"
                    >
                      Find similar sites →
                    </button>
                  </div>
                </Popup>
              </CircleMarker>
            ))}

            {/* ALL drift forecasts: uncertainty cone + mean path per trajectory */}
            {(result?.trajectories ?? []).map((t) => {
              const cone: LatLngExpression[] | null = t.cone.length > 1
                ? [
                    ...t.cone.map((c) => [c.latMin, c.lonMin] as LatLngExpression),
                    ...[...t.cone].reverse().map((c) => [c.latMax, c.lonMax] as LatLngExpression),
                  ]
                : null;
              return (
                <span key={t.detectionIndex}>
                  {cone && (
                    <Polygon
                      positions={cone}
                      pathOptions={{ color: '#0D9488', weight: 1, dashArray: '4 4', fillColor: '#14B8A6', fillOpacity: 0.10 }}
                    />
                  )}
                  <Polyline
                    positions={t.points.map((p) => [p.lat, p.lon] as LatLngExpression)}
                    pathOptions={{ color: '#0D9488', weight: 2, dashArray: '6 6' }}
                  />
                </span>
              );
            })}

            {/* On-demand 72h forecast: forward path + back-track to source */}
            <ForecastPaths forecast={forecast.data} />
          </MapContainer>

          {/* Live scanning overlay — a scan line sweeps the AOI while the engine
              ingests the array, runs FDI, and predicts with the CNN. */}
          <AnimatePresence>
            {bbox && aoi.isFetching && (
              <motion.div
                className="pointer-events-none absolute inset-0 z-[450] overflow-hidden"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              >
                <motion.div
                  className="absolute inset-x-0 h-24 bg-gradient-to-b from-transparent via-ocean-400/40 to-transparent"
                  initial={{ top: '-15%' }}
                  animate={{ top: ['-15%', '100%'] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
                />
                <motion.div
                  className="absolute left-1/2 top-3 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-900/80 px-3.5 py-1.5 text-xs font-semibold text-white shadow-glass backdrop-blur"
                  initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                >
                  <ScanLine size={13} className="animate-pulse text-ocean-300" />
                  Scanning array · FDI · CNN predict… (a cold satellite fetch can take ~1 min)
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Map controls: class filters + scene overlay toggle */}
          {result && (
            <div className="absolute right-4 top-4 z-[500] flex flex-col items-end gap-2">
              <div className="flex flex-wrap justify-end gap-1.5">
                {ALL_CLASSES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleClass(c)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-glass backdrop-blur transition-colors',
                      classFilter.has(c)
                        ? 'border-transparent text-white'
                        : 'border-border bg-white/85 text-slate-400 line-through',
                    )}
                    style={classFilter.has(c) ? { background: CLASS_COLORS[c] } : undefined}
                    title={`Toggle ${c.replace('_', ' ')} markers`}
                  >
                    {c.replace('_', ' ')} · {(result.detections ?? []).filter((d) => d.classification === c).length}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowHeat((h) => !h)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold shadow-glass backdrop-blur',
                  showHeat ? 'bg-red-500 text-white' : 'border border-border bg-white/85 text-slate-600',
                )}
                title="Toggle the debris-intensity heatmap"
              >
                <Flame size={12} /> {showHeat ? 'Hide' : 'Show'} heatmap
              </button>
              {sceneBounds && (
                <button
                  type="button"
                  onClick={() => setShowScene((s) => !s)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold shadow-glass backdrop-blur',
                    showScene ? 'bg-ocean-600 text-white' : 'border border-border bg-white/85 text-slate-600',
                  )}
                >
                  <Layers size={12} /> {showScene ? 'Hide' : 'Show'} real scene preview
                </button>
              )}
            </div>
          )}

          {/* Legend */}
          <div className="pointer-events-none absolute bottom-4 left-4 z-[500] rounded-xl border border-border/70 bg-white/90 p-3 text-xs shadow-glass backdrop-blur">
            <p className="mb-1.5 font-semibold text-slate-600">Legend</p>
            <div className="space-y-1">
              <LegendItem color="#0D9488" label="Plastic (size = confidence)" />
              <LegendItem color="#10B981" label="Algae / other" />
              <LegendItem color="#EF4444" label="High-severity hotspot" ring />
              <LegendItem color="#F59E0B" label="Medium hotspot" ring />
              <LegendItem color="#14B8A6" label="72-h drift + uncertainty cone" ring />
              {showHeat && (
                <div className="flex items-center gap-2 pt-0.5">
                  <span
                    className="h-3 w-8 rounded-full"
                    style={{ background: 'linear-gradient(90deg,#22D3EE,#14B8A6,#F59E0B,#EF4444,#B91C1C)' }}
                  />
                  <span className="text-slate-500">Debris intensity (low → high)</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {bbox && <StageTimeline stages={result?.stages} fetching={aoi.isFetching} />}

      {/* Real-time "what am I scanning" readout (real SCL) or synthetic note */}
      {result && !result.engineOffline && <SurfaceReadout stats={result.stats} />}

      {/* Honest zero-result explanation (fully masked or genuinely clean water) */}
      {result && !result.engineOffline && result.stats.candidatePixels === 0 && (
        <Card className="flex items-start gap-3 border-ocean-100 bg-ocean-50/40 text-sm text-slate-600">
          <CloudOff size={18} className="mt-0.5 shrink-0 text-ocean-500" />
          <div>
            <p className="font-semibold text-slate-700">No debris candidates in this area right now — that's a real result.</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              {maskInfo(result)
                ? `${maskInfo(result)}. If most of the scene was masked, try a box over open water or a different area; if the water was clear, there was simply nothing above the FDI threshold.`
                : 'Nothing in this box exceeded the FDI candidacy threshold (0.02) — clean water, or the usable scene was fully cloud/land-masked.'}
            </p>
          </div>
        </Card>
      )}

      <AnimatePresence mode="wait">
        {result && (
          <motion.div
            key={result.runId}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            <AoiResultPanel
              result={result}
              live={live}
              fetching={aoi.isFetching}
              updatedAt={aoi.dataUpdatedAt}
              bbox={bbox}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Advanced tools — new engine features (run options + forecast + change + export) */}
      {bbox && result && !result.engineOffline && (
        <Card accent className="space-y-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={15} className="text-ocean-600" />
            <h3 className="font-display text-sm font-semibold text-slate-800">Advanced tools</h3>
            <span className="text-xs text-slate-400">72h forecast · change detection · GeoTIFF · run options</span>
          </div>

          {/* Run options — changing these re-scans the area */}
          <div className="flex flex-wrap items-center gap-4 border-b border-border/50 pb-3">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              Min confidence
              <input
                type="range" min={0} max={95} step={5}
                value={Math.round(runOpts.minConfidence * 100)}
                onChange={(e) => setRunOpts((o) => ({ ...o, minConfidence: Number(e.target.value) / 100 }))}
                className="accent-ocean-600"
              />
              <span className="w-8 font-mono text-slate-500">{Math.round(runOpts.minConfidence * 100)}%</span>
            </label>
            <ToggleChip label="Dedupe" on={runOpts.dedupe} onClick={() => setRunOpts((o) => ({ ...o, dedupe: !o.dedupe }))} />
            <ToggleChip label="Biofouling" on={runOpts.biofouling} onClick={() => setRunOpts((o) => ({ ...o, biofouling: !o.biofouling }))} />
          </div>

          {/* Feature buttons */}
          <div className="flex flex-wrap gap-2">
            <ToolButton icon={Navigation2} label="72h forecast" onClick={runForecast} busy={forecast.isPending} />
            <ToolButton icon={TrendingUp} label="Change vs 6 mo" onClick={runChange} busy={change.isPending} />
            <ToolButton icon={Download} label="Export FDI GeoTIFF" onClick={() => doExport('fdi')} busy={exporting} />
          </div>

          {forecast.data && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-xs text-slate-600">
              <p className="flex items-center gap-2 font-semibold text-emerald-800">
                <Target size={13} /> 72-hour drift forecast ({forecast.data.dataSource})
              </p>
              <p className="mt-1">
                Landfall probability <b>{Math.round(forecast.data.landfall.probability * 100)}%</b>
                {forecast.data.landfall.earliestEtaHours != null && <> · earliest ETA {Math.round(forecast.data.landfall.earliestEtaHours)}h</>}
                {forecast.data.etaHours != null && <> · mean coast ETA {Math.round(forecast.data.etaHours)}h</>}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">Green = forward drift, amber = back-track to the likely source (on the map).</p>
            </div>
          )}
          {forecast.isError && <p className="text-xs text-red-600">Forecast failed — the engine may be offline.</p>}

          {change.data && (
            <div className="rounded-xl border border-ocean-100 bg-ocean-50/40 p-3 text-xs text-slate-600">
              <p className="font-semibold text-ocean-800">Debris trend: {change.data.trend}</p>
              <p className="mt-1">
                recent {change.data.recent.candidatePixels} candidates vs {change.data.old.candidatePixels} older
                {' '}· density Δ {change.data.densityDelta.toExponential(1)}
              </p>
            </div>
          )}
          {change.isError && <p className="text-xs text-red-600">Change detection needs real satellite imagery (Sentinel Hub keys).</p>}
        </Card>
      )}

      {bbox && <AoiScenesPanel scenes={scenes.data?.data ?? []} source={scenes.data?.source} loading={scenes.isLoading} />}

      <SimilarSitesDrawer hotspot={selectedHotspot} onClose={() => setSelectedHotspot(null)} />
    </div>
  );
}

function ToggleChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors',
        on ? 'border-transparent bg-ocean-600 text-white' : 'border-border bg-white/80 text-slate-500',
      )}
    >
      {label} {on ? 'on' : 'off'}
    </button>
  );
}

function ToolButton({ icon: Icon, label, onClick, busy }: {
  icon: typeof Navigation2; label: string; onClick: () => void; busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-ocean-400 hover:text-ocean-700 disabled:opacity-50"
    >
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />} {label}
    </button>
  );
}

/** Live processing timeline — shows every pipeline stage running for the AOI. */
function StageTimeline({ stages, fetching }: { stages?: PipelineStage[]; fetching: boolean }) {
  const byStage = useMemo(
    () => Object.fromEntries((stages ?? []).map((s) => [s.stage, s])),
    [stages],
  );
  return (
    <Card accent className="space-y-3">
      <div className="flex items-center gap-2">
        <Radio size={14} className={cn('text-ocean-600', fetching && 'animate-pulse')} />
        <h3 className="font-display text-sm font-semibold text-slate-800">Live processing</h3>
        <span className="text-xs text-slate-400">
          {fetching ? 'running every stage for this area…' : 'every stage ran for your selection'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {STAGE_ORDER.map((code, i) => {
          const meta = STAGE_META[code];
          const s = byStage[code];
          const running = fetching && !s;
          const Icon = meta.icon;
          return (
            <motion.div
              key={code}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07, duration: 0.3 }}
              title={s?.detail ?? `${meta.label} — awaiting run`}
              className={cn(
                'relative rounded-xl border p-3 transition-colors',
                s ? 'border-ocean-100 bg-ocean-50/50' : 'border-border/60 bg-white/50',
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg',
                  s ? 'bg-ocean-600 text-white' : 'bg-slate-100 text-slate-400',
                )}>
                  <Icon size={15} />
                </span>
                {running ? (
                  <Loader2 size={14} className="animate-spin text-ocean-400" />
                ) : s ? (
                  <motion.span
                    initial={{ scale: 0 }} animate={{ scale: 1 }}
                    transition={{ delay: i * 0.07 + 0.15, type: 'spring', stiffness: 320 }}
                    className="flex h-4 w-4 items-center justify-center rounded-full bg-success-500 text-white"
                  >
                    <Check size={11} />
                  </motion.span>
                ) : (
                  <span className="h-2 w-2 rounded-full bg-slate-200" />
                )}
              </div>
              <p className="mt-2 font-display text-xs font-bold text-slate-700">{meta.label}</p>
              <p className="font-mono text-[10px] text-ocean-500">
                {s ? `${code} · ${s.durationMs}ms` : running ? 'processing…' : code}
              </p>
            </motion.div>
          );
        })}
      </div>
    </Card>
  );
}

/** Countdown to the next auto-rescan while live mode is on. */
function LiveCountdown({ updatedAt }: { updatedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const remaining = Math.max(0, Math.ceil((updatedAt + LIVE_INTERVAL_MS - now) / 1000));
  return <span className="font-mono text-xs text-success-700">next scan in {remaining}s</span>;
}

function secondsAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;
}

function AoiResultPanel({ result, live, fetching, updatedAt, bbox }: {
  result: PipelineResult; live: boolean; fetching: boolean; updatedAt: number; bbox: AoiBBox | null;
}) {
  if (result.engineOffline) {
    return (
      <Card className="flex items-center gap-3 border-amber-200 bg-amber-50/60 text-sm text-amber-700">
        <Info size={18} /> Python engine unreachable — start it (or run <b>start-all.cmd</b>) to analyze this area. No cached/static
        results are shown; every detection here is computed live.
      </Card>
    );
  }
  const s = result.stats;
  const real = s.provider === 'sentinelhub';

  const exportGeojson = () => {
    const features = [
      ...(result.detections ?? []).map((d) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [d.lon, d.lat] },
        properties: {
          kind: 'detection', class: d.classification, confidence: d.confidence,
          fdi: d.fdiScore, area_km2: d.areaSqKm, status: d.status,
        },
      })),
      ...(result.hotspots ?? []).map((h) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [h.centroidLon, h.centroidLat] },
        properties: { kind: 'hotspot', label: h.label, severity: h.severity, detections: h.detectionCount, eta_hours: h.etaHours },
      })),
      ...(result.trajectories ?? []).map((t) => ({
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: t.points.map((p) => [p.lon, p.lat]) },
        properties: { kind: 'drift-path', horizon_hours: t.horizonHours, forcing: t.dataSource },
      })),
      ...(bbox ? [{
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[[bbox.west, bbox.south], [bbox.east, bbox.south], [bbox.east, bbox.north], [bbox.west, bbox.north], [bbox.west, bbox.south]]],
        },
        properties: { kind: 'aoi' },
      }] : []),
    ];
    const blob = new Blob(
      [JSON.stringify({ type: 'FeatureCollection', features }, null, 2)],
      { type: 'application/geo+json' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aoi_${result.runId}.geojson`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card accent className="lg:col-span-2 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-sm font-semibold text-slate-800">This area, right now</h3>
          <Badge variant={live ? 'success' : 'neutral'} dot>{live ? 'live · 30s' : 'on demand'}</Badge>
          {live && !fetching && <LiveCountdown updatedAt={updatedAt} />}
          {fetching && <Loader2 size={13} className="animate-spin text-ocean-500" />}
          <span className="ml-auto flex items-center gap-2 text-xs text-slate-400">
            updated {secondsAgo(updatedAt)}
            <button
              type="button"
              onClick={exportGeojson}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-semibold text-slate-500 hover:border-ocean-300 hover:text-ocean-700"
              title="Download this AOI result as GeoJSON (QGIS/ArcGIS-ready)"
            >
              <FileDown size={12} /> GeoJSON
            </button>
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Candidate px" value={s.candidatePixels} />
          <Metric label="Plastic" value={s.plastic} accent />
          <Metric label="Hotspots" value={s.hotspots} />
          <Metric label="Avg conf." value={`${Math.round(s.avgConfidence * 100)}%`} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 pt-2 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1"><Cpu size={11} /> {s.modelLoaded ? 'CNN model' : 'heuristic'}</span>
          {real ? (
            <span className="text-success-700">REAL Sentinel-2 reflectance (Sentinel Hub) · cloud/land masked via SCL</span>
          ) : (
            <span>Dynamic synthetic pixels for this AOI — add free Sentinel Hub keys for real reflectance</span>
          )}
          {result.trajectories?.[0] && (() => {
            const src = result.trajectories[0].dataSource;
            const label = src === 'cmems'
              ? 'REAL gridded ocean currents (Copernicus Marine) + winds'
              : src === 'open-meteo'
                ? 'REAL currents + winds (Open-Meteo)'
                : 'synthetic forcing';
            return (
              <span className={src === 'cmems' || src === 'open-meteo' ? 'text-success-700' : ''}>
                drift: {label}
              </span>
            );
          })()}
        </div>
      </Card>

      <SceneCard scene={result.scene} />
    </div>
  );
}

function SceneCard({ scene }: { scene: PipelineResult['scene'] }) {
  if (!scene) {
    return (
      <Card className="flex flex-col justify-center text-sm text-slate-400">
        <Satellite size={16} className="mb-1 text-ocean-400" />
        No recent Sentinel-2 scene metadata for this area (offline or none in range).
      </Card>
    );
  }
  return (
    <Card accent padding="none" className="overflow-hidden">
      {scene.thumbnail && (
        <img
          src={scene.thumbnail}
          alt={`Sentinel-2 preview ${scene.sceneId}`}
          className="h-28 w-full object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      )}
      <div className="space-y-1 p-3">
        <div className="flex items-center gap-2">
          <Badge variant={scene.source === 'stac' ? 'success' : 'warn'} dot>
            {scene.source === 'stac' ? 'real Sentinel-2' : 'demo'}
          </Badge>
          <span className="font-mono text-[11px] text-slate-400">{scene.tile}</span>
        </div>
        <p className="font-mono text-xs text-slate-600">{scene.sceneId}</p>
        <p className="text-[11px] text-slate-400">
          {scene.acquisitionDate ? scene.acquisitionDate.slice(0, 10) : '—'} · {Math.round(scene.cloudCoverPct)}% cloud · {scene.platform}
        </p>
      </div>
    </Card>
  );
}

function AoiScenesPanel({ scenes, source, loading }: { scenes: SatelliteScene[]; source?: string; loading: boolean }) {
  const badge = source === 'stac'
    ? { variant: 'success' as const, label: 'live · AWS STAC' }
    : source === 'mock'
      ? { variant: 'warn' as const, label: 'offline · mock' }
      : { variant: 'ocean' as const, label: 'demo scenes' };
  return (
    <Card accent padding="none" className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-slate-800">
          <Satellite size={15} className="text-ocean-600" /> Recent Sentinel-2 scenes over this area
        </h3>
        <Badge variant={badge.variant} dot>{badge.label}</Badge>
      </div>
      <div className="divide-y divide-border/50">
        {loading && <p className="px-4 py-6 text-center text-sm text-slate-400">Searching imagery…</p>}
        {scenes.slice(0, 6).map((s) => (
          <div key={s.sceneId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span className="font-mono text-xs font-medium text-slate-700">{s.tile || '—'}</span>
            <span className="text-xs text-slate-400">{s.platform}</span>
            <div className="ml-auto flex items-center gap-4 text-xs text-slate-500">
              <span>{s.acquisitionDate.slice(0, 10)}</span>
              <span className={s.cloudCoverPct > 60 ? 'text-amber-600' : s.cloudCoverPct > 30 ? 'text-slate-500' : 'text-success-600'}>
                {Math.round(s.cloudCoverPct)}% cloud
              </span>
            </div>
          </div>
        ))}
        {!loading && scenes.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-slate-400">No Sentinel-2 scenes found for this area in the last 30 days.</p>
        )}
      </div>
      {source === 'stac' && (
        <p className="border-t border-border/60 px-4 py-2 text-[11px] leading-relaxed text-slate-400">
          Live discovery via Element84 Earth Search (AWS Open Data, no key). High cloud cover is expected during the
          Indian monsoon — a real limitation of optical satellites.
        </p>
      )}
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

function LegendItem({ color, label, ring = false }: { color: string; label: string; ring?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-3 w-3 rounded-full"
        style={ring ? { border: `2px solid ${color}`, background: `${color}22` } : { background: color }}
      />
      <span className="text-slate-500">{label}</span>
    </div>
  );
}
