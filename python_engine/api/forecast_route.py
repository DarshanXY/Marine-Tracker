"""Drift-forecast routes — full 72h trajectory + back-track (source attribution).

/forecast/trajectory: forward path + uncertainty cone + landfall probability +
back-track, using real Open-Meteo forcing when live.
/forecast/backtrack: reverse-time drift only — where did this parcel come FROM?
"""
from __future__ import annotations

from fastapi import APIRouter

from main_pipeline import _forcing_for
from schemas import DriftRequest
from trajectory import forecast as fc
from trajectory.back_tracker import back_track
from trajectory.coastline_loader import nearest_coast_lon
from trajectory.ensemble_model import DEFAULT_WINDAGE

router = APIRouter()


@router.post("/forecast/trajectory", summary="72h forecast: path + cone + landfall + back-track")
def forecast_trajectory(body: DriftRequest) -> dict:
    horizon = max(6, min(body.horizon_hours, 120))
    # Use the nearest monitored coastline so the landfall ETA is real (was None,
    # which made every on-demand forecast report a null ETA).
    coast = nearest_coast_lon(body.lat, body.lon)
    return fc.forecast(body.lat, body.lon, horizon, coast_lon=coast, include_backtrack=True)


@router.post("/forecast/backtrack", summary="Trace a parcel to its likely upstream source")
def forecast_backtrack(body: DriftRequest) -> dict:
    horizon = max(6, min(body.horizon_hours, 120))
    forcing = _forcing_for(body.lat, body.lon, horizon)
    points, cone = back_track(body.lat, body.lon, horizon, DEFAULT_WINDAGE, forcing)
    return {
        "points": points, "cone": cone,
        "windageCoeffs": list(DEFAULT_WINDAGE), "horizonHours": horizon,
        "dataSource": forcing["source"] if forcing else "synthetic",
    }
