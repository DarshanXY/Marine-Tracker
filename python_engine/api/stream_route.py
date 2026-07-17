"""Live-scan SSE — stream real pipeline stage events as an AOI scan runs.

GET /pipeline/stream?north=&south=&east=&west=&scene_size= emits Server-Sent
Events, one per pipeline stage (DOWNLOAD → FDI → CNN → DBSCAN → DRIFT → ALERT)
plus a final result event, so the UI can show a live progress tracker instead of
waiting for one opaque response. Each event's timing is the genuine per-stage work
(run_aoi_events reuses the same stage helpers as run_aoi).
"""
from __future__ import annotations

import json

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

import main_pipeline

router = APIRouter()


@router.get("/pipeline/stream", summary="Live-scan SSE — per-stage progress for an AOI")
async def pipeline_stream(
    north: float, south: float, east: float, west: float,
    scene_size: int = Query(64, ge=8, le=256),
) -> StreamingResponse:
    bbox = {"north": north, "south": south, "east": east, "west": west}

    def gen():
        yield f"data: {json.dumps({'type': 'start', 'bbox': bbox})}\n\n"
        try:
            for event in main_pipeline.run_aoi_events(bbox, scene_size):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as exc:  # noqa: BLE001 — surface a clean error event
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)[:160]})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
