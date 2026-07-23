/**
 * Map Explorer session store (zustand + localStorage).
 *
 * The AOI scan query is deliberately zero-cache (staleTime/gcTime 0) so each new
 * selection re-runs the whole pipeline. That means leaving the page dropped the
 * drawn box AND its results. This store remembers the last scan — the selection,
 * run options, and the full result — so returning to Map Explorer (or reloading)
 * restores exactly what you were looking at, without a wasteful CDSE re-scan.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AoiBBox, PipelineResult } from '@/types';

export interface AoiRunOpts {
  minConfidence: number;
  dedupe: boolean;
  biofouling: boolean;
}

/** The full analyzeAoi response we cache so results show instantly on return. */
export interface AoiSnapshot {
  result: PipelineResult;
  engine: 'online' | 'offline';
}

interface MapState {
  bbox: AoiBBox | null;
  runOpts: AoiRunOpts;
  live: boolean;
  /** Last successful scan payload + when it was taken (ms epoch). */
  snapshot: AoiSnapshot | null;
  savedAt: number;
  /** `scanKey` of the run that produced `snapshot` — its provenance. Without it
   *  there is no way to tell whether the snapshot belongs to the box currently
   *  selected, and stale results leak onto a different area. */
  snapshotKey: string;

  setSelection: (bbox: AoiBBox | null, runOpts: AoiRunOpts, live: boolean) => void;
  setSnapshot: (snapshot: AoiSnapshot, key: string) => void;
  clear: () => void;
}

const DEFAULT_OPTS: AoiRunOpts = { minConfidence: 0, dedupe: false, biofouling: false };

export const useMapStore = create<MapState>()(
  persist(
    (set) => ({
      bbox: null,
      runOpts: DEFAULT_OPTS,
      live: false,
      snapshot: null,
      savedAt: 0,
      snapshotKey: '',

      setSelection: (bbox, runOpts, live) => set({ bbox, runOpts, live }),
      setSnapshot: (snapshot, key) => set({ snapshot, snapshotKey: key, savedAt: Date.now() }),
      clear: () => set({ bbox: null, snapshot: null, snapshotKey: '', savedAt: 0, live: false }),
    }),
    {
      name: 'mpt-map-session',
      // v1 snapshots carry no provenance key, so they cannot be matched to a
      // scan — drop them and let the area re-scan rather than risk showing them
      // under the wrong box.
      version: 2,
      migrate: (persisted) => ({
        ...(persisted as MapState), snapshot: null, snapshotKey: '', savedAt: 0,
      }),
    },
  ),
);

/** Stable key for an AOI box (matches the query key so restore lines up). */
export const bboxKey = (b: AoiBBox | null): string =>
  b ? `${b.west.toFixed(4)},${b.south.toFixed(4)},${b.east.toFixed(4)},${b.north.toFixed(4)}` : 'none';

/** Full identity of a scan: the box AND the run options that produced it —
 *  mirrors the react-query key, so a snapshot only ever restores onto the exact
 *  run it came from. */
export const scanKey = (b: AoiBBox | null, o: AoiRunOpts): string =>
  `${bboxKey(b)}|${o.minConfidence}|${o.dedupe}|${o.biofouling}`;
