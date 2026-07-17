"""Sentinel Hub Process API client — real Sentinel-2 band ingest.

Fetches a small multi-band reflectance array for an AOI in ONE request: the
server mosaics/resamples and returns a float32 GeoTIFF, decoded with tifffile
(pure Python + numpy — no GDAL/rasterio). The 6th channel is SCL (used to mask
cloud/land and to classify the scanned surface).

Requires OAuth2 client credentials (free at dataspace.copernicus.eu → Sentinel
Hub). Without them / without numpy+tifffile the pipeline falls back to synthetic
pixels — this module is imported lazily by download.py. Transient connection
failures are retried so a Wi-Fi/CDSE blip doesn't drop a scan to synthetic.
"""
from __future__ import annotations

import io
import json
import logging
import math
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

from config import settings

logger = logging.getLogger("engine.satellite")

# Bands pulled for FDI + classification (order matters downstream). The 6th
# channel is SCL — the L2A scene-classification layer.
BANDS = ("B04", "B06", "B08", "B8A", "B11", "SCL")

# Sentinel Hub Process API caps a single response at 2500 px/side. We stay under
# that AND bound Processing-Unit cost/latency for large-region sweeps, while
# still giving small drawn AOIs their native ~10-20 m resolution.
_MAX_DIM = 1024
_MIN_DIM = 64
_M_PER_DEG = 111_320.0
# Tile budget for native-resolution stitching — bounds Processing-Unit cost so a
# large region degrades to one coarse request instead of hundreds of tiles.
_MAX_TILES = 9


def _grid_for(bbox: dict, target_m: float) -> tuple[int, int, float]:
    """Pixel grid sized to hit ~target_m ground resolution for this bbox.

    Small AOIs get native resolution; a full ~1.5° region is capped at
    _MAX_DIM so one request never balloons PU cost. Returns (w, h, actual_m).
    """
    mid_lat = (bbox["north"] + bbox["south"]) / 2.0
    w_m = abs(bbox["east"] - bbox["west"]) * _M_PER_DEG * math.cos(math.radians(mid_lat))
    h_m = abs(bbox["north"] - bbox["south"]) * _M_PER_DEG
    width = max(_MIN_DIM, min(_MAX_DIM, round(w_m / target_m)))
    height = max(_MIN_DIM, min(_MAX_DIM, round(h_m / target_m)))
    actual_m = round(max(w_m / width, h_m / height), 1)
    return width, height, actual_m

_EVALSCRIPT = """//VERSION=3
function setup() {
  return {
    input: ["B04", "B06", "B08", "B8A", "B11", "SCL"],
    output: { bands: 6, sampleType: "FLOAT32" }
  };
}
function evaluatePixel(s) {
  return [s.B04, s.B06, s.B08, s.B8A, s.B11, s.SCL];
}
"""


def available() -> bool:
    """True when real pixel ingest is possible (deps + provider + credentials)."""
    try:
        import numpy  # noqa: F401  # noqa: PLC0415
        import tifffile  # noqa: F401  # noqa: PLC0415
    except ImportError:
        return False
    return (
        settings.satellite_provider in {"sentinelhub", "cdse"}
        and bool(settings.sh_client_id and settings.sh_client_secret)
    )


def _read_url(req: urllib.request.Request, timeout: int, attempts: int = 3) -> bytes:
    """urlopen → body bytes, retrying transient connection failures.

    A dropped/refused/reset connection would otherwise fail the whole fetch and
    drop the scan to a synthetic scene. HTTP errors (401 bad creds, 429 quota,
    4xx/5xx) are NOT retried — they are real answers. Small linear backoff."""
    last: Exception | None = None
    for i in range(attempts):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
                return resp.read()
        except urllib.error.HTTPError:
            raise
        except (urllib.error.URLError, OSError) as exc:
            last = exc
            if i < attempts - 1:
                time.sleep(0.6 * (i + 1))
    raise last if last else RuntimeError("urlopen failed")


_TOKEN_CACHE: dict = {"token": None, "exp": 0.0}


def get_token(timeout: int = 15) -> str:
    """OAuth2 client-credentials grant → access token (cached until near expiry).

    Previously re-fetched on every fetch_bands; caching cuts a token round-trip
    per scan and eases load on the CDSE identity endpoint.
    """
    now = time.time()
    if _TOKEN_CACHE["token"] and now < _TOKEN_CACHE["exp"] - 60:
        return _TOKEN_CACHE["token"]
    data = urllib.parse.urlencode({
        "grant_type": "client_credentials",
        "client_id": settings.sh_client_id,
        "client_secret": settings.sh_client_secret,
    }).encode()
    req = urllib.request.Request(
        settings.sh_token_url, data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    resp = json.loads(_read_url(req, timeout).decode())
    _TOKEN_CACHE["token"] = resp["access_token"]
    _TOKEN_CACHE["exp"] = now + float(resp.get("expires_in", 600))
    return _TOKEN_CACHE["token"]


def _process_url() -> str:
    return settings.sh_base_url.rstrip("/") + "/api/v1/process"


def _grid_full(bbox: dict, target_m: float) -> tuple[int, int]:
    """Full (UNcapped) pixel dims to hit target_m — used to decide tiling."""
    mid_lat = (bbox["north"] + bbox["south"]) / 2.0
    w_m = abs(bbox["east"] - bbox["west"]) * _M_PER_DEG * math.cos(math.radians(mid_lat))
    h_m = abs(bbox["north"] - bbox["south"]) * _M_PER_DEG
    return max(_MIN_DIM, round(w_m / target_m)), max(_MIN_DIM, round(h_m / target_m))


def _fetch_one(bbox: dict, width: int, height: int, token: str,
               days_back: int, max_cloud: int, timeout: int):
    """One Process-API request → (H, W, 6) float32 array (5 bands + SCL)."""
    import numpy as np
    import tifffile

    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days_back)
    body = {
        "input": {
            "bounds": {
                "bbox": [bbox["west"], bbox["south"], bbox["east"], bbox["north"]],
                "properties": {"crs": "http://www.opengis.net/def/crs/EPSG/0/4326"},
            },
            "data": [{
                "type": "sentinel-2-l2a",
                "dataFilter": {
                    "timeRange": {"from": start.isoformat().replace("+00:00", "Z"),
                                  "to": end.isoformat().replace("+00:00", "Z")},
                    "maxCloudCoverage": max_cloud,
                    "mosaickingOrder": "leastCC",
                },
            }],
        },
        "output": {
            "width": width, "height": height,
            "responses": [{"identifier": "default", "format": {"type": "image/tiff"}}],
        },
        "evalscript": _EVALSCRIPT,
    }
    req = urllib.request.Request(
        _process_url(), data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {token}",
                 "Content-Type": "application/json", "Accept": "image/tiff"},
        method="POST",
    )
    raw = _read_url(req, timeout)
    arr = tifffile.imread(io.BytesIO(raw))
    arr = np.asarray(arr, dtype="float32")
    if arr.ndim == 2:
        arr = arr[:, :, None]
    if arr.shape[0] == len(BANDS) and arr.shape[-1] != len(BANDS):
        arr = np.moveaxis(arr, 0, -1)
    return arr


def fetch_bands(bbox: dict, width: int | None = None, height: int | None = None,
                target_m: float = 20.0, days_back: int = 30, max_cloud: int = 100,
                timeout: int = 60, max_tiles: int = _MAX_TILES):
    """Return a float32 array (H, W, 6): 5 reflectance bands + SCL.

    Sizes the grid from the AOI to ~target_m ground resolution (default 20 m, near
    Sentinel-2 native). A single Process request caps at _MAX_DIM px/side, so:
      • small AOI  → one native-resolution request,
      • medium AOI → NATIVE-RESOLUTION TILING: split into ≤max_tiles tiles fetched
        at target_m and stitched (true 10-20 m over a larger area),
      • huge region → one capped request (coarser but PU-cheap) rather than an
        explosion of tiles that would blow the CDSE quota.
    Previously a fixed 256×256 over any bbox → ~640 m/px, averaging small rafts away.

    Explicit width/height override all sizing. Raises on any failure; callers fall
    back to synthetic pixels.
    """
    import numpy as np

    token = get_token()
    if width is not None and height is not None:
        return _fetch_one(bbox, width, height, token, days_back, max_cloud, timeout)

    w_full, h_full = _grid_full(bbox, target_m)
    if w_full <= _MAX_DIM and h_full <= _MAX_DIM:
        logger.info("fetch_bands single %sx%s px (~%s m/px)", w_full, h_full, target_m)
        return _fetch_one(bbox, w_full, h_full, token, days_back, max_cloud, timeout)

    nx = math.ceil(w_full / _MAX_DIM)
    ny = math.ceil(h_full / _MAX_DIM)
    if nx * ny > max_tiles:
        # Too many native tiles for the PU budget → one capped (coarser) request.
        cw, ch, actual_m = _grid_for(bbox, target_m)
        logger.info("fetch_bands region needs %dx%d tiles (>%d) → single %sx%s px (~%s m/px, coarse)",
                    nx, ny, max_tiles, cw, ch, actual_m)
        return _fetch_one(bbox, cw, ch, token, days_back, max_cloud, timeout)

    tile_w = math.ceil(w_full / nx)
    tile_h = math.ceil(h_full / ny)
    logger.info("fetch_bands NATIVE tiling %dx%d @ %sx%s px (~%s m/px)", nx, ny, tile_w, tile_h, target_m)
    rows = []
    for r in range(ny):  # north → south
        cols = []
        for c in range(nx):  # west → east
            sub = {
                "north": bbox["north"] - (bbox["north"] - bbox["south"]) * r / ny,
                "south": bbox["north"] - (bbox["north"] - bbox["south"]) * (r + 1) / ny,
                "west":  bbox["west"] + (bbox["east"] - bbox["west"]) * c / nx,
                "east":  bbox["west"] + (bbox["east"] - bbox["west"]) * (c + 1) / nx,
            }
            cols.append(_fetch_one(sub, tile_w, tile_h, token, days_back, max_cloud, timeout))
        rows.append(np.concatenate(cols, axis=1))
    return np.concatenate(rows, axis=0)
