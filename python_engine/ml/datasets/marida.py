"""Load the REAL MARIDA dataset into the engine's per-pixel classifier contract.

MARIDA (Marine Debris Archive; Kikaki et al. 2022, PLOS ONE 17(1):e0262247) is a
hand-labelled Sentinel-2 benchmark: per-patch 11-band surface-reflectance
GeoTIFFs + pixel-level class masks + official train/val/test splits.

Reads MARIDA's 15 fine classes, maps them to the engine's 4 (Plastic, Algae,
Sea_Foam, Water), and builds the exact 7-feature vector the live pipeline
computes from Sentinel Hub — [B04,B06,B08,B8A,B11,FDI,NDVI] — so a model trained
here drops into marinenet.onnx with NO engine change. Mapping Sediment-Laden /
Turbid Water → Water is deliberate: it teaches the classifier that bright turbid
coastal water is NOT debris (the monsoon FDI false-positive fix).
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import rasterio

DATA_ROOT = Path(__file__).resolve().parents[3] / "data" / "marida"

CLASSES = ("Plastic", "Algae", "Sea_Foam", "Water")

# MARIDA 11-band stack order (0-indexed):
#   0 B01, 1 B02, 2 B03, 3 B04, 4 B05, 5 B06, 6 B07, 7 B08, 8 B8A, 9 B11, 10 B12
BAND_IDX = {"B04": 3, "B06": 5, "B08": 7, "B8A": 8, "B11": 9}
_SLOPE = (842.0 - 740.0) / (1610.0 - 740.0)

# MARIDA class id (1-15) → engine class (0-3); absent = excluded from training.
CLASS_MAP = {
    1: 0,                      # Marine Debris          → Plastic
    2: 1, 3: 1, 4: 1,          # Dense/Sparse Sargassum, Natural Organic Material → Algae
    9: 2,                      # Foam                   → Sea_Foam
    7: 3, 8: 3, 10: 3, 11: 3, 15: 3,  # Marine/Sediment/Turbid/Shallow/Mixed water → Water
    # Excluded: 5 Ship, 6 Clouds, 12 Waves, 13 Cloud Shadows, 14 Wakes
}


def _patch_paths(name: str) -> tuple[Path, Path]:
    """'11-6-18_16PCC_13' → (spectral tif, class-mask tif)."""
    folder = "S2_" + "_".join(name.split("_")[:2])
    stem = DATA_ROOT / "patches" / folder / f"S2_{name}"
    return stem.with_suffix(".tif"), Path(str(stem) + "_cl.tif")


def _features_from_bands(b04, b06, b08, b8a, b11):
    """[B04,B06,B08,B8A,B11,FDI,NDVI] — identical to inference_engine._features."""
    fdi = b08 - (b06 + (b11 - b06) * _SLOPE * 10.0)
    ndvi = (b08 - b04) / (b08 + b04 + 1e-6)
    return np.stack([b04, b06, b08, b8a, b11, fdi, ndvi], axis=-1)


def load_split(split: str, cache: bool = True):
    """Read one official split → (X [n,7] float32, y [n] int64) of labelled pixels.
    Caches to python_engine/models/marida_<split>.npz so repeat runs are instant."""
    models_dir = Path(__file__).resolve().parents[2] / "models"
    cache_path = models_dir / f"marida_{split}.npz"
    if cache and cache_path.exists():
        d = np.load(cache_path)
        return d["x"], d["y"]

    names = [l.strip() for l in (DATA_ROOT / "splits" / f"{split}_X.txt").read_text().splitlines() if l.strip()]
    xs: list[np.ndarray] = []
    ys: list[np.ndarray] = []
    i4, i6, i8, i8a, i11 = (BAND_IDX[b] for b in ("B04", "B06", "B08", "B8A", "B11"))

    for name in names:
        spec, mask = _patch_paths(name)
        if not spec.exists() or not mask.exists():
            continue
        with rasterio.open(spec) as s:
            arr = s.read().astype("float32")            # (11, H, W)
        with rasterio.open(mask) as s:
            cl = s.read(1).astype("int32")              # (H, W)

        feats = _features_from_bands(arr[i4], arr[i6], arr[i8], arr[i8a], arr[i11])  # (H,W,7)
        for marida_c, engine_c in CLASS_MAP.items():
            m = cl == marida_c
            if not m.any():
                continue
            px = feats[m]
            ok = np.isfinite(px).all(axis=1)
            px = px[ok]
            if len(px):
                xs.append(px.astype("float32"))
                ys.append(np.full(len(px), engine_c, dtype="int64"))

    x = np.concatenate(xs) if xs else np.zeros((0, 7), "float32")
    y = np.concatenate(ys) if ys else np.zeros((0,), "int64")
    if cache:
        models_dir.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(cache_path, x=x, y=y)
    return x, y


def class_histogram(y: np.ndarray) -> dict[str, int]:
    return {CLASSES[c]: int((y == c).sum()) for c in range(4)}


if __name__ == "__main__":
    for split in ("train", "val", "test"):
        x, y = load_split(split, cache=False)
        print(f"{split:5s}: {len(y):7d} pixels | {class_histogram(y)}")
