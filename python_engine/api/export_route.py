"""Export routes — georeferenced raster of an AOI index layer.

/export/geotiff: fetches the AOI's real reflectance and returns a float32 raster
of the chosen index (FDI/NDVI/FAI) as a TIFF, georeferenced by the request bbox
(echoed in the X-BBox header). QGIS/ArcGIS place it with the bbox as world bounds.
"""
from __future__ import annotations

import io

from fastapi import APIRouter, HTTPException, Response

from satellite import band_loader, cloud_masker
from satellite import spectral_indices as si
from satellite.fdi_calculator import fdi_array
from schemas import GeoTiffRequest

router = APIRouter()


@router.post("/export/geotiff", summary="AOI → georeferenced index raster (FDI/NDVI/FAI)")
def export_geotiff(body: GeoTiffRequest):
    if not band_loader.available():
        raise HTTPException(status_code=503, detail="real ingest not configured (needs Sentinel Hub keys)")
    bbox = body.bbox.model_dump()
    try:
        arr = band_loader.fetch_bands(bbox)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"satellite fetch failed: {exc}")

    import numpy as np
    import tifffile

    bands, _ = cloud_masker.split_scl(arr)
    b04, b06, b08, _b8a, b11 = (bands[..., i] for i in range(5))
    layer = body.layer.lower()
    if layer == "fdi":
        data = fdi_array(b06, b08, b11)
    elif layer == "ndvi":
        data = si.ndvi_array(b04, b08)
    elif layer == "fai":
        data = si.fai_array(b04, b08, b11)
    else:
        raise HTTPException(status_code=400, detail="layer must be 'fdi', 'ndvi' or 'fai'")

    buf = io.BytesIO()
    tifffile.imwrite(buf, np.asarray(data, dtype="float32"))
    w, s, e, n = bbox["west"], bbox["south"], bbox["east"], bbox["north"]
    return Response(
        content=buf.getvalue(), media_type="image/tiff",
        headers={
            "Content-Disposition": f'attachment; filename="{layer}_aoi.tif"',
            "X-BBox": f"{w},{s},{e},{n}",  # world bounds for georeferencing
        },
    )
