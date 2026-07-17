"""RefinedFloatingObjects (Russwurm et al. 2023) adapter -> engine contracts.

6 full Sentinel-2 scenes (Accra, Durban, Lagos, Marmara, New Orleans, Venice) with
hand-REFINED point annotations: shapefile field type=1 debris, type=0 water/other.
This is the scene-DIVERSITY injection: 6 new acquisitions the model has never seen.

For each labelled point we do ONE windowed read (64x64, boundless) of the 5 engine
bands (resolved per-tif via band descriptions — scenes vary 12/13-band L2A/L1C),
DN/10000 -> reflectance, and emit BOTH contracts:
  * x7  [n,7]  [B04,B06,B08,B8A,B11,FDI,NDVI] centre-pixel (per-pixel MLP)
  * chip [n,64,64,6] float16 NHWC [B04,B06,B08,B8A,B11,FDI]  (Clay / patch models)
Labels: type=1 -> 0 (Plastic/debris), type=0 -> 3 (Water). HONEST caveat: 'debris'
points include mixed floating matter (wood/sargassum possible) — label noise.

Scene-disjoint split: TRAIN = accra+lagos+neworleans+venice, TEST = durban+marmara
(two held-out seas). Caches:
  models/rfo_pixels_{train,test}.npz {x,y}   models/rfo_chips_{train,test}.npz {x,y}

Run:  conda run -n mpt-train python -m ml.datasets.rfo
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

DATA = Path(__file__).resolve().parents[3] / "data" / "refinedfloatingobjects" / "refinedfloatingobjects"
MODELS = Path(__file__).resolve().parents[2] / "models"

TRAIN_SCENES = ("accra_20181031", "lagos_20190101", "neworleans_20200202", "venice_20180630")
TEST_SCENES = ("durban_20190424", "marmara_20210519")
BANDS = ("B4", "B6", "B8", "B8A", "B11")   # tif description names
SIZE = 64
_SLOPE10 = ((842.0 - 740.0) / (1610.0 - 740.0)) * 10.0


def _extract_scene(scene: str):
    """-> (x7 [n,7], chips [n,64,64,6] float16, y [n]) for one scene's points."""
    import rasterio
    import shapefile
    from pyproj import Transformer
    from rasterio.windows import Window

    tif, shp = DATA / f"{scene}.tif", DATA / f"{scene}.shp"
    if not tif.exists() or not shp.exists():
        print(f"  [{scene}] MISSING files — skipped")
        return None
    sf = shapefile.Reader(str(shp))
    pts = [(r.shape.points[0], int(r.record[0])) for r in sf.shapeRecords() if r.shape.points]

    x7s, chips, ys = [], [], []
    half = SIZE // 2
    with rasterio.open(tif) as s:
        # shapefiles are WGS84 lon/lat; tifs are UTM -> reproject each point
        to_utm = Transformer.from_crs("EPSG:4326", s.crs, always_xy=True)
        pts = [(to_utm.transform(lon, lat), t) for (lon, lat), t in pts]
        desc = {d: i + 1 for i, d in enumerate(s.descriptions)}          # name -> 1-based index
        idx = [desc[b] for b in BANDS]
        inv = ~s.transform
        for (wx, wy), t in pts:
            col, row = inv * (wx, wy)
            row, col = int(round(row)), int(round(col))
            if not (0 <= row < s.height and 0 <= col < s.width):
                continue
            win = Window(col - half, row - half, SIZE, SIZE)
            arr = s.read(idx, window=win, boundless=True, fill_value=0).astype("float32")  # (5,64,64)
            arr = np.nan_to_num(arr, nan=0.0) / 10000.0                   # DN -> reflectance
            b04, b06, b08, b8a, b11 = arr
            c = half
            if arr[:, c, c].sum() <= 1e-6:                                # nodata centre
                continue
            fdi = b08 - (b06 + (b11 - b06) * _SLOPE10)
            chip = np.stack([b04, b06, b08, b8a, b11, fdi], axis=-1)      # (64,64,6)
            pb04, pb06, pb08, pb8a, pb11, pfdi = (float(v[c, c]) for v in (b04, b06, b08, b8a, b11, fdi))
            ndvi = (pb08 - pb04) / (pb08 + pb04 + 1e-6)
            x7s.append([pb04, pb06, pb08, pb8a, pb11, pfdi, ndvi])
            chips.append(chip.astype("float16"))
            ys.append(0 if t == 1 else 3)                                 # debris->Plastic, else Water
    x7 = np.asarray(x7s, "float32")
    y = np.asarray(ys, "int64")
    ch = np.stack(chips) if chips else np.zeros((0, SIZE, SIZE, 6), "float16")
    n1 = int((y == 0).sum())
    print(f"  [{scene}] {len(y)} px  (debris {n1} / water {len(y)-n1})")
    return x7, ch, y


def build(split: str, cache: bool = True):
    """-> (x7, chips, y) concatenated over the split's scenes; cached to models/."""
    px_cache = MODELS / f"rfo_pixels_{split}.npz"
    ch_cache = MODELS / f"rfo_chips_{split}.npz"
    if cache and px_cache.exists() and ch_cache.exists():
        p, c = np.load(px_cache), np.load(ch_cache)
        return p["x"], c["x"], p["y"]
    scenes = TRAIN_SCENES if split == "train" else TEST_SCENES
    xs, cs, ys = [], [], []
    for sc in scenes:
        out = _extract_scene(sc)
        if out is None:
            continue
        x7, ch, y = out
        if len(y):
            xs.append(x7); cs.append(ch); ys.append(y)
    x = np.concatenate(xs) if xs else np.zeros((0, 7), "float32")
    c = np.concatenate(cs) if cs else np.zeros((0, SIZE, SIZE, 6), "float16")
    y = np.concatenate(ys) if ys else np.zeros((0,), "int64")
    if cache and len(y):
        MODELS.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(px_cache, x=x, y=y)
        np.savez_compressed(ch_cache, x=c, y=y)
    return x, c, y


if __name__ == "__main__":
    for split in ("train", "test"):
        print(f"--- RFO {split} ---")
        x, c, y = build(split, cache=True)
        n1 = int((y == 0).sum())
        print(f"{split}: {len(y)} labelled px | debris {n1} / water {len(y)-n1} | chips {c.shape}")
        if len(x):
            print(f"  centre-band means {np.round(x[:, :5].mean(0), 4).tolist()} (expect ~0-1 reflectance)")
    print("RFO EXTRACTION DONE")
