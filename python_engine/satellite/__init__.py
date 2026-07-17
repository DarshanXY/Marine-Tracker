"""Satellite ingest: scene discovery, band download, SCL masking, FDI, patches.

Pipeline of this package:
    download.scene_for(_bbox)  →  band_loader.fetch_bands  →  cloud_masker.split_scl
    →  threshold_applier.extract_candidates (FDI > threshold ∧ SCL keep-mask)
Everything is stdlib + numpy/tifffile only (no GDAL/rasterio).
"""
