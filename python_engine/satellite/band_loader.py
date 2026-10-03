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
import threading
import time
import urllib.error
from concurrent.futures import ThreadPoolExecutor
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

# Wall-clock budget for one fetch_bands call. The backend gives the whole AOI
# run 120 s; on a slow link (<1 Mbit/s) a native-resolution 0.3° AOI (~20 MB)
# blew straight past that and the UI sat on "processing…" until it gave up.
# Resolution is now planned from measured bandwidth so the pull fits the budget.
_FETCH_BUDGET_S = 60.0
_ASSUMED_BPS = 400_000.0            # until a real transfer has been measured
_BYTES_PER_PX = 6 * 2 * 0.75        # 6 UINT16 channels, ~0.75 TIFF compression
_BPS: dict = {"ewma": None}         # measured download throughput (bytes/s)


class FetchBudgetExceeded(RuntimeError):
    """The fetch ran past its wall-clock deadline (not retried)."""


class _Meter:
    """Aggregate bytes/s across the (parallel) requests of one fetch."""

    def __init__(self) -> None:
        self.t0 = time.monotonic()
        self.bytes = 0
        self._lock = threading.Lock()

    def add(self, n: int) -> None:
        with self._lock:
            self.bytes += n

    def bps(self) -> float | None:
        dt = time.monotonic() - self.t0
        return self.bytes / dt if self.bytes > 256_000 and dt > 0.5 else None

    def record(self) -> None:
        bps = self.bps()
        if bps:
            prev = _BPS["ewma"]
            _BPS["ewma"] = bps if prev is None else 0.5 * prev + 0.5 * bps


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

# UINT16 reflectance ×10000 (the L2A DN scale, so lossless) instead of FLOAT32:
# roughly a third fewer bytes on the wire. Decoded back to 0-1 in _fetch_one.
_REFL_SCALE = 10000.0
_EVALSCRIPT = """//VERSION=3
function setup() {
  return {
    input: ["B04", "B06", "B08", "B8A", "B11", "SCL"],
    output: { bands: 6, sampleType: "UINT16" }
  };
}
function evaluatePixel(s) {
  return [s.B04 * 10000, s.B06 * 10000, s.B08 * 10000, s.B8A * 10000, s.B11 * 10000, s.SCL];
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


def _read_url(req: urllib.request.Request, timeout: float, attempts: int = 3,
              deadline: float | None = None, meter: _Meter | None = None) -> bytes:
    """urlopen → body bytes, retrying transient connection failures.

    A dropped/refused/reset connection would otherwise fail the whole fetch and
    drop the scan to a synthetic scene. HTTP errors (401 bad creds, 429 quota,
    4xx/5xx) are NOT retried — they are real answers. Small linear backoff.
    With a `deadline` (time.monotonic()) the body is streamed in chunks and the
    read aborts with FetchBudgetExceeded once past it; `meter` counts the bytes."""
    last: Exception | None = None
    for i in range(attempts):
        if deadline is not None and time.monotonic() >= deadline:
            raise FetchBudgetExceeded("fetch deadline reached")
        t = timeout if deadline is None else max(1.0, min(timeout, deadline - time.monotonic()))
        try:
            with urllib.request.urlopen(req, timeout=t) as resp:  # noqa: S310
                if deadline is None and meter is None:
                    return resp.read()
                chunks = []
                while True:
                    if deadline is not None and time.monotonic() >= deadline:
                        raise FetchBudgetExceeded("fetch deadline reached mid-download")
                    b = resp.read(65536)
                    if not b:
                        return b"".join(chunks)
                    chunks.append(b)
                    if meter is not None:
                        meter.add(len(b))
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
               days_back: int, max_cloud: int, timeout: float,
               deadline: float | None = None, meter: _Meter | None = None):
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
    raw = _read_url(req, timeout, deadline=deadline, meter=meter)
    arr = tifffile.imread(io.BytesIO(raw))
    arr = np.asarray(arr, dtype="float32")
    if arr.ndim == 2:
        arr = arr[:, :, None]
    if arr.shape[0] == len(BANDS) and arr.shape[-1] != len(BANDS):
        arr = np.moveaxis(arr, 0, -1)
    arr[..., :len(BANDS) - 1] /= _REFL_SCALE  # UINT16 DN → reflectance; SCL stays a class id
    return arr


def _plan(bbox: dict, target_m: float, max_tiles: int) -> tuple[int, int, int, int, float]:
    """(nx, ny, tile_w, tile_h, actual_m) for fetching bbox at ~target_m."""
    w_full, h_full = _grid_full(bbox, target_m)
    if w_full <= _MAX_DIM and h_full <= _MAX_DIM:
        return 1, 1, w_full, h_full, target_m
    nx, ny = math.ceil(w_full / _MAX_DIM), math.ceil(h_full / _MAX_DIM)
    if nx * ny > max_tiles:
        # Too many native tiles for the PU budget → one capped (coarser) request.
        cw, ch, actual_m = _grid_for(bbox, target_m)
        return 1, 1, cw, ch, actual_m
    return nx, ny, math.ceil(w_full / nx), math.ceil(h_full / ny), target_m


def _fit_resolution(bbox: dict, target_m: float, max_tiles: int,
                    seconds: float, bps: float) -> float:
    """Coarsest-necessary ground resolution whose download fits `seconds` at `bps`."""
    m = target_m
    seconds = max(seconds, 1.0)
    for _ in range(10):
        nx, ny, tw, th, _ = _plan(bbox, m, max_tiles)
        est = nx * ny * tw * th * _BYTES_PER_PX / bps
        if est <= seconds:
            break
        m *= max(1.15, math.sqrt(est / seconds))
    return m


def _fetch_plan(bbox: dict, target_m: float, max_tiles: int, token: str,
                days_back: int, max_cloud: int, timeout: float, deadline: float):
    """Fetch bbox at ~target_m (tiles in parallel, stitched) before `deadline`."""
    import numpy as np

    nx, ny, tw, th, actual_m = _plan(bbox, target_m, max_tiles)
    logger.info("fetch_bands %dx%d tile(s) @ %sx%s px (~%s m/px)", nx, ny, tw, th, round(actual_m, 1))
    meter = _Meter()
    subs = [{
        "north": bbox["north"] - (bbox["north"] - bbox["south"]) * r / ny,
        "south": bbox["north"] - (bbox["north"] - bbox["south"]) * (r + 1) / ny,
        "west":  bbox["west"] + (bbox["east"] - bbox["west"]) * c / nx,
        "east":  bbox["west"] + (bbox["east"] - bbox["west"]) * (c + 1) / nx,
    } for r in range(ny) for c in range(nx)]  # north → south, west → east
    try:
        with ThreadPoolExecutor(max_workers=min(4, len(subs))) as ex:
            tiles = list(ex.map(lambda s: _fetch_one(s, tw, th, token, days_back, max_cloud,
                                                     timeout, deadline, meter), subs))
    finally:
        meter.record()
    rows = [np.concatenate(tiles[r * nx:(r + 1) * nx], axis=1) for r in range(ny)]
    return np.concatenate(rows, axis=0)


def fetch_bands(bbox: dict, width: int | None = None, height: int | None = None,
                target_m: float = 20.0, days_back: int = 30, max_cloud: int = 50,
                timeout: int = 60, max_tiles: int = _MAX_TILES,
                budget_s: float = _FETCH_BUDGET_S):
    """Return a float32 array (H, W, 6): 5 reflectance bands + SCL.

    Sizes the grid from the AOI to ~target_m ground resolution (default 20 m, near
    Sentinel-2 native). A single Process request caps at _MAX_DIM px/side, so:
      • small AOI  → one native-resolution request,
      • medium AOI → NATIVE-RESOLUTION TILING: split into ≤max_tiles tiles fetched
        (in parallel) at target_m and stitched (true 10-20 m over a larger area),
      • huge region → one capped request (coarser but PU-cheap) rather than an
        explosion of tiles that would blow the CDSE quota.
    Previously a fixed 256×256 over any bbox → ~640 m/px, averaging small rafts away.

    BANDWIDTH-AWARE: the whole pull must land within budget_s. Resolution is
    coarsened up front if the measured link speed can't carry native pixels in
    time; if the first attempt still overruns its share, it is abandoned and
    re-planned from the throughput it actually saw, within the remaining budget.

    Explicit width/height override all sizing. Raises on any failure; callers fall
    back to synthetic pixels.
    """
    token = get_token()
    if width is not None and height is not None:
        return _fetch_one(bbox, width, height, token, days_back, max_cloud, timeout)

    start = time.monotonic()
    end = start + budget_s
    bps = _BPS["ewma"] or _ASSUMED_BPS
    first_share = 0.55 * budget_s  # leave room for a coarser retry
    m = _fit_resolution(bbox, target_m, max_tiles, first_share, bps)
    if m > target_m * 1.01:
        logger.info("fetch_bands: link ~%.2f MB/s → ~%.0f m/px (native %s m) to fit %.0fs",
                    bps / 1e6, m, target_m, first_share)
    try:
        return _fetch_plan(bbox, m, max_tiles, token, days_back, max_cloud, timeout,
                           start + first_share)
    except FetchBudgetExceeded:
        remaining = end - time.monotonic()
        if remaining < 8.0:
            # A DNS stall isn't bounded by the socket timeout, so the first try
            # can eat the whole budget — no time left for a retry.
            raise
        bps = _BPS["ewma"] or bps
        m2 = max(m * 1.5, _fit_resolution(bbox, m, max_tiles, 0.85 * remaining, bps))
        logger.warning("fetch_bands overran %.0fs at ~%.0f m/px (link ~%.2f MB/s) → retry at ~%.0f m/px",
                       first_share, m, bps / 1e6, m2)
        return _fetch_plan(bbox, m2, max_tiles, token, days_back, max_cloud, timeout, end)
