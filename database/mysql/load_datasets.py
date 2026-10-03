#!/usr/bin/env python
"""Load every reference / training dataset into MySQL  ->  database `mpt_datasets`.

    python load_datasets.py                    # full rebuild (schema -> data -> views)
    python load_datasets.py --skip pixels      # skip the 2.1 M-row pixel table
    python load_datasets.py --dry-run          # parse everything, touch no database

What is stored (see README.md): all TABULAR content — 2.1 M labelled training pixels,
patch / crop catalogues with per-class pixel counts, annotation polygons, PLP targets,
RFO labelled points and polygons, country polygons and the model metrics. The raw
GeoTIFF rasters (~16 GB) stay on disk; the tables point to them by id and footprint.

Every step cross-checks its row count against an independent source and records the
result in the `load_audit` table, so a silent mismatch cannot hide.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

import numpy as np
import shapefile
import tifffile

from _common import (DATA, HERE, MODELS, Audit, Timer, add_connection_args, bulk_insert, connect,
                     resolve_config, run_sql_file)
from _geo import (clamp_geojson, geojson_bounds, geotiff_footprint, reproject_geojson, shape_area_m2,
                  utm_from_prj, utm_to_lonlat)

STEPS = ("pixels", "marida", "mados", "plp", "rfo", "countries", "models")

# ─── static reference data ────────────────────────────────────────────────────
UNIFIED = [
    (0, "Plastic", "Floating plastic / marine debris", "#0D9488"),
    (1, "Algae", "Sargassum, natural organic material, blooms", "#84CC16"),
    (2, "Sea_Foam", "Foam and whitecaps", "#38BDF8"),
    (3, "Water", "Open, turbid, shallow and mixed water backgrounds", "#94A3B8"),
]
CLASS_NAMES = [u[1] for u in UNIFIED]

# (id, name, unified class or None, note) — mirrors python_engine/ml/datasets/marida.py CLASS_MAP.
MARIDA_CLASSES = [
    (1, "Marine Debris", 0, ""),
    (2, "Dense Sargassum", 1, ""),
    (3, "Sparse Sargassum", 1, ""),
    (4, "Natural Organic Material", 1, ""),
    (5, "Ship", None, "excluded from training"),
    (6, "Clouds", None, "excluded from training"),
    (7, "Marine Water", 3, ""),
    (8, "Sediment-Laden Water", 3, "kept as Water on purpose: teaches that bright turbid coastal water is NOT debris"),
    (9, "Foam", 2, ""),
    (10, "Turbid Water", 3, ""),
    (11, "Shallow Water", 3, ""),
    (12, "Waves", None, "excluded from training"),
    (13, "Cloud Shadows", None, "excluded from training"),
    (14, "Wakes", None, "excluded from training"),
    (15, "Mixed Water", 3, ""),
]
MARIDA_FLAGS = ["c01_marine_debris", "c02_dense_sargassum", "c03_sparse_sargassum", "c04_natural_organic",
                "c05_ship", "c06_clouds", "c07_marine_water", "c08_sediment_laden_water", "c09_foam",
                "c10_turbid_water", "c11_shallow_water", "c12_waves", "c13_cloud_shadows", "c14_wakes",
                "c15_mixed_water"]

# mirrors python_engine/ml/datasets/mados.py RAW_NAMES + CLASS_MAP.
MADOS_CLASSES = [
    (1, "Marine Debris", 0, ""),
    (2, "Oil Spills", None, "excluded from training"),
    (3, "Dense Sargassum", 1, ""),
    (4, "Sparse Floating Algae", 1, ""),
    (5, "Natural Organic Material", 1, ""),
    (6, "Ships", 3, "spectra show a water background, so mapped to Water (validated empirically in mados.py)"),
    (7, "Marine Water", 3, ""),
    (8, "Sediment-Laden Water", 3, ""),
    (9, "Foam", 2, ""),
    (10, "Turbid Water", 3, ""),
    (11, "Shallow Water", 3, ""),
    (12, "Waves & Wakes", None, "excluded from training"),
    (13, "Oil Platforms", None, "excluded from training"),
    (14, "Jellyfish", None, "excluded from training"),
    (15, "Sea Snot", None, "excluded from training"),
]
MARIDA_MAP = {c[0]: c[2] for c in MARIDA_CLASSES if c[2] is not None}
MADOS_MAP = {c[0]: c[2] for c in MADOS_CLASSES if c[2] is not None}

RFO_TRAIN = ("accra_20181031", "lagos_20190101", "neworleans_20200202", "venice_20180630")
RFO_TEST = ("durban_20190424", "marmara_20210519")
PLASTIC_TYPES = {"HDPE", "PVC", "plastic", "PET", "LDPE"}

SUMMARY_JSONS = ["metrics.json", "perpixel_gpu_summary.json", "perpixel_gpu_summary_ens.json",
                 "perpixel_gpu_summary_rfo.json", "clay_head_summary.json", "clay_analytics.json",
                 "clay_threshold.json", "fusion_thresholds.json", "plp_validation.json",
                 "plp_clay_validation.json"]


def dir_size_gb(p: Path) -> float:
    total = 0
    for f in p.rglob("*"):
        try:
            if f.is_file():
                total += f.stat().st_size
        except OSError:
            pass
    return round(total / 1024**3, 2)


def read_lines(p: Path) -> list[str]:
    return [l.strip() for l in p.read_text(encoding="utf8").splitlines() if l.strip()]


def clean_json(o):
    """NaN / Infinity are valid Python JSON but not valid MySQL JSON -> None."""
    if isinstance(o, float) and (o != o or o in (float("inf"), float("-inf"))):
        return None
    if isinstance(o, dict):
        return {k: clean_json(v) for k, v in o.items()}
    if isinstance(o, list):
        return [clean_json(v) for v in o]
    return o


class Loader:
    def __init__(self, cnx, audit: Audit, dry: bool) -> None:
        self.cnx, self.audit, self.dry = cnx, audit, dry

    # -- db helpers -----------------------------------------------------------
    def insert(self, table: str, cols: list[str], rows: list | object, chunk: int = 20000) -> int:
        if self.dry:
            return len(rows) if hasattr(rows, "__len__") else sum(1 for _ in rows)
        return bulk_insert(self.cnx, table, cols, rows, chunk)

    def insert_geo(self, table: str, cols: list[str], rows: list[tuple], chunk: int = 200) -> tuple[int, int]:
        """rows = (*plain_values, geojson_str | None); the geometry goes into the trailing `geom` column.
        A chunk that fails (invalid geometry) is retried row by row; a bad row is stored with geom NULL."""
        if self.dry:
            return len(rows), 0
        all_cols = cols + ["geom"]
        col_sql = ", ".join(f"`{c}`" for c in all_cols)
        one = "(" + ", ".join(["%s"] * len(cols)) + ", ST_GeomFromGeoJSON(%s, 1, 4326))"
        one_null = "(" + ", ".join(["%s"] * len(cols)) + ", NULL)"
        cur = self.cnx.cursor()
        loaded = bad = 0
        for i in range(0, len(rows), chunk):
            part = rows[i:i + chunk]
            try:
                cur.execute(f"INSERT INTO `{table}` ({col_sql}) VALUES " + ", ".join([one] * len(part)),
                            [v for r in part for v in r])
                loaded += len(part)
            except Exception:
                self.cnx.rollback()
                for r in part:
                    try:
                        cur.execute(f"INSERT INTO `{table}` ({col_sql}) VALUES {one}", list(r))
                    except Exception:
                        cur.execute(f"INSERT INTO `{table}` ({col_sql}) VALUES {one_null}", list(r[:-1]))
                        bad += 1
                    loaded += 1
        self.cnx.commit()
        cur.close()
        return loaded, bad

    def exec(self, sql: str, params=None) -> None:
        if self.dry:
            return
        cur = self.cnx.cursor()
        cur.execute(sql, params or ())
        self.cnx.commit()
        cur.close()

    # ── 0. catalogue + class lookups ─────────────────────────────────────────
    def catalogue(self) -> None:
        with Timer("catalogue / class tables"):
            self.insert("unified_classes", ["class_id", "class_name", "description", "colour_hex"], UNIFIED)
            for tbl, classes in (("marida_classes", MARIDA_CLASSES), ("mados_classes", MADOS_CLASSES)):
                rows = [(cid, name, u, 1 if u is not None else 0, note) for cid, name, u, note in classes]
                n = self.insert(tbl, ["class_id", "class_name", "unified_class_id", "used_in_training", "note"], rows)
                self.audit.add("catalogue", tbl, n, 15)
            rfo_dir = DATA / "refinedfloatingobjects"
            rows = [
                ("marida", "MARIDA", "Marine Debris Archive", "hand-labelled benchmark", "Sentinel-2 MSI", 10.0,
                 "Kikaki et al. 2022, PLOS ONE 17(1):e0262247",
                 "Primary training set: pixel labels for debris, sargassum, foam, water and confusers",
                 dir_size_gb(DATA / "marida"),
                 "data/marida",
                 "Patch / scene catalogue, official splits, 15-class flags + pixel counts, annotation polygons, "
                 "and the labelled training pixels (via training_pixels). Rasters stay on disk.",
                 "Mapped 15 native classes -> 4 unified classes; Sediment-Laden / Turbid water deliberately kept as Water."),
                ("mados", "MADOS", "Marine Debris and Oil Spill", "hand-labelled benchmark", "Sentinel-2 MSI (ACOLITE rhorc)", 10.0,
                 "Kikaki, Kakogeorgiou, Hoteit, Karantzalos 2024, ISPRS J. Photogramm. Remote Sens. (Zenodo 10.5281/zenodo.10664073)",
                 "Second training set: 174 scenes, larger and more diverse than MARIDA",
                 dir_size_gb(DATA / "MADOS"),
                 "data/MADOS",
                 "Scene / crop catalogue, official splits, per-class pixel counts, and the labelled training pixels "
                 "(via training_pixels). Rasters stay on disk.",
                 "MADOS class ids are re-indexed vs MARIDA; the mapping in mados_classes was validated from mean spectra."),
                ("rfo", "RefinedFloatingObjects", "RefinedFloatingObjects", "hand-refined point labels", "Sentinel-2 MSI", 10.0,
                 "Russwurm et al. 2023 (as cited in python_engine/ml/datasets/rfo.py)",
                 "Scene-diversity injection: 6 unseen coastal scenes; TEST = Durban + Marmara (two held-out seas)",
                 dir_size_gb(rfo_dir / "refinedfloatingobjects") if (rfo_dir / "refinedfloatingobjects").exists() else None,
                 "data/refinedfloatingobjects",
                 "Site catalogue, every labelled point, qualitative polygons / bboxes, and the labelled pixels "
                 "(via training_pixels). The 6+ full-scene GeoTIFFs stay on disk.",
                 "type=1 debris -> Plastic, type=0 water/other -> Water. Debris points mix wood / sargassum, so labels are noisy."),
                ("plp", "Plastic Litter Project", "Plastic Litter Project 2021/2022 (Aegean Sea)", "controlled field experiment", "Sentinel-2 + PlanetScope", 10.0,
                 "Topouzelis et al., University of the Aegean (as cited in python_engine/ml/datasets/plp.py)",
                 "Cleanest real-plastic signal: HDPE/PVC targets floated at known positions and dates",
                 dir_size_gb(DATA / "plp"),
                 "data/plp",
                 "Every target observation (target x satellite date) with position and material, the imagery "
                 "catalogue, and the labelled pixels (via training_pixels).",
                 "Targets (3.5-14 m radius) are sub-pixel in 10 m imagery, so the centre pixel is a plastic/water mix."),
                ("countries", "Country polygons", "data/coastline/countries.geojson", "reference geometry", None, None,
                 None, "Land / country reference geometry", dir_size_gb(DATA / "coastline"), "data/coastline",
                 "All country polygons (GEOMETRY column) with centroid, bbox and vertex count.", None),
            ]
            self.insert("datasets", ["dataset_id", "name", "full_name", "kind", "sensor", "resolution_m", "citation",
                                     "role_in_project", "raw_size_gb", "local_path", "in_mysql", "notes"], rows)

    # ── 1. per-pixel training samples (.npz caches) ──────────────────────────
    def pixels(self) -> None:
        with Timer("training_pixels (from python_engine/models/*.npz)"):
            plan = [("marida", ("train", "val", "test")), ("mados", ("train", "val", "test")),
                    ("rfo", ("train", "test")), ("plp", ("train", "test"))]
            cols = ["dataset_id", "split", "b04", "b06", "b08", "b8a", "b11", "fdi", "ndvi", "class_id"]
            for ds, splits in plan:
                for sp in splits:
                    f = MODELS / (f"{ds}_pixels_{sp}.npz" if ds in ("rfo", "plp") else f"{ds}_{sp}.npz")
                    if not f.exists():
                        self.audit.add("pixels", f"training_pixels[{ds}/{sp}]", 0, None, f"MISSING {f.name}")
                        continue
                    z = np.load(f)
                    x, y = z["x"], z["y"]
                    ok = np.isfinite(x).all(axis=1) & (y >= 0) & (y <= 3)
                    x, y = x[ok], y[ok]

                    def gen(x=x, y=y, ds=ds, sp=sp):
                        for i in range(0, len(x), 50000):
                            xr = np.round(x[i:i + 50000].astype("float64"), 8).tolist()
                            yl = y[i:i + 50000].tolist()
                            for r, c in zip(xr, yl):
                                yield (ds, sp, *r, c)

                    n = self.insert("training_pixels", cols, gen())
                    self.audit.add("pixels", f"training_pixels[{ds}/{sp}]", n, int(len(z["x"])),
                                   f"{f.name}; {int(len(z['x']) - ok.sum())} non-finite rows skipped" if ok.sum() != len(z["x"]) else f.name)

    # ── 2. MARIDA ────────────────────────────────────────────────────────────
    def marida(self) -> None:
        with Timer("MARIDA (patch catalogue + class pixel counts + annotations)"):
            root = DATA / "marida"
            labels = json.loads((root / "labels_mapping.txt").read_text(encoding="utf8"))
            labels = {k[:-4] if k.endswith(".tif") else k: v for k, v in labels.items()}
            split_of: dict[str, str] = {}
            for sp in ("train", "val", "test"):
                for name in read_lines(root / "splits" / f"{sp}_X.txt"):
                    split_of["S2_" + name] = sp

            patches, pcp, scenes = [], [], defaultdict(list)
            folders = sorted(p for p in (root / "patches").iterdir() if p.is_dir())
            for fi, folder in enumerate(folders):
                m = re.match(r"S2_(\d+)-(\d+)-(\d+)_(\w+)$", folder.name)
                if not m:
                    continue
                for tif in sorted(folder.glob("S2_*.tif")):
                    if tif.stem.endswith(("_cl", "_conf")):
                        continue
                    pid = tif.stem
                    idx = int(pid.rsplit("_", 1)[1])
                    fp = geotiff_footprint(tif) or {}
                    cl_path = tif.with_name(pid + "_cl.tif")
                    counts = np.zeros(16, dtype=np.int64)
                    if cl_path.exists():
                        cl = tifffile.imread(str(cl_path))
                        counts = np.bincount(np.clip(np.rint(cl).astype(np.int64).ravel(), 0, 15), minlength=16)[:16]
                    present = {c for c in range(1, 16) if counts[c] > 0}
                    flags = labels.get(pid)
                    if flags is not None:
                        official = {i + 1 for i, v in enumerate(flags) if v}
                        match = 1 if official == present else 0
                    else:
                        flags, match = [0] * 15, None
                    row = (pid, folder.name, idx, split_of.get(pid), fp.get("width"), fp.get("height"),
                           fp.get("lon"), fp.get("lat"), fp.get("min_lon"), fp.get("max_lon"), fp.get("min_lat"),
                           fp.get("max_lat"), int(counts[1:].sum()), len(present), match, *[int(v) for v in flags])
                    patches.append(row)
                    scenes[folder.name].append(fp)
                    pcp.extend((pid, c, int(counts[c])) for c in sorted(present))
                if (fi + 1) % 15 == 0:
                    print(f"    ... {fi + 1}/{len(folders)} scenes read")

            # scene table (derived: date/tile from the folder name, footprint = union of patches)
            ann_rows, ann_counts = self._marida_annotations(root)
            scene_rows = []
            for sid, fps in sorted(scenes.items()):
                m = re.match(r"S2_(\d+)-(\d+)-(\d+)_(\w+)$", sid)
                d = date(2000 + int(m.group(3)), int(m.group(2)), int(m.group(1)))
                fps = [f for f in fps if f]
                g = lambda k, fn: fn(f[k] for f in fps) if fps else None
                scene_rows.append((sid, d, m.group(4), fps[0]["epsg"] if fps else None, len(scenes[sid]),
                                   g("lon", lambda v: float(np.mean(list(v)))), g("lat", lambda v: float(np.mean(list(v)))),
                                   g("min_lon", min), g("max_lon", max), g("min_lat", min), g("max_lat", max),
                                   ann_counts.get(sid, 0)))
            n = self.insert("marida_scenes", ["scene_id", "acquisition_date", "mgrs_tile", "utm_epsg", "n_patches",
                                              "center_lon", "center_lat", "min_lon", "max_lon", "min_lat", "max_lat",
                                              "n_annotations"], scene_rows)
            self.audit.add("marida", "marida_scenes", n, 63, "63 per-scene shapefiles in the dataset")

            n = self.insert("marida_patches",
                            ["patch_id", "scene_id", "patch_index", "split", "width_px", "height_px", "center_lon",
                             "center_lat", "min_lon", "max_lon", "min_lat", "max_lat", "labelled_pixels", "n_classes",
                             "labels_match_mask", *MARIDA_FLAGS], patches)
            self.audit.add("marida", "marida_patches", n, len(labels), "vs entries in labels_mapping.txt")
            in_split = sum(1 for p in patches if p[3])
            self.audit.add("marida", "marida_patches[with split]", in_split, len(split_of), "vs entries in the 3 split files")
            mism = sum(1 for p in patches if p[14] == 0)
            self.audit.add("marida", "marida_patches[labels==mask]", len(patches) - mism, len(patches),
                           "official multi-hot labels equal the classes actually present in each _cl.tif mask")
            n = self.insert("marida_patch_class_pixels", ["patch_id", "class_id", "pixels"], pcp)
            self.audit.add("marida", "marida_patch_class_pixels", n, None)

            # cross-check against the training pixels: mapped-class pixels per split must equal npz rows
            per_split = defaultdict(int)
            sp_by_patch = {p[0]: p[3] for p in patches}
            for pid, c, px in pcp:
                if c in MARIDA_MAP and sp_by_patch.get(pid):
                    per_split[sp_by_patch[pid]] += px
            for sp in ("train", "val", "test"):
                f = MODELS / f"marida_{sp}.npz"
                if f.exists():
                    exp = int(len(np.load(f)["y"]))
                    self.audit.add("marida", f"cross-check mapped px [{sp}]", per_split[sp], exp,
                                   "class-mask pixels of the 5 mapped classes vs rows in the training .npz")

            ann_n, bad = self.insert_geo("marida_annotations",
                                         ["scene_id", "shape_id", "confidence", "report", "area_m2", "n_vertices",
                                          "center_lon", "center_lat"], ann_rows)
            self.audit.add("marida", "marida_annotations", ann_n, len(ann_rows), f"{bad} with geom NULL (rejected by MySQL)" if bad else "")
            if not self.dry:
                self.exec("UPDATE marida_annotations SET is_valid = ST_IsValid(geom) WHERE geom IS NOT NULL")
                cur = self.cnx.cursor()
                cur.execute("SELECT COUNT(*), COALESCE(SUM(is_valid), 0) FROM marida_annotations")
                tot, valid = cur.fetchone()
                cur.close()
                self.audit.add("marida", "marida_annotations[valid geometry]", int(valid), None,
                               f"{int(tot - valid)} of {int(tot)} source polygons are self-intersecting (kept as-is, flagged is_valid=0)")

    def _marida_annotations(self, root: Path):
        rows, counts = [], defaultdict(int)
        for shp in sorted((root / "shapefiles").glob("*.shp")):
            sid = shp.stem
            prj = shp.with_suffix(".prj").read_text(errors="ignore")
            utm = utm_from_prj(prj)
            r = shapefile.Reader(str(shp))
            fields = [f[0] for f in r.fields[1:]]
            for sr in r.shapeRecords():
                gj = sr.shape.__geo_interface__
                if gj["type"] not in ("Polygon", "MultiPolygon"):
                    continue
                rec = dict(zip(fields, sr.record))
                nv = sum(len(ring) for poly in ([gj["coordinates"]] if gj["type"] == "Polygon" else gj["coordinates"]) for ring in poly)
                area = shape_area_m2(gj)
                if utm:
                    gj = reproject_geojson(gj, utm[0], utm[1])
                mnx, mny, mxx, mxy, cx, cy = geojson_bounds(gj)
                rows.append((sid, _int(rec.get("id")), _int(rec.get("conf")), _int(rec.get("report")),
                             round(area, 2), nv, cx, cy, json.dumps(gj)))
                counts[sid] += 1
        return rows, counts

    # ── 3. MADOS ─────────────────────────────────────────────────────────────
    def mados(self) -> None:
        with Timer("MADOS (crop catalogue + class pixel counts)"):
            root = DATA / "MADOS"
            split_of: dict[str, str] = {}
            for sp in ("train", "val", "test"):
                for name in read_lines(root / "splits" / f"{sp}_X.txt"):
                    split_of[name] = sp
            files = []
            for sd in sorted(root.glob("Scene_*"), key=lambda p: int(p.name.split("_")[1])):
                for f in sorted((sd / "10").glob("*_L2R_cl_*.tif")):
                    m = re.match(r"(Scene_\d+)_L2R_cl_(\d+)\.tif$", f.name)
                    if m:
                        files.append((m.group(1), int(m.group(2)), f))
            crops, ccp, scenes = [], [], defaultdict(list)
            for i, (sid, ci, f) in enumerate(files):
                cid = f"{sid}_{ci}"
                fp = geotiff_footprint(f) or {}
                cl = tifffile.imread(str(f))
                counts = np.bincount(np.clip(cl.astype(np.int64).ravel(), 0, 15), minlength=16)[:16]
                present = [c for c in range(1, 16) if counts[c] > 0]
                crops.append((cid, sid, ci, split_of.get(cid), fp.get("width"), fp.get("height"), fp.get("lon"),
                              fp.get("lat"), fp.get("min_lon"), fp.get("max_lon"), fp.get("min_lat"), fp.get("max_lat"),
                              int(counts[1:].sum()), len(present)))
                scenes[sid].append(fp)
                ccp.extend((cid, c, int(counts[c])) for c in present)
                if (i + 1) % 500 == 0:
                    print(f"    ... {i + 1}/{len(files)} crops read")
            scene_rows = []
            for sid, fps in scenes.items():
                fps = [f for f in fps if f]
                g = lambda k, fn: fn([f[k] for f in fps]) if fps else None
                scene_rows.append((sid, int(sid.split("_")[1]), len(scenes[sid]), g("lon", lambda v: float(np.mean(v))),
                                   g("lat", lambda v: float(np.mean(v))), g("min_lon", min), g("max_lon", max),
                                   g("min_lat", min), g("max_lat", max)))
            n = self.insert("mados_scenes", ["scene_id", "scene_number", "n_crops", "center_lon", "center_lat",
                                             "min_lon", "max_lon", "min_lat", "max_lat"], scene_rows)
            self.audit.add("mados", "mados_scenes", n, 174, "MADOS paper: 174 scenes")
            n = self.insert("mados_crops", ["crop_id", "scene_id", "crop_index", "split", "width_px", "height_px",
                                            "center_lon", "center_lat", "min_lon", "max_lon", "min_lat", "max_lat",
                                            "labelled_pixels", "n_classes"], crops)
            self.audit.add("mados", "mados_crops", n, len(split_of), "vs entries in the 3 split files")
            n = self.insert("mados_crop_class_pixels", ["crop_id", "class_id", "pixels"], ccp)
            self.audit.add("mados", "mados_crop_class_pixels", n, None)
            per_split = defaultdict(int)
            sp_by_crop = {c[0]: c[3] for c in crops}
            for cid, c, px in ccp:
                if c in MADOS_MAP and sp_by_crop.get(cid):
                    per_split[sp_by_crop[cid]] += px
            for sp in ("train", "val", "test"):
                f = MODELS / f"mados_{sp}.npz"
                if f.exists():
                    self.audit.add("mados", f"cross-check mapped px [{sp}]", per_split[sp], int(len(np.load(f)["y"])),
                                   "class-mask pixels of the 10 mapped classes vs rows in the training .npz")

    # ── 4. PLP ───────────────────────────────────────────────────────────────
    def plp(self) -> None:
        with Timer("PLP (targets + imagery catalogue)"):
            root = DATA / "plp" / "PLP"
            trows = []
            for year in (2021, 2022):
                shp = root / f"PLP{year}" / f"PLP{year}_targets.shp"
                utm = utm_from_prj(shp.with_suffix(".prj").read_text(errors="ignore"))
                r = shapefile.Reader(str(shp))
                fields = [f[0] for f in r.fields[1:]]
                for sr in r.shapeRecords():
                    rec = dict(zip(fields, sr.record))
                    x, y = sr.shape.points[0]
                    lon, lat = (float(v) for v in utm_to_lonlat(x, y, utm[0], utm[1])) if utm else (x, y)
                    d = str(rec.get("date") or "")
                    dep = datetime.strptime(d, "%Y%m%d").date() if re.fullmatch(r"\d{8}", d) else None
                    mat = (rec.get("type") or "").strip()
                    trows.append((year, int(rec["id"]), dep, mat or None,
                                  (rec.get("note") or rec.get("notes") or "").strip() or None,
                                  _flt(rec.get("radius")), _flt(rec.get("width")), _flt(rec.get("height")),
                                  round(lon, 7), round(lat, 7), 0 if mat in PLASTIC_TYPES else None))
            n = self.insert("plp_target_observations", ["campaign_year", "target_id", "observation_date", "material",
                                                        "notes", "radius_m", "width_m", "height_m", "lon", "lat",
                                                        "maps_to_class"], trows)
            self.audit.add("plp", "plp_target_observations", n, 36 + 39, "PLP2021 36 + PLP2022 39 shapefile features (one per target per date)")
            lons = [t[8] for t in trows]
            lats = [t[9] for t in trows]
            print(f"    targets span lon {min(lons):.3f}..{max(lons):.3f}, lat {min(lats):.3f}..{max(lats):.3f}")

            irows = []
            for year in (2021, 2022):
                for tif in sorted((root / f"PLP{year}" / "Sentinel-2").glob("*.tif")):
                    m = re.match(r"(\d{8})T\d{6}_\d{8}T\d{6}_(T\w+)\.tif$", tif.name)
                    irows.append((year, "Sentinel-2", tif.stem, datetime.strptime(m.group(1), "%Y%m%d").date() if m else None,
                                  m.group(2) if m else None, None, None, None, None, tif.name, round(tif.stat().st_size / 2**20, 2)))
            ps = root / "PLP2022" / "PlanetScope"
            for js in sorted(ps.rglob("*_metadata.json")):
                d = json.loads(js.read_text(encoding="utf8"))
                p = d.get("properties", {})
                pid = d.get("id") or js.stem.replace("_metadata", "")
                acq = (p.get("acquired") or "")[:10]
                size = sum(f.stat().st_size for f in js.parent.glob(pid + "*") if f.suffix.lower() == ".tif") / 2**20
                irows.append((2022, "PlanetScope", pid, date.fromisoformat(acq) if acq else None, None,
                              _flt(p.get("cloud_percent")), _flt(p.get("clear_percent")), _flt(p.get("gsd")),
                              _flt(p.get("sun_elevation")), js.name, round(size, 2) if size else None))
            n = self.insert("plp_imagery", ["campaign_year", "sensor", "product_id", "acquired_on", "tile",
                                            "cloud_cover_pct", "clear_pct", "gsd_m", "sun_elevation", "file_name",
                                            "file_size_mb"], irows)
            self.audit.add("plp", "plp_imagery", n, None, "Sentinel-2 .tif + PlanetScope metadata .json")

    # ── 5. RFO ───────────────────────────────────────────────────────────────
    def rfo(self) -> None:
        with Timer("RFO (sites, points, polygons)"):
            root = DATA / "refinedfloatingobjects" / "refinedfloatingobjects"
            mains = sorted(p for p in root.glob("*.shp") if "qualitative" not in p.stem)
            sites, points, polys = [], [], []
            for shp in mains:
                sid = shp.stem
                name, ds = sid.rsplit("_", 1)
                sdate = datetime.strptime(ds, "%Y%m%d").date()
                r = shapefile.Reader(str(shp))
                lab = [int(rec[0]) for rec in r.records()]
                pts = [sh.points[0] for sh in r.shapes()]
                for (lon, lat), t in zip(pts, lab):
                    points.append((sid, "points", t, "debris" if t == 1 else "water_other", 0 if t == 1 else 3, lon, lat))
                nq = 0
                qp = root / f"{sid}_qualitative_point.shp"
                if qp.exists():
                    for sh in shapefile.Reader(str(qp)).shapes():
                        if sh.points:
                            points.append((sid, "qualitative_point", None, None, None, sh.points[0][0], sh.points[0][1]))
                counts = {"qualitative_poly": 0, "qualitative_bbox": 0}
                for layer in ("qualitative_poly", "qualitative_bbox"):
                    lp = root / f"{sid}_{layer}.shp"
                    if not lp.exists():
                        continue
                    lr = shapefile.Reader(str(lp))
                    lf = [f[0] for f in lr.fields[1:]]
                    for sr in lr.shapeRecords():
                        gj = sr.shape.__geo_interface__
                        if gj["type"] not in ("Polygon", "MultiPolygon"):
                            continue
                        rec = dict(zip(lf, sr.record))
                        gj = clamp_geojson(gj)
                        nv = sum(len(ring) for poly in ([gj["coordinates"]] if gj["type"] == "Polygon" else gj["coordinates"]) for ring in poly)
                        _, _, _, _, cx, cy = geojson_bounds(gj)
                        polys.append((sid, layer, _int(rec.get("type")), _flt(rec.get("area")), nv, cx, cy, json.dumps(gj)))
                        counts[layer] += 1
                tif = root / f"{sid}.tif"
                sites.append((sid, name.capitalize().replace("Neworleans", "New Orleans"), sdate,
                              "train" if sid in RFO_TRAIN else "test", len(pts), sum(1 for t in lab if t == 1),
                              sum(1 for t in lab if t == 0), counts["qualitative_poly"], counts["qualitative_bbox"],
                              round(tif.stat().st_size / 1024**3, 2) if tif.exists() else None,
                              min(p[0] for p in pts), max(p[0] for p in pts), min(p[1] for p in pts), max(p[1] for p in pts)))
            n = self.insert("rfo_sites", ["site_id", "site_name", "scene_date", "split", "n_points", "n_debris", "n_water",
                                          "n_qualitative_polygons", "n_qualitative_bboxes", "scene_tif_gb", "min_lon",
                                          "max_lon", "min_lat", "max_lat"], sites)
            self.audit.add("rfo", "rfo_sites", n, 6, "accra, durban, lagos, marmara, neworleans, venice")
            n = self.insert("rfo_points", ["site_id", "source_layer", "label_type", "label_name", "class_id", "lon", "lat"], points)
            self.audit.add("rfo", "rfo_points", n, None)
            for sp, f in (("train", "rfo_pixels_train.npz"), ("test", "rfo_pixels_test.npz")):
                if (MODELS / f).exists():
                    got = sum(1 for p in points if p[1] == "points" and next(s for s in sites if s[0] == p[0])[3] == sp)
                    self.audit.add("rfo", f"cross-check labelled points [{sp}]", got, int(len(np.load(MODELS / f)["y"])),
                                   "python_engine/ml/datasets/rfo.py skips a point that falls outside its scene or on a nodata centre pixel",
                                   allow_extra=5)
            n, bad = self.insert_geo("rfo_polygons", ["site_id", "source_layer", "attr_type", "attr_area", "n_vertices",
                                                      "center_lon", "center_lat"], polys)
            self.audit.add("rfo", "rfo_polygons", n, len(polys), f"{bad} with geom NULL" if bad else "")

    # ── 6. countries ─────────────────────────────────────────────────────────
    def countries(self) -> None:
        with Timer("countries (polygons)"):
            gj = json.loads((DATA / "coastline" / "countries.geojson").read_text(encoding="utf8"))
            rows = []
            for ft in gj["features"]:
                g = ft.get("geometry")
                if not g or g["type"] not in ("Polygon", "MultiPolygon"):
                    continue
                g = clamp_geojson(g)
                pr = ft.get("properties", {})
                nv = sum(len(ring) for poly in ([g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]) for ring in poly)
                mnx, mny, mxx, mxy, cx, cy = geojson_bounds(g)
                iso3 = pr.get("ISO3166-1-Alpha-3")
                iso2 = pr.get("ISO3166-1-Alpha-2")
                rows.append((pr.get("name") or "?", None if iso3 in (None, "-99") else iso3,
                             None if iso2 in (None, "-99") else iso2, cx, cy, mnx, mxx, mny, mxy, nv, json.dumps(g)))
            n, bad = self.insert_geo("countries", ["name", "iso3", "iso2", "center_lon", "center_lat", "min_lon", "max_lon",
                                                   "min_lat", "max_lat", "n_vertices"], rows)
            self.audit.add("countries", "countries", n, len(gj["features"]), f"{bad} with geom NULL" if bad else "")

    # ── 7. model results ─────────────────────────────────────────────────────
    def models(self) -> None:
        with Timer("model results (metrics.json + summary documents)"):
            m = json.loads((MODELS / "metrics.json").read_text(encoding="utf8"))
            classes = m.get("classes") or CLASS_NAMES
            runs, cm, conf, dsm = [], [], [], []

            def add_run(key, sec, per_class, confusion, file_key="model"):
                runs.append((key, sec.get(file_key), sec.get("arch"), sec.get("role"), sec.get("input"),
                             sec.get("trainSamples") or sec.get("trainEmbeddings"),
                             sec.get("testAccuracy", (sec.get("combined") or {}).get("acc")),
                             sec.get("macroF1", (sec.get("combined") or {}).get("macroF1")),
                             sec.get("balancedMacroF1"), sec.get("onnxAgreement"), sec.get("device"),
                             sec.get("dataset"), sec.get("note") or (f"verdict {sec.get('verdict')}, deltaMacroF1 {sec.get('deltaMacroF1')}" if sec.get("verdict") else None),
                             sec.get("updated") or m.get("updated")))
                for cn, v in (per_class or {}).items():
                    cm.append((key, cn, v.get("precision"), v.get("recall"), v.get("f1")))
                for i, row in enumerate(confusion or []):
                    for j, v in enumerate(row):
                        conf.append((key, classes[i], classes[j], int(v)))

            if "perPixel" in m:
                pp = m["perPixel"]
                add_run("per_pixel", pp, pp.get("perClass"), pp.get("confusion"))
                for ds, v in (pp.get("perDataset") or {}).items():
                    dsm.append(("per_pixel", ds, v.get("testAccuracy"), v.get("macroF1"), v.get("samples")))
            if "patch" in m:
                add_run("patch_cnn", m["patch"], m["patch"].get("perClass"), m["patch"].get("confusion"))
            if "clay" in m:
                cl = m["clay"]
                add_run("clay_head", cl, (cl.get("combined") or {}).get("perClass"), (cl.get("combined") or {}).get("confusion"))
            n = self.insert("model_runs", ["run_key", "model_file", "arch", "role", "input_desc", "train_samples",
                                           "test_accuracy", "macro_f1", "balanced_macro_f1", "onnx_agreement", "device",
                                           "dataset_desc", "note", "updated_at"], runs)
            self.audit.add("models", "model_runs", n, len([k for k in ("perPixel", "patch", "clay") if k in m]))
            self.audit.add("models", "model_class_metrics", self.insert("model_class_metrics", ["run_key", "class_name", "precision_score", "recall_score", "f1_score"], cm), None)
            self.audit.add("models", "model_confusion", self.insert("model_confusion", ["run_key", "actual_class", "predicted_class", "n"], conf), None)
            self.audit.add("models", "model_dataset_metrics", self.insert("model_dataset_metrics", ["run_key", "dataset_id", "test_accuracy", "macro_f1", "samples"], dsm), None)

            docs = []
            for fn in SUMMARY_JSONS:
                p = MODELS / fn
                if p.exists():
                    docs.append((p.stem, f"python_engine/models/{fn}", json.dumps(clean_json(json.loads(p.read_text(encoding="utf8"))))))
            n = self.insert("json_documents", ["doc_name", "source_file", "payload"], docs)
            self.audit.add("models", "json_documents", n, sum(1 for f in SUMMARY_JSONS if (MODELS / f).exists()))

    # ── 8. dataset counts ────────────────────────────────────────────────────
    def finish_catalogue(self) -> None:
        for ds, patches in (("marida", "marida_patches"), ("mados", "mados_crops")):
            scenes = "marida_scenes" if ds == "marida" else "mados_scenes"
            self.exec(f"UPDATE datasets SET n_scenes=(SELECT COUNT(*) FROM {scenes}), n_patches=(SELECT COUNT(*) FROM {patches}) WHERE dataset_id=%s", (ds,))
        self.exec("UPDATE datasets SET n_scenes=(SELECT COUNT(*) FROM rfo_sites) WHERE dataset_id='rfo'")
        self.exec("UPDATE datasets SET n_scenes=(SELECT COUNT(*) FROM plp_imagery) WHERE dataset_id='plp'")
        self.exec("UPDATE datasets d SET n_pixel_samples=(SELECT COUNT(*) FROM training_pixels t WHERE t.dataset_id=d.dataset_id) "
                  "WHERE d.dataset_id IN ('marida','mados','rfo','plp')")
        self.exec("UPDATE datasets SET n_patches=(SELECT COUNT(*) FROM countries) WHERE dataset_id='countries'")


def _int(v):
    try:
        return None if v is None else int(v)
    except (TypeError, ValueError):
        return None


def _flt(v):
    try:
        return None if v is None else float(v)
    except (TypeError, ValueError):
        return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    add_connection_args(ap)
    ap.add_argument("--skip", default="", help=f"comma-separated steps to skip: {', '.join(STEPS)}")
    ap.add_argument("--dry-run", action="store_true", help="parse everything, do not touch any database")
    args = ap.parse_args()
    skip = {s.strip() for s in args.skip.split(",") if s.strip()}
    bad = skip - set(STEPS)
    if bad:
        ap.error(f"unknown step(s): {', '.join(sorted(bad))}")

    cfg = resolve_config(args)
    cnx = None
    if not args.dry_run:
        print(f"Connecting to {cfg['user']}@{cfg['host']}:{cfg['port']} -> {cfg['datasets_db']}")
        cnx = connect(cfg, cfg["datasets_db"])
        with Timer("schema"):
            n = run_sql_file(cnx, HERE / "schema_datasets.sql")
            print(f"  {n} statements")
    audit = Audit()
    ld = Loader(cnx, audit, args.dry_run)
    t0 = time.time()
    ld.catalogue()
    for step in STEPS:
        if step not in skip:
            getattr(ld, step)()
    if cnx:
        ld.finish_catalogue()
        with Timer("views"):
            print(f"  {run_sql_file(cnx, HERE / 'views_datasets.sql')} statements")
        audit.flush(cnx)
        cnx.close()
    bad_rows = [r for r in audit.rows if not r[4]]
    print(f"\nDone in {time.time() - t0:.0f}s. {len(audit.rows)} audit rows, {len(bad_rows)} mismatch(es).")
    for r in bad_rows:
        print(f"  MISMATCH  {r[1]}: loaded {r[2]:,} vs expected {r[3]:,}  {r[5]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
