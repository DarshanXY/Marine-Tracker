"""Backward trajectory — estimate where a detected parcel drifted FROM.

Runs the Lagrangian model in REVERSE (stepping against currents + winds) to trace
a hotspot's likely upstream path over the preceding `hours`, with the same
windage-ensemble uncertainty cone. Useful for attributing debris to a source
(river mouth, port). Uses whatever forcing is active — gridded CMEMS, point
Open-Meteo, or the synthetic field — via the shared RK4 integrator.
"""
from __future__ import annotations

from .ensemble_model import DEFAULT_WINDAGE, mean_and_cone
from .lagrangian_model import integrate_members


def back_track(lat0: float, lon0: float, hours: int = 72,
               windage_coeffs: tuple[float, ...] = DEFAULT_WINDAGE,
               forcing=None) -> tuple[list[dict], list[dict]]:
    """Return (mean_points, cone) tracing BACK from (lat0, lon0). t increases into
    the past (t=0 is the observation)."""
    members = integrate_members(lat0, lon0, hours, windage_coeffs, forcing, direction=-1)
    return mean_and_cone(members)
