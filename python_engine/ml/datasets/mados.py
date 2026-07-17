"""Load the REAL MADOS dataset into the engine's per-pixel classifier contract.

MADOS (Marine Debris & Oil Spill; Kikaki, Kakogeorgiou, Hoteit, Karantzalos 2024,
ISPRS J. Photogramm. Remote Sens.; Zenodo 10.5281/zenodo.10664073) is the same
group's Sentinel-2 successor to MARIDA — 174 scenes, pixel-level sparse
annotations, 15 thematic classes, ACOLITE rhorc surface reflectance (0-1).

Because it is Sentinel-2 it drops into the SAME 7-feature contract as MARIDA —
[B04,B06,B08,B8A,B11,FDI,NDVI] — so combining MARIDA + MADOS needs no engine
change. Bands are stored per-wavelength; sorted ascending they give the same
11-band order as MARIDA; 20/60 m bands are nearest-upsampled onto the 10 m grid.
"""
from __future__ import annotations

from glob import glob
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling

# Reuse MARIDA's exact feature contract + band indices so the two datasets are
# byte-for-byte comparable to the model.
from .marida import BAND_IDX, CLASSES, _features_from_bands


def _find_root() -> Path:
    base = Path(__file__).resolve().parents[3] / "data"
    for cand in (base / "mados" / "MADOS", base / "MADOS", base / "mados"):
        if (cand / "splits").is_dir():
            return cand
    for d in base.glob("**/splits"):
        return d.parent
    return base / "MADOS"


DATA_ROOT = _find_root()

# MADOS raw class id (1-15) → engine class (0-3); VALIDATED EMPIRICALLY via
# class_signatures() (mean spectra), NOT copied from MARIDA (MADOS is reindexed).
# Class 6 (140k px, FDI 0.0117, NDVI -0.09, water brightness) is a water
# background, NOT "Ships" — the spectra rule out debris/ship, so → Water.
CLASS_MAP: dict[int, int] = {
    1: 0,                              # Marine Debris → Plastic
    3: 1, 4: 1, 5: 1,                  # Dense Sargassum / Sparse Floating Algae / Natural Organic Material → Algae
    9: 2,                              # Foam → Sea_Foam
    6: 3, 7: 3, 8: 3, 10: 3, 11: 3,    # water backgrounds → Water
    # Excluded: 2 Oil Spills, 13 Oil Platforms, 15 Sea Snot, 14 Jellyfish, 12 Waves & Wakes
}

RAW_NAMES = {
    1: "Marine Debris", 2: "Oil Spills", 3: "Dense Sargassum",
    4: "Sparse Floating Algae", 5: "Natural Organic Material", 6: "Ships",
    7: "Marine Water", 8: "Sediment-Laden Water", 9: "Foam", 10: "Turbid Water",
    11: "Shallow Water", 12: "Waves & Wakes", 13: "Oil Platforms",
    14: "Jellyfish", 15: "Sea Snot",
}


def _wavelength(path: str) -> int:
    """'..._rhorc_833_0.tif' → 833."""
    return int(Path(path).name.split("_")[-2])


def _crop_bands(tile: Path, crop: str) -> np.ndarray | None:
    """Stack a crop's 11 bands onto the 10 m grid → (11, H, W) float32, or None."""
    band_paths = sorted(glob(str(tile / "*" / f"*L2R_rhorc*_{crop}")), key=_wavelength)
    if len(band_paths) != 11:
        return None
    layers: list[np.ndarray] = []
    for bp in band_paths:
        factor = int(Path(bp).parent.name) // 10  # 10→1, 20→2, 60→6
        with rasterio.open(bp) as src:
            layers.append(src.read(
                1, out_shape=(src.height * factor, src.width * factor),
                resampling=Resampling.nearest,
            ).astype("float32"))
    h = min(a.shape[0] for a in layers)
    w = min(a.shape[1] for a in layers)
    return np.stack([a[:h, :w] for a in layers])


def _crops_for_tile(tile: Path) -> list[str]:
    return [Path(f).name.split("_cl_")[-1] for f in glob(str(tile / "10" / "*_cl_*"))]


def _split_names(split: str) -> set[str]:
    raw = (DATA_ROOT / "splits" / f"{split}_X.txt").read_text().splitlines()
    return {ln.strip() for ln in raw if ln.strip()}


def _iter_labeled(split: str):
    """Yield (features (n,7) float32, raw_ids (n,) int) per crop in the split."""
    wanted = _split_names(split)
    i4, i6, i8, i8a, i11 = (BAND_IDX[b] for b in ("B04", "B06", "B08", "B8A", "B11"))
    tiles = [d for d in DATA_ROOT.iterdir() if d.is_dir() and d.name != "splits"]

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
            bands, cl = bands[:, :h, :w], cl[:h, :w]
            feats = _features_from_bands(bands[i4], bands[i6], bands[i8], bands[i8a], bands[i11])
            yield feats.reshape(-1, 7), cl.reshape(-1)


def load_split(split: str, cache: bool = True):
    """Read one official split → (X [n,7] float32, y [n] int64). Applies CLASS_MAP
    (15→4), drops non-finite. Caches to python_engine/models/mados_<split>.npz."""
    models_dir = Path(__file__).resolve().parents[2] / "models"
    cache_path = models_dir / f"mados_{split}.npz"
    if cache and cache_path.exists():
        d = np.load(cache_path)
        return d["x"], d["y"]

    xs: list[np.ndarray] = []
    ys: list[np.ndarray] = []
    for feats, raw in _iter_labeled(split):
        for raw_c, engine_c in CLASS_MAP.items():
            m = raw == raw_c
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


def class_signatures(split: str = "train") -> dict[int, dict]:
    """DIAGNOSTIC: per RAW class id (1-15) → count + mean [B04,B06,B08,B8A,B11,FDI,NDVI]."""
    sums: dict[int, np.ndarray] = {}
    counts: dict[int, int] = {}
    for feats, raw in _iter_labeled(split):
        ok = np.isfinite(feats).all(axis=1)
        feats, raw = feats[ok], raw[ok]
        for c in np.unique(raw):
            c = int(c)
            if c <= 0:
                continue
            m = raw == c
            sums[c] = sums.get(c, np.zeros(7)) + feats[m].sum(0)
            counts[c] = counts.get(c, 0) + int(m.sum())
    return {
        c: {"name": RAW_NAMES.get(c, "?"), "count": counts[c],
            "mean": (sums[c] / counts[c]).round(4).tolist()}
        for c in sorted(counts)
    }


if __name__ == "__main__":
    print(f"DATA_ROOT = {DATA_ROOT}  exists={DATA_ROOT.exists()}")
    feat_names = ["B04", "B06", "B08", "B8A", "B11", "FDI", "NDVI"]
    print("\nPER-RAW-CLASS spectral signatures (train) — validate CLASS_MAP:")
    print(f"  {'id':>2} {'name':<24} {'count':>9}  " + " ".join(f"{n:>7}" for n in feat_names))
    for c, s in class_signatures("train").items():
        means = " ".join(f"{v:7.4f}" for v in s["mean"])
        print(f"  {c:>2} {s['name']:<24} {s['count']:>9}  {means}")
