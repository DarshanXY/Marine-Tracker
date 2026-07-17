"""Assemble raw current + wind series into model-ready forcing.

`fetch_forcing` orchestrates the two fetchers, gap-fills nulls, converts units to
m/s and directions to (u=east, v=north) vectors, and returns
{u_cur, v_cur, u_wind, v_wind, source}. Currents flow TOWARD their direction;
wind blows FROM its direction (negated here). Cached 1 h per ~11 km cell; failures
negative-cached 5 min so offline runs don't stall. Raises on fetch failure —
callers fall back to the synthetic field.
"""
from __future__ import annotations

import math
import time

from . import fetch_ocean_currents
from . import fetch_wind_data

_CACHE: dict[tuple, tuple[float, dict]] = {}
_FAIL_CACHE: dict[tuple, float] = {}
_TTL = 3600.0
_FAIL_TTL = 300.0


def fill(series: list, n: int) -> list[float]:
    """Replace nulls with the previous value (0.0 if leading); pad/trim to n."""
    out: list[float] = []
    prev = 0.0
    for v in series[:n]:
        prev = float(v) if v is not None else prev
        out.append(prev)
    while len(out) < n:
        out.append(prev)
    return out


def to_ms(values: list[float], unit: str) -> list[float]:
    if unit == "km/h":
        return [v / 3.6 for v in values]
    if unit in ("kn", "knots"):
        return [v * 0.514444 for v in values]
    return list(values)


def fetch_forcing(lat: float, lon: float, hours: int) -> dict:
    """Hourly real forcing at (lat, lon) → {u_cur,v_cur,u_wind,v_wind,source} m/s."""
    key = (round(lat, 1), round(lon, 1))
    now = time.time()
    hit = _CACHE.get(key)
    if hit and now - hit[0] < _TTL:
        return hit[1]
    if key in _FAIL_CACHE and now - _FAIL_CACHE[key] < _FAIL_TTL:
        raise RuntimeError("forcing recently unavailable (negative cache)")

    n = max(hours + 1, 2)
    days = min(16, max(2, hours // 24 + 2))
    try:
        cur_s, cur_d, unit = fetch_ocean_currents.fetch(lat, lon, days)
        wind_s, wind_d = fetch_wind_data.fetch(lat, lon, days)
        cur_speed = to_ms(fill(cur_s, n), unit)
        cur_dir = fill(cur_d, n)
        wind_speed = fill(wind_s, n)
        wind_dir = fill(wind_d, n)
        forcing = {
            "u_cur": [s * math.sin(math.radians(d)) for s, d in zip(cur_speed, cur_dir)],
            "v_cur": [s * math.cos(math.radians(d)) for s, d in zip(cur_speed, cur_dir)],
            "u_wind": [-s * math.sin(math.radians(d)) for s, d in zip(wind_speed, wind_dir)],
            "v_wind": [-s * math.cos(math.radians(d)) for s, d in zip(wind_speed, wind_dir)],
            "source": "open-meteo",
        }
        _CACHE[key] = (now, forcing)
        return forcing
    except Exception:
        _FAIL_CACHE[key] = now
        raise
