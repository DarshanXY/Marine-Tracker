"""Export a reflectance / FDI array to GeoTIFF (+ world-file georeference).

tifffile is already an ingest dependency (it decodes the Sentinel Hub GeoTIFF),
so this stays dependency-light. Writes the raster as a TIFF plus an ESRI
world-file (.tfw) carrying the bbox georeference — QGIS/ArcGIS read the pair and
place it correctly. (A fully GEO-tagged single-file GeoTIFF would need rasterio;
the .tfw sidecar is the honest zero-extra-dep way to georeference.)
"""
from __future__ import annotations

from pathlib import Path


def export_array(arr, path: str | Path, bbox: dict | None = None) -> Path:
    """Write (H,W) or (H,W,C) float array to `path`; add a .tfw if bbox given."""
    import numpy as np
    import tifffile

    a = np.asarray(arr, dtype="float32")
    path = Path(path)
    tifffile.imwrite(str(path), a)
    if bbox is not None and a.ndim >= 2:
        _write_worldfile(path, bbox, a.shape[1], a.shape[0])
    return path


def _write_worldfile(tif_path: Path, bbox: dict, width: int, height: int) -> None:
    px = (bbox["east"] - bbox["west"]) / max(width, 1)
    py = (bbox["north"] - bbox["south"]) / max(height, 1)
    # ESRI world file rows: x-pixel-size, rot, rot, y-pixel-size(neg), x of
    # centre of top-left pixel, y of centre of top-left pixel.
    lines = [
        f"{px:.10f}", "0.0", "0.0", f"{-py:.10f}",
        f"{bbox['west'] + px / 2:.10f}", f"{bbox['north'] - py / 2:.10f}",
    ]
    tif_path.with_suffix(".tfw").write_text("\n".join(lines) + "\n")
