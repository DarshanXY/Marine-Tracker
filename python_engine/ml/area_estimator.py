"""Detection area estimate — honest physical footprint of flagged pixels.

Each detection is a single ~10 m Sentinel-2 grid cell, so its footprint is one
pixel = 100 m² = 0.0001 km². Summed over detections this gives the footprint of
the flagged pixels — indicative (candidates are spatially sub-sampled), and never
a measured slick area.

NOTE: an earlier `area_from_fdi(fdi)` returned 0.08–0.9 km² *per single pixel* as
a magnitude proxy — i.e. it over-reported per-pixel footprint by ~1000× and that
value flowed into dashboard sums and CSV/PDF exports. It has been removed; all
area now derives from real pixel counts via `area_from_pixels`.
"""
from __future__ import annotations

PIXEL_M = 10.0  # Sentinel-2 working resolution (Clay GSD + FDI grid)


def area_from_pixels(n_pixels: int, pixel_m: float = PIXEL_M) -> float:
    """Honest physical area (km²) = n × (pixel_m)² / 1e6."""
    return round(n_pixels * (pixel_m * pixel_m) / 1_000_000.0, 6)


def pixel_area_km2(pixel_m: float = PIXEL_M) -> float:
    """Footprint of a single grid cell in km² (0.0001 for a 10 m pixel)."""
    return area_from_pixels(1, pixel_m)
