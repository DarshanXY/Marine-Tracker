"""System routes — capabilities discovery + in-process metrics.

/capabilities: a self-describing list of features, endpoints, config and regions
so clients (and humans) can discover what the engine can do.
/metrics: in-process counters + stage timings (GET, JSON, no Prometheus dep).

/capabilities is `def` (threadpool), not `async def`: it probes the Clay sidecar
and the satellite/forcing backends with blocking socket calls, which on the event
loop would stall the whole engine for the probe timeout on every poll.
"""
from __future__ import annotations

from fastapi import APIRouter

import metrics
from config import settings
from ml import clay_live
from ml import inference_engine as infer
from ml import model_loader
from satellite import band_loader
from satellite.download import REGIONS
from trajectory import gridded_forcing

router = APIRouter()


@router.get("/capabilities", summary="Self-describing feature + endpoint list")
def capabilities() -> dict:
    return {
        "version": "0.4.0",
        "engine": "domain-structured (satellite / ml / hotspot / trajectory / analysis / api)",
        "config": {
            "demoMode": settings.demo_mode,
            "provider": settings.satellite_provider,
            "satelliteConfigured": settings.satellite_configured,
            "realIngest": band_loader.available(),
            "modelLoaded": infer.model_loaded(),
            "modelMode": model_loader.input_kind(),
            "griddedForcing": gridded_forcing.available(),
            "clayLive": clay_live.available(),
        },
        "regions": list(REGIONS.keys()),
        "endpoints": {
            "detection": ["POST /pipeline/run", "POST /pipeline/batch", "GET /pipeline/last"],
            "compute": ["POST /compute/fdi", "POST /compute/indices", "POST /compute/drift", "POST /compute/change"],
            "forecast": ["POST /forecast/trajectory", "POST /forecast/backtrack"],
            "model": ["GET /model/info", "GET /model/evaluate"],
            "export": ["POST /export/geotiff"],
            "satellite": ["GET /satellite/scenes"],
            "system": ["GET /health", "GET /capabilities", "GET /metrics"],
        },
        "runOptions": ["minConfidence", "dedupe", "biofouling"],
        "indices": ["FDI", "NDVI", "NDWI", "FAI", "PlasticIndex"],
        "features": {
            "realSatellite": "Sentinel-2 L2A via CDSE Sentinel Hub + AWS Earth Search STAC",
            "surfaceReadout": "SCL water/land/cloud composition per scan",
            "drift": "Lagrangian windage ensemble + Open-Meteo forcing + landfall probability + back-track",
            "changeDetection": "recent-vs-older AOI candidate-density delta",
        },
    }


@router.get("/metrics", summary="In-process counters + stage timings")
async def get_metrics() -> dict:
    return metrics.snapshot()
