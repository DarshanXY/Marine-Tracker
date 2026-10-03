"""Landfall against the real coastline polygon (replaces the single-meridian coast).

The meridian model treats the coast as one north-south line borrowed from the
nearest monitored region, which is meaningless for an arbitrary AOI (a parcel can
drift onto a delta while a distant meridian reports 0% landfall). Here a parcel
"beaches" the first hour its position falls inside a land polygon, and the drawn
path is cut at the coast crossing.

`is_land(lat, lon) -> bool` is injected (satellite.landmask.is_land) so this module
stays pure and testable.
"""
from __future__ import annotations

from typing import Callable

IsLand = Callable[[float, float], "bool | None"]


def _first_land_index(track: list[tuple[float, float]], is_land: IsLand) -> int | None:
    for i in range(1, len(track)):
        if is_land(track[i][0], track[i][1]):
            return i
    return None


def landfall_stats(member_tracks: list[list[tuple[float, float]]], is_land: IsLand) -> dict:
    """Fraction of ensemble members that reach land within the horizon."""
    hits = [i for i in (_first_land_index(t, is_land) for t in member_tracks) if i is not None]
    return {
        "probability": round(len(hits) / len(member_tracks), 3) if member_tracks else 0.0,
        "earliestEtaHours": float(min(hits)) if hits else None,
        "latestEtaHours": float(max(hits)) if hits else None,
        "members": len(member_tracks),
        "madeLandfall": len(hits),
    }


def _crossing(a: tuple[float, float], b: tuple[float, float], is_land: IsLand, iters: int = 12) -> tuple[float, float, float]:
    """Bisect the sea→land segment a→b; returns (lat, lon, fraction) of the last sea point."""
    lo, hi = 0.0, 1.0
    for _ in range(iters):
        mid = (lo + hi) / 2.0
        if is_land(a[0] + mid * (b[0] - a[0]), a[1] + mid * (b[1] - a[1])):
            hi = mid
        else:
            lo = mid
    return a[0] + lo * (b[0] - a[0]), a[1] + lo * (b[1] - a[1]), lo


def clamp_path(points: list[dict], cone: list[dict], is_land: IsLand) -> tuple[list[dict], list[dict], float, str]:
    """Cut the mean path (snake_case points/cone from ensemble_model) at the coast.

    Returns (points, cone, end_hours, end_reason); end_reason is "landfall" when the
    mean path reaches land within the horizon (path ends exactly at the crossing),
    else "horizon" with everything untouched.
    """
    if points and is_land(points[0]["lat"], points[0]["lon"]):
        # Released on land per the coarse polygon (a near-shore pixel): there is no
        # sea→land crossing to find, and clamping would leave a one-point track.
        return points, cone, float(points[-1]["t"]), "horizon"
    for k in range(1, len(points)):
        if not is_land(points[k]["lat"], points[k]["lon"]):
            continue
        a = (points[k - 1]["lat"], points[k - 1]["lon"])
        b = (points[k]["lat"], points[k]["lon"])
        clat, clon, frac = _crossing(a, b, is_land)
        t_end = round(points[k - 1]["t"] + frac, 2)
        clamped = [dict(p) for p in points[:k]] + [{"t": t_end, "lat": round(clat, 5), "lon": round(clon, 5)}]
        clamped_cone = [dict(c) for c in cone[:k + 1]]
        tail = clamped_cone[k]
        tail["t"] = t_end
        # The terminal vertex must sit inside its own envelope.
        tail["lat_min"] = min(tail["lat_min"], clat)
        tail["lat_max"] = max(tail["lat_max"], clat)
        tail["lon_min"] = min(tail["lon_min"], clon)
        tail["lon_max"] = max(tail["lon_max"], clon)
        return clamped, clamped_cone, t_end, "landfall"
    end = float(points[-1]["t"]) if points else 0.0
    return points, cone, end, "horizon"
