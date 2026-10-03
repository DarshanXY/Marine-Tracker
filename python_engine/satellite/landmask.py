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


# ── Land polygon test (offline) ───────────────────────────────────────────────
# Elevation alone cannot tell a river-delta town from the sea (both sit at 0-11 m),
# so "is this release point over open water?" is answered against the coastline
# polygons in data/coastline/countries.geojson (Natural Earth, ~1-3 km at the coast).
import os  # noqa: E402
from pathlib import Path  # noqa: E402

_COASTLINE = Path(os.getenv("COASTLINE_GEOJSON") or Path(__file__).resolve().parents[2] / "data" / "coastline" / "countries.geojson")
_LAND_POLYS: list | None = None  # [(minx, miny, maxx, maxy, outer, holes)]; [] = dataset unavailable


def _load_land() -> list:
    global _LAND_POLYS
    if _LAND_POLYS is not None:
        return _LAND_POLYS
    polys: list = []
    try:
        import numpy as np  # noqa: PLC0415

        with open(_COASTLINE, encoding="utf-8") as f:
            gj = json.load(f)
        for feat in gj.get("features", []):
            geom = feat.get("geometry") or {}
            if geom.get("type") == "Polygon":
                parts = [geom["coordinates"]]
            elif geom.get("type") == "MultiPolygon":
                parts = geom["coordinates"]
            else:
                continue
            for rings in parts:
                outer = np.asarray(rings[0], dtype="float64")[:, :2]
                holes = [np.asarray(h, dtype="float64")[:, :2] for h in rings[1:]]
                polys.append((outer[:, 0].min(), outer[:, 1].min(), outer[:, 0].max(), outer[:, 1].max(), outer, holes))
    except Exception:  # noqa: BLE001 — dataset missing/corrupt → callers fall back to elevation
        polys = []
    _LAND_POLYS = polys
    return polys


def _in_ring(ring, x: float, y: float) -> bool:
    import numpy as np  # noqa: PLC0415

    x0, y0, x1, y1 = ring[:-1, 0], ring[:-1, 1], ring[1:, 0], ring[1:, 1]
    crosses = (y0 > y) != (y1 > y)
    xi = (x1 - x0) * (y - y0) / np.where(y1 != y0, y1 - y0, 1e-18) + x0
    return bool(np.count_nonzero(crosses & (x < xi)) % 2)


def available() -> bool:
    """True when the coastline polygons loaded (landfall/inland tests are usable)."""
    return bool(_load_land())


def is_land(lat: float, lon: float) -> bool | None:
    """True if (lat, lon) is inside a land polygon, False if over water, None when
    the coastline dataset is unavailable (caller decides what to do)."""
    polys = _load_land()
    if not polys:
        return None
    for minx, miny, maxx, maxy, outer, holes in polys:
        if minx <= lon <= maxx and miny <= lat <= maxy and _in_ring(outer, lon, lat):
            if not any(_in_ring(h, lon, lat) for h in holes):
                return True
    return False


INLAND_BUFFER_KM = 3.0  # ≈ the coastline dataset's own error; nearer than this is kept


def _in_ring_many(ring, xs, ys):
    """Vectorised even-odd point-in-ring for many points; segments pruned to the
    points' latitude span and to those not entirely west of every point."""
    import numpy as np  # noqa: PLC0415

    x0, y0, x1, y1 = ring[:-1, 0], ring[:-1, 1], ring[1:, 0], ring[1:, 1]
    keep = (np.maximum(y0, y1) >= ys.min()) & (np.minimum(y0, y1) <= ys.max()) & (np.maximum(x0, x1) >= xs.min())
    x0, y0, x1, y1 = x0[keep], y0[keep], x1[keep], y1[keep]
    inside = np.zeros(len(xs), dtype=bool)
    if x0.size == 0:
        return inside
    dy = np.where(y1 != y0, y1 - y0, 1e-18)
    for s in range(0, len(xs), 512):
        x, y = xs[s:s + 512, None], ys[s:s + 512, None]
        crosses = (y0 > y) != (y1 > y)
        xi = (x1 - x0) * (y - y0) / dy + x0
        inside[s:s + 512] = (np.count_nonzero(crosses & (x < xi), axis=1) % 2).astype(bool)
    return inside


def _edge_dist_km(ring, xs, ys, cap_km: float):
    """Distance (km, equirectangular) from each point to the nearest ring edge;
    edges farther than ~cap_km of the whole point cloud are ignored (→ inf)."""
    import numpy as np  # noqa: PLC0415

    pad = cap_km / 100.0
    x0, y0, x1, y1 = ring[:-1, 0], ring[:-1, 1], ring[1:, 0], ring[1:, 1]
    keep = ((np.maximum(x0, x1) >= xs.min() - pad) & (np.minimum(x0, x1) <= xs.max() + pad)
            & (np.maximum(y0, y1) >= ys.min() - pad) & (np.minimum(y0, y1) <= ys.max() + pad))
    x0, y0, x1, y1 = x0[keep], y0[keep], x1[keep], y1[keep]
    out = np.full(len(xs), np.inf)
    if x0.size == 0:
        return out
    for s in range(0, len(xs), 256):
        px, py = xs[s:s + 256, None], ys[s:s + 256, None]
        k = 111.32 * np.cos(np.radians(py))
        ax, ay = (x0 - px) * k, (y0 - py) * 111.32
        bx, by = (x1 - px) * k, (y1 - py) * 111.32
        ex, ey = bx - ax, by - ay
        t = np.clip(-(ax * ex + ay * ey) / np.where(ex * ex + ey * ey > 0, ex * ex + ey * ey, 1e-18), 0.0, 1.0)
        d = np.hypot(ax + t * ex, ay + t * ey)
        out[s:s + 256] = d.min(axis=1)
    return out


def deep_inland(lats, lons, near_km: float = INLAND_BUFFER_KM) -> list[bool] | None:
    """Per point: True if it lies on land more than `near_km` from the nearest coast
    edge (i.e. inland water / aquaculture ponds / fields, not a near-shore pixel the
    coarse polygon might mislabel). None when the coastline dataset is unavailable."""
    import numpy as np  # noqa: PLC0415

    polys = _load_land()
    if not polys or len(lats) == 0:
        return None if not polys else []
    ys = np.asarray(lats, dtype="float64")
    xs = np.asarray(lons, dtype="float64")
    deep = np.zeros(len(xs), dtype=bool)
    for minx, miny, maxx, maxy, outer, holes in polys:
        m = (xs >= minx) & (xs <= maxx) & (ys >= miny) & (ys <= maxy) & ~deep
        if not m.any():
            continue
        idx = np.nonzero(m)[0]
        px, py = xs[idx], ys[idx]
        inside = _in_ring_many(outer, px, py)
        for h in holes:
            if inside.any():
                inside &= ~_in_ring_many(h, px, py)
        if not inside.any():
            continue
        sel = idx[inside]
        dist = _edge_dist_km(outer, xs[sel], ys[sel], near_km)
        deep[sel] = dist > near_km
    return deep.tolist()


def land_many(lats, lons) -> list[bool] | None:
    """Vectorised is_land for many points; None when the coastline dataset is unavailable."""
    import numpy as np  # noqa: PLC0415

    polys = _load_land()
    if not polys:
        return None
    ys = np.asarray(lats, dtype="float64")
    xs = np.asarray(lons, dtype="float64")
    land = np.zeros(len(xs), dtype=bool)
    for minx, miny, maxx, maxy, outer, holes in polys:
        m = (xs >= minx) & (xs <= maxx) & (ys >= miny) & (ys <= maxy) & ~land
        if not m.any():
            continue
        idx = np.nonzero(m)[0]
        inside = _in_ring_many(outer, xs[idx], ys[idx])
        for h in holes:
            if inside.any():
                inside &= ~_in_ring_many(h, xs[idx], ys[idx])
        land[idx[inside]] = True
    return land.tolist()
