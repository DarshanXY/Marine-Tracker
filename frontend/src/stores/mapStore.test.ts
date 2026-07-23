import { beforeEach, describe, expect, it } from 'vitest';
import { useMapStore, scanKey, type AoiRunOpts } from './mapStore';
import type { AoiBBox } from '@/types';

const MUM: AoiBBox = { north: 19.3, south: 18.7, east: 73.2, west: 72.5 };
const CHN: AoiBBox = { north: 13.4, south: 12.8, east: 80.6, west: 79.9 };
const OPTS: AoiRunOpts = { minConfidence: 0, dedupe: false, biofouling: false };

const snapshot = (runId: string) =>
  ({ result: { runId }, engine: 'online' }) as unknown as Parameters<
    ReturnType<typeof useMapStore.getState>['setSnapshot']
  >[0];

/** Mirrors the guard in MapExplorer that decides whether to seed the AOI query
 *  with a saved scan instead of running the pipeline. */
const wouldRestore = (bbox: AoiBBox | null, opts: AoiRunOpts): boolean => {
  const st = useMapStore.getState();
  return Boolean(st.snapshot && bbox && st.snapshotKey === scanKey(bbox, opts));
};

describe('AOI session restore', () => {
  beforeEach(() => useMapStore.getState().clear());

  it('restores a saved scan onto the run that produced it', () => {
    const st = useMapStore.getState();
    st.setSelection(MUM, OPTS, false);
    st.setSnapshot(snapshot('mum-1'), scanKey(MUM, OPTS));

    expect(wouldRestore(MUM, OPTS)).toBe(true);
  });

  it('does not leak the previous area onto a newly selected box', () => {
    const st = useMapStore.getState();
    st.setSelection(MUM, OPTS, false);
    st.setSnapshot(snapshot('mum-1'), scanKey(MUM, OPTS));

    // Selecting a new area rewrites the stored bbox immediately, while the
    // snapshot is still Mumbai's — the new scan has not resolved yet. The old
    // guard compared bbox-to-bbox here and matched, seeding Chennai's query
    // with Mumbai's detections.
    useMapStore.getState().setSelection(CHN, OPTS, false);

    expect(useMapStore.getState().snapshot).not.toBeNull();
    expect(wouldRestore(CHN, OPTS)).toBe(false);
  });

  it('does not restore across a change in run options', () => {
    const st = useMapStore.getState();
    st.setSelection(MUM, OPTS, false);
    st.setSnapshot(snapshot('mum-1'), scanKey(MUM, OPTS));

    // Run options are part of the react-query key, so a different threshold is
    // a different scan and must not reuse the old result.
    expect(wouldRestore(MUM, { ...OPTS, minConfidence: 0.5 })).toBe(false);
  });

  it('clears snapshot provenance so a wiped session cannot restore', () => {
    const st = useMapStore.getState();
    st.setSelection(MUM, OPTS, false);
    st.setSnapshot(snapshot('mum-1'), scanKey(MUM, OPTS));

    useMapStore.getState().clear();

    expect(useMapStore.getState().snapshotKey).toBe('');
    expect(wouldRestore(MUM, OPTS)).toBe(false);
  });
});
