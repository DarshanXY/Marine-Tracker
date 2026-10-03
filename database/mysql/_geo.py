"""Dependency-light geospatial helpers (numpy + tifffile + pyshp only — no GDAL / pyproj).

* utm_to_lonlat        Krüger-series inverse Transverse Mercator (WGS84), sub-millimetre accuracy.
* geotiff_footprint    read a GeoTIFF's georeferencing header only (no pixel decode) -> lon/lat bbox.
* shape_to_geojson     pyshp shape -> GeoJSON dict, optionally reprojecting UTM -> lon/lat.
"""
from __future__ import annotations

import math
import re
from pathlib import Path

import numpy as np
import tifffile

_A = 6378137.0
_F = 1 / 298.257223563
_K0 = 0.9996
_N = _F / (2 - _F)
_AA = _A / (1 + _N) * (1 + _N**2 / 4 + _N**4 / 64)
_BETA = (
    _N / 2 - 2 * _N**2 / 3 + 37 * _N**3 / 96,
    _N**2 / 48 + _N**3 / 15,
    17 * _N**3 / 480,
)
_DELTA = (
    2 * _N - 2 * _N**2 / 3 - 2 * _N**3,
    7 * _N**2 / 3 - 8 * _N**3 / 5,
    56 * _N**3 / 15,
)


def utm_to_lonlat(easting, northing, zone: int, south: bool):
    """UTM (WGS84) -> (lon, lat) degrees. Accepts scalars or numpy arrays."""
    e = np.asarray(easting, dtype="float64")
    n = np.asarray(northing, dtype="float64")
    n0 = 10_000_000.0 if south else 0.0
    xi = (n - n0) / (_K0 * _AA)
    eta = (e - 500_000.0) / (_K0 * _AA)
    xi_p, eta_p = xi.copy(), eta.copy()
    for j, b in enumerate(_BETA, start=1):
        xi_p = xi_p - b * np.sin(2 * j * xi) * np.cosh(2 * j * eta)
        eta_p = eta_p - b * np.cos(2 * j * xi) * np.sinh(2 * j * eta)
    chi = np.arcsin(np.sin(xi_p) / np.cosh(eta_p))
    lat = chi.copy()
    for j, d in enumerate(_DELTA, start=1):
        lat = lat + d * np.sin(2 * j * chi)
    lon0 = math.radians(zone * 6 - 183)
    lon = lon0 + np.arctan2(np.sinh(eta_p), np.cos(xi_p))
    return np.degrees(lon), np.degrees(lat)


def utm_from_epsg(epsg: int) -> tuple[int, bool] | None:
    """EPSG 326zz (north) / 327zz (south) -> (zone, south). None for anything else."""
    if 32601 <= epsg <= 32660:
        return epsg - 32600, False
    if 32701 <= epsg <= 32760:
        return epsg - 32700, True
    return None


def utm_from_prj(prj_text: str) -> tuple[int, bool] | None:
    """ESRI .prj text 'WGS_1984_UTM_Zone_35N' -> (35, False)."""
    m = re.search(r"UTM_Zone_(\d+)([NS])", prj_text)
    return (int(m.group(1)), m.group(2) == "S") if m else None


def _geokey(tags, key_id: int):
    d = tags.get("GeoKeyDirectoryTag")
    if d is None:
        return None
    v = d.value
    for i in range(4, len(v), 4):
        if v[i] == key_id:
            return v[i + 3]
    return None


def geotiff_footprint(path: Path) -> dict | None:
    """Header-only read -> {epsg, width, height, min_lon, max_lon, min_lat, max_lat, lon, lat}.
    Supports UTM (326xx/327xx) and EPSG:4326 with tiepoint+scale or a transformation matrix."""
    with tifffile.TiffFile(str(path)) as t:
        pg = t.pages[0]
        tags = pg.tags
        h, w = pg.shape[0], pg.shape[1]
        if "ModelTransformationTag" in tags:
            m = tags["ModelTransformationTag"].value
            a, b, x0, c, d, y0 = m[0], m[1], m[3], m[4], m[5], m[7]
        elif "ModelTiepointTag" in tags and "ModelPixelScaleTag" in tags:
            tp, sc = tags["ModelTiepointTag"].value, tags["ModelPixelScaleTag"].value
            a, b, x0 = sc[0], 0.0, tp[3] - tp[0] * sc[0]
            c, d, y0 = 0.0, -sc[1], tp[4] + tp[1] * sc[1]
        else:
            return None
        epsg = _geokey(tags, 3072) or _geokey(tags, 2048)   # projected, else geographic
    xs = np.array([x0, x0 + a * w, x0, x0 + a * w, x0 + a * w / 2])
    ys = np.array([y0, y0 + c * w, y0 + d * h, y0 + c * w + d * h, y0 + c * w / 2 + d * h / 2])
    if epsg == 4326:
        lon, lat = xs, ys
    else:
        u = utm_from_epsg(int(epsg)) if epsg else None
        if not u:
            return None
        lon, lat = utm_to_lonlat(xs, ys, u[0], u[1])
    return {
        "epsg": int(epsg) if epsg else None,
        "width": int(w),
        "height": int(h),
        "min_lon": float(lon[:4].min()),
        "max_lon": float(lon[:4].max()),
        "min_lat": float(lat[:4].min()),
        "max_lat": float(lat[:4].max()),
        "lon": float(lon[4]),
        "lat": float(lat[4]),
    }


# ─── vector geometry ──────────────────────────────────────────────────────────
def _ring_area(ring: list) -> float:
    a = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        a += x1 * y2 - x2 * y1
    return abs(a) / 2.0


def shape_area_m2(gj: dict) -> float:
    """Planar area of a Polygon/MultiPolygon GeoJSON dict (call BEFORE reprojecting UTM meters)."""
    polys = [gj["coordinates"]] if gj["type"] == "Polygon" else gj["coordinates"]
    total = 0.0
    for rings in polys:
        total += _ring_area([tuple(p[:2]) for p in rings[0]]) - sum(_ring_area([tuple(p[:2]) for p in r]) for r in rings[1:])
    return total


def _clamp_lonlat(lon, lat):
    # MySQL geographic SRS accepts lon in (-180, 180]; nudge exact -180 / lat ±90 inside.
    return np.clip(lon, -179.999999, 180.0), np.clip(lat, -89.999999, 89.999999)


def reproject_geojson(gj: dict, zone: int, south: bool) -> dict:
    """UTM meters -> lon/lat degrees, vertex by vertex."""

    def conv(ring):
        arr = np.asarray(ring, dtype="float64")
        lon, lat = utm_to_lonlat(arr[:, 0], arr[:, 1], zone, south)
        lon, lat = _clamp_lonlat(lon, lat)
        return np.stack([np.round(lon, 7), np.round(lat, 7)], axis=1).tolist()

    if gj["type"] == "Polygon":
        return {"type": "Polygon", "coordinates": [conv(r) for r in gj["coordinates"]]}
    return {"type": "MultiPolygon", "coordinates": [[conv(r) for r in poly] for poly in gj["coordinates"]]}


def clamp_geojson(gj: dict) -> dict:
    """Clamp already-geographic coordinates into MySQL's valid range (no reprojection)."""

    def conv(ring):
        arr = np.asarray(ring, dtype="float64")[:, :2]
        lon, lat = _clamp_lonlat(arr[:, 0], arr[:, 1])
        return np.stack([lon, lat], axis=1).tolist()

    if gj["type"] == "Polygon":
        return {"type": "Polygon", "coordinates": [conv(r) for r in gj["coordinates"]]}
    return {"type": "MultiPolygon", "coordinates": [[conv(r) for r in poly] for poly in gj["coordinates"]]}


def geojson_bounds(gj: dict) -> tuple[float, float, float, float, float, float]:
    """-> (min_lon, min_lat, max_lon, max_lat, centre_lon, centre_lat) of bounding box."""
    polys = [gj["coordinates"]] if gj["type"] == "Polygon" else gj["coordinates"]
    pts = np.concatenate([np.asarray(r, dtype="float64")[:, :2] for poly in polys for r in poly[:1]])
    mn, mx = pts.min(axis=0), pts.max(axis=0)
    return float(mn[0]), float(mn[1]), float(mx[0]), float(mx[1]), float((mn[0] + mx[0]) / 2), float((mn[1] + mx[1]) / 2)
