"""Analysis routes — full spectral indices + AOI change detection.

/compute/indices: FDI/NDVI/NDWI/FAI/Plastic-Index for one pixel's bands.
/compute/change: is an AOI's debris density increasing vs an older window?
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from analysis import change_detection
from satellite import spectral_indices as si
from schemas import ChangeRequest, IndicesRequest

router = APIRouter()


@router.post("/compute/indices", summary="FDI/NDVI/NDWI/FAI/Plastic-Index for one pixel")
async def compute_indices(body: IndicesRequest) -> dict:
    return si.all_indices(body.b04, body.b06, body.b08, body.b11, b03=body.b03, b8a=body.b8a)


@router.post("/compute/change", summary="AOI change detection (recent vs older window)")
def compute_change(body: ChangeRequest) -> dict:
    try:
        res = change_detection.compare(body.bbox.model_dump(), body.days_recent, body.days_old)
    except Exception as exc:  # noqa: BLE001 — satellite fetch may fail
        raise HTTPException(status_code=502, detail=f"change detection failed: {exc}")
    if not res.get("available"):
        raise HTTPException(status_code=503, detail=res.get("reason", "change detection unavailable"))
    return res
