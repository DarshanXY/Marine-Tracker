"""FastAPI application — the engine's HTTP entry point.

Serves the SAME contract the previous engine served on :8000 (/, /health,
/model/info, /pipeline/run, /pipeline/last, /compute/fdi, /compute/drift,
/satellite/scenes), so the Node backend and React frontend need no change.

Run (from inside python_engine):
    python -m uvicorn api.app:app --host 127.0.0.1 --port 8000
"""
from __future__ import annotations

import os
import threading
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.analysis_route import router as analysis_router
from api.export_route import router as export_router
from api.forecast_route import router as forecast_router
from api.health_route import router as health_router
from api.model_route import router as model_router
from api.predict_route import router as predict_router
from api.similarity_route import router as similarity_router
from api.stream_route import router as stream_router
from api.system_route import router as system_router

app = FastAPI(
    title="Marine Plastic Tracker — Python Engine",
    version="0.3.0",
    description=(
        "Satellite ingest, FDI computation, CNN classification, DBSCAN hotspot "
        "clustering, and Lagrangian drift forecasting for marine plastic."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(predict_router)
app.include_router(model_router)
app.include_router(forecast_router)
app.include_router(analysis_router)
app.include_router(export_router)
app.include_router(similarity_router)
app.include_router(stream_router)
app.include_router(system_router)


@app.on_event("startup")
def _start_embed_drainer() -> None:
    """Always-on hotspot-embedding drainer, tied to the engine lifecycle.

    The engine spools detected-site chips it can't embed (torch-free); if nothing
    drains them, per-site similarity + change-over-time silently stall. This daemon
    thread drains the spool through the Clay SIDECAR (no local Clay load → no GPU
    OOM, no torch), so the capability is never silently off. Quiet when the queue is
    empty or the sidecar is down (retries next tick). Opt-out: EMBED_DRAIN=0."""
    if os.getenv("EMBED_DRAIN", "1").strip().lower() in {"0", "false", "no", "off"}:
        return

    def _loop() -> None:
        from ml import embed_hotspots
        while True:
            try:
                if embed_hotspots._sidecar_up():
                    embed_hotspots.drain_once(embed_hotspots._embed_via_sidecar)
            except Exception:  # noqa: BLE001 — a background drainer must never die
                pass
            time.sleep(60)

    threading.Thread(target=_loop, name="embed-drainer", daemon=True).start()
