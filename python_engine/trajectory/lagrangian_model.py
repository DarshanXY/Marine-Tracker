"""Forward Lagrangian drift (RK4 integration).

Advects a plastic parcel `horizon` hours under the windage ensemble. Forcing can be:
  • a GRIDDED sampler (has .current_ms/.wind_ms(lat,lon,t)) — real CMEMS currents
    sampled ALONG the moving track (correct multi-day physics),
  • a point `forcing` dict (REAL hourly Open-Meteo series at the release point), or
  • None → a smooth deterministic synthetic field (reproducible demo, honest label).
Integration is 4th-order Runge–Kutta at a 1-h step (was forward-Euler), which cuts
truncation error on curved current paths. Returns (mean_points, cone) via simulate.
"""
from __future__ import annotations

import math

from .ensemble_model import DEFAULT_WINDAGE, mean_and_cone

_M_PER_DEG_LAT = 111_320.0


def ms_to_deg(u_ms: float, v_ms: float, lat: float) -> tuple[float, float]:
    """(east, north) m/s → (dlon, dlat) degrees per hour."""
    dlat = v_ms * 3600.0 / _M_PER_DEG_LAT
    dlon = u_ms * 3600.0 / (_M_PER_DEG_LAT * max(0.2, math.cos(math.radians(lat))))
    return dlon, dlat


def synthetic_current(lat: float, lon: float, t: float) -> tuple[float, float]:
    """Synthetic surface current in degrees/hour (u = lon, v = lat)."""
    u = 0.006 + 0.0015 * math.sin((lat + t * 0.05) * 0.6)
    v = 0.010 + 0.0010 * math.cos((lon + t * 0.04) * 0.5)
    return u, v


def synthetic_wind(lat: float, lon: float, t: float) -> tuple[float, float]:
    """Synthetic 10-m wind expressed as degrees/hour of surface push."""
    u = 0.05 * math.sin((lon + t * 0.03) * 0.4)
    v = 0.04 * math.cos((lat + t * 0.03) * 0.4)
    return u, v


def _velocity_deg(forcing, w: float, lat: float, lon: float, t: float) -> tuple[float, float]:
    """Total parcel velocity (dlon, dlat) in deg/hour = current + windage·wind.

    Dispatches on the forcing type: gridded sampler → sample at (lat,lon,t);
    point dict → hourly series at the release point; None → synthetic field.
    """
    if forcing is not None and hasattr(forcing, "current_ms"):
        cu_ms, cv_ms = forcing.current_ms(lat, lon, t)
        wu_ms, wv_ms = forcing.wind_ms(lat, lon, t)
        cu, cv = ms_to_deg(cu_ms, cv_ms, lat)
        wu, wv = ms_to_deg(wu_ms, wv_ms, lat)
    elif isinstance(forcing, dict):
        # t is signed hours from release (negative = back-track); t0_index is "now".
        i = max(0, min(forcing.get("t0_index", 0) + int(round(t)), len(forcing["u_cur"]) - 1))
        cu, cv = ms_to_deg(forcing["u_cur"][i], forcing["v_cur"][i], lat)
        wu, wv = ms_to_deg(forcing["u_wind"][i], forcing["v_wind"][i], lat)
    else:
        cu, cv = synthetic_current(lat, lon, t)
        wu, wv = synthetic_wind(lat, lon, t)
    return cu + w * wu, cv + w * wv


def integrate_members(start_lat: float, start_lon: float, horizon_hours: int = 72,
                      windage_coeffs: tuple[float, ...] = DEFAULT_WINDAGE,
                      forcing=None,
                      direction: int = 1) -> list[list[tuple[float, float]]]:
    """One track per windage member (RK4, 1-h step). direction=+1 forward, -1 back."""
    members: list[list[tuple[float, float]]] = []
    dt = 1.0
    for w in windage_coeffs:
        lat, lon = start_lat, start_lon
        track: list[tuple[float, float]] = [(lat, lon)]
        for step in range(1, horizon_hours + 1):
            # Signed time from release: forward reads the coming hours, the back-track
            # reads the PAST hours (the parcel was carried by yesterday's currents).
            t0 = direction * float(step - 1)
            td = direction * dt
            # RK4 over one hour; velocity is deg/hour so h == dt == 1.
            k1x, k1y = _velocity_deg(forcing, w, lat, lon, t0)
            k2x, k2y = _velocity_deg(forcing, w, lat + 0.5 * dt * k1y * direction,
                                     lon + 0.5 * dt * k1x * direction, t0 + 0.5 * td)
            k3x, k3y = _velocity_deg(forcing, w, lat + 0.5 * dt * k2y * direction,
                                     lon + 0.5 * dt * k2x * direction, t0 + 0.5 * td)
            k4x, k4y = _velocity_deg(forcing, w, lat + dt * k3y * direction,
                                     lon + dt * k3x * direction, t0 + td)
            lon += direction * dt / 6.0 * (k1x + 2 * k2x + 2 * k3x + k4x)
            lat += direction * dt / 6.0 * (k1y + 2 * k2y + 2 * k3y + k4y)
            track.append((lat, lon))
        members.append(track)
    return members


def simulate(start_lat: float, start_lon: float, horizon_hours: int = 72,
             windage_coeffs: tuple[float, ...] = DEFAULT_WINDAGE,
             forcing: dict | None = None) -> tuple[list[dict], list[dict]]:
    """Return (mean_points, cone) over the forecast horizon."""
    return mean_and_cone(integrate_members(start_lat, start_lon, horizon_hours, windage_coeffs, forcing))
