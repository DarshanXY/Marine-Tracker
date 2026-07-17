/**
 * Typed API client.
 *
 * Talks to the backend at /api (Vite proxies /api → http://localhost:3001 in
 * dev; set VITE_API_URL for other environments). Every call gracefully falls
 * back to the bundled frontend mock if the backend is unreachable, so the UI
 * never breaks during the demo. `api.isLive()` reports whether the last call
 * hit the real backend.
 */
import axios, { type AxiosInstance } from 'axios';
import type {
  AdminUser, Alert, AoiBBox, AoiRunOptions, AuthUser, Backtrack, ChangeResult, ClassStat,
  CreateOperationInput, Detection, DetectionQuery, DetectionStatus, EngineCapabilities, FileReportInput, Hotspot, LoginPayload, ModelValidation,
  ModelEval, Operation, OperationStats, OperationStatus, OverviewStats, PipelineLogEntry,
  PipelineResult, PipelineStatusInfo, Region, RegionStat, SatelliteScene, SatelliteStatus,
  ScenesResult, ServiceStatus, SimilarityDemo, SimilarityHotspot, SimilarityInfo, SimilaritySearch, SimilaritySites,
  SiteChange, TrainingLabel, TrainingLabelSet, TrajectoryForecast,
  TrendPoint, TwoFactorSetup,
} from '@/types';
import * as mock from './mockData';
import { authToken } from './authToken';

const baseURL = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

const http: AxiosInstance = axios.create({
  baseURL,
  timeout: 8000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach the JWT access token to every request when signed in.
http.interceptors.request.use((config) => {
  if (authToken.access) {
    config.headers.Authorization = `Bearer ${authToken.access}`;
  }
  return config;
});

// ── Transparent access-token refresh ──────────────────────────────────────────
// The 15-min access token used to expire silently, so any WRITE (scan an AOI,
// acknowledge an alert, dispatch an op) 401'd for the rest of the session while
// reads kept working. On a 401 we now refresh once (rotating refresh token) and
// retry the original request; concurrent 401s share the single in-flight refresh.
let refreshing: Promise<string | null> | null = null;

async function refreshAccess(): Promise<string | null> {
  const rt = authToken.refresh;
  if (!rt) return null;
  try {
    // Raw axios (bypasses these interceptors) to avoid recursion.
    const res = await axios.post<{ data: { accessToken: string; refreshToken: string } }>(
      `${baseURL}/api/auth/refresh`, { refreshToken: rt }, { headers: { 'Content-Type': 'application/json' } },
    );
    const { accessToken, refreshToken } = res.data.data;
    // Update the persisted store (dynamic import breaks the store↔api cycle);
    // its subscription mirrors the tokens into authToken for the next request.
    const { useAuthStore } = await import('@/stores/authStore');
    useAuthStore.setState({ accessToken, refreshToken, isAuthenticated: true });
    return accessToken;
  } catch {
    const { useAuthStore } = await import('@/stores/authStore');
    useAuthStore.setState({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
    return null;
  }
}

http.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config as (typeof error.config & { _retried?: boolean }) | undefined;
    const status = error.response?.status;
    const url = String(original?.url ?? '');
    if (status === 401 && original && !original._retried && authToken.refresh && !url.includes('/api/auth/')) {
      original._retried = true;
      if (!refreshing) refreshing = refreshAccess().finally(() => { refreshing = null; });
      const newAccess = await refreshing;
      if (newAccess) {
        original.headers = { ...(original.headers ?? {}), Authorization: `Bearer ${newAccess}` };
        return http(original);
      }
    }
    return Promise.reject(error);
  },
);

/** Sentinel thrown by auth calls when the backend is unreachable. */
export const OFFLINE = '__offline__';

function authError(err: unknown): never {
  if (axios.isAxiosError(err) && err.response) {
    const msg = (err.response.data as { error?: { message?: string } })?.error?.message;
    throw new Error(msg ?? 'Request failed');
  }
  throw new Error(OFFLINE);
}

let live = false;
let lastSource: 'db' | 'demo' | 'mock' = 'mock';

/** Unwrap `{ data }` envelope; mark backend as reachable; note data source. */
async function get<T>(url: string, fallback: () => T, params?: unknown): Promise<T> {
  try {
    const res = await http.get<{ data: T }>(url, { params: params as object });
    live = true;
    const hdr = res.headers['x-data-source'];
    lastSource = hdr === 'db' ? 'db' : 'demo';
    return res.data.data;
  } catch {
    live = false;
    lastSource = 'mock';
    return fallback();
  }
}

async function patch<T>(url: string, fallback: () => T): Promise<T> {
  try {
    const res = await http.patch<{ data: T }>(url);
    live = true;
    return res.data.data;
  } catch {
    live = false;
    return fallback();
  }
}

/** POST with body, unwrapping `{ data }`. Throws on failure (no offline fallback —
 *  writes need the backend); react-query surfaces the error to the UI. */
async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await http.post<{ data: T }>(url, body);
  live = true;
  return res.data.data;
}

/** PATCH with body, unwrapping `{ data }`. Throws on failure. */
async function patchBody<T>(url: string, body: unknown): Promise<T> {
  const res = await http.patch<{ data: T }>(url, body);
  live = true;
  return res.data.data;
}

/** Fetch a binary endpoint as a Blob and trigger a browser download. */
async function downloadBlob(url: string, filename: string, opts?: { params?: object; timeout?: number }): Promise<void> {
  const res = await http.get(url, { responseType: 'blob', params: opts?.params, timeout: opts?.timeout ?? 30_000 });
  const blobUrl = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}

// Local mock filtering (mirrors backend query semantics) ─────────────────────
function filterDetections(q: DetectionQuery): { data: Detection[]; total: number } {
  let rows = [...mock.detections];
  if (q.region) rows = rows.filter((d) => d.regionCode === q.region);
  if (q.status) rows = rows.filter((d) => d.status === q.status);
  if (q.classification) rows = rows.filter((d) => d.classification === q.classification);
  if (q.minConfidence) rows = rows.filter((d) => d.confidence >= q.minConfidence!);
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const total = rows.length;
  const offset = q.offset ?? 0;
  const limit = q.limit ?? 50;
  return { data: rows.slice(offset, offset + limit), total };
}

export const api = {
  isLive: (): boolean => live,
  source: (): 'db' | 'demo' | 'mock' => lastSource,

  overview: (): Promise<OverviewStats> =>
    get('/api/stats/overview', () => mock.overview),

  trend: (days = 30): Promise<TrendPoint[]> =>
    get('/api/stats/trend', () => mock.trend(days), { days }),

  byRegion: (): Promise<RegionStat[]> =>
    get('/api/stats/by-region', () => mock.byRegion),

  byClass: (): Promise<ClassStat[]> =>
    get('/api/stats/by-class', () => mock.byClass),

  // Dedicated implementation (not the generic get()): this endpoint's envelope
  // is { data, meta: { total } } and callers need BOTH — the plain unwrapper
  // returned the bare array on the live path, crashing `.data`/`.total` readers.
  detections: async (q: DetectionQuery = {}): Promise<{ data: Detection[]; total: number }> => {
    try {
      const res = await http.get<{ data: Detection[]; meta?: { total?: number } }>(
        '/api/detections',
        { params: q },
      );
      live = true;
      lastSource = res.headers['x-data-source'] === 'db' ? 'db' : 'demo';
      return { data: res.data.data, total: res.data.meta?.total ?? res.data.data.length };
    } catch {
      live = false;
      lastSource = 'mock';
      return filterDetections(q);
    }
  },

  detection: (id: string): Promise<Detection | null> =>
    get(`/api/detections/${id}`, () => mock.detections.find((d) => d.id === id) ?? null),

  /** Human validation of a detection (Coast Guard+). Falls back to a local mock
   *  mutation when the backend is offline so the demo still reflects the label. */
  labelDetection: async (id: string, status: DetectionStatus): Promise<Detection | null> => {
    try {
      const res = await http.post<{ data: Detection }>(`/api/detections/${id}/label`, { status });
      live = true;
      return res.data.data;
    } catch {
      live = false;
      const d = mock.detections.find((x) => x.id === id);
      if (d) d.status = status;
      return d ?? null;
    }
  },

  /** Download the analyst-validated set as an active-learning CSV. */
  exportTrainingLabels: (): Promise<void> =>
    downloadBlob('/api/detections/labels/export', `training-labels-${new Date().toISOString().slice(0, 10)}.csv`,
      { params: { format: 'csv' } }),

  /** The active-learning labelled set (JSON) — rows + confirmed / false-alarm counts. */
  trainingLabels: async (): Promise<TrainingLabelSet> => {
    try {
      const res = await http.get<{ data: TrainingLabel[]; meta: { total: number; confirmed: number; falseAlarm: number } }>(
        '/api/detections/labels/export',
      );
      live = true;
      return { rows: res.data.data, ...res.data.meta };
    } catch {
      live = false;
      const rows = mock.detections
        .filter((d) => d.status === 'CONFIRMED' || d.status === 'FALSE_ALARM')
        .map((d): TrainingLabel => ({
          id: d.id, lat: d.lat, lon: d.lon, classification: d.classification, confidence: d.confidence,
          fdiScore: d.fdiScore, areaSqKm: d.areaSqKm, label: d.status as 'CONFIRMED' | 'FALSE_ALARM',
          regionCode: d.regionCode ?? null, validatedAt: null,
        }));
      const confirmed = rows.filter((r) => r.label === 'CONFIRMED').length;
      return { rows, total: rows.length, confirmed, falseAlarm: rows.length - confirmed };
    }
  },

  hotspots: (params: { region?: string; severity?: string; active?: boolean } = {}): Promise<Hotspot[]> =>
    get('/api/hotspots', () => {
      let rows = [...mock.hotspots];
      if (params.region) rows = rows.filter((h) => h.regionCode === params.region);
      if (params.severity) rows = rows.filter((h) => h.severity === params.severity);
      return rows;
    }, params),

  hotspot: (id: string): Promise<Hotspot | null> =>
    get(`/api/hotspots/${id}`, () => mock.hotspots.find((h) => h.id === id) ?? null),

  regions: (): Promise<Region[]> =>
    get('/api/regions', () => mock.regions),

  alerts: (params: { acked?: boolean; severity?: string } = {}): Promise<Alert[]> =>
    get('/api/alerts', () => {
      let rows = [...mock.alerts];
      if (params.acked !== undefined) rows = rows.filter((a) => a.isAcked === params.acked);
      if (params.severity) rows = rows.filter((a) => a.severity === params.severity);
      return rows;
    }, params),

  ackAlert: (id: string): Promise<Alert | null> =>
    patch(`/api/alerts/${id}/ack`, () => {
      const a = mock.alerts.find((x) => x.id === id);
      if (a) { a.isAcked = true; a.ackedAt = new Date().toISOString(); }
      return a ?? null;
    }),

  satelliteStatus: (): Promise<SatelliteStatus> =>
    get('/api/satellite/status', () => mock.satelliteStatus),

  scenes: async (region?: string): Promise<ScenesResult> => {
    try {
      const res = await http.get<{ data: SatelliteScene[]; meta?: { source?: string } }>(
        '/api/satellite/scenes',
        { params: region ? { region } : {} },
      );
      live = true;
      const source = res.data.meta?.source === 'stac' ? 'stac' : 'demo';
      return { data: res.data.data, source };
    } catch {
      live = false;
      const data = region ? mock.scenes.filter((s) => s.regionCode === region) : mock.scenes;
      return { data, source: 'mock' };
    }
  },

  // ── Auth ───────────────────────────────────────────────────────────────────
  authLogin: async (identifier: string, password: string, totp?: string): Promise<LoginPayload> => {
    try {
      const res = await http.post<{ data: LoginPayload }>('/api/auth/login', { identifier, password, totp });
      live = true;
      return res.data.data;
    } catch (err) {
      authError(err);
    }
  },

  authRegister: async (username: string, email: string, password: string): Promise<LoginPayload> => {
    try {
      const res = await http.post<{ data: LoginPayload }>('/api/auth/register', { username, email, password });
      live = true;
      return res.data.data;
    } catch (err) {
      authError(err);
    }
  },

  authMe: async (): Promise<AuthUser | null> => {
    try {
      const res = await http.get<{ data: AuthUser }>('/api/auth/me');
      return res.data.data;
    } catch {
      return null;
    }
  },

  authLogout: async (refreshToken: string | null): Promise<void> => {
    try {
      await http.post('/api/auth/logout', { refreshToken });
    } catch {
      // best-effort — clearing local state is what matters
    }
  },

  twoFactorSetup: async (): Promise<TwoFactorSetup> => {
    const res = await http.post<{ data: TwoFactorSetup }>('/api/auth/2fa/setup');
    return res.data.data;
  },

  twoFactorEnable: async (token: string): Promise<boolean> => {
    try {
      const res = await http.post<{ data: { totpEnabled: boolean } }>('/api/auth/2fa/enable', { token });
      return res.data.data.totpEnabled;
    } catch (err) {
      authError(err);
    }
  },

  twoFactorDisable: async (): Promise<boolean> => {
    const res = await http.post<{ data: { totpEnabled: boolean } }>('/api/auth/2fa/disable');
    return res.data.data.totpEnabled;
  },

  // ── Detection pipeline ──────────────────────────────────────────────────────
  pipelineStatus: async (): Promise<PipelineStatusInfo> => {
    try {
      const res = await http.get<{ data: PipelineStatusInfo }>('/api/pipeline/status');
      live = true;
      return res.data.data;
    } catch {
      live = false;
      return { engine: 'offline' };
    }
  },

  /** Read-only status of the backing services: engine, queue, DB, Clay. */
  services: async (): Promise<ServiceStatus[]> => {
    try {
      const res = await http.get<{ data: ServiceStatus[] }>('/api/system/services');
      return res.data.data;
    } catch {
      return [];
    }
  },

  pipelineRun: async (
    region?: string,
    sceneSize = 48,
  ): Promise<{ result: PipelineResult; engine: 'online' | 'offline' }> => {
    try {
      const res = await http.post<{ data: PipelineResult; meta?: { engine?: 'online' | 'offline' } }>(
        '/api/pipeline/run',
        { region, sceneSize },
      );
      live = true;
      return { result: res.data.data, engine: res.data.meta?.engine ?? 'online' };
    } catch {
      live = false;
      return { result: mock.pipelineResult(region), engine: 'offline' };
    }
  },

  /** Run the full detection pipeline live for a user-drawn AOI (bbox). Everything
   *  is computed for the selected area — no static data. */
  analyzeAoi: async (
    bbox: AoiBBox,
    sceneSize = 64,
    options?: AoiRunOptions,
  ): Promise<{ result: PipelineResult; engine: 'online' | 'offline' }> => {
    const res = await http.post<{ data: PipelineResult; meta?: { engine?: 'online' | 'offline' } }>(
      '/api/pipeline/run',
      { bbox, sceneSize, ...options },
      { timeout: 130_000 }, // cold real run: OAuth + pixel fetch + STAC + forcing (backend caps at 120s)
    );
    live = true;
    return { result: res.data.data, engine: res.data.meta?.engine ?? 'online' };
  },

  /** 72-hour drift forecast for a point: forward path + uncertainty cone +
   *  landfall probability + back-track (where it likely came FROM). */
  forecastTrajectory: async (lat: number, lon: number, horizonHours = 72): Promise<TrajectoryForecast> => {
    const res = await http.post<{ data: TrajectoryForecast }>(
      '/api/engine/forecast/trajectory', { lat, lon, horizonHours }, { timeout: 35_000 },
    );
    return res.data.data;
  },

  /** Back-track a parcel upstream to its likely source (points[last] ≈ origin). */
  forecastBacktrack: async (lat: number, lon: number, horizonHours = 48): Promise<Backtrack> => {
    const res = await http.post<{ data: Backtrack }>(
      '/api/engine/forecast/backtrack', { lat, lon, horizonHours }, { timeout: 35_000 },
    );
    return res.data.data;
  },

  /** Is an AOI's debris density increasing vs an older window? (real-satellite only) */
  changeDetection: async (bbox: AoiBBox, daysRecent = 30, daysOld = 180): Promise<ChangeResult> => {
    const res = await http.post<{ data: ChangeResult }>(
      '/api/engine/change', { bbox, daysRecent, daysOld }, { timeout: 140_000 },
    );
    return res.data.data;
  },

  /** Live held-out evaluation of the shipped model on a cached MARIDA/MADOS split. */
  modelEvaluate: async (dataset = 'marida', split = 'test'): Promise<ModelEval> => {
    const res = await http.get<{ data: ModelEval }>(
      '/api/engine/model/evaluate', { params: { dataset, split }, timeout: 35_000 },
    );
    return res.data.data;
  },

  /** Clay similarity index availability + stats (size, class mix, sources). */
  similarityInfo: async (): Promise<SimilarityInfo> => {
    const res = await http.get<{ data: SimilarityInfo }>('/api/engine/similarity/info', { timeout: 8_000 });
    return res.data.data;
  },

  /** 'Find sites like this' — nearest labelled sites to a class exemplar (no embedder needed). */
  similarityDemo: async (cls = 0, k = 6): Promise<SimilarityDemo> => {
    const res = await http.get<{ data: SimilarityDemo }>(
      '/api/engine/similarity/demo', { params: { cls, k }, timeout: 8_000 },
    );
    return res.data.data;
  },

  /** Nearest labelled sites for a RAW 1024-d Clay embedding + retrieval vote + novelty. */
  similaritySearch: async (embedding: number[], k = 6): Promise<SimilaritySearch> => {
    const res = await http.post<{ data: SimilaritySearch }>(
      '/api/engine/similarity/search', { embedding, k }, { timeout: 20_000 },
    );
    return res.data.data;
  },

  /** TRUE 'sites like this hotspot' from its cached Clay embedding (pending until embedded). */
  similarityHotspot: async (key: string, k = 8): Promise<SimilarityHotspot> => {
    const res = await http.get<{ data: SimilarityHotspot }>(
      '/api/engine/similarity/hotspot', { params: { key, k }, timeout: 8_000 },
    );
    return res.data.data;
  },

  /** Temporal change of a site across its dated Clay fingerprints (drift + plastic trend). */
  similarityChange: async (key: string): Promise<SiteChange> => {
    const res = await http.get<{ data: SiteChange }>(
      '/api/engine/similarity/change', { params: { key }, timeout: 8_000 },
    );
    return res.data.data;
  },

  /** Engine self-description — features, config, endpoints, indices. */
  capabilities: async (): Promise<EngineCapabilities> => {
    const res = await http.get<{ data: EngineCapabilities }>('/api/engine/capabilities', { timeout: 6_000 });
    return res.data.data;
  },

  /** Operating regime — fusion calibration + PLP independent validation. */
  modelValidation: async (): Promise<ModelValidation> => {
    const res = await http.get<{ data: ModelValidation }>('/api/engine/model/validation', { timeout: 6_000 });
    return res.data.data;
  },

  /** Embedded sites available for per-hotspot intelligence. */
  similaritySites: async (limit = 200): Promise<SimilaritySites> => {
    const res = await http.get<{ data: SimilaritySites }>(
      '/api/engine/similarity/sites', { params: { limit }, timeout: 8_000 },
    );
    return res.data.data;
  },

  /** Download a georeferenced index raster (FDI/NDVI/FAI) for an AOI as GeoTIFF. */
  exportGeotiff: async (bbox: AoiBBox, layer = 'fdi'): Promise<void> => {
    const res = await http.post('/api/engine/export/geotiff', { bbox, layer },
      { responseType: 'blob', timeout: 90_000 });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${layer}_aoi.tif`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  /** Recent per-stage pipeline log rows (operations board). */
  pipelineLogs: (limit = 30): Promise<PipelineLogEntry[]> =>
    get('/api/pipeline/logs', () => [], { limit }),

  /** Trigger a full monitored-regions run (same entry point the external cron hits). */
  scheduledRun: async (): Promise<{ mode: string }> => {
    const res = await http.post<{ data: { mode?: string; jobs?: Record<string, string> } }>(
      '/api/pipeline/scheduled-run', {}, { timeout: 400_000 },
    );
    return { mode: res.data.data.mode ?? 'direct' };
  },

  /** All users — ADMIN only (backend enforces via requireMinLevel). */
  adminUsers: async (): Promise<AdminUser[]> => {
    try {
      const res = await http.get<{ data: AdminUser[] }>('/api/auth/users');
      return res.data.data;
    } catch (err) {
      authError(err);
    }
  },

  /** Real Sentinel-2 scenes covering a user-drawn AOI (AWS Earth Search STAC, no key). */
  scenesByBbox: async (bbox: AoiBBox): Promise<ScenesResult> => {
    const raw = `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;
    const res = await http.get<{ data: SatelliteScene[]; meta?: { source?: string } }>(
      '/api/satellite/scenes',
      { params: { bbox: raw }, timeout: 30_000 }, // > backend's 20s engine wait (cold STAC bbox lookup)
    );
    live = true;
    const source = res.data.meta?.source === 'stac' ? 'stac' : 'demo';
    return { data: res.data.data, source };
  },

  // ── Field operations ────────────────────────────────────────────────────────
  operations: (params: { status?: string; region?: string; limit?: number } = {}): Promise<Operation[]> =>
    get('/api/operations', () => [], params),

  operation: (id: string): Promise<Operation | null> =>
    get(`/api/operations/${id}`, () => null),

  operationStats: (): Promise<OperationStats> =>
    get('/api/operations/stats', () => ({
      total: 0,
      byStatus: { PLANNED: 0, DISPATCHED: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELLED: 0 },
      openHighPriority: 0, plasticCollectedKg: 0, areaClearedSqKm: 0,
    })),

  createOperation: (input: CreateOperationInput): Promise<Operation> =>
    post('/api/operations', input),

  updateOperationStatus: (id: string, status: OperationStatus, note?: string): Promise<Operation> =>
    patchBody(`/api/operations/${id}/status`, { status, note }),

  fileMissionReport: (id: string, input: FileReportInput): Promise<Operation> =>
    post(`/api/operations/${id}/report`, input),

  // ── Server-side report exports (proper PDF / full-dataset CSV) ───────────────
  exportHotspotsPdf: (region?: string): Promise<void> =>
    downloadBlob('/api/export/hotspots.pdf', `hotspot-report-${region ?? 'all'}-${new Date().toISOString().slice(0, 10)}.pdf`,
      { params: region ? { region } : undefined }),

  exportOperationPdf: (id: string, code: string): Promise<void> =>
    downloadBlob(`/api/export/operations/${id}.pdf`, `operation-${code}.pdf`),

  exportDetectionsCsv: (params: { region?: string; status?: string; days?: number } = {}): Promise<void> =>
    downloadBlob('/api/export/detections.csv', `detections-${new Date().toISOString().slice(0, 10)}.csv`, { params }),
};
