"""Drift-forecast routes — full 72h trajectory + back-track (source attribution).

/forecast/trajectory: forward path + uncertainty cone + landfall probability +
back-track, using real Open-Meteo forcing when live.
/forecast/backtrack: reverse-time drift only — where did this parcel come FROM?
"""
from __future__ import annotations

from fastapi import APIRouter

from main_pipeline import _forcing_for
from satellite import landmask
from schemas import BBox, DriftRequest
from trajectory import forecast as fc
from trajectory.back_tracker import back_track
from trajectory.coastline_loader import nearest_coast_lon
from trajectory.ensemble_model import DEFAULT_WINDAGE

router = APIRouter()

# Fallback only (used when the coastline polygons are unavailable): above this
# terrain elevation the release point is inland (a landlocked lake / reservoir sits
# hundreds of m up), where the OCEAN drift model — currents + winds — is
# meaningless. Ocean/near-shore points are at/near sea level (≤ ~0 m).
_INLAND_ELEV_M = 10.0


def _is_marine(lat: float, lon: float) -> bool:
    """Open-sea release point? Primary test is the coastline land polygon — elevation
    cannot separate a river-delta town or aquaculture pond (0-11 m) from the sea, so
    a point inside land is refused. Falls back to the keyless Open-Meteo elevation
    only if the polygons can't be loaded; an unknown lookup does NOT block the
    forecast (assume marine)."""
    land = landmask.is_land(lat, lon)
    if land is not None:
        return not land
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
            "reason": ("This release point is on land or an inland water body, so the ocean "
                       "drift model — currents + winds — does not apply. Marine plastic drift "
                       "is only meaningful over the sea."),
            "points": [], "cone": [], "horizonHours": horizon, "dataSource": "n/a",
        }
    # Landfall against the real coastline polygon when it's available; otherwise the
    # nearest monitored region's single-longitude coast (crude, but not None).
    if landmask.is_land(body.lat, body.lon) is not None:
        out = fc.forecast(body.lat, body.lon, horizon, include_backtrack=body.include_backtrack,
                          is_land=landmask.is_land, windage=body.windage)
    else:
        coast = nearest_coast_lon(body.lat, body.lon)
        out = fc.forecast(body.lat, body.lon, horizon, coast_lon=coast, include_backtrack=body.include_backtrack,
                          windage=body.windage)
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


@router.post("/forecast/open-water", summary="An open-water point inside a box (for a what-if plastic release)")
def open_water(b: BBox) -> dict:
    """Nearest-to-centre point of the box that is over the sea. Prefers points whose four
    neighbours ~5 km away are sea too (not a shoreline pixel the coarse coast might mislabel).
    `found: false` when the box has no open water (or the coastline data is missing)."""
    import numpy as np  # noqa: PLC0415

    n = 41
    lats = np.linspace(b.south, b.north, n + 2)[1:-1]
    lons = np.linspace(b.west, b.east, n + 2)[1:-1]
    glat, glon = np.meshgrid(lats, lons, indexing="ij")
    glat, glon = glat.ravel(), glon.ravel()
    d = 0.05
    stack_lat = np.concatenate([glat, glat + d, glat - d, glat, glat])
    stack_lon = np.concatenate([glon, glon, glon, glon + d, glon - d])
    land = landmask.land_many(stack_lat.tolist(), stack_lon.tolist())
    if land is None:
        return {"found": False, "reason": "coastline data unavailable"}
    land = np.asarray(land).reshape(5, -1)
    water = ~land[0]
    offshore = water & ~land[1:].any(axis=0)
    for mask, tag in ((offshore, True), (water, False)):
        if mask.any():
            cl, co = (b.north + b.south) / 2.0, (b.east + b.west) / 2.0
            dist = (glat - cl) ** 2 + ((glon - co) * np.cos(np.radians(cl))) ** 2
            i = int(np.argmin(np.where(mask, dist, np.inf)))
            return {"found": True, "lat": round(float(glat[i]), 5), "lon": round(float(glon[i]), 5), "offshore": tag}
    return {"found": False, "reason": "no open water in this box"}
