"""10-m wind — Open-Meteo Forecast API (keyless, ₹0, stdlib urllib).

Returns the raw hourly wind speed (m/s) + direction series for a point.
Direction is meteorological (the wind blows FROM it). Raises on any failure.
"""
from __future__ import annotations

import json
import urllib.parse
import urllib.request

WEATHER_URL = "https://api.open-meteo.com/v1/forecast"


def _get(url: str, params: dict, timeout: int = 10) -> dict:
    qs = urllib.parse.urlencode(params)
    req = urllib.request.Request(f"{url}?{qs}", headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (trusted host)
        return json.loads(resp.read().decode("utf-8"))


def fetch(lat: float, lon: float, days: int, past_days: int = 0) -> tuple[list, list]:
    """Return (speed_series_ms, direction_series); starts 00:00 UTC of (today - past_days)."""
    j = _get(WEATHER_URL, {
        "latitude": lat, "longitude": lon,
        "hourly": "wind_speed_10m,wind_direction_10m",
        "forecast_days": days, "past_days": past_days, "timezone": "UTC", "wind_speed_unit": "ms",
    })
    h = j.get("hourly", {})
    return h.get("wind_speed_10m", []), h.get("wind_direction_10m", [])
