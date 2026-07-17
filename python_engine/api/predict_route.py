"""Pipeline, compute, and scene-discovery routes.

Serves POST /pipeline/run, GET /pipeline/last, POST /compute/fdi,
POST /compute/drift, and GET /satellite/scenes — byte-for-byte the same contract
the previous engine served. STAC results are cached (region + bbox) so the polled
UI panels don't trigger a fresh AWS round-trip on every request.

Routes that fetch imagery, hit the network, or run inference are declared `def`,
NOT `async def`: their bodies are synchronous and blocking, so on the event loop
they would freeze this single-worker engine for the whole scan (health checks and
every other endpoint included). As `def`, FastAPI runs them in its threadpool.
Only trivial in-memory handlers stay async.
"""
from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException

import metrics
from cache import TTLCache
from config import settings
from main_pipeline import _forcing_for, run_aoi, run_pipeline
from satellite import download
from satellite.download import REGIONS
from satellite.fdi_calculator import floating_debris_index
from schemas import BatchRunRequest, DriftRequest, FdiRequest, PipelineResult, RunRequest
from trajectory import lagrangian_model
from trajectory.ensemble_model import DEFAULT_WINDAGE

router = APIRouter()

# Most recent pipeline run (served by /pipeline/last).
_last_result: PipelineResult | None = None
# Short-TTL cache so rapid duplicate AOI requests don't re-hit CDSE (a 30s "live"
# poll is > TTL, so it always gets a fresh scan — no staleness).
_aoi_cache = TTLCache(ttl_seconds=20.0, maxsize=64)


@router.post("/pipeline/run", response_model=PipelineResult, summary="Run the detection pipeline")
def pipeline_run(body: RunRequest | None = None) -> PipelineResult:
    global _last_result
    req = body or RunRequest()
    size = max(8, min(req.scene_size, 200))
    opts = dict(min_confidence=req.min_confidence, dedupe=req.dedupe, biofouling=req.biofouling)
    t0 = time.perf_counter()
    if req.bbox is not None:
        b = req.bbox
        key = (f"{round(b.west, 3)},{round(b.south, 3)},{round(b.east, 3)},{round(b.north, 3)}"
               f"|{size}|{req.min_confidence}|{req.dedupe}|{req.biofouling}")
        cached = _aoi_cache.get(key)
        if cached is not None:
            metrics.inc("pipeline.aoi.cache_hit")
            _last_result = cached
            return cached
        _last_result = run_aoi(req.bbox.model_dump(), scene_size=max(size, 48), **opts)
        _aoi_cache.put(key, _last_result)
        metrics.inc("pipeline.aoi")
    else:
        _last_result = run_pipeline(region=req.region, scene_size=size, **opts)
        metrics.inc("pipeline.region")
    metrics.observe("pipeline.run", (time.perf_counter() - t0) * 1000)
    return _last_result


@router.post("/pipeline/batch", summary="Scan several AOIs in one call")
def pipeline_batch(body: BatchRunRequest) -> dict:
    """Run the pipeline for each bbox → a result per AOI. Capped at 12 AOIs/call."""
    if not body.bboxes:
        raise HTTPException(status_code=400, detail="bboxes must be a non-empty list")
    if len(body.bboxes) > 12:
        raise HTTPException(status_code=400, detail="at most 12 AOIs per batch")
    size = max(8, min(body.scene_size, 200))
    opts = dict(min_confidence=body.min_confidence, dedupe=body.dedupe, biofouling=body.biofouling)
    results = [run_aoi(b.model_dump(), scene_size=max(size, 48), **opts) for b in body.bboxes]
    return {"count": len(results), "results": results}


@router.get("/pipeline/last", response_model=PipelineResult, summary="Last pipeline result")
async def pipeline_last() -> PipelineResult:
    if _last_result is None:
        raise HTTPException(status_code=404, detail="No pipeline run yet")
    return _last_result


@router.post("/compute/fdi", summary="Compute FDI for one pixel")
async def compute_fdi(body: FdiRequest) -> dict:
    fdi = floating_debris_index(body.b06, body.b08, body.b11)
    return {"fdi": round(fdi, 5), "isCandidate": fdi > settings.fdi_threshold, "threshold": settings.fdi_threshold}


@router.post("/compute/drift", summary="Compute a drift forecast")
def compute_drift(body: DriftRequest) -> dict:
    horizon = max(6, min(body.horizon_hours, 120))
    forcing = _forcing_for(body.lat, body.lon, horizon)
    points, cone = lagrangian_model.simulate(body.lat, body.lon, horizon, forcing=forcing)
    return {
        "points": points, "cone": cone,
        "windageCoeffs": list(DEFAULT_WINDAGE), "horizonHours": horizon,
        "dataSource": forcing["source"] if forcing else ("demo" if settings.demo_mode else "synthetic"),
    }


# ── Scene discovery (STAC, cached) ────────────────────────────────────────────
_SCENES_CACHE: dict[str, tuple[float, list[dict]]] = {}
_SCENES_TTL = 600.0


def _demo_scenes(codes: list[str]) -> list[dict]:
    now = datetime.now(timezone.utc)
    out: list[dict] = []
    for i, code in enumerate(codes):
        for j in range(2):
            dt = now - timedelta(days=2 + i + j * 3)
            out.append({
                "sceneId": f"S2{'AB'[j % 2]}_MSIL2A_{dt.strftime('%Y%m%dT%H%M%S')}_N0510_R{100 + i}_T{code}DEMO",
                "platform": f"sentinel-2{'ab'[j % 2]}",
                "tile": f"{code}-demo",
                "acquisitionDate": dt.isoformat(),
                "cloudCoverPct": round(1.5 + i * 0.8 + j * 1.1, 1),
                "regionCode": code, "isProcessed": True, "thumbnail": None,
            })
    out.sort(key=lambda s: s["acquisitionDate"], reverse=True)
    return out


def _cached_stac(codes: list[str], days: int) -> list[dict]:
    key = f"{','.join(codes)}|{days}"
    now = time.time()
    hit = _SCENES_CACHE.get(key)
    if hit and now - hit[0] < _SCENES_TTL:
        return hit[1]
    scenes: list[dict] = []
    for code in codes:
        scenes.extend(download.search_scenes(REGIONS[code]["bbox"], code, days_back=days, limit=6))
    scenes.sort(key=lambda s: s["acquisitionDate"], reverse=True)
    _SCENES_CACHE[key] = (now, scenes)
    return scenes


def _parse_bbox(raw: str) -> dict | None:
    try:
        w, s, e, n = (float(x) for x in raw.split(","))
        if s < n and w < e:
            return {"west": w, "south": s, "east": e, "north": n}
    except (ValueError, TypeError):
        pass
    return None


def _cached_stac_bbox(box: dict, days: int) -> list[dict]:
    """STAC search for an arbitrary AOI bbox, cached (~0.05° key) so live polls
    and rescans are instant and never race the backend timeout."""
    key = "bbox|{:.2f},{:.2f},{:.2f},{:.2f}|{}".format(
        box["west"], box["south"], box["east"], box["north"], days,
    )
    now = time.time()
    hit = _SCENES_CACHE.get(key)
    if hit and now - hit[0] < _SCENES_TTL:
        return hit[1]
    scenes = download.search_scenes(box, "AOI", days_back=days, limit=8)
    _SCENES_CACHE[key] = (now, scenes)
    return scenes


@router.get("/satellite/scenes", summary="Recent Sentinel-2 scenes (real STAC or demo)")
def satellite_scenes(region: str | None = None, days: int = 30, bbox: str | None = None) -> dict:
    days = max(1, min(days, 90))

    if bbox:
        box = _parse_bbox(bbox)
        if box is None:
            raise HTTPException(status_code=400, detail="bbox must be 'west,south,east,north'")
        try:
            scenes = _cached_stac_bbox(box, days)
            return {"data": scenes, "meta": {"source": "stac", "provider": settings.satellite_provider, "count": len(scenes)}}
        except Exception as exc:  # noqa: BLE001 — degrade gracefully
            return {"data": _demo_scenes(["AOI"]), "meta": {"source": "demo", "provider": settings.satellite_provider, "error": str(exc)[:200]}}

    codes = [region] if region in REGIONS else list(REGIONS)
    if download.is_live_provider():
        try:
            scenes = _cached_stac(codes, days)
            return {"data": scenes, "meta": {"source": "stac", "provider": settings.satellite_provider, "count": len(scenes)}}
        except Exception as exc:  # noqa: BLE001
            return {"data": _demo_scenes(codes), "meta": {"source": "demo", "provider": settings.satellite_provider, "error": str(exc)[:200]}}

    return {"data": _demo_scenes(codes), "meta": {"source": "demo", "provider": settings.satellite_provider}}
