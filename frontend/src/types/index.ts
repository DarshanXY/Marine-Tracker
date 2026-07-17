/**
 * Frontend API types — mirror of `backend/src/types/domain.ts`.
 * Keep these two files in sync.
 */

export type Severity = 'HIGH' | 'MEDIUM' | 'LOW';
export type DetectionStatus = 'PENDING' | 'CONFIRMED' | 'FALSE_ALARM';
export type AlertType = 'HOTSPOT' | 'COAST_PROXIMITY' | 'INFRASTRUCTURE' | 'SYSTEM';

export interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface Region {
  id: string;
  code: string;
  name: string;
  displayName: string;
  centerLat: number;
  centerLon: number;
  zoomLevel: number;
  boundingBox: BoundingBox;
  detectionCount: number;
  hotspotCount: number;
}

export interface Detection {
  id: string;
  lat: number;
  lon: number;
  classification: string;
  confidence: number;
  fdiScore: number;
  areaSqKm: number;
  pixelCount: number;
  status: DetectionStatus;
  regionCode: string | null;
  regionName: string | null;
  createdAt: string;
}

export interface Trajectory {
  id: string;
  detectionId: string;
  points: { t: number; lat: number; lon: number }[];
  cone: { t: number; latMin: number; latMax: number; lonMin: number; lonMax: number }[];
  windageCoeffs: number[];
  horizonHours: number;
  dataSource: string;
}

export interface Hotspot {
  id: string;
  label: string;
  centroidLat: number;
  centroidLon: number;
  detectionCount: number;
  severity: Severity;
  confidence: number;
  etaHours: number | null;
  regionCode: string | null;
  regionName: string | null;
  isActive: boolean;
  firstDetected: string;
  lastDetected: string;
  trajectory?: Trajectory | null;
}

export interface Alert {
  id: string;
  type: AlertType;
  severity: Severity;
  title: string;
  message: string;
  isAcked: boolean;
  ackedAt: string | null;
  createdAt: string;
  detectionId: string | null;
}

export interface OverviewStats {
  totalDetections: number;
  confirmedDetections: number;
  pendingDetections: number;
  falseAlarms: number;
  plasticDetections: number;
  avgConfidence: number;
  totalAreaSqKm: number;
  activeHotspots: number;
  highSeverityHotspots: number;
  regionsMonitored: number;
  openAlerts: number;
  lastUpdated: string;
  model: { name: string; version: string; f1Score: number | null };
}

export interface TrendPoint {
  date: string;
  detections: number;
  confirmed: number;
}

export interface RegionStat {
  code: string;
  name: string;
  detections: number;
  hotspots: number;
  highSeverity: number;
}

export interface ClassStat {
  classification: string;
  count: number;
  pct: number;
}

export interface SatelliteScene {
  sceneId: string;
  platform: string;
  tile: string;
  acquisitionDate: string;
  cloudCoverPct: number;
  regionCode: string | null;
  isProcessed: boolean;
  thumbnail?: string | null;
}

export interface ScenesResult {
  data: SatelliteScene[];
  source: 'stac' | 'demo' | 'mock';
}

export interface SatelliteStatus {
  provider: string;
  configured: boolean;
  mode: 'live' | 'demo';
  message: string;
  tokenEndpoint: string | null;
  catalogEndpoint: string | null;
  latestScene: SatelliteScene | null;
}

export interface DetectionQuery {
  region?: string;
  status?: DetectionStatus;
  classification?: string;
  minConfidence?: number;
  /** Time-slider window: only detections from the last N days. */
  days?: number;
  limit?: number;
  offset?: number;
}

export interface PipelineLogEntry {
  id: string;
  stage: string;
  status: string;
  durationMs: number;
  at: string;
  detail: string;
  sceneId: string | null;
}

/** Safe user projection from GET /api/auth/users (admin only). */
export interface AdminUser {
  id: string;
  username: string;
  email: string;
  role: string;
  level: number;
  displayName: string;
  totpEnabled: boolean;
}

// Auth
export type UserRole = 'ADMIN' | 'COASTGUARD' | 'FIELD';

export const ROLE_LEVEL: Record<UserRole, number> = {
  ADMIN: 3, COASTGUARD: 2, FIELD: 1,
};

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  level: number;
  displayName: string;
  totpEnabled: boolean;
}

export interface LoginPayload {
  user?: AuthUser;
  accessToken?: string;
  refreshToken?: string;
  needsTotp?: boolean;
}

export interface TwoFactorSetup {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}

// Detection pipeline (Python engine)
export interface PipelineStage {
  stage: string;
  status: string;
  durationMs: number;
  detail: string;
}

export interface PipelineDetection {
  lat: number;
  lon: number;
  classification: string;
  confidence: number;
  fdiScore: number;
  areaSqKm: number;
  status: string;
}

export interface PipelineHotspot {
  label: string;
  centroidLat: number;
  centroidLon: number;
  detectionCount: number;
  severity: Severity;
  confidence: number;
  etaHours: number | null;
  embedKey?: string | null;   // stable site key for the Clay embedding store
  // Live Clay tier-2 (set when the GPU sidecar re-scored during the scan).
  clayClass?: string | null;
  anomaly?: number | null;
  tier?: 'CONFIRMED' | 'POSSIBLE' | null;
  fusion?: ConfidenceFusion | null;
}

export interface PipelineTrajectory {
  detectionIndex: number;
  points: { t: number; lat: number; lon: number }[];
  cone: { t: number; latMin: number; latMax: number; lonMin: number; lonMax: number }[];
  windageCoeffs: number[];
  horizonHours: number;
  dataSource: string;
}

export interface SurfaceComposition {
  waterPct: number;
  landPct: number;
  cloudPct: number;
  otherPct: number;
  label: 'water' | 'land' | 'cloud' | 'mixed';
  waterValid: boolean;
  source?: 'scl' | 'geographic-estimate';
}

export interface AoiRunOptions {
  minConfidence?: number;
  dedupe?: boolean;
  biofouling?: boolean;
}

export interface ForecastPoint { t: number; lat: number; lon: number; }
export interface ForecastCone { t: number; latMin: number; latMax: number; lonMin: number; lonMax: number; }

/** Upstream back-track — traces a parcel to its likely source (points[last] ≈ origin). */
export interface Backtrack {
  points: ForecastPoint[];
  cone: ForecastCone[];
  windageCoeffs: number[];
  horizonHours: number;
  dataSource: string;
}

export interface Landfall {
  probability: number;
  earliestEtaHours: number | null;
  latestEtaHours: number | null;
  members: number;
  madeLandfall: number;
}

export interface TrajectoryForecast {
  points: ForecastPoint[];
  cone: ForecastCone[];
  etaHours: number | null;
  landfall: Landfall;
  windageCoeffs: number[];
  horizonHours: number;
  dataSource: string;
  backtrack?: { points: ForecastPoint[]; cone: ForecastCone[] };
}

export interface ChangeWindow {
  candidatePixels: number;
  candidateDensity: number;
  surface: SurfaceComposition | null;
}

export interface ChangeResult {
  available: boolean;
  trend: 'increasing' | 'decreasing' | 'stable';
  densityDelta: number;
  daysRecent: number;
  daysOld: number;
  recent: ChangeWindow;
  old: ChangeWindow;
}

export interface ModelEval {
  dataset: string;
  split: string;
  accuracy: number;
  macroF1: number;
  perClass: Record<string, { precision: number; recall: number; f1: number }>;
  confusion: number[][];
  samples: number;
}

/** Operating regime — fusion calibration + PLP independent validation (evidence). */
export interface ClayFusionGroup {
  n: number;
  mlpCalledPlastic: number;
  meanPlasticAffinity: number;
  confirmedByFusion: number;
  downgradedToPossible: number;
}
export interface ModelValidation {
  available: boolean;
  fusion?: {
    conf_high: number;
    aff_min: number;
    anomaly_tau: number;
    confirmedPrecision?: number;
    confirmedRecall?: number;
    calibratedOn?: string;
  } | null;
  plp?: {
    hdpeHitRate?: number;
    fdiGateRate?: number;
    woodAsPlasticRate?: number;
    medianSceneFpPct?: number;
    dates?: number;
    dataset?: string;
  } | null;
  clayFusion?: {
    finding?: string;
    HDPE?: ClayFusionGroup;
    wood?: ClayFusionGroup;
  } | null;
}

/** Engine self-description (GET /api/engine/capabilities). */
export interface EngineCapabilities {
  version: string;
  engine: string;
  config: {
    demoMode: boolean;
    provider: string;
    satelliteConfigured: boolean;
    realIngest: boolean;
    modelLoaded: boolean;
    modelMode: string;
    griddedForcing: boolean;
    /** GPU Clay sidecar reachable + model loaded (live tier-2 re-scoring). */
    clayLive?: boolean;
  };
  regions: string[];
  endpoints: Record<string, string[]>;
  runOptions: string[];
  indices: string[];
  features: Record<string, string>;
}

// ── Field operations ──────────────────────────────────────────────────────────
export type OperationStatus =
  | 'PLANNED' | 'DISPATCHED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type OperationOutcome =
  | 'CLEARED' | 'PARTIAL' | 'NOT_FOUND' | 'STOOD_DOWN';

export interface OperationEvent {
  id: string;
  status: OperationStatus | null;
  note: string | null;
  by: string | null;
  at: string;
}

export interface MissionReport {
  id: string;
  summary: string;
  outcome: OperationOutcome;
  plasticCollectedKg: number | null;
  areaClearedSqKm: number | null;
  teamSize: number | null;
  photosCount: number;
  filedBy: string | null;
  filedAt: string;
}

export interface Operation {
  id: string;
  code: string;
  title: string;
  status: OperationStatus;
  priority: Severity;
  hotspotId: string | null;
  detectionId: string | null;
  regionCode: string | null;
  targetLat: number | null;
  targetLon: number | null;
  assignedTeam: string | null;
  assignedToId: string | null;
  notes: string | null;
  plannedAt: string | null;
  dispatchedAt: string | null;
  completedAt: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  events?: OperationEvent[];
  report?: MissionReport | null;
}

export interface CreateOperationInput {
  title: string;
  priority?: Severity;
  hotspotId?: string | null;
  detectionId?: string | null;
  regionCode?: string | null;
  targetLat?: number | null;
  targetLon?: number | null;
  assignedTeam?: string | null;
  notes?: string | null;
}

export interface FileReportInput {
  summary: string;
  outcome: OperationOutcome;
  plasticCollectedKg?: number | null;
  areaClearedSqKm?: number | null;
  teamSize?: number | null;
  photosCount?: number;
}

export interface OperationStats {
  total: number;
  byStatus: Record<OperationStatus, number>;
  openHighPriority: number;
  plasticCollectedKg: number;
  areaClearedSqKm: number;
}

export interface PipelineStats {
  candidatePixels: number;
  detections: number;
  plastic: number;
  hotspots: number;
  avgConfidence: number;
  totalAreaSqKm: number;
  provider: string;
  modelLoaded: boolean;
  surface?: SurfaceComposition | null;
}

export interface AoiBBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface SceneRef {
  sceneId: string;
  platform: string;
  tile: string;
  acquisitionDate: string;
  cloudCoverPct: number;
  thumbnail: string | null;
  source: 'stac' | 'demo';
  /** STAC item footprint [w, s, e, n] — true bounds for the map preview overlay. */
  bbox?: number[] | null;
}

export interface PipelineResult {
  runId: string;
  region: string | null;
  generatedAt: string;
  demoMode: boolean;
  stages: PipelineStage[];
  detections: PipelineDetection[];
  hotspots: PipelineHotspot[];
  trajectories: PipelineTrajectory[];
  stats: PipelineStats;
  bbox?: AoiBBox | null;
  scene?: SceneRef | null;
  /** Set by the backend when an AOI run couldn't reach the engine. */
  engineOffline?: boolean;
}

export interface ModelClassMetric {
  precision: number;
  recall: number;
  f1: number;
}

export interface ModelMetrics {
  model: string;
  arch: string;
  input?: string;
  features?: string[];
  channels?: string[];
  trainSamples: number;
  trainAccuracy?: number;
  valAccuracy?: number;
  testAccuracy: number;
  macroF1?: number;
  onnxAgreement?: number;
  perClass: Record<string, ModelClassMetric>;
  confusion: number[][];
  dataset?: string;
  /** 'marida' when trained on the real labelled dataset (vs synthetic baseline). */
  trainedOn?: string;
  note?: string;
}

export interface ModelInfo {
  loaded: boolean;
  inputKind: 'pixel' | 'patch' | 'none';
  mode: string;
  path: string | null;
  classes: string[];
  dataset?: string | null;
  trained?: string | null;
  geometry?: { layout: string; channels: number; size: number } | null;
  metrics?: ModelMetrics | null;
}

export interface PipelineStatusInfo {
  engine: 'online' | 'offline';
  phase?: string;
  demoMode?: boolean;
  model_loaded?: boolean;
  model?: ModelInfo;
  satellite_provider?: string;
  queue?: { state: 'up' | 'down'; counts: Record<string, number> | null };
  /** Internal continuous-scan scheduler (BullMQ repeatable sweep). */
  scheduler?: { enabled: boolean; intervalMinutes: number };
}

/** A controllable backing process (engine / queue / DB / Clay sidecar). */
export interface ServiceStatus {
  name: string;
  label: string;
  running: boolean;
  port: number;
}

// ── Clay foundation-model similarity (find-similar / retrieval / novelty) ──
export interface SimilarityNeighbour {
  class: string;       // 'Plastic' | 'Algae' | 'Sea_Foam' | 'Water'
  source: string;      // reference dataset (e.g. 'MARIDA+MADOS')
  id: number;
  similarity: number;  // cosine, 0..1
}

export interface SimilarityInfo {
  available: boolean;
  size?: number;
  dim?: number;
  classMix?: Record<string, number>;
  sources?: string[];
  siteStore?: { embeddedSites: number; observations: number };
  model?: string;
}

export interface SimilarityDemo {
  available: boolean;
  queryClass?: string;
  queryId?: number;
  querySource?: string;
  neighbours?: SimilarityNeighbour[];
}

export interface SimilaritySearch {
  available: boolean;
  neighbours?: SimilarityNeighbour[];
  knnClass?: string;
  anomaly?: number;
  novel?: boolean;
  error?: string;      // set (with available:true) on embedding-dimension mismatch
}

/** MLP + Clay fused confidence — the two independent models collapsed to one tier. */
export interface ConfidenceFusion {
  tier: 'Low' | 'Medium' | 'High';
  score: number;
  basis: 'mlp+clay' | 'mlp-only';
  agreement?: boolean | null;
  reasons: string[];
  confirmed?: boolean;          // calibrated CONFIRMED (precise) vs POSSIBLE (wider net)
  plasticAffinity?: number;     // Clay weighted k-NN Plastic vote share (class-robust)
  anomaly?: number;
}

/** TRUE 'sites like this hotspot' from the site's cached Clay embedding.
 *  pending=true means the chip is queued but the GPU node hasn't embedded it yet. */
export interface SimilarityHotspot {
  available: boolean;
  pending?: boolean;
  key?: string;
  observedAt?: string;
  lat?: number;
  lon?: number;
  observations?: number;
  neighbours?: SimilarityNeighbour[];
  mlpClass?: string;
  mlpConfidence?: number;
  knnClass?: string;
  anomaly?: number;
  novel?: boolean;
  fusion?: ConfidenceFusion;
}

/** A human-validated detection in the active-learning export. */
export interface TrainingLabel {
  id: string;
  lat: number;
  lon: number;
  classification: string;
  confidence: number;
  fdiScore: number;
  areaSqKm: number;
  label: 'CONFIRMED' | 'FALSE_ALARM';
  regionCode: string | null;
  validatedAt: string | null;
}

export interface TrainingLabelSet {
  rows: TrainingLabel[];
  total: number;
  confirmed: number;
  falseAlarm: number;
}

/** An embedded site available for per-hotspot intelligence (from the store). */
export interface SimilaritySite {
  key: string;
  region: string;
  lat: number;
  lon: number;
  mlpClass: string;
  observedAt: string;
  observations: number;
}

export interface SimilaritySites {
  available: boolean;
  count: number;
  sites: SimilaritySite[];
}

/** Temporal change of a site across its dated Clay fingerprints. */
export interface SiteChange {
  available: boolean;
  key?: string;
  observations: number;
  change?: null;              // set null when <2 observations
  note?: string;
  from?: string;
  to?: string;
  classFrom?: string;
  classTo?: string;
  plasticAffinityFrom?: number;
  plasticAffinityTo?: number;
  plasticAffinityDelta?: number;
  latestDrift?: number;
  trend?: 'intensifying' | 'clearing' | 'shifted' | 'stable';
  steps?: { from: string; to: string; drift: number }[];
  series?: { ts: string; knnClass: string; plasticAffinity: number }[];
}
