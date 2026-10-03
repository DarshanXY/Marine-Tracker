"""A slow CMEMS load must not stall or duplicate: callers time out (→ point-forcing
fallback) while ONE shared load keeps running to warm the cache."""
import time

import pytest

from trajectory import gridded_forcing as gf

BOX = {"north": 20.5, "south": 15.5, "east": 85.5, "west": 80.5}


def test_slow_load_times_out_but_is_shared(monkeypatch):
    calls: list[int] = []

    def slow(*_a):
        calls.append(1)
        time.sleep(0.4)
        return object()

    monkeypatch.setattr(gf, "_load_currents", slow)
    monkeypatch.setattr(gf, "LOAD_BUDGET_S", 0.05)
    monkeypatch.setattr(gf, "available", lambda: True)
    gf._CACHE.clear()
    gf._INFLIGHT.clear()
    for _ in range(3):
        with pytest.raises(TimeoutError):
            gf.fetch_gridded_forcing(BOX, 72)
    assert len(calls) == 1          # concurrent/repeat requests shared the in-flight load
    time.sleep(0.6)                 # let the background load finish before the next test
    gf._INFLIGHT.clear()


def test_forecast_falls_back_to_point_forcing_on_timeout(monkeypatch):
    from trajectory import forecast as fc

    def boom(*_a, **_k):
        raise TimeoutError("CMEMS load still in progress")

    monkeypatch.setattr(gf, "fetch_gridded_forcing", boom)
    monkeypatch.setattr(fc.data_interpolator, "fetch_forcing",
                        lambda la, lo, h: {"u_cur": [0.1] * 200, "v_cur": [0.0] * 200, "u_wind": [0.0] * 200,
                                           "v_wind": [0.0] * 200, "t0_index": 0, "source": "open-meteo"})
    monkeypatch.setattr(fc.settings, "demo_mode", False)
    _forcing, source = fc._forcing(16.85, 82.44, 48)
    assert source == "open-meteo"
