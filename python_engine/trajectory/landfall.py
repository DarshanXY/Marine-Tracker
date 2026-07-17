"""Landfall probability from a windage ensemble.

The mean-path ETA (eta_calculator) is the central estimate; this adds the SPREAD:
the landfall probability is the fraction of ensemble members whose track crosses
the coast within the horizon, plus the earliest/latest member ETA.
"""
from __future__ import annotations

from .eta_calculator import coast_eta_hours


def landfall_stats(member_tracks: list[list[tuple[float, float]]], coast_lon: float | None) -> dict:
    if coast_lon is None or not member_tracks:
        return {"probability": 0.0, "earliestEtaHours": None, "latestEtaHours": None,
                "members": len(member_tracks), "madeLandfall": 0}
    etas: list[float] = []
    for track in member_tracks:
        pts = [{"t": i, "lat": la, "lon": lo} for i, (la, lo) in enumerate(track)]
        eta = coast_eta_hours(pts, coast_lon)
        if eta is not None:
            etas.append(eta)
    return {
        "probability": round(len(etas) / len(member_tracks), 3),
        "earliestEtaHours": min(etas) if etas else None,
        "latestEtaHours": max(etas) if etas else None,
        "members": len(member_tracks),
        "madeLandfall": len(etas),
    }
