/**
 * Compact frontend fallback dataset. Only used when the backend can't be
 * reached (e.g. running `npm run dev` in the frontend before starting the API).
 * The real demo data comes from the backend; this just keeps the UI from ever
 * showing a broken/empty state.
 */
import type {
  Alert, ClassStat, Detection, Hotspot, OverviewStats,
  PipelineResult, Region, RegionStat, SatelliteScene, SatelliteStatus, TrendPoint,
} from '@/types';

const REGIONS_RAW = [
  { code: 'MUM', name: 'Mumbai Coast',           lat: 19.076, lon: 72.877, zoom: 9,  bb: { north: 20.0, south: 18.5, east: 73.5, west: 72.0 } },
  { code: 'GOA', name: 'Goa Coastline',          lat: 15.299, lon: 74.124, zoom: 10, bb: { north: 15.8, south: 14.8, east: 74.5, west: 73.7 } },
  { code: 'KCH', name: 'Kochi – Arabian Sea',    lat: 9.9312, lon: 76.267, zoom: 9,  bb: { north: 10.5, south: 9.3, east: 76.8, west: 75.8 } },
  { code: 'CHN', name: 'Chennai – Bay of Bengal', lat: 13.082, lon: 80.270, zoom: 9, bb: { north: 13.8, south: 12.4, east: 81.0, west: 79.5 } },
  { code: 'AND', name: 'Andaman & Nicobar Sea',  lat: 11.740, lon: 92.658, zoom: 8,  bb: { north: 13.7, south: 6.8, east: 94.2, west: 92.0 } },
];

const iso = (daysAgo: number): string =>
  new Date(Date.now() - daysAgo * 86_400_000).toISOString();

export const regions: Region[] = REGIONS_RAW.map((r, i) => ({
  id: `reg_${r.code.toLowerCase()}`,
  code: r.code,
  name: r.name,
  displayName: r.name,
  centerLat: r.lat,
  centerLon: r.lon,
  zoomLevel: r.zoom,
  boundingBox: r.bb,
  detectionCount: [9, 7, 6, 5, 9][i],
  hotspotCount: [1, 1, 1, 1, 1][i],
}));

export const detections: Detection[] = [
  { id: 'det_mum_1', lat: 19.4, lon: 72.9, classification: 'Plastic',  confidence: 0.91, fdiScore: 0.038, areaSqKm: 0.42, pixelCount: 4200, status: 'CONFIRMED',   regionCode: 'MUM', regionName: 'Mumbai Coast', createdAt: iso(2) },
  { id: 'det_kch_1', lat: 9.8,  lon: 76.1, classification: 'Plastic',  confidence: 0.88, fdiScore: 0.041, areaSqKm: 0.54, pixelCount: 5400, status: 'CONFIRMED',   regionCode: 'KCH', regionName: 'Kochi – Arabian Sea', createdAt: iso(1) },
  { id: 'det_and_1', lat: 11.6, lon: 92.7, classification: 'Plastic',  confidence: 0.94, fdiScore: 0.052, areaSqKm: 0.71, pixelCount: 7100, status: 'CONFIRMED',   regionCode: 'AND', regionName: 'Andaman & Nicobar Sea', createdAt: iso(1) },
  { id: 'det_goa_1', lat: 15.3, lon: 73.9, classification: 'Plastic',  confidence: 0.83, fdiScore: 0.031, areaSqKm: 0.29, pixelCount: 2900, status: 'CONFIRMED',   regionCode: 'GOA', regionName: 'Goa Coastline', createdAt: iso(3) },
  { id: 'det_chn_1', lat: 13.2, lon: 80.3, classification: 'Plastic',  confidence: 0.79, fdiScore: 0.027, areaSqKm: 0.22, pixelCount: 2200, status: 'PENDING',     regionCode: 'CHN', regionName: 'Chennai – Bay of Bengal', createdAt: iso(4) },
  { id: 'det_mum_2', lat: 19.1, lon: 72.7, classification: 'Plastic',  confidence: 0.76, fdiScore: 0.024, areaSqKm: 0.18, pixelCount: 1800, status: 'PENDING',     regionCode: 'MUM', regionName: 'Mumbai Coast', createdAt: iso(5) },
  { id: 'det_goa_2', lat: 15.1, lon: 74.0, classification: 'Sea_Foam', confidence: 0.62, fdiScore: 0.019, areaSqKm: 0.09, pixelCount: 900,  status: 'FALSE_ALARM', regionCode: 'GOA', regionName: 'Goa Coastline', createdAt: iso(8) },
  { id: 'det_and_2', lat: 11.9, lon: 93.1, classification: 'Algae',    confidence: 0.71, fdiScore: 0.022, areaSqKm: 0.13, pixelCount: 1300, status: 'FALSE_ALARM', regionCode: 'AND', regionName: 'Andaman & Nicobar Sea', createdAt: iso(6) },
];

export const hotspots: Hotspot[] = [
  { id: 'hot_mum_1', label: 'MUM-H1', centroidLat: 19.25, centroidLon: 72.80, detectionCount: 12, severity: 'HIGH',   confidence: 0.91, etaHours: 18,   regionCode: 'MUM', regionName: 'Mumbai Coast', isActive: true, firstDetected: iso(4), lastDetected: iso(1) },
  { id: 'hot_and_1', label: 'AND-H1', centroidLat: 11.70, centroidLon: 92.90, detectionCount: 18, severity: 'HIGH',   confidence: 0.94, etaHours: null, regionCode: 'AND', regionName: 'Andaman & Nicobar Sea', isActive: true, firstDetected: iso(4), lastDetected: iso(1) },
  { id: 'hot_goa_1', label: 'GOA-H1', centroidLat: 15.20, centroidLon: 73.95, detectionCount: 6,  severity: 'MEDIUM', confidence: 0.83, etaHours: 36,   regionCode: 'GOA', regionName: 'Goa Coastline', isActive: true, firstDetected: iso(4), lastDetected: iso(1) },
  { id: 'hot_kch_1', label: 'KCH-H1', centroidLat: 9.85,  centroidLon: 76.15, detectionCount: 4,  severity: 'MEDIUM', confidence: 0.88, etaHours: 42,   regionCode: 'KCH', regionName: 'Kochi – Arabian Sea', isActive: true, firstDetected: iso(4), lastDetected: iso(1) },
  { id: 'hot_chn_1', label: 'CHN-H1', centroidLat: 13.15, centroidLon: 80.35, detectionCount: 3,  severity: 'LOW',    confidence: 0.77, etaHours: 54,   regionCode: 'CHN', regionName: 'Chennai – Bay of Bengal', isActive: true, firstDetected: iso(4), lastDetected: iso(1) },
];

export const alerts: Alert[] = [
  { id: 'alr_1', type: 'HOTSPOT',         severity: 'HIGH',   title: 'High-severity hotspot detected — Mumbai',   message: 'Cluster MUM-H1 (12 detections, 91% confidence) identified 18 km off Mumbai coast.', isAcked: false, ackedAt: null, createdAt: iso(2), detectionId: 'det_mum_1' },
  { id: 'alr_2', type: 'COAST_PROXIMITY', severity: 'HIGH',   title: 'Drift forecast: coastal landfall ETA 18 h', message: 'Lagrangian ensemble predicts MUM-H1 plastic mass reaching Versova Beach at T+18 h.',  isAcked: false, ackedAt: null, createdAt: iso(2), detectionId: 'det_mum_1' },
  { id: 'alr_3', type: 'HOTSPOT',         severity: 'MEDIUM', title: 'New cluster — Andaman Sea',                 message: 'AND-H1 (18 detections) detected near North Andaman. No coast ETA (open ocean).',      isAcked: true,  ackedAt: iso(1), createdAt: iso(3), detectionId: 'det_and_1' },
];

export const overview: OverviewStats = {
  totalDetections: 36,
  confirmedDetections: 13,
  pendingDetections: 11,
  falseAlarms: 12,
  plasticDetections: 26,
  avgConfidence: 0.79,
  totalAreaSqKm: 13.6,
  activeHotspots: 5,
  highSeverityHotspots: 2,
  regionsMonitored: 5,
  openAlerts: 3,
  lastUpdated: new Date().toISOString(),
  model: { name: 'MarineNet (per-pixel MLP)', version: '1.1-gpu-marida+mados', f1Score: 0.787 },
};

export function trend(days: number): TrendPoint[] {
  const out: TrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const base = 1 + Math.round(Math.abs(Math.sin(i * 1.3)) * 4);
    out.push({
      date: new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10),
      detections: base,
      confirmed: Math.max(0, base - 1 - (i % 2)),
    });
  }
  return out;
}

export const byRegion: RegionStat[] = regions.map((r) => ({
  code: r.code,
  name: r.displayName,
  detections: r.detectionCount,
  hotspots: r.hotspotCount,
  highSeverity: hotspots.filter((h) => h.regionCode === r.code && h.severity === 'HIGH').length,
}));

export const byClass: ClassStat[] = [
  { classification: 'Plastic',  count: 26, pct: 72.2 },
  { classification: 'Algae',    count: 6,  pct: 16.7 },
  { classification: 'Sea_Foam', count: 4,  pct: 11.1 },
];

// Full-offline pipeline result (backend AND engine unreachable).
export function pipelineResult(region?: string): PipelineResult {
  const dets = region ? detections.filter((d) => d.regionCode === region) : detections;
  const hots = region ? hotspots.filter((h) => h.regionCode === region) : hotspots;
  const plastic = dets.filter((d) => d.classification === 'Plastic').length;
  const top = hots[0];
  const points = Array.from({ length: 73 }, (_, t) => ({
    t,
    lat: +((top?.centroidLat ?? 19.25) + t * 0.012).toFixed(5),
    lon: +((top?.centroidLon ?? 72.8) + t * 0.008).toFixed(5),
  }));
  const cone = points.map((p) => {
    const spread = +(p.t * 0.003).toFixed(5);
    return { t: p.t, latMin: +(p.lat - spread).toFixed(5), latMax: +(p.lat + spread).toFixed(5), lonMin: +(p.lon - spread).toFixed(5), lonMax: +(p.lon + spread).toFixed(5) };
  });
  return {
    runId: `run_local_${Math.floor(Date.now() / 1000).toString(36)}`,
    region: region ?? null,
    generatedAt: new Date().toISOString(),
    demoMode: true,
    stages: [
      { stage: 'DOWNLOAD', status: 'COMPLETED', durationMs: 5, detail: `${dets.length * 3} pixels (fully offline — bundled mock)` },
      { stage: 'FDI', status: 'COMPLETED', durationMs: 2, detail: `${dets.length} candidate pixels` },
      { stage: 'CNN', status: 'COMPLETED', durationMs: 4, detail: `${plastic} plastic classified (model_loaded=false)` },
      { stage: 'DBSCAN', status: 'COMPLETED', durationMs: 1, detail: `${hots.length} hotspot cluster(s)` },
      { stage: 'DRIFT', status: 'COMPLETED', durationMs: 6, detail: '1 trajectory, 72h horizon' },
      { stage: 'ALERT', status: 'COMPLETED', durationMs: 1, detail: `${hots.filter((h) => h.severity !== 'LOW').length} alert(s)` },
    ],
    detections: dets.map((d) => ({ lat: d.lat, lon: d.lon, classification: d.classification, confidence: d.confidence, fdiScore: d.fdiScore, areaSqKm: d.areaSqKm, status: d.status })),
    hotspots: hots.map((h) => ({ label: h.label, centroidLat: h.centroidLat, centroidLon: h.centroidLon, detectionCount: h.detectionCount, severity: h.severity, confidence: h.confidence, etaHours: h.etaHours })),
    trajectories: top ? [{ detectionIndex: 0, points, cone, windageCoeffs: [0.015, 0.02, 0.025, 0.03], horizonHours: 72, dataSource: 'demo' }] : [],
    stats: {
      candidatePixels: dets.length,
      detections: dets.length,
      plastic,
      hotspots: hots.length,
      avgConfidence: +(dets.reduce((s, d) => s + d.confidence, 0) / (dets.length || 1)).toFixed(3),
      totalAreaSqKm: +dets.reduce((s, d) => s + d.areaSqKm, 0).toFixed(2),
      provider: 'demo',
      modelLoaded: false,
    },
  };
}

export const scenes: SatelliteScene[] = [
  { sceneId: 'S2A_MSIL2A_20240315T050501_N0510_R106_T43QCA', platform: 'sentinel-2a', tile: 'MGRS-43QCA', acquisitionDate: iso(2), cloudCoverPct: 3.2, regionCode: 'MUM', isProcessed: true, thumbnail: null },
  { sceneId: 'S2B_MSIL2A_20240314T051649_N0510_R062_T43PGQ', platform: 'sentinel-2b', tile: 'MGRS-43PGQ', acquisitionDate: iso(3), cloudCoverPct: 5.1, regionCode: 'GOA', isProcessed: true, thumbnail: null },
  { sceneId: 'S2A_MSIL2A_20240312T045701_N0510_R116_T43NCE', platform: 'sentinel-2a', tile: 'MGRS-43NCE', acquisitionDate: iso(5), cloudCoverPct: 1.8, regionCode: 'KCH', isProcessed: true, thumbnail: null },
];

export const satelliteStatus: SatelliteStatus = {
  provider: 'demo',
  configured: false,
  mode: 'demo',
  message: 'Demo mode — set SATELLITE_PROVIDER + Sentinel Hub keys for live Sentinel-2 data.',
  tokenEndpoint: null,
  catalogEndpoint: null,
  latestScene: {
    sceneId: 'S2A_MSIL2A_20240315T050501_N0510_R106_T44NKL_20240315T082351',
    platform: 'Sentinel-2A',
    tile: '44NKL',
    acquisitionDate: iso(2),
    cloudCoverPct: 3.2,
    regionCode: 'MUM',
    isProcessed: true,
  },
};
