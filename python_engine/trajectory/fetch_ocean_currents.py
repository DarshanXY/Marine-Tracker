"""Ocean surface currents — Open-Meteo Marine API (keyless, ₹0, stdlib urllib).

Returns the raw hourly velocity + direction series for a point. Direction is
oceanographic (the current flows TOWARD it). The unit varies (km/h typically);
the caller converts to m/s. Raises on any failure.
"""
from __future__ import annotations

import json
import urllib.parse
import urllib.request

MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"


def _get(url: str, params: dict, timeout: int = 10) -> dict:
    qs = urllib.parse.urlencode(params)
    req = urllib.request.Request(f"{url}?{qs}", headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (trusted host)
        return json.loads(resp.read().decode("utf-8"))


def fetch(lat: float, lon: float, days: int, past_days: int = 0) -> tuple[list, list, str]:
    """Return (speed_series, direction_series, speed_unit). The hourly series starts at
    00:00 UTC of (today - past_days) and runs (past_days + days) * 24 hours."""
    j = _get(MARINE_URL, {
        "latitude": lat, "longitude": lon,
        "hourly": "ocean_current_velocity,ocean_current_direction",
        "forecast_days": days, "past_days": past_days, "timezone": "UTC", "cell_selection": "sea",
    })
    h = j.get("hourly", {})
    unit = j.get("hourly_units", {}).get("ocean_current_velocity", "km/h")
    return h.get("ocean_current_velocity", []), h.get("ocean_current_direction", []), unit
