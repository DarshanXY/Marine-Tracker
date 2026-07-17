/**
 * Bundled demo dataset — mirrors `prisma/seed.ts` but shaped as API DTOs and
 * enriched with extra detections so charts look alive. Served whenever the DB
 * is unreachable or DEMO_MODE=true. Arrays are mutable so demo mutations
 * (e.g. acknowledging an alert) work in-memory until restart.
 */
import type {
  AlertDto,
  DetectionDto,
  HotspotDto,
  RegionDto,
  SatelliteScene,
  TrajectoryDto,
} from '../types/domain';

// Deterministic PRNG so the demo dataset is identical on every boot.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20240315);

const NOW = new Date();
const daysAgoISO = (days: number): string =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

// ── Regions (5) — same as seed ──────────────────────────────────────────────
interface RegionDef {
  id: string;
  code: string;
  name: string;
  displayName: string;
  centerLat: number;
  centerLon: number;
  zoomLevel: number;
  boundingBox: { north: number; south: number; east: number; west: number };
}

const regionDefs: RegionDef[] = [
  { id: 'reg_mum', code: 'MUM', name: 'Mumbai Coast', displayName: 'Mumbai Coast', centerLat: 19.076, centerLon: 72.877, zoomLevel: 9, boundingBox: { north: 20.0, south: 18.5, east: 73.5, west: 72.0 } },
  { id: 'reg_goa', code: 'GOA', name: 'Goa Coastline', displayName: 'Goa Coastline', centerLat: 15.299, centerLon: 74.124, zoomLevel: 10, boundingBox: { north: 15.8, south: 14.8, east: 74.5, west: 73.7 } },
  { id: 'reg_kch', code: 'KCH', name: 'Kochi - Arabian Sea', displayName: 'Kochi – Arabian Sea', centerLat: 9.9312, centerLon: 76.2673, zoomLevel: 9, boundingBox: { north: 10.5, south: 9.3, east: 76.8, west: 75.8 } },
  { id: 'reg_chn', code: 'CHN', name: 'Chennai Bay of Bengal', displayName: 'Chennai – Bay of Bengal', centerLat: 13.0827, centerLon: 80.2707, zoomLevel: 9, boundingBox: { north: 13.8, south: 12.4, east: 81.0, west: 79.5 } },
  { id: 'reg_and', code: 'AND', name: 'Andaman Sea', displayName: 'Andaman & Nicobar Sea', centerLat: 11.7401, centerLon: 92.6586, zoomLevel: 8, boundingBox: { north: 13.7, south: 6.8, east: 94.2, west: 92.0 } },
];
const regionByCode = Object.fromEntries(regionDefs.map((r) => [r.code, r]));

// ── Detections ──────────────────────────────────────────────────────────────
// The 8 canonical seed detections first (stable ids), then generated extras.
type Seed = {
  id: string; lat: number; lon: number; code: string;
  conf: number; fdi: number; area: number; cls: string;
  status: DetectionDto['status']; ageDays: number;
};

const canonical: Seed[] = [
  { id: 'det_mum_1', lat: 19.4, lon: 72.9, code: 'MUM', conf: 0.91, fdi: 0.038, area: 0.42, cls: 'Plastic',  status: 'CONFIRMED',   ageDays: 2 },
  { id: 'det_mum_2', lat: 19.1, lon: 72.7, code: 'MUM', conf: 0.76, fdi: 0.024, area: 0.18, cls: 'Plastic',  status: 'PENDING',     ageDays: 5 },
  { id: 'det_goa_1', lat: 15.3, lon: 73.9, code: 'GOA', conf: 0.83, fdi: 0.031, area: 0.29, cls: 'Plastic',  status: 'CONFIRMED',   ageDays: 3 },
  { id: 'det_goa_2', lat: 15.1, lon: 74.0, code: 'GOA', conf: 0.62, fdi: 0.019, area: 0.09, cls: 'Sea_Foam', status: 'FALSE_ALARM', ageDays: 8 },
  { id: 'det_kch_1', lat: 9.8,  lon: 76.1, code: 'KCH', conf: 0.88, fdi: 0.041, area: 0.54, cls: 'Plastic',  status: 'CONFIRMED',   ageDays: 1 },
  { id: 'det_chn_1', lat: 13.2, lon: 80.3, code: 'CHN', conf: 0.79, fdi: 0.027, area: 0.22, cls: 'Plastic',  status: 'PENDING',     ageDays: 4 },
  { id: 'det_and_1', lat: 11.6, lon: 92.7, code: 'AND', conf: 0.94, fdi: 0.052, area: 0.71, cls: 'Plastic',  status: 'CONFIRMED',   ageDays: 1 },
  { id: 'det_and_2', lat: 11.9, lon: 93.1, code: 'AND', conf: 0.71, fdi: 0.022, area: 0.13, cls: 'Algae',    status: 'FALSE_ALARM', ageDays: 6 },
];

const CLASSES = ['Plastic', 'Plastic', 'Plastic', 'Plastic', 'Algae', 'Sea_Foam'];
const STATUSES: DetectionDto['status'][] = ['CONFIRMED', 'PENDING', 'PENDING', 'CONFIRMED', 'FALSE_ALARM'];

function toDetection(s: Seed): DetectionDto {
  const region = regionByCode[s.code];
  return {
    id: s.id,
    lat: s.lat,
    lon: s.lon,
    classification: s.cls,
    confidence: s.conf,
    fdiScore: s.fdi,
    areaSqKm: s.area,
    pixelCount: Math.max(1, Math.ceil(s.area / 0.0001)),
    status: s.status,
    regionCode: region?.code ?? null,
    regionName: region?.displayName ?? null,
    createdAt: daysAgoISO(s.ageDays),
  };
}

export const detections: DetectionDto[] = canonical.map(toDetection);

// Generate ~28 more detections spread across regions and the last 45 days.
for (let i = 0; i < 28; i++) {
  const region = regionDefs[Math.floor(rand() * regionDefs.length)];
  const cls = CLASSES[Math.floor(rand() * CLASSES.length)];
  const status = cls === 'Plastic'
    ? STATUSES[Math.floor(rand() * STATUSES.length)]
    : (rand() < 0.5 ? 'FALSE_ALARM' : 'PENDING');
  const bb = region.boundingBox;
  const lat = +(bb.south + rand() * (bb.north - bb.south)).toFixed(4);
  const lon = +(bb.west + rand() * (bb.east - bb.west)).toFixed(4);
  const fdi = +(0.015 + rand() * 0.045).toFixed(4);
  const conf = +(0.55 + rand() * 0.44).toFixed(2);
  const area = +(0.05 + rand() * 0.65).toFixed(2);
  detections.push({
    id: `det_gen_${i + 1}`,
    lat,
    lon,
    classification: cls,
    confidence: conf,
    fdiScore: fdi,
    areaSqKm: area,
    pixelCount: Math.max(1, Math.ceil(area / 0.0001)),
    status,
    regionCode: region.code,
    regionName: region.displayName,
    createdAt: daysAgoISO(Math.floor(rand() * 45)),
  });
}

// ── Trajectory (72-h Lagrangian ensemble for the MUM confirmed detection) ────
const trajPoints = Array.from({ length: 73 }, (_, i) => ({
  t: i,
  lat: +(19.4 + i * 0.012).toFixed(5),
  lon: +(72.9 + i * 0.008).toFixed(5),
}));
const trajCone = Array.from({ length: 73 }, (_, i) => {
  const spread = +(i * 0.003).toFixed(5);
  return {
    t: i,
    latMin: +(19.4 + i * 0.012 - spread).toFixed(5),
    latMax: +(19.4 + i * 0.012 + spread).toFixed(5),
    lonMin: +(72.9 + i * 0.008 - spread).toFixed(5),
    lonMax: +(72.9 + i * 0.008 + spread).toFixed(5),
  };
});

export const trajectories: TrajectoryDto[] = [
  {
    id: 'traj_mum_1',
    detectionId: 'det_mum_1',
    points: trajPoints,
    cone: trajCone,
    windageCoeffs: [0.015, 0.02, 0.025, 0.03],
    horizonHours: 72,
    dataSource: 'demo',
  },
];

// ── Hotspots (5) ────────────────────────────────────────────────────────────
type HotSeed = {
  id: string; label: string; code: string; lat: number; lon: number;
  count: number; sev: HotspotDto['severity']; eta: number | null; conf: number;
};
const hotSeeds: HotSeed[] = [
  { id: 'hot_mum_1', label: 'MUM-H1', code: 'MUM', lat: 19.25, lon: 72.8,  count: 12, sev: 'HIGH',   eta: 18,   conf: 0.91 },
  { id: 'hot_goa_1', label: 'GOA-H1', code: 'GOA', lat: 15.2,  lon: 73.95, count: 6,  sev: 'MEDIUM', eta: 36,   conf: 0.83 },
  { id: 'hot_kch_1', label: 'KCH-H1', code: 'KCH', lat: 9.85,  lon: 76.15, count: 4,  sev: 'MEDIUM', eta: 42,   conf: 0.88 },
  { id: 'hot_and_1', label: 'AND-H1', code: 'AND', lat: 11.7,  lon: 92.9,  count: 18, sev: 'HIGH',   eta: null, conf: 0.94 },
  { id: 'hot_chn_1', label: 'CHN-H1', code: 'CHN', lat: 13.15, lon: 80.35, count: 3,  sev: 'LOW',    eta: 54,   conf: 0.77 },
];

export const hotspots: HotspotDto[] = hotSeeds.map((h) => {
  const region = regionByCode[h.code];
  return {
    id: h.id,
    label: h.label,
    centroidLat: h.lat,
    centroidLon: h.lon,
    detectionCount: h.count,
    severity: h.sev,
    confidence: h.conf,
    etaHours: h.eta,
    regionCode: region?.code ?? null,
    regionName: region?.displayName ?? null,
    isActive: true,
    firstDetected: daysAgoISO(4),
    lastDetected: daysAgoISO(1),
    trajectory: h.id === 'hot_mum_1' ? trajectories[0] : null,
  };
});

// ── Alerts (4) ──────────────────────────────────────────────────────────────
export const alerts: AlertDto[] = [
  { id: 'alr_1', type: 'HOTSPOT',         severity: 'HIGH',   title: 'High-severity hotspot detected — Mumbai',     message: 'Cluster MUM-H1 (12 detections, 91% confidence) identified 18 km off Mumbai coast.', isAcked: false, ackedAt: null, createdAt: daysAgoISO(2), detectionId: 'det_mum_1' },
  { id: 'alr_2', type: 'COAST_PROXIMITY', severity: 'HIGH',   title: 'Drift forecast: coastal landfall ETA 18 h',   message: 'Lagrangian ensemble predicts MUM-H1 plastic mass reaching Versova Beach at T+18 h.',  isAcked: false, ackedAt: null, createdAt: daysAgoISO(2), detectionId: 'det_mum_1' },
  { id: 'alr_3', type: 'HOTSPOT',         severity: 'MEDIUM', title: 'New cluster — Andaman Sea',                   message: 'AND-H1 (18 detections) detected near North Andaman. No coast ETA (open ocean).',      isAcked: true,  ackedAt: daysAgoISO(1), createdAt: daysAgoISO(3), detectionId: 'det_and_1' },
  { id: 'alr_4', type: 'SYSTEM',          severity: 'LOW',    title: 'Pipeline run complete — 3 new scenes',        message: 'Nightly Sentinel-2 ingest processed 3 scenes (avg 3.4% cloud) across 5 regions.',      isAcked: false, ackedAt: null, createdAt: daysAgoISO(1), detectionId: null },
];

// ── Satellite scenes ────────────────────────────────────────────────────────
export const scenes: SatelliteScene[] = [
  { sceneId: 'S2A_MSIL2A_20240315T050501_N0510_R106_T44NKL_20240315T082351', platform: 'Sentinel-2A', tile: '44NKL', acquisitionDate: daysAgoISO(2),  cloudCoverPct: 3.2, regionCode: 'MUM', isProcessed: true },
  { sceneId: 'S2B_MSIL2A_20240314T051649_N0510_R062_T43PGQ_20240314T081210', platform: 'Sentinel-2B', tile: '43PGQ', acquisitionDate: daysAgoISO(3),  cloudCoverPct: 5.1, regionCode: 'GOA', isProcessed: true },
  { sceneId: 'S2A_MSIL2A_20240312T045701_N0510_R116_T43NCE_20240312T074914', platform: 'Sentinel-2A', tile: '43NCE', acquisitionDate: daysAgoISO(5),  cloudCoverPct: 1.8, regionCode: 'KCH', isProcessed: true },
];

// ── Regions as DTOs (counts derived from the demo detections/hotspots) ───────
export const regions: RegionDto[] = regionDefs.map((r) => ({
  id: r.id,
  code: r.code,
  name: r.name,
  displayName: r.displayName,
  centerLat: r.centerLat,
  centerLon: r.centerLon,
  zoomLevel: r.zoomLevel,
  boundingBox: r.boundingBox,
  detectionCount: detections.filter((d) => d.regionCode === r.code).length,
  hotspotCount: hotspots.filter((h) => h.regionCode === r.code).length,
}));

// ── Active model version ─────────────────────────────────────────────────────
// Mirrors the real MARIDA+MADOS-trained model so the offline/demo badge stays honest
// (macro-F1 on the held-out combined test split; see backend/prisma/seed.ts).
export const modelVersion = {
  name: 'MarineNet (per-pixel MLP)',
  version: '1.1-gpu-marida+mados',
  f1Score: 0.787,
};
