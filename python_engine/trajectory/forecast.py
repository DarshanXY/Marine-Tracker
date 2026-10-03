"""Full drift forecast — the 72-hour trajectory system.

Combines forward advection (mean path + uncertainty cone), landfall PROBABILITY
from the ensemble spread, coast ETA, and an optional BACK-TRACK (where the parcel
likely drifted FROM — source attribution). Uses REAL Open-Meteo currents+winds
when live, else the synthetic field. Gridded CMEMS/ERA5 forcing is attempted
first when configured, falling back to point forcing.
"""
from __future__ import annotations

from config import settings

from . import data_interpolator, gridded_forcing, polygon_landfall
from .back_tracker import back_track
from .ensemble_model import DEFAULT_WINDAGE, mean_and_cone
from .eta_calculator import coast_eta_hours
from .lagrangian_model import integrate_members
from .landfall import landfall_stats
from .path_clamp import clamp_path_to_coast


def _camel_cone(cone: list[dict]) -> list[dict]:
    """mean_and_cone emits snake_case cone keys, but the API contract (and the
    Pydantic-aliased pipeline cone) is camelCase. Convert at the forecast
    boundary so consumers get one consistent shape — the Areas-page cone reads
    latMin/lonMin and silently rendered nothing while this leaked snake_case."""
    return [
        {"t": c["t"], "latMin": c["lat_min"], "latMax": c["lat_max"],
         "lonMin": c["lon_min"], "lonMax": c["lon_max"]}
        for c in cone
    ]


def _forcing(lat: float, lon: float, horizon: int) -> tuple[object | None, str]:
    """Best available forcing + a source label. gridded → point → synthetic."""
    if settings.demo_mode:
        return None, "demo"
    try:
        # Box around the release's 1° CELL (not the point) sized to bound a multi-day
        # drift (~3 km/h ≈ 0.03°/h) plus 0.5° for the cell snap — so every release in
        # the same 1° cell shares one CMEMS load (a cold load is ~30 s).
        m = max(0.5, horizon * 0.03) + 0.5
        clat, clon = float(round(lat)), float(round(lon))
        box = {"north": clat + m, "south": clat - m, "east": clon + m, "west": clon - m}
        return gridded_forcing.fetch_gridded_forcing(box, horizon, wind_at=(lat, lon)), "cmems"
    except Exception:  # noqa: BLE001 — gridded not available/failed → point forcing
        pass
    try:
        return data_interpolator.fetch_forcing(lat, lon, horizon), "open-meteo"
    except Exception:  # noqa: BLE001
        return None, "synthetic"


def forecast(lat: float, lon: float, horizon_hours: int = 72,
             coast_lon: float | None = None, include_backtrack: bool = True,
             is_land=None, windage: tuple[float, ...] | list[float] | None = None) -> dict:
    """Forward + backward trajectory, cone, landfall probability, coast ETA.

    `is_land(lat, lon)` (optional) switches landfall to the real coastline polygon;
    without it the crude single-meridian `coast_lon` model is used."""
    wc = tuple(windage) if windage else DEFAULT_WINDAGE
    forcing, source = _forcing(lat, lon, horizon_hours)
    members = integrate_members(lat, lon, horizon_hours, wc, forcing, direction=1)
    points, cone = mean_and_cone(members)

    if is_land is not None:
        landfall = polygon_landfall.landfall_stats(members, is_land)
        points, cone, end_hours, end_reason = polygon_landfall.clamp_path(points, cone, is_land)
        eta = end_hours if end_reason == "landfall" else None
        coast_model, coast_lon = "polygon", None
    else:
        # ETA and landfall probability are computed on the RAW mean/members BEFORE
        # the clamp, so both keep exactly today's values (see path_clamp docstring).
        eta = coast_eta_hours(points, coast_lon)
        landfall = landfall_stats(members, coast_lon)

        # Halt the drawn path at the coast (no-op when coast_lon is None). A beached
        # parcel does not drift inland; without this the path ran the full horizon.
        points, cone, end_hours, end_reason = clamp_path_to_coast(points, cone, coast_lon)
        coast_model = "meridian"  # single-longitude approximation (auditable)

    out: dict = {
        "points": points, "cone": _camel_cone(cone),
        "etaHours": eta,
        "landfall": landfall,
        "windageCoeffs": list(wc),
        "horizonHours": horizon_hours,   # the REQUESTED horizon
        "pathEndHours": end_hours,       # where the drawn path actually ends
        "pathEndReason": end_reason,     # "landfall" | "horizon"
        "coastLon": coast_lon,           # the meridian used as the coastline
        "coastModel": coast_model,       # "polygon" (real coastline) | "meridian" (approximation)
        "dataSource": source,
    }
    if include_backtrack:
        # back_track runs time in reverse (source attribution) — reaching the
        # coast means the parcel WAS there, a source not a sink — so it is
        # deliberately NOT clamped and takes no coast_lon.
        b_points, b_cone = back_track(lat, lon, horizon_hours, wc, forcing)
        out["backtrack"] = {"points": b_points, "cone": _camel_cone(b_cone)}
    return out
