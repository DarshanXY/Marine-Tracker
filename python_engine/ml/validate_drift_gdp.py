"""Hindcast validation of the drift model against real NOAA GDP drifter tracks.

For each real drifter segment: seed the model at the buoy's position, advect 72 h
with CMEMS currents (gridded, sampled along the track) + ERA5 wind, and compare with
where the buoy actually went. Reports separation distance at 24/48/72 h, the
Liu & Weisberg skill score, skill against baselines (no motion; persistence of the
buoy's first 6 h of motion), and whether the ensemble cone actually contains the
truth (i.e. whether the uncertainty drawn on the map is honest).

Scope notes (read before quoting numbers):
  * HINDCAST: CMEMS analysis fields + ERA5 winds, not forecasts — real forecast
    skill at +24…72 h lead is lower.
  * Drogued buoys (15 m drogue) follow the current (windage 0); undrogued buoys are
    surface floats that pick up ~1 % of the wind — the closest proxy for floating
    plastic, but a proxy: real debris varies in windage/shape/fouling.
  * Data: GDP 6-hourly QC drifters (NOAA AOML ERDDAP), ends 2025-06.

Usage (from python_engine/):
    python -m ml.validate_drift_gdp --cases 60 --workers 4
Outputs validation/drift_gdp_results.json (+ prints a summary).
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import math
import os
import random
import statistics
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from ml.validate_drift import haversine_km, skill_score
from satellite import landmask
from trajectory import gridded_forcing
from trajectory.lagrangian_model import integrate_members

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "validation"
TRACKS_CSV = OUT_DIR / "gdp_6h_indian_ocean.csv"
RESULTS_JSON = OUT_DIR / "drift_gdp_results.json"

ERDDAP = "https://erddap.aoml.noaa.gov/gdp/erddap/tabledap/drifter_6hour_qc.csv"
HOURS = 72
STEP_S = 6 * 3600
PRODUCTION_WINDAGE = (0.015, 0.02, 0.025, 0.03)
UNDROGUED_WINDAGE = 0.01      # typical downwind slip of an undrogued surface drifter


# ── data ─────────────────────────────────────────────────────────────────────
def _iso(s: str) -> float | None:
    if not s or s.lower() == "nan":
        return None
    return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()


def fetch_tracks(start: str, end: str, force: bool = False) -> Path:
    OUT_DIR.mkdir(exist_ok=True)
    if TRACKS_CSV.exists() and not force:
        return TRACKS_CSV
    q = (f'ID,time,latitude,longitude,drogue_lost_date&time>={start}&time<={end}'
         '&latitude>=4&latitude<=24&longitude>=58&longitude<=100&orderBy("ID,time")')
    url = ERDDAP + "?" + urllib.parse.quote(q, safe="=&,()")
    with urllib.request.urlopen(url, timeout=180) as r:  # noqa: S310 (trusted host)
        TRACKS_CSV.write_bytes(r.read())
    return TRACKS_CSV


def load_tracks(path: Path) -> dict[str, list[dict]]:
    tracks: dict[str, list[dict]] = {}
    rows = list(csv.reader(io.StringIO(path.read_text(encoding="utf-8"))))
    for r in rows[2:]:  # header + units
        t = _iso(r[1])
        if t is None:
            continue
        tracks.setdefault(r[0], []).append({
            "t": t, "lat": float(r[2]), "lon": float(r[3]), "dl": _iso(r[4]),
        })
    return tracks


def make_cases(tracks: dict[str, list[dict]], n: int, seed: int) -> list[dict]:
    """72-h segments on the regular 6-h grid, ≥10 days apart per buoy, buoy not
    beached, classified drogued / undrogued (drogue status must be unambiguous)."""
    rng = random.Random(seed)
    pool: dict[str, list[dict]] = {"drogued": [], "undrogued": []}
    for bid, recs in tracks.items():
        recs.sort(key=lambda x: x["t"])
        last_used = -999
        for i in range(len(recs) - 12):
            if i - last_used < 40:
                continue
            seg = recs[i:i + 13]
            if any(seg[k + 1]["t"] - seg[k]["t"] != STEP_S for k in range(12)):
                continue
            dl = seg[0]["dl"]
            if dl is None:
                continue
            if dl <= seg[0]["t"]:
                kind = "undrogued"
            elif dl >= seg[-1]["t"]:
                kind = "drogued"
            else:
                continue
            if haversine_km(seg[0]["lat"], seg[0]["lon"], seg[-1]["lat"], seg[-1]["lon"]) < 5.0:
                continue  # stuck / beached, not a floating parcel
            if any(landmask.is_land(p["lat"], p["lon"]) for p in seg):
                continue
            pool[kind].append({"id": bid, "kind": kind, "seg": seg})
            last_used = i
    cases: list[dict] = []
    for kind in ("drogued", "undrogued"):
        rng.shuffle(pool[kind])
        cases += pool[kind][: n // 2]
    return cases


# ── forcing ──────────────────────────────────────────────────────────────────
class PointCurrent(gridded_forcing.GriddedForcing):
    """Same CMEMS data, but currents are read at the RELEASE cell for the whole path
    — the limitation of point forcing (what the app used before gridded CMEMS)."""

    def __init__(self, ds, wind, t0, lat0, lon0):
        super().__init__(ds, wind, t0)
        self._p = (lat0, lon0)

    def current_ms(self, lat, lon, t):
        return super().current_ms(self._p[0], self._p[1], t)


def era5_wind(lat: float, lon: float, t0: datetime) -> dict:
    d0 = (t0 - timedelta(days=0)).date()
    d1 = (t0 + timedelta(hours=HOURS + 2)).date()
    qs = urllib.parse.urlencode({
        "latitude": f"{lat:.3f}", "longitude": f"{lon:.3f}", "start_date": d0.isoformat(),
        "end_date": d1.isoformat(), "hourly": "wind_speed_10m,wind_direction_10m",
        "wind_speed_unit": "ms", "timezone": "UTC",
    })
    last: Exception | None = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen("https://archive-api.open-meteo.com/v1/archive?" + qs, timeout=60) as r:  # noqa: S310
                h = json.loads(r.read())["hourly"]
            break
        except Exception as e:  # noqa: BLE001 — retry on 429/timeouts
            last = e
            time.sleep(3 + 5 * attempt)
    else:
        raise RuntimeError(f"ERA5 wind fetch failed: {last}")
    off = t0.hour  # series starts 00:00 UTC of d0 (== t0's date)
    s = [v if v is not None else 0.0 for v in h["wind_speed_10m"]][off:]
    d = [v if v is not None else 0.0 for v in h["wind_direction_10m"]][off:]
    return {
        "u_wind": [-a * math.sin(math.radians(b)) for a, b in zip(s, d)],
        "v_wind": [-a * math.cos(math.radians(b)) for a, b in zip(s, d)],
        "t0_index": 0,
    }


def load_currents(seg: list[dict], t0: datetime):
    import copernicusmarine

    lats = [p["lat"] for p in seg]
    lons = [p["lon"] for p in seg]
    pad = 1.6
    ds = copernicusmarine.open_dataset(
        dataset_id=gridded_forcing._CMEMS_CUR_DATASET,
        username=os.getenv("CMEMS_USERNAME"), password=os.getenv("CMEMS_PASSWORD"),
        variables=["uo", "vo"],
        minimum_longitude=min(lons) - pad, maximum_longitude=max(lons) + pad,
        minimum_latitude=min(lats) - pad, maximum_latitude=max(lats) + pad,
        start_datetime=t0, end_datetime=t0 + timedelta(hours=HOURS + 3),
        minimum_depth=0.0, maximum_depth=1.0,
    )
    if "depth" in ds.dims:
        ds = ds.isel(depth=0)
    return ds.load()


# ── model + metrics ──────────────────────────────────────────────────────────
def _pts(track: list[tuple[float, float]]) -> list[dict]:
    return [{"t": float(i), "lat": la, "lon": lo} for i, (la, lo) in enumerate(track)]


def _mean_track(members: list[list[tuple[float, float]]]) -> list[tuple[float, float]]:
    return [(sum(m[i][0] for m in members) / len(members), sum(m[i][1] for m in members) / len(members))
            for i in range(len(members[0]))]


def _score(track: list[tuple[float, float]], obs: list[tuple[float, float, float]]) -> dict:
    sk = skill_score(_pts(track), obs)
    out = {"skill": sk["skillScore"]}
    for h in (24, 48, 72):
        o = next(x for x in obs if x[0] == h)
        out[f"sep{h}"] = haversine_km(track[h][0], track[h][1], o[1], o[2])
    return out


def _persistence(seg: list[dict]) -> list[tuple[float, float]]:
    """Baseline: keep moving at the buoy's own first-6-h velocity (uses observed motion)."""
    la0, lo0 = seg[0]["lat"], seg[0]["lon"]
    dla, dlo = (seg[1]["lat"] - la0) / 6.0, (seg[1]["lon"] - lo0) / 6.0
    return [(la0 + dla * h, lo0 + dlo * h) for h in range(HOURS + 1)]


def run_case(case: dict) -> dict:
    seg = case["seg"]
    t0 = datetime.fromtimestamp(seg[0]["t"], tz=timezone.utc)
    la0, lo0 = seg[0]["lat"], seg[0]["lon"]
    obs = [((p["t"] - seg[0]["t"]) / 3600.0, p["lat"], p["lon"]) for p in seg]
    ds = load_currents(seg, t0)
    wind = era5_wind(la0, lo0, t0)
    grid = gridded_forcing.GriddedForcing(ds, wind, t0)
    point = PointCurrent(ds, wind, t0, la0, lo0)
    res: dict = {"id": case["id"], "kind": case["kind"], "start": t0.isoformat(), "lat0": la0, "lon0": lo0,
                 "obs72_km": haversine_km(la0, lo0, seg[-1]["lat"], seg[-1]["lon"])}
    res["zero"] = _score([(la0, lo0)] * (HOURS + 1), obs)
    res["persistence"] = _score(_persistence(seg), obs)

    if case["kind"] == "drogued":
        variants = {"grid": (grid, (0.0,)), "point": (point, (0.0,))}
    else:
        variants = {
            "grid_1pct": (grid, (UNDROGUED_WINDAGE,)), "point_1pct": (point, (UNDROGUED_WINDAGE,)),
            "grid_prod": (grid, PRODUCTION_WINDAGE), "point_prod": (point, PRODUCTION_WINDAGE),
        }
    for name, (forcing, wcs) in variants.items():
        members = integrate_members(la0, lo0, HOURS, wcs, forcing, direction=1)
        res[name] = _score(_mean_track(members), obs)
        if name == "grid_prod":  # is the drawn uncertainty cone honest?
            cov = {}
            for h in (24, 48, 72):
                o = next(x for x in obs if x[0] == h)
                lats, lons = [m[h][0] for m in members], [m[h][1] for m in members]
                cov[str(h)] = bool(min(lats) <= o[1] <= max(lats) and min(lons) <= o[2] <= max(lons))
            res["cone_contains"] = cov
    return res


# ── summary ──────────────────────────────────────────────────────────────────
def _stat(vals: list[float]) -> dict:
    v = sorted(vals)
    return {"n": len(v), "median": round(statistics.median(v), 1), "mean": round(statistics.fmean(v), 1),
            "p90": round(v[min(len(v) - 1, int(0.9 * len(v)))], 1)}


def summarise(results: list[dict]) -> dict:
    out: dict = {"n_cases": len(results)}
    for kind in ("drogued", "undrogued"):
        rs = [r for r in results if r["kind"] == kind]
        if not rs:
            continue
        block: dict = {"n": len(rs), "median_true_displacement_72h_km": round(statistics.median(r["obs72_km"] for r in rs), 1)}
        names = [k for k in rs[0] if isinstance(rs[0][k], dict) and "sep24" in rs[0][k]]
        for name in names:
            block[name] = {f"sep{h}_km": _stat([r[name][f"sep{h}"] for r in rs]) for h in (24, 48, 72)}
            block[name]["mean_LW_skill"] = round(statistics.fmean(r[name]["skill"] for r in rs), 3)
        for h in (24, 48, 72):
            for name in names:
                if name in ("zero", "persistence"):
                    continue
                for base in ("zero", "persistence"):
                    block[name][f"skill_vs_{base}_{h}h"] = round(
                        1 - statistics.fmean(r[name][f"sep{h}"] for r in rs) / statistics.fmean(r[base][f"sep{h}"] for r in rs), 3)
        cones = [r["cone_contains"] for r in rs if "cone_contains" in r]
        if cones:
            block["cone_contains_truth"] = {h: round(sum(c[h] for c in cones) / len(cones), 2) for h in ("24", "48", "72")}
        out[kind] = block
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cases", type=int, default=60)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--start", default="2024-01-01T00:00:00Z")
    ap.add_argument("--end", default="2025-06-15T00:00:00Z")
    a = ap.parse_args()

    import config  # noqa: F401  (loads .env → CMEMS credentials)

    path = fetch_tracks(a.start, a.end)
    tracks = load_tracks(path)
    cases = make_cases(tracks, a.cases, a.seed)
    print(f"{len(tracks)} drifters in region -> {len(cases)} cases "
          f"({sum(c['kind'] == 'drogued' for c in cases)} drogued / {sum(c['kind'] == 'undrogued' for c in cases)} undrogued)", flush=True)

    results: list[dict] = []
    failures: list[dict] = []
    t_start = time.time()
    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        futs = {ex.submit(run_case, c): c for c in cases}
        for i, f in enumerate(as_completed(futs), 1):
            c = futs[f]
            try:
                results.append(f.result())
            except Exception as e:  # noqa: BLE001
                failures.append({"id": c["id"], "err": f"{type(e).__name__}: {str(e)[:140]}"})
            print(f"[{i}/{len(cases)}] done, ok={len(results)} fail={len(failures)} ({time.time() - t_start:.0f}s)", flush=True)
            RESULTS_JSON.write_text(json.dumps({"summary": summarise(results) if results else {}, "failures": failures,
                                                "cases": results}, indent=1), encoding="utf-8")
    print(json.dumps(summarise(results), indent=1))
    print("failures:", failures[:5])


if __name__ == "__main__":
    sys.exit(main())
