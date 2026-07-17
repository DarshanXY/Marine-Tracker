"""Coarse geographic land/water estimate from terrain elevation (keyless).

When a real Sentinel-2 fetch fails (synthetic fallback) we STILL want to tell the
user whether they scanned land or water. This samples a grid over the AOI and
queries the Open-Meteo Elevation API — free, no key, and the SAME host the drift
forcing already reaches — classifying each point as land (elevation > ~2 m) or
water (at/below sea level). It CANNOT see cloud (that needs the satellite), so
cloud is reported as unknown. The result is clearly labelled
`source: "geographic-estimate"` so the UI distinguishes it from the precise SCL
readout you get on a real scene.
"""
from __future__ import annotations

import json
import urllib.parse
import urllib.request

ELEV_URL = "https://api.open-meteo.com/v1/elevation"
_LAND_ELEV_M = 2.0  # above this = land; at/below ≈ water / tidal


def _fetch_elevations(lats: list[float], lons: list[float], timeout: int = 10) -> list:
    qs = urllib.parse.urlencode({
        "latitude": ",".join(f"{x:.4f}" for x in lats),
        "longitude": ",".join(f"{x:.4f}" for x in lons),
    })
    req = urllib.request.Request(f"{ELEV_URL}?{qs}", headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (trusted host)
        return json.loads(resp.read().decode("utf-8")).get("elevation", [])


def estimate_surface(bbox: dict, grid: int = 6) -> dict | None:
    """Grid-sample the AOI's elevation → water/land composition estimate, or None
    on failure. Cloud is unknown (needs the satellite)."""
    north, south = float(bbox["north"]), float(bbox["south"])
    east, west = float(bbox["east"]), float(bbox["west"])
    lats: list[float] = []
    lons: list[float] = []
    for i in range(grid):
        for j in range(grid):
            lats.append(south + (i + 0.5) / grid * (north - south))
            lons.append(west + (j + 0.5) / grid * (east - west))

    try:
        elevs = _fetch_elevations(lats, lons)
    except Exception:  # noqa: BLE001 — no estimate rather than a wrong one
        return None
    valid = [e for e in elevs if e is not None]
    if not valid:
        return None

    n = len(valid)
    land = sum(1 for e in valid if e > _LAND_ELEV_M)
    water = n - land
    water_pct = round(water / n * 100, 1)
    land_pct = round(land / n * 100, 1)
    label = "water" if water_pct >= 60 else "land" if land_pct >= 60 else "mixed"
    return {
        "water_pct": water_pct, "land_pct": land_pct,
        "cloud_pct": 0.0, "other_pct": 0.0,
        "label": label, "water_valid": water_pct >= 15.0,
        "source": "geographic-estimate",
    }
