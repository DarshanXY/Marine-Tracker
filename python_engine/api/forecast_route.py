"""Drift-forecast routes — full 72h trajectory + back-track (source attribution).

/forecast/trajectory: forward path + uncertainty cone + landfall probability +
back-track, using real Open-Meteo forcing when live.
/forecast/backtrack: reverse-time drift only — where did this parcel come FROM?
"""
from __future__ import annotations

from fastapi import APIRouter

from main_pipeline import _forcing_for
from satellite import landmask
from schemas import DriftRequest
from trajectory import forecast as fc
from trajectory.back_tracker import back_track
from trajectory.coastline_loader import nearest_coast_lon
from trajectory.ensemble_model import DEFAULT_WINDAGE

router = APIRouter()

# Above this terrain elevation the release point is inland (a landlocked lake /
# reservoir sits hundreds of m up), where the OCEAN drift model — currents + winds
# — is meaningless. Ocean/near-shore points are at/near sea level (≤ ~0 m).
_INLAND_ELEV_M = 10.0


def _is_marine(lat: float, lon: float) -> bool:
    """Open-sea release point? Uses the keyless Open-Meteo elevation (SAME host the
    drift forcing already reaches). Marine ⇔ at/near sea level. Best-effort: an
    unknown lookup does NOT block the forecast (assume marine)."""
    try:
        elevs = landmask._fetch_elevations([lat], [lon])
        if elevs:
            return float(elevs[0]) <= _INLAND_ELEV_M
    except Exception:  # noqa: BLE001 — never fail a forecast on an elevation blip
        pass
    return True


@router.post("/forecast/trajectory", summary="72h forecast: path + cone + landfall + back-track")
def forecast_trajectory(body: DriftRequest) -> dict:
    horizon = max(6, min(body.horizon_hours, 120))
    # Ocean drift only applies over the sea. An inland release (freshwater lake /
    # reservoir, or a land false-positive) must NOT get a fake "REAL CURRENTS +
    # WINDS / open ocean" track.
    if not _is_marine(body.lat, body.lon):
        return {
            "marine": False,
            "reason": ("This release point is inland (well above sea level), so the ocean "
                       "drift model — currents + winds — does not apply. Marine plastic drift "
                       "is only meaningful over the sea."),
            "points": [], "cone": [], "horizonHours": horizon, "dataSource": "n/a",
        }
    # Use the nearest monitored coastline so the landfall ETA is real (was None,
    # which made every on-demand forecast report a null ETA).
    coast = nearest_coast_lon(body.lat, body.lon)
    out = fc.forecast(body.lat, body.lon, horizon, coast_lon=coast, include_backtrack=True)
    out["marine"] = True
    return out


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
