"""Gridded met-ocean forcing (CMEMS currents + Open-Meteo winds) — the production
upgrade over point-only forcing.

Point forcing (data_interpolator) advects with the hourly series AT THE RELEASE
POINT. This gridded path samples a 2-D CMEMS surface-current field ALONG the drift
track — the correct physics for a multi-day forecast. Winds (a smaller drift term
via windage) stay from the keyless Open-Meteo point series, which — unlike ERA5
reanalysis (~5-day latency) — is forecast-capable for the forward horizon.

Needs copernicusmarine + xarray and CMEMS credentials (provisioned in .env). If a
fetch fails for any reason the caller (forecast._forcing) catches it and falls back
to point forcing — honest, never faked. First use may require `copernicusmarine
login` once to cache the CMEMS credentials.
"""
from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timedelta, timezone

logger = logging.getLogger("engine.drift")

# Global ocean physics analysis-forecast, hourly-mean surface currents (uo, vo).
_CMEMS_CUR_DATASET = "cmems_mod_glo_phy_anfc_0.083deg_PT1H-m"

# Loading a CMEMS subset takes ~20-40 s, so cache the field per coarse area/window
# — the first forecast in a region is slow, repeats are instant.
_CACHE: dict = {}
_CACHE_TTL = 3600.0


def available() -> bool:
    try:
        import copernicusmarine  # noqa: F401  # noqa: PLC0415
        import xarray  # noqa: F401  # noqa: PLC0415
    except ImportError:
        return False
    return bool(os.getenv("CMEMS_USERNAME") and os.getenv("CMEMS_PASSWORD"))


class GriddedForcing:
    """In-memory CMEMS current field + point wind series, sampled at (lat, lon, t).

    Currents are nearest-neighbour on the ~0.083° (~9 km) grid at the nearest hour
    — adequate for a 72-h surface-drift forecast and cheap enough for RK4's four
    evaluations per hour per ensemble member (the whole subset is loaded once).
    """

    def __init__(self, ds, wind: dict | None, t0: datetime) -> None:
        import numpy as np

        self._np = np
        self.lats = np.asarray(ds["latitude"].values, dtype="float64")
        self.lons = np.asarray(ds["longitude"].values, dtype="float64")
        self.times = np.asarray(ds["time"].values)  # datetime64[ns]
        self.uo = np.asarray(ds["uo"].values, dtype="float64")  # (T, Y, X)
        self.vo = np.asarray(ds["vo"].values, dtype="float64")
        self.t0 = np.datetime64(t0.replace(tzinfo=None), "ns")
        self.wind = wind

    def _time_index(self, t_hours: float) -> int:
        np = self._np
        target = self.t0 + np.timedelta64(int(round(t_hours * 3600)), "s")
        return int(np.argmin(np.abs(self.times - target)))

    def current_ms(self, lat: float, lon: float, t: float) -> tuple[float, float]:
        np = self._np
        ti = self._time_index(t)
        yi = int(np.argmin(np.abs(self.lats - lat)))
        xi = int(np.argmin(np.abs(self.lons - lon)))
        u = self.uo[ti, yi, xi]
        v = self.vo[ti, yi, xi]
        if np.isnan(u) or np.isnan(v):  # land / masked → no current
            return 0.0, 0.0
        return float(u), float(v)

    def wind_ms(self, lat: float, lon: float, t: float) -> tuple[float, float]:
        if not self.wind:
            return 0.0, 0.0
        i = min(int(round(t)), len(self.wind["u_wind"]) - 1)
        return float(self.wind["u_wind"][i]), float(self.wind["v_wind"][i])


def fetch_gridded_forcing(bbox: dict, hours: int) -> GriddedForcing:
    """Open the CMEMS surface-current subset for the AOI/window and return a
    (lat,lon,t)->(u,v) sampler. Raises on any failure so the caller falls back to
    point forcing."""
    if not available():
        raise NotImplementedError(
            "Gridded CMEMS forcing needs copernicusmarine + xarray and CMEMS "
            "credentials. Point Open-Meteo forcing is used until then."
        )
    key = (round(bbox["west"], 1), round(bbox["south"], 1),
           round(bbox["east"], 1), round(bbox["north"], 1), hours // 12)
    cached = _CACHE.get(key)
    if cached and time.time() < cached[0]:
        return cached[1]

    import copernicusmarine

    now = datetime.now(timezone.utc)
    pad = 0.5  # degrees of margin so the drift can't leave the loaded subset
    ds = copernicusmarine.open_dataset(
        dataset_id=_CMEMS_CUR_DATASET,
        username=os.getenv("CMEMS_USERNAME"),
        password=os.getenv("CMEMS_PASSWORD"),
        variables=["uo", "vo"],
        minimum_longitude=bbox["west"] - pad, maximum_longitude=bbox["east"] + pad,
        minimum_latitude=bbox["south"] - pad, maximum_latitude=bbox["north"] + pad,
        start_datetime=now, end_datetime=now + timedelta(hours=hours + 3),
        minimum_depth=0.0, maximum_depth=1.0,
    )
    # Collapse a singleton depth dim if present, then pull the small subset into RAM.
    if "depth" in ds.dims:
        ds = ds.isel(depth=0)
    ds = ds.load()

    # Winds (windage term) from the keyless Open-Meteo point series at the centre.
    wind = None
    try:
        from . import data_interpolator
        wind = data_interpolator.fetch_forcing(
            (bbox["north"] + bbox["south"]) / 2.0, (bbox["east"] + bbox["west"]) / 2.0, hours)
    except Exception as exc:  # noqa: BLE001 — winds are optional; currents dominate
        logger.info("gridded forcing: winds unavailable (%s) — currents only", exc)

    logger.info("gridded CMEMS currents loaded: %s grid, %d hours", ds["uo"].shape, hours)
    gf = GriddedForcing(ds, wind, now)
    _CACHE[key] = (time.time() + _CACHE_TTL, gf)
    return gf
