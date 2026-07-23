"""Drift validation harness — quantify forecast skill against a reference track.

Seeds the Lagrangian model at a reference start point (e.g. a NOAA GDP / Copernicus
surface drifter), runs the forecast, and reports separation distance over time plus
the Liu & Weisberg (2011) skill score. It validates WHATEVER forcing is active
(gridded CMEMS if available, else point Open-Meteo, else synthetic) — turning the
previously-unvalidated ETA into a number with a defensible skill figure behind it.

Usage:
    python -m ml.validate_drift                 # offline self-test (synthetic ref track)
    python -m ml.validate_drift track.csv       # CSV columns: t_hours,lat,lon (t=0 at release)
"""
from __future__ import annotations

import csv
import json
import math
import sys

from trajectory import forecast as fc


def haversine_km(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
    r = 6371.0088
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dphi = math.radians(b_lat - a_lat)
    dl = math.radians(b_lon - a_lon)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))


def _model_at(points: list[dict], t: float) -> dict:
    """Nearest modelled hourly point to observation time t."""
    return min(points, key=lambda p: abs(float(p["t"]) - t))


def skill_score(model_pts: list[dict], obs: list[tuple[float, float, float]]) -> dict:
    """Liu–Weisberg skill score of a modelled path vs an observed (t,lat,lon) track.

    c = Σ dᵢ / Σ Lᵢ, where dᵢ is model–obs separation at time i and Lᵢ is the
    cumulative observed track length to i. Skill ss = max(0, 1 − c/n), n = 1
    (perfect = 1, ≥ tolerance = 0).
    """
    seps: list[tuple[float, float]] = []
    cum_len = 0.0
    num = 0.0
    den = 0.0
    prev = obs[0]
    for t, la, lo in obs[1:]:
        cum_len += haversine_km(prev[1], prev[2], la, lo)
        prev = (t, la, lo)
        m = _model_at(model_pts, t)
        d = haversine_km(float(m["lat"]), float(m["lon"]), la, lo)
        seps.append((t, d))
        num += d
        den += cum_len
    c = num / den if den > 0 else float("inf")
    ss = max(0.0, 1.0 - c / 1.0)
    return {
        "skillScore": round(ss, 3),
        "meanSepKm": round(sum(d for _, d in seps) / len(seps), 2) if seps else None,
        "finalSepKm": round(seps[-1][1], 2) if seps else None,
        "hours": obs[-1][0],
        "nPoints": len(obs),
    }


def validate(obs: list[tuple[float, float, float]]) -> dict:
    """Run the forecast from the track's start and score it against the track."""
    start = obs[0]
    horizon = max(6, int(math.ceil(obs[-1][0])))
    # coast_lon=None: skill-score against the FULL free-drift path. A landfall
    # clamp would truncate the modelled path against an untruncated drifter
    # track, saturating every post-intercept sample onto the coast and
    # collapsing the score — so it is explicitly disabled here.
    fcast = fc.forecast(start[1], start[2], horizon, coast_lon=None, include_backtrack=False)
    return {"dataSource": fcast.get("dataSource"), **skill_score(fcast["points"], obs)}


def _synthetic_track() -> list[tuple[float, float, float]]:
    """Offline self-test track = the model's own 48-h path sampled every 6 h, so the
    harness maths can be verified without a real drifter (expect a high score)."""
    pts = fc.forecast(19.0, 72.6, 48, coast_lon=None, include_backtrack=False)["points"]
    return [(float(p["t"]), float(p["lat"]), float(p["lon"])) for p in pts[::6]]


def _load_csv(path: str) -> list[tuple[float, float, float]]:
    obs: list[tuple[float, float, float]] = []
    with open(path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            obs.append((float(row["t_hours"]), float(row["lat"]), float(row["lon"])))
    obs.sort()
    return obs


def main() -> None:
    if len(sys.argv) > 1:
        obs = _load_csv(sys.argv[1])
    else:
        print("self-test on a synthetic reference track (pass a CSV of t_hours,lat,lon for a real drifter)")
        obs = _synthetic_track()
    print(json.dumps(validate(obs), indent=2))


if __name__ == "__main__":
    main()
