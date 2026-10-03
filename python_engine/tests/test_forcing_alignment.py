"""Forcing time alignment: Open-Meteo hourly series start at 00:00 UTC, not "now".

`t0_index` marks the current hour inside the arrays; the forecast must read the
hours AFTER it and the back-track the hours BEFORE it.
"""
from datetime import datetime, timezone

from trajectory import data_interpolator as di
from trajectory.lagrangian_model import integrate_members


def _ramp(n=200, t0=100):
    # eastward current speed encodes the array index (u = index mm/s), no wind
    return {"u_cur": [i * 0.001 for i in range(n)], "v_cur": [0.0] * n,
            "u_wind": [0.0] * n, "v_wind": [0.0] * n, "t0_index": t0, "source": "test"}


def test_forward_reads_future_hours_and_backtrack_reads_past_hours():
    fwd = integrate_members(0.0, 0.0, 10, (0.0,), _ramp(), direction=1)[0]
    bwd = integrate_members(0.0, 0.0, 10, (0.0,), _ramp(), direction=-1)[0]
    assert fwd[-1][1] > 0 > bwd[-1][1]           # forward drifts east, back-track west
    # the ramp is weaker in the past (index < t0) than in the future (index > t0)
    assert abs(bwd[-1][1]) < fwd[-1][1]


def test_forecast_starts_at_the_current_hour_not_midnight():
    early = integrate_members(0.0, 0.0, 6, (0.0,), _ramp(t0=10), direction=1)[0]
    late = integrate_members(0.0, 0.0, 6, (0.0,), _ramp(t0=150), direction=1)[0]
    assert late[-1][1] > early[-1][1]            # later "now" → stronger ramp value


def test_fetch_forcing_marks_now_inside_the_series(monkeypatch):
    di._CACHE.clear()
    di._FAIL_CACHE.clear()
    seen = {}

    def cur(lat, lon, days, past_days=0):
        seen["days"], seen["past"] = days, past_days
        n = (days + past_days) * 24
        return [1.0] * n, [90.0] * n, "m/s"

    def wind(lat, lon, days, past_days=0):
        n = (days + past_days) * 24
        return [5.0] * n, [180.0] * n

    monkeypatch.setattr(di.fetch_ocean_currents, "fetch", cur)
    monkeypatch.setattr(di.fetch_wind_data, "fetch", wind)
    h0 = datetime.now(timezone.utc).hour
    f = di.fetch_forcing(16.85, 82.44, 72)
    h1 = datetime.now(timezone.utc).hour

    assert seen["past"] >= 3                     # ≥ 72 h of history for the back-track
    assert f["t0_index"] // 24 == seen["past"]
    assert f["t0_index"] % 24 in {h0, h1}
    # enough future hours after "now" to cover the whole horizon
    assert len(f["u_cur"]) - f["t0_index"] > 72
