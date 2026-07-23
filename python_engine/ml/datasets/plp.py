"""Plastic Litter Project (PLP 2021/2022, Topouzelis/Aegean) adapter → engine contract.

REAL DEPLOYED PLASTIC: HDPE mesh + PVC targets physically floated at a known
lon/lat on known dates, imaged by Sentinel-2. This is the cleanest plastic-POSITIVE
signal available (vs MARIDA/MADOS/RFO 'debris' which mix wood/sargassum). The catch
is sub-pixel size (targets 3.5–14 m radius in a 10 m pixel), so the centre pixel is
a plastic/water mix — honest label noise, but real plastic spectra.

For every target we match its date to the S2 scene acquired that date, reproject the
point into the scene CRS, and read the centre pixel's 5 engine bands → the 7-feature
per-pixel contract [B04,B06,B08,B8A,B11,FDI,NDVI]. HDPE/PVC/plastic → Plastic(0);
'wood' is a floating NON-plastic control → dropped (no matching class, avoids noise).
A few clean open-water pixels per scene are sampled as Water(3) negatives.

Date-disjoint split (honest): earlier target dates → train, latest ~30% → test, so
the held-out PLP pixels are a genuine future-deployment generalisation check.
Caches: models/plp_pixels_{train,test}.npz {x,y}.

Run:  conda run -n mpt-train python -m ml.datasets.plp
"""
from __future__ import annotations

import glob
import os
from pathlib import Path

import numpy as np

DATA = Path(__file__).resolve().parents[3] / "data" / "plp" / "PLP"
MODELS = Path(__file__).resolve().parents[2] / "models"
BANDS = ("B4", "B6", "B8", "B8A", "B11")   # tif description names (12-band L2A)
_SLOPE10 = ((842.0 - 740.0) / (1610.0 - 740.0)) * 10.0
PLASTIC_TYPES = {"HDPE", "PVC", "plastic", "PET", "LDPE"}
WATER_PER_SCENE = 12  # clean open-water negatives sampled per scene


def _scene_by_date(year: str) -> dict[str, str]:
    """acquisition-date(YYYYMMDD) → scene tif path for one PLP year."""
    out = {}
    for t in glob.glob(str(DATA / year / "Sentinel-2" / "*.tif")):
        out[os.path.basename(t)[:8]] = t
    return out


def _reproj_transformer(shp_path: Path, dst_crs):
    """Transformer from the shapefile's own CRS (.prj) to the scene CRS."""
    from pyproj import CRS, Transformer
    prj = shp_path.with_suffix(".prj")
    src = CRS.from_wkt(prj.read_text()) if prj.exists() else CRS.from_epsg(4326)
    return Transformer.from_crs(src, dst_crs, always_xy=True)


def _read_px(s, wx, wy, idx):
    """Centre-pixel reflectance for the 5 bands at world (wx,wy), or None."""
    import numpy as np
    col, row = ~s.transform * (wx, wy)
    row, col = int(round(row)), int(round(col))
    if not (0 <= row < s.height and 0 <= col < s.width):
        return None
    from rasterio.windows import Window
    arr = s.read(idx, window=Window(col, row, 1, 1), boundless=True, fill_value=0).astype("float32")
    v = arr.reshape(len(idx))
    if v.sum() <= 1e-6:
        return None
    if np.nanmedian(v) > 1.5:            # DN (0–10000) rather than reflectance
        v = v / 10000.0
    return np.nan_to_num(v, nan=0.0)


def _x7(v):
    b04, b06, b08, b8a, b11 = v
    fdi = b08 - (b06 + (b11 - b06) * _SLOPE10)
    ndvi = (b08 - b04) / (b08 + b04 + 1e-6)
    return [float(b04), float(b06), float(b08), float(b8a), float(b11), float(fdi), float(ndvi)]


def _extract_year(year: str):
    """→ list of (date, x7, label) for one PLP year (plastic targets + water negs)."""
    import rasterio
    import shapefile
    shp = DATA / year / f"{year}_targets.shp"
    if not shp.exists():
        print(f"  [{year}] no targets shapefile — skipped")
        return []
    sf = shapefile.Reader(str(shp))
    fields = [f[0] for f in sf.fields[1:]]
    di, ti = fields.index("date"), fields.index("type")
    recs = [(r.shape.points[0], str(r.record[di]), str(r.record[ti])) for r in sf.shapeRecords() if r.shape.points]
    scenes = _scene_by_date(year)

    rng = np.random.default_rng(7)
    out = []
    for date in sorted({d for _, d, _ in recs}):
        tif = scenes.get(date)
        if tif is None:
            continue
        pts = [(pt, ty) for pt, d, ty in recs if d == date]
        with rasterio.open(tif) as s:
            tr = _reproj_transformer(shp, s.crs)
            desc = {d: i + 1 for i, d in enumerate(s.descriptions)}
            if not all(b in desc for b in BANDS):
                continue
            idx = [desc[b] for b in BANDS]
            got = 0
            for (lon, lat), ty in pts:
                if ty not in PLASTIC_TYPES:
                    continue                      # drop wood/control — no clean class
                wx, wy = tr.transform(lon, lat)
                v = _read_px(s, wx, wy, idx)
                if v is not None:
                    out.append((date, _x7(v), 0))  # Plastic
                    got += 1
            # clean open-water negatives: random pixels ≥40 px from every target
            if got:
                tpix = []
                for (lon, lat), _ in pts:
                    wx, wy = tr.transform(lon, lat)
                    c, r = ~s.transform * (wx, wy)
                    tpix.append((int(r), int(c)))
                added = 0
                tries = 0
                while added < WATER_PER_SCENE and tries < 400:
                    tries += 1
                    r = int(rng.integers(0, s.height)); c = int(rng.integers(0, s.width))
                    if all(abs(r - tr_) > 40 or abs(c - tc_) > 40 for tr_, tc_ in tpix):
                        v = _read_px(s, s.transform.c + (c + 0.5) * s.transform.a,
                                     s.transform.f + (r + 0.5) * s.transform.e, idx)
                        if v is not None and v[0] < 0.12 and (v[2] - v[0]) < 0.02:  # dark, low-NDVI → water
                            out.append((date, _x7(v), 3)); added += 1
        print(f"  [{year} {date}] plastic {got}")
    return out


def build(cache: bool = True):
    """Extract PLP → date-disjoint (train, test) pixel caches. Returns dict of arrays."""
    tr_c, te_c = MODELS / "plp_pixels_train.npz", MODELS / "plp_pixels_test.npz"
    if cache and tr_c.exists() and te_c.exists():
        a, b = np.load(tr_c), np.load(te_c)
        return a["x"], a["y"], b["x"], b["y"]
    rows = _extract_year("PLP2021") + _extract_year("PLP2022")
    dates = sorted({d for d, _, _ in rows})
    cut = dates[int(len(dates) * 0.7)] if len(dates) > 3 else (dates[-1] if dates else "99999999")
    tr = [(x, y) for d, x, y in rows if d < cut]
    te = [(x, y) for d, x, y in rows if d >= cut]

    def split(rows_):
        if not rows_:
            return np.zeros((0, 7), "float32"), np.zeros((0,), "int64")
        X = np.asarray([x for x, _ in rows_], "float32")
        Y = np.asarray([y for _, y in rows_], "int64")
        return X, Y
    xtr, ytr = split(tr); xte, yte = split(te)
    if cache and len(ytr):
        MODELS.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(tr_c, x=xtr, y=ytr)
        np.savez_compressed(te_c, x=xte, y=yte)
    return xtr, ytr, xte, yte


if __name__ == "__main__":
    xtr, ytr, xte, yte = build(cache=True)
    for tag, y in (("train", ytr), ("test", yte)):
        print(f"{tag}: {len(y)} px  plastic {int((y==0).sum())}  water {int((y==3).sum())}")
    print("PLP EXTRACTION DONE")
