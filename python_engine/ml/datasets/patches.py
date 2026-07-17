"""Extract REAL 64x64x6 patches from MARIDA + MADOS for CNN training.

Each patch is a window CENTRED on a labelled pixel; its label is that centre
pixel's engine class — exactly how the engine's `batch_classifier` crops a window
around each FDI candidate and asks "what is the centre?". Channels are the SAME 6
the engine feeds at inference: [B04,B06,B08,B8A,B11,FDI] (stored NHWC here; the
trainer transposes to NCHW). Windows are edge-clamped + zero-padded IDENTICALLY to
`satellite.patch_extractor.extract_patch`, so training and inference patches match.

Balanced sampling caps per class (Water dominates the benchmarks ~700:1) with a
small per-scene cap so no single scene dominates and BOTH datasets contribute.
Patches cache to models/patches_<split>_<cap>.npz (float16 → ~half the disk).

Run standalone to inspect scale + class balance:
    conda run -n mpt-train python -m ml.datasets.patches
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

# rasterio + the MARIDA/MADOS loaders are imported LAZILY inside the extraction
# functions below, so this module imports with just numpy. That lets the GPU
# training env (PyTorch, no GDAL) load cached patches via build()'s cache-hit
# path without rasterio installed — extraction runs once under the engine's env.

SIZE = 64
CHANNELS = 6
PATCH_CHANNELS = ("B04", "B06", "B08", "B8A", "B11", "FDI")
CLASSES = ("Plastic", "Algae", "Sea_Foam", "Water")


def _arr6(bands11: np.ndarray) -> np.ndarray:
    """(11,H,W) -> (H,W,6) [B04,B06,B08,B8A,B11,FDI] float32 (drops NDVI, keeps 6)."""
    from .marida import BAND_IDX, _features_from_bands
    i4, i6, i8, i8a, i11 = (BAND_IDX[b] for b in ("B04", "B06", "B08", "B8A", "B11"))
    feats7 = _features_from_bands(bands11[i4], bands11[i6], bands11[i8], bands11[i8a], bands11[i11])
    arr = feats7[..., :6].astype("float32")
    return np.nan_to_num(arr, nan=0.0, posinf=0.0, neginf=0.0)


def _remap(mask_raw: np.ndarray, class_map: dict[int, int]) -> np.ndarray:
    """(H,W) raw class ids → (H,W) engine class 0-3; -1 = unlabelled / excluded."""
    out = np.full(mask_raw.shape, -1, dtype="int8")
    for raw_c, eng_c in class_map.items():
        out[mask_raw == raw_c] = eng_c
    return out


def _iter_marida(split: str):
    """Yield (arr6 (H,W,6), engine_mask (H,W)) per MARIDA scene in the split."""
    import rasterio

    from .marida import CLASS_MAP as MARIDA_MAP
    from .marida import DATA_ROOT as MARIDA_ROOT
    from .marida import _patch_paths

    txt = MARIDA_ROOT / "splits" / f"{split}_X.txt"
    if not txt.exists():
        return
    names = [l.strip() for l in txt.read_text().splitlines() if l.strip()]
    for name in names:
        spec, mask = _patch_paths(name)
        if not spec.exists() or not mask.exists():
            continue
        with rasterio.open(spec) as s:
            bands = s.read().astype("float32")           # (11,H,W)
        with rasterio.open(mask) as s:
            cl = s.read(1).astype("int32")               # (H,W)
        yield _arr6(bands), _remap(cl, MARIDA_MAP)


def _iter_mados(split: str):
    """Yield (arr6 (H,W,6), engine_mask (H,W)) per MADOS crop in the split."""
    import rasterio

    from .mados import CLASS_MAP as MADOS_MAP
    from .mados import DATA_ROOT as MADOS_ROOT
    from .mados import _crop_bands, _crops_for_tile, _split_names

    if not (MADOS_ROOT / "splits").is_dir():
        return
    wanted = _split_names(split)
    tiles = [d for d in MADOS_ROOT.iterdir() if d.is_dir() and d.name != "splits"]
    for tile in tiles:
        for crop in _crops_for_tile(tile):
            crop_name = f"{tile.name}_{crop.split('.tif')[0]}"
            if crop_name not in wanted:
                continue
            mask_path = tile / "10" / f"{tile.name}_L2R_cl_{crop}"
            if not mask_path.exists():
                continue
            bands = _crop_bands(tile, crop)
            if bands is None:
                continue
            with rasterio.open(mask_path) as s:
                cl = s.read(1).astype("int32")
            h = min(bands.shape[1], cl.shape[0])
            w = min(bands.shape[2], cl.shape[1])
            yield _arr6(bands[:, :h, :w]), _remap(cl[:h, :w], MADOS_MAP)


def _window(arr6: np.ndarray, r: int, c: int, size: int) -> np.ndarray:
    """Centre-crop (size,size,6), edge-clamp + zero-pad — matches extract_patch()."""
    h, w, ch = arr6.shape
    half = size // 2
    r0 = min(max(r - half, 0), h - size) if h >= size else 0
    c0 = min(max(c - half, 0), w - size) if w >= size else 0
    win = arr6[r0:r0 + size, c0:c0 + size]
    if win.shape[0] != size or win.shape[1] != size:
        pad = np.zeros((size, size, ch), arr6.dtype)
        pad[:win.shape[0], :win.shape[1]] = win
        win = pad
    return win


def build(split: str, per_class: int, size: int = SIZE, per_scene: int | None = None,
          seed: int = 0, cache: bool = True, verbose: bool = True, source: str = "both"):
    """Extract balanced patches → (X (n,size,size,6) float16, y (n,) int64).

    Scans EVERY scene once (so rare Plastic/Foam pixels are all captured), taking
    up to `per_scene` per class per scene, until each class reaches `per_class`.
    `source`: 'both' | 'marida' | 'mados' (per-dataset held-out evaluation).
    """
    models_dir = Path(__file__).resolve().parents[2] / "models"
    tag = "" if source == "both" else f"_{source}"
    cache_path = models_dir / f"patches_{split}_{per_class}{tag}.npz"
    if cache and cache_path.exists():
        d = np.load(cache_path)
        if verbose:
            print(f"[patches] loaded cache {cache_path.name}: X{d['x'].shape} y{d['y'].shape}")
        return d["x"], d["y"]

    if per_scene is None:
        per_scene = max(8, per_class // 20)
    rng = np.random.default_rng(seed)
    buf: dict[int, list] = {c: [] for c in range(4)}
    counts = {c: 0 for c in range(4)}
    # running channel stats to sanity-check the reflectance scale (~0-1 expected)
    ch_sum = np.zeros(6); ch_sqsum = np.zeros(6); ch_n = 0
    scenes = 0

    src_scenes = []
    if source in ("both", "marida"):
        src_scenes += list(_iter_marida(split))
    if source in ("both", "mados"):
        src_scenes += list(_iter_mados(split))
    for arr6, mask in src_scenes:
        scenes += 1
        centre = arr6[..., :5].sum(-1)  # band sum; ~0 => nodata
        for c in range(4):
            if counts[c] >= per_class:
                continue
            ys, xs = np.where((mask == c) & (centre > 1e-6))
            if len(ys) == 0:
                continue
            take = min(len(ys), per_scene, per_class - counts[c])
            sel = rng.choice(len(ys), size=take, replace=False)
            for k in sel:
                buf[c].append(_window(arr6, int(ys[k]), int(xs[k]), size).astype("float16"))
            counts[c] += take
        # accumulate channel stats from a sparse sample of valid pixels
        valid = arr6[centre > 1e-6]
        if len(valid):
            s = valid[rng.choice(len(valid), size=min(2000, len(valid)), replace=False)]
            ch_sum += s.sum(0); ch_sqsum += (s ** 2).sum(0); ch_n += len(s)
        if all(counts[c] >= per_class for c in range(4)):
            # keep scanning only if rare classes still short — here all full
            pass

    xs_all, ys_all = [], []
    for c in range(4):
        if buf[c]:
            xs_all.append(np.stack(buf[c]))
            ys_all.append(np.full(len(buf[c]), c, dtype="int64"))
    x = np.concatenate(xs_all) if xs_all else np.zeros((0, size, size, 6), "float16")
    y = np.concatenate(ys_all) if ys_all else np.zeros((0,), "int64")
    p = rng.permutation(len(y))
    x, y = x[p], y[p]

    if verbose:
        mean = ch_sum / max(ch_n, 1)
        std = np.sqrt(np.maximum(ch_sqsum / max(ch_n, 1) - mean ** 2, 0))
        print(f"[patches] {split}: {scenes} scenes -> {len(y)} patches  "
              f"{ {CLASSES[c]: counts[c] for c in range(4)} }")
        print(f"[patches] channel mean {np.round(mean,4).tolist()} "
              f"std {np.round(std,4).tolist()}  (expect ~0-1 reflectance)")
    if cache:
        models_dir.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(cache_path, x=x, y=y)
    return x, y


if __name__ == "__main__":
    for split in ("train", "test"):
        build(split, per_class=1500, cache=False)
