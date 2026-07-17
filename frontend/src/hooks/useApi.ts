/**
 * React Query hooks over the typed API client. Components consume these instead
 * of calling `api` directly, so caching/loading/error states are consistent.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AoiBBox, AoiRunOptions, DetectionQuery, DetectionStatus, FileReportInput, OperationStatus } from '@/types';

/** Stable query-key for an AOI so react-query caches per drawn area. */
const bboxKey = (b: AoiBBox) =>
  `${b.north.toFixed(4)},${b.south.toFixed(4)},${b.east.toFixed(4)},${b.west.toFixed(4)}`;

export const useOverview = () =>
  useQuery({ queryKey: ['overview'], queryFn: api.overview });

export const useTrend = (days = 30) =>
  useQuery({ queryKey: ['trend', days], queryFn: () => api.trend(days) });

export const useByRegion = () =>
  useQuery({ queryKey: ['by-region'], queryFn: api.byRegion });

export const useByClass = () =>
  useQuery({ queryKey: ['by-class'], queryFn: api.byClass });

export const useDetections = (query: DetectionQuery = {}) =>
  useQuery({ queryKey: ['detections', query], queryFn: () => api.detections(query) });

export const useDetection = (id: string | undefined) =>
  useQuery({
    queryKey: ['detection', id],
    queryFn: () => api.detection(id as string),
    enabled: Boolean(id),
  });

export const useHotspots = (params: { region?: string; severity?: string; active?: boolean } = {}) =>
  useQuery({ queryKey: ['hotspots', params], queryFn: () => api.hotspots(params) });

export const useHotspot = (id: string | undefined) =>
  useQuery({
    queryKey: ['hotspot', id],
    queryFn: () => api.hotspot(id as string),
    enabled: Boolean(id),
  });

export const useRegions = () =>
  useQuery({ queryKey: ['regions'], queryFn: api.regions });

export const useAlerts = (params: { acked?: boolean; severity?: string } = {}) =>
  useQuery({ queryKey: ['alerts', params], queryFn: () => api.alerts(params) });

export const useSatelliteStatus = () =>
  useQuery({ queryKey: ['satellite-status'], queryFn: api.satelliteStatus });

export const useScenes = (region?: string) =>
  useQuery({ queryKey: ['scenes', region ?? 'all'], queryFn: () => api.scenes(region) });

export const usePipelineStatus = () =>
  useQuery({ queryKey: ['pipeline-status'], queryFn: api.pipelineStatus, refetchInterval: 15_000 });

/** Backing services (engine / queue / DB / Clay) — polled so the status chips
 *  reflect a service coming up/going down on their own. Read-only: the UI reports
 *  service state, it does not start or stop them. */
export const useServices = () =>
  useQuery({ queryKey: ['services'], queryFn: api.services, refetchInterval: 8_000, retry: false });

export const usePipelineLogs = (limit = 30) =>
  useQuery({ queryKey: ['pipeline-logs', limit], queryFn: () => api.pipelineLogs(limit), refetchInterval: 30_000 });

export const useAdminUsers = () =>
  useQuery({ queryKey: ['admin-users'], queryFn: api.adminUsers, retry: false });

export function usePipelineRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ region, sceneSize }: { region?: string; sceneSize?: number }) =>
      api.pipelineRun(region, sceneSize),
    onSuccess: () => {
      // Runs persist to PostgreSQL — refresh everything that reads from it.
      for (const key of ['detections', 'hotspots', 'alerts', 'overview', 'trend', 'by-region', 'by-class']) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

/** Live detection for a user-drawn AOI. Auto-runs when `bbox` changes; when
 *  `live` is on it re-runs every 30s (near-real-time).
 *
 *  `initial` restores a previously-saved scan for the SAME box (from mapStore):
 *  it seeds the query so returning to the page shows results instantly and does
 *  NOT trigger a fresh CDSE re-scan (unless `live` is on, or the box changes). */
export const useAoiAnalysis = (
  bbox: AoiBBox | null,
  live: boolean,
  options?: AoiRunOptions,
  initial?: { data: { result: unknown; engine: 'online' | 'offline' }; savedAt: number },
) =>
  useQuery({
    queryKey: ['aoi', bbox ? bboxKey(bbox) : 'none',
      options?.minConfidence ?? 0, options?.dedupe ?? false, options?.biofouling ?? false],
    queryFn: () => api.analyzeAoi(bbox as AoiBBox, 64, options),
    enabled: Boolean(bbox),
    refetchInterval: live && bbox ? 30_000 : false,
    refetchOnWindowFocus: false,
    // One retry only — a real scan takes tens of seconds; three silent retries
    // made failures look like "nothing happened". Errors surface in the UI.
    retry: 1,
    // Restored session: treat the saved snapshot as fresh so it shows instantly
    // without a re-scan. A brand-new selection has no snapshot → runs the whole
    // pipeline fresh (scan → FDI → CNN → cluster → drift).
    ...(initial
      ? {
          initialData: initial.data as never,
          initialDataUpdatedAt: initial.savedAt,
          staleTime: 15 * 60_000,
          gcTime: 15 * 60_000,
        }
      : { staleTime: 0, gcTime: 0 }),
  });

/** On-demand 72-hour drift forecast (forward + back-track + landfall) for a point. */
export const useForecast = () =>
  useMutation({
    mutationFn: (p: { lat: number; lon: number; horizon?: number }) =>
      api.forecastTrajectory(p.lat, p.lon, p.horizon ?? 72),
  });

/** On-demand AOI change detection (recent vs older window). */
export const useChangeDetection = () =>
  useMutation({ mutationFn: (bbox: AoiBBox) => api.changeDetection(bbox) });

/** On-demand back-track — trace a parcel upstream to its likely source. */
export const useBacktrack = () =>
  useMutation({ mutationFn: (p: { lat: number; lon: number; horizon?: number }) =>
    api.forecastBacktrack(p.lat, p.lon, p.horizon ?? 48) });

/** On-demand live held-out model evaluation on a cached split. */
export const useModelEval = () =>
  useMutation({ mutationFn: (p: { dataset?: string }) => api.modelEvaluate(p.dataset ?? 'marida') });

/** Engine self-description — features, config, indices (retry:false; 503s when engine down). */
export const useCapabilities = () =>
  useQuery({ queryKey: ['capabilities'], queryFn: api.capabilities, retry: false });

/** Operating regime — fusion calibration + PLP independent validation. */
export const useModelValidation = () =>
  useQuery({ queryKey: ['model-validation'], queryFn: api.modelValidation, retry: false });

/** Clay similarity index availability + stats (retry:false — 503s when index absent). */
export const useSimilarityInfo = (enabled = true) =>
  useQuery({ queryKey: ['similarity-info'], queryFn: api.similarityInfo, enabled, retry: false });

/** 'Find sites like this' neighbours for a class exemplar (cls 0-3, k neighbours). */
export const useSimilarityDemo = (cls = 0, k = 8, enabled = true) =>
  useQuery({
    queryKey: ['similarity-demo', cls, k],
    queryFn: () => api.similarityDemo(cls, k),
    enabled,
    retry: false,
  });

/** Nearest sites for a RAW Clay embedding (user-triggered; needs the GPU embedder). */
export const useSimilaritySearch = () =>
  useMutation({ mutationFn: (p: { embedding: number[]; k?: number }) => api.similaritySearch(p.embedding, p.k ?? 8) });

/** TRUE 'sites like THIS hotspot' by its embed key (pending until the GPU node embeds it). */
export const useSimilarityHotspot = (key: string | null | undefined, k = 8) =>
  useQuery({
    queryKey: ['similarity-hotspot', key, k],
    queryFn: () => api.similarityHotspot(key as string, k),
    enabled: Boolean(key),
    retry: false,
  });

/** Temporal change of a site across its dated Clay fingerprints. */
export const useSimilarityChange = (key: string | null | undefined, enabled = true) =>
  useQuery({
    queryKey: ['similarity-change', key],
    queryFn: () => api.similarityChange(key as string),
    enabled: Boolean(key) && enabled,
    retry: false,
  });

/** Embedded sites available for per-hotspot intelligence. */
export const useSimilaritySites = (enabled = true) =>
  useQuery({ queryKey: ['similarity-sites'], queryFn: () => api.similaritySites(), enabled, retry: false });

/** Real Sentinel-2 scenes for a user-drawn AOI (refreshes every 60s when live). */
export const useScenesByBbox = (bbox: AoiBBox | null, live: boolean) =>
  useQuery({
    queryKey: ['scenes-bbox', bbox ? bboxKey(bbox) : 'none'],
    queryFn: () => api.scenesByBbox(bbox as AoiBBox),
    enabled: Boolean(bbox),
    refetchInterval: live && bbox ? 60_000 : false,
    refetchOnWindowFocus: false,
  });

/** Analyst validation of a detection (confirm plastic / false alarm / reset).
 *  Refreshes everything the label changes: the list, counts, class + trend charts. */
export function useLabelDetection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: DetectionStatus }) => api.labelDetection(id, status),
    onSuccess: () => {
      for (const key of ['detections', 'detection', 'overview', 'by-class', 'trend', 'training-labels']) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

/** The active-learning labelled set + counts (refreshed when a label changes). */
export const useTrainingLabels = () =>
  useQuery({ queryKey: ['training-labels'], queryFn: api.trainingLabels });

export function useAckAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.ackAlert(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['alerts'] });
      void qc.invalidateQueries({ queryKey: ['overview'] });
    },
  });
}

// ── Field operations ──────────────────────────────────────────────────────────
export const useOperations = (params: { status?: string; region?: string; limit?: number } = {}) =>
  useQuery({ queryKey: ['operations', params], queryFn: () => api.operations(params), refetchInterval: 20_000 });

export const useOperation = (id: string | undefined) =>
  useQuery({ queryKey: ['operation', id], queryFn: () => api.operation(id as string), enabled: Boolean(id) });

export const useOperationStats = () =>
  useQuery({ queryKey: ['operation-stats'], queryFn: api.operationStats, refetchInterval: 20_000 });

/** Invalidate every operations query after a write. */
function invalidateOps(qc: ReturnType<typeof useQueryClient>) {
  for (const key of ['operations', 'operation', 'operation-stats']) {
    void qc.invalidateQueries({ queryKey: [key] });
  }
}

export function useCreateOperation() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: api.createOperation, onSuccess: () => invalidateOps(qc) });
}

export function useUpdateOperationStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: OperationStatus; note?: string }) =>
      api.updateOperationStatus(id, status, note),
    onSuccess: () => invalidateOps(qc),
  });
}

export function useFileMissionReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: FileReportInput }) => api.fileMissionReport(id, input),
    onSuccess: () => invalidateOps(qc),
  });
}
