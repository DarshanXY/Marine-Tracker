"""Coastline reference for landfall ETA.

Provides the coastline longitude the ETA calculator crosses, per monitored
region (None = open ocean). For an arbitrary AOI the pipeline uses the AOI's
eastern edge instead. Region metadata is sourced from the satellite registry so
there's a single source of truth for the monitored areas.
"""
from __future__ import annotations

from satellite.download import REGIONS


def coast_lon_for(region_code: str) -> float | None:
    r = REGIONS.get(region_code)
    return r["coast_lon"] if r else None


def nearest_coast_lon(lat: float, lon: float) -> float | None:
    """Coastline longitude of the nearest monitored region.

    Used for on-demand forecasts at an ARBITRARY point (a map click or a hotspot
    that carries no region code) so the landfall ETA is real instead of null.
    Picks the region whose centre is closest to the point and returns its coast.
    """
    best: float | None = None
    best_d = float("inf")
    for r in REGIONS.values():
        cl = r.get("coast_lon")
        if cl is None:
            continue
        d = (lat - r["lat"]) ** 2 + (lon - r["lon"]) ** 2
        if d < best_d:
            best_d, best = d, cl
    return best
