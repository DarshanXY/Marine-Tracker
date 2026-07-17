"""Scene discovery + ingest orchestration.

Two real sources, one synthetic fallback:
  * search_scenes()      — real Sentinel-2 L2A metadata via AWS Earth Search STAC
                           (no key, stdlib urllib).
  * scene_for(_bbox)()   — REAL reflectance via band_loader (Sentinel Hub, OAuth)
                           when configured, else a dynamic synthetic scene.

`scene_for*` returns a SceneData with pixels + arr6 + the per-scan SCL surface and
mask. Everything is returned (no module globals), so a synthetic fallback can
never report a previous scan's surface — the fix for the "land shows 88% water"
staleness bug.
"""
from __future__ import annotations

import json
import os
import random
import urllib.error  # noqa: F401  (re-exported for callers that catch URLError)
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from config import settings
from logger import get_logger

from . import band_loader, cloud_masker, landmask, threshold_applier
from .fdi_calculator import SLOPE

log = get_logger("satellite")

DEFAULT_STAC_URL = "https://earth-search.aws.element84.com/v1"

# code → region metadata. coast_lon = nearest coastline longitude for a rough
# landfall ETA (None = open ocean). bbox = {north,south,east,west} for scene search.
REGIONS: dict[str, dict] = {
    "MUM": {"name": "Mumbai Coast",            "lat": 19.076, "lon": 72.877, "coast_lon": 72.95, "bbox": {"north": 20.0, "south": 18.5, "east": 73.5, "west": 72.0}},
    "GOA": {"name": "Goa Coastline",           "lat": 15.299, "lon": 74.124, "coast_lon": 74.20, "bbox": {"north": 15.8, "south": 14.8, "east": 74.5, "west": 73.7}},
    "KCH": {"name": "Kochi – Arabian Sea",     "lat": 9.9312, "lon": 76.267, "coast_lon": 76.35, "bbox": {"north": 10.5, "south": 9.3, "east": 76.8, "west": 75.8}},
    "CHN": {"name": "Chennai – Bay of Bengal", "lat": 13.082, "lon": 80.270, "coast_lon": 80.35, "bbox": {"north": 13.8, "south": 12.4, "east": 81.0, "west": 79.5}},
    "AND": {"name": "Andaman & Nicobar Sea",   "lat": 11.740, "lon": 92.658, "coast_lon": None,  "bbox": {"north": 13.7, "south": 6.8, "east": 94.2, "west": 92.0}},
}


@dataclass
class SceneData:
    """Result of one ingest — carries its OWN surface/mask (no shared globals)."""
    pixels: list[dict]
    source: str                 # 'sentinelhub' | 'demo'
    arr6: object | None         # (H,W,6) [bands+FDI] for patch extraction, or None
    surface: dict | None        # water/land/cloud composition (real fetch only)
    mask: dict | None           # {valid_pct, masked_pct} (real fetch only)
    error: str | None           # why we fell back to synthetic, if we did


# ── Real scene discovery (STAC, keyless) ──────────────────────────────────────
def _post(url: str, body: dict, timeout: int = 15) -> dict:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url, data=data,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
        return json.loads(resp.read().decode("utf-8"))


def is_live_provider() -> bool:
    """True when configured to use a real scene source."""
    return settings.satellite_provider in {"aws-stac", "cdse", "sentinelhub"}


def search_scenes(bbox: dict, region_code: str, days_back: int = 30, limit: int = 8) -> list[dict]:
    """Real Sentinel-2 L2A scenes over a bbox in the last `days_back` days.
    Raises on network/parse failure — callers decide the fallback."""
    url = os.getenv("AWS_STAC_URL", DEFAULT_STAC_URL).rstrip("/") + "/search"
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days_back)
    result = _post(url, {
        "collections": ["sentinel-2-l2a"],
        "bbox": [bbox["west"], bbox["south"], bbox["east"], bbox["north"]],
        "datetime": f"{start.isoformat()}/{end.isoformat()}",
        "limit": limit,
    })
    scenes: list[dict] = []
    for f in result.get("features", []):
        props = f.get("properties", {})
        thumb = f.get("assets", {}).get("thumbnail") or f.get("assets", {}).get("overview") or {}
        scenes.append({
            "sceneId": f.get("id", ""),
            "platform": props.get("platform", "sentinel-2"),
            "tile": props.get("grid:code") or props.get("s2:mgrs_tile") or props.get("mgrs:utm_zone", ""),
            "acquisitionDate": props.get("datetime", ""),
            "cloudCoverPct": round(float(props.get("eo:cloud_cover", 0.0) or 0.0), 1),
            "regionCode": region_code,
            "isProcessed": True,
            "thumbnail": thumb.get("href"),
            "bbox": f.get("bbox"),  # [w,s,e,n] footprint for the map overlay
        })
    scenes.sort(key=lambda s: s["acquisitionDate"], reverse=True)
    return scenes


def scene_ref_for_bbox(bbox: dict) -> dict | None:
    """Newest real Sentinel-2 scene covering an AOI (dict) or None on failure."""
    try:
        scenes = search_scenes(bbox, "AOI", days_back=45, limit=1)
        return scenes[0] if scenes else None
    except Exception:  # noqa: BLE001 — real-scene metadata is best-effort
        return None


# ── Synthetic fallback scene (deterministic, dynamic per selection) ───────────
def _baseline(b06: float, b11: float) -> float:
    return b06 + (b11 - b06) * SLOPE * 10.0


def _debris_pixel(rng: random.Random, lat: float, lon: float) -> dict:
    b06 = 0.10 + rng.uniform(-0.02, 0.02)
    b11 = 0.06 + rng.uniform(-0.01, 0.01)
    b08 = _baseline(b06, b11) + rng.uniform(0.032, 0.070)  # strong positive FDI
    b04 = 0.05 + rng.uniform(-0.01, 0.02)
    return {"lat": round(lat, 5), "lon": round(lon, 5),
            "bands": {"B04": b04, "B06": b06, "B08": b08, "B8A": b08 * 0.95, "B11": b11}}


def _noise_pixel(rng: random.Random, lat: float, lon: float) -> dict:
    kind = rng.random()
    b06 = 0.10 + rng.uniform(-0.02, 0.02)
    b11 = 0.06 + rng.uniform(-0.01, 0.01)
    base = _baseline(b06, b11)
    if kind < 0.20:            # algae — high NDVI
        b08 = base + rng.uniform(0.01, 0.03)
        b04 = 0.02 + rng.uniform(0.0, 0.01)
    elif kind < 0.35:          # sea foam — bright, weak FDI
        b06 = 0.16 + rng.uniform(-0.02, 0.02)
        b11 = 0.14 + rng.uniform(-0.02, 0.02)
        b08 = _baseline(b06, b11) + rng.uniform(-0.005, 0.012)
        b04 = 0.14 + rng.uniform(-0.02, 0.02)
    elif kind < 0.50:          # scattered debris (noise-level)
        b08 = base + rng.uniform(0.028, 0.05)
        b04 = 0.05 + rng.uniform(-0.01, 0.02)
    else:                      # open water
        b08 = base + rng.uniform(-0.012, 0.010)
        b04 = 0.03 + rng.uniform(-0.01, 0.01)
    return {"lat": round(lat, 5), "lon": round(lon, 5),
            "bands": {"B04": b04, "B06": b06, "B08": b08, "B8A": b08 * 0.95, "B11": b11}}


def _synthetic_region(region_code: str, size: int = 48) -> list[dict]:
    r = REGIONS[region_code]
    rng = random.Random(sum(ord(c) for c in region_code) * 7 + size)
    pixels: list[dict] = []
    for _ in range(2):  # two dense debris clusters → MEDIUM/HIGH hotspots
        c_lat = r["lat"] + rng.uniform(-0.20, 0.20)
        c_lon = r["lon"] + rng.uniform(-0.20, 0.20)
        for _ in range(rng.randint(6, 14)):
            pixels.append(_debris_pixel(rng, c_lat + rng.uniform(-0.03, 0.03), c_lon + rng.uniform(-0.03, 0.03)))
    for _ in range(size):
        pixels.append(_noise_pixel(rng, r["lat"] + rng.uniform(-0.32, 0.32), r["lon"] + rng.uniform(-0.32, 0.32)))
    return pixels


def _synthetic_bbox(bbox: dict, size: int = 48) -> list[dict]:
    north, south = float(bbox["north"]), float(bbox["south"])
    east, west = float(bbox["east"]), float(bbox["west"])
    lat_span = max(1e-4, north - south)
    lon_span = max(1e-4, east - west)
    rng = random.Random(int((abs(north) + abs(south) + abs(east) + abs(west)) * 1000) * 13 + size)
    pixels: list[dict] = []
    n_clusters = 1 + min(2, int(lat_span * lon_span * 60))
    for _ in range(n_clusters):
        c_lat = south + (0.15 + 0.70 * rng.random()) * lat_span
        c_lon = west + (0.15 + 0.70 * rng.random()) * lon_span
        sl, so = min(0.03, lat_span * 0.12), min(0.03, lon_span * 0.12)
        for _ in range(rng.randint(6, 14)):
            pixels.append(_debris_pixel(rng, c_lat + rng.uniform(-sl, sl), c_lon + rng.uniform(-so, so)))
    for _ in range(size):
        pixels.append(_noise_pixel(rng, south + rng.random() * lat_span, west + rng.random() * lon_span))
    return pixels


# ── Ingest orchestration ──────────────────────────────────────────────────────
def _real_ingest(bbox: dict, max_candidates: int = 500) -> SceneData:
    """Fetch → split SCL → surface/mask → candidacy. Raises on any failure."""
    arr = band_loader.fetch_bands(bbox)
    bands, scl = cloud_masker.split_scl(arr)
    surface = cloud_masker.surface_from_scl(scl) if scl is not None else None
    mask = cloud_masker.mask_stats(scl) if scl is not None else None
    pixels, arr6 = threshold_applier.extract_candidates(
        bands, bbox, settings.fdi_threshold, max_candidates, scl=scl,
    )
    return SceneData(pixels=pixels, source="sentinelhub", arr6=arr6, surface=surface, mask=mask, error=None)


def _geo_surface(bbox: dict) -> dict | None:
    """Keyless terrain-elevation land/water estimate for the synthetic fallback, so
    the surface readout works for ANY area even when the real scene can't be fetched."""
    try:
        return landmask.estimate_surface(bbox)
    except Exception:  # noqa: BLE001 — best-effort; no estimate is fine
        return None


def scene_for(region_code: str, scene_size: int = 48) -> SceneData:
    """Region ingest → SceneData (real Sentinel Hub when configured, else synthetic)."""
    bbox = REGIONS[region_code]["bbox"]
    if band_loader.available():
        try:
            return _real_ingest(bbox)
        except Exception as exc:  # noqa: BLE001 — degrade to synthetic
            log.warning("real ingest failed for %s: %s", region_code, exc)
            return SceneData(_synthetic_region(region_code, scene_size), "demo", None, _geo_surface(bbox), None, str(exc)[:200])
    return SceneData(_synthetic_region(region_code, scene_size), "demo", None, _geo_surface(bbox), None, None)


def scene_for_bbox(bbox: dict, scene_size: int = 48) -> SceneData:
    """AOI ingest → SceneData for a user-drawn bbox."""
    if band_loader.available():
        try:
            return _real_ingest(bbox)
        except Exception as exc:  # noqa: BLE001 — degrade to synthetic
            log.warning("real AOI ingest failed: %s", exc)
            return SceneData(_synthetic_bbox(bbox, scene_size), "demo", None, _geo_surface(bbox), None, str(exc)[:200])
    return SceneData(_synthetic_bbox(bbox, scene_size), "demo", None, _geo_surface(bbox), None, None)
