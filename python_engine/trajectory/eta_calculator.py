"""Coastal landfall ETA from a drift path.

`coast_eta_hours` is a rough estimate of when the mean path crosses a coastline
longitude. Direction-aware: it detects the crossing on whichever side of the
start the coast lies. Returns None for open-ocean drift (no crossing in horizon).
"""
from __future__ import annotations


def coast_eta_hours(points: list[dict], coast_lon: float | None) -> float | None:
    if coast_lon is None or not points:
        return None
    start_lon = points[0]["lon"]
    approaching_east = coast_lon >= start_lon
    for p in points:
        crossed = p["lon"] >= coast_lon if approaching_east else p["lon"] <= coast_lon
        if crossed:
            return float(p["t"])
    return None
