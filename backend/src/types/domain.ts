/**
 * API DTO shapes. These are the exact JSON contracts the frontend consumes —
 * keep them in sync with `frontend/src/types/index.ts`.
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

export interface RegionDto {
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

export interface DetectionDto {
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

export interface TrajectoryDto {
  id: string;
  detectionId: string;
  points: { t: number; lat: number; lon: number }[];
  cone: { t: number; latMin: number; latMax: number; lonMin: number; lonMax: number }[];
  windageCoeffs: number[];
  horizonHours: number;
  dataSource: string;
}

export interface HotspotDto {
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
  trajectory?: TrajectoryDto | null;
}

export interface AlertDto {
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

// ── Field operations ──────────────────────────────────────────────────────────
export type OperationStatus =
  | 'PLANNED' | 'DISPATCHED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type OperationOutcome =
  | 'CLEARED' | 'PARTIAL' | 'NOT_FOUND' | 'STOOD_DOWN';

export interface OperationEventDto {
  id: string;
  status: OperationStatus | null;
  note: string | null;
  by: string | null;
  at: string;
}

export interface MissionReportDto {
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

export interface OperationDto {
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
  events?: OperationEventDto[];
  report?: MissionReportDto | null;
}

/** Payload for POST /api/operations. */
export interface CreateOperationInput {
  title: string;
  priority?: Severity;
  hotspotId?: string | null;
  detectionId?: string | null;
  regionCode?: string | null;
  targetLat?: number | null;
  targetLon?: number | null;
  assignedTeam?: string | null;
  assignedToId?: string | null;
  notes?: string | null;
}

/** Payload for POST /api/operations/:id/report. */
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
