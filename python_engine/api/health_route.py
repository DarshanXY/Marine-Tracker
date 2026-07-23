"""Health + model-card routes.

`/health` and `/model/info` use snake_case JSON keys (plain BaseModel, not the
camelCase Camel base) — matching the exact shape the Node backend + frontend read
(e.g. `model_loaded`, `model`).

`/health` is `def` (threadpool): it reads the model card off disk and can trigger
the lazy ONNX load, so as `async def` the watchdog's liveness probe would be
blocked by exactly the work it is meant to observe.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter
from pydantic import BaseModel

from config import settings
from ml import clay_live
from ml import inference_engine as infer
from ml import model_loader

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    version: str
    phase: str
    demo_mode: bool
    model_loaded: bool
    model: dict | None = None
    clay: dict | None = None   # 2nd-stage verifier status (on/off, so the UI can show it)
    satellite_provider: str
    satellite_configured: bool
    time: str


@router.get("/", summary="Service info")
async def root() -> dict[str, str]:
    return {
        "name": "Marine Plastic Tracker — Python Engine",
        "version": "0.3.0",
        "docs": "/docs",
        "health": "/health",
    }


@router.get("/health", response_model=HealthResponse, summary="Liveness probe")
def health() -> HealthResponse:
    return HealthResponse(
        status="healthy",
        version="0.3.0",
        phase="Phase 4 — detection pipeline",
        demo_mode=settings.demo_mode,
        model_loaded=infer.model_loaded(),
        model=model_loader.model_info(),
        clay=clay_live.status(),
        satellite_provider=settings.satellite_provider,
        satellite_configured=settings.satellite_configured,
        time=datetime.now(timezone.utc).isoformat(),
    )
