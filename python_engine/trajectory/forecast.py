"""Full drift forecast — the 72-hour trajectory system.

Combines forward advection (mean path + uncertainty cone), landfall PROBABILITY
from the ensemble spread, coast ETA, and an optional BACK-TRACK (where the parcel
likely drifted FROM — source attribution). Uses REAL Open-Meteo currents+winds
when live, else the synthetic field. Gridded CMEMS/ERA5 forcing is attempted
first when configured, falling back to point forcing.
"""
from __future__ import annotations

from config import settings

from . import data_interpolator, gridded_forcing
from .back_tracker import back_track
from .ensemble_model import DEFAULT_WINDAGE, mean_and_cone
from .eta_calculator import coast_eta_hours
from .lagrangian_model import integrate_members
from .landfall import landfall_stats


def _forcing(lat: float, lon: float, horizon: int) -> tuple[object | None, str]:
    """Best available forcing + a source label. gridded → point → synthetic."""
    if settings.demo_mode:
        return None, "demo"
    try:
        # bbox around the release point sized to bound a multi-day drift
        # (~3 km/h ≈ 0.03°/h); fetch_gridded_forcing adds its own margin.
        m = max(0.5, horizon * 0.03)
        box = {"north": lat + m, "south": lat - m, "east": lon + m, "west": lon - m}
        return gridded_forcing.fetch_gridded_forcing(box, horizon), "cmems"
    except Exception:  # noqa: BLE001 — gridded not available/failed → point forcing
        pass
    try:
        return data_interpolator.fetch_forcing(lat, lon, horizon), "open-meteo"
    except Exception:  # noqa: BLE001
        return None, "synthetic"


def forecast(lat: float, lon: float, horizon_hours: int = 72,
             coast_lon: float | None = None, include_backtrack: bool = True) -> dict:
    """Forward + backward trajectory, cone, landfall probability, coast ETA."""
    forcing, source = _forcing(lat, lon, horizon_hours)
    members = integrate_members(lat, lon, horizon_hours, DEFAULT_WINDAGE, forcing, direction=1)
    points, cone = mean_and_cone(members)

    out: dict = {
        "points": points, "cone": cone,
        "etaHours": coast_eta_hours(points, coast_lon),
        "landfall": landfall_stats(members, coast_lon),
        "windageCoeffs": list(DEFAULT_WINDAGE),
        "horizonHours": horizon_hours,
        "dataSource": source,
    }
    if include_backtrack:
        b_points, b_cone = back_track(lat, lon, horizon_hours, DEFAULT_WINDAGE, forcing)
        out["backtrack"] = {"points": b_points, "cone": b_cone}
    return out
