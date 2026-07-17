"""Windage ensemble aggregation.

The drift forecast runs one track per windage coefficient (fraction of wind speed
imparted to a floating object, 1.5–3%). `mean_and_cone` collapses those member
tracks into a mean path plus a per-hour min/max envelope (the uncertainty cone).
"""
from __future__ import annotations

# Windage: fraction of wind speed imparted to a floating object (1.5–3%).
DEFAULT_WINDAGE = (0.015, 0.02, 0.025, 0.03)


def mean_and_cone(members: list[list[tuple[float, float]]]) -> tuple[list[dict], list[dict]]:
    """members: list of tracks [(lat,lon), …] → (mean_points, cone)."""
    horizon = len(members[0]) - 1
    points: list[dict] = []
    cone: list[dict] = []
    for t in range(horizon + 1):
        lats = [m[t][0] for m in members]
        lons = [m[t][1] for m in members]
        points.append({
            "t": t,
            "lat": round(sum(lats) / len(lats), 5),
            "lon": round(sum(lons) / len(lons), 5),
        })
        cone.append({
            "t": t,
            "lat_min": round(min(lats), 5), "lat_max": round(max(lats), 5),
            "lon_min": round(min(lons), 5), "lon_max": round(max(lons), 5),
        })
    return points, cone
