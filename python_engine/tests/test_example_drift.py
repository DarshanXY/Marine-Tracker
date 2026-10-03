"""What-if plastic release: custom windage, vectorised land test, open-water picker."""
import pytest

from api.forecast_route import open_water
from satellite import landmask
from schemas import BBox
from trajectory import forecast as fc

needs_coast = pytest.mark.skipif(not landmask.available(), reason="coastline dataset not present")


@pytest.fixture(autouse=True)
def _synthetic_forcing(monkeypatch):
    monkeypatch.setattr(fc, "_forcing", lambda lat, lon, horizon: (None, "synthetic"))


def test_custom_windage_sets_the_members():
    out = fc.forecast(19.0, 72.6, 24, include_backtrack=False, windage=(0.005, 0.01, 0.015))
    assert out["windageCoeffs"] == [0.005, 0.01, 0.015]
    assert out["landfall"]["members"] == 3


def test_default_windage_is_unchanged():
    out = fc.forecast(19.0, 72.6, 24, include_backtrack=False)
    assert out["windageCoeffs"] == [0.015, 0.02, 0.025, 0.03]


def test_more_windage_pushes_further_downwind():
    lo = fc.forecast(19.0, 72.6, 48, include_backtrack=False, windage=(0.0,))
    hi = fc.forecast(19.0, 72.6, 48, include_backtrack=False, windage=(0.05,))
    assert (lo["points"][-1]["lat"], lo["points"][-1]["lon"]) != (hi["points"][-1]["lat"], hi["points"][-1]["lon"])


@needs_coast
def test_land_many_matches_is_land():
    pts = [(16.7559, 81.6925), (16.8501, 82.4396), (19.07, 72.88), (18.5, 70.0)]
    assert landmask.land_many([p[0] for p in pts], [p[1] for p in pts]) == [landmask.is_land(*p) for p in pts]


@needs_coast
def test_open_water_finds_sea_and_refuses_all_land():
    sea = open_water(BBox(north=16.9, south=16.3, east=82.7, west=82.2))
    assert sea["found"] and landmask.is_land(sea["lat"], sea["lon"]) is False
    land = open_water(BBox(north=16.80, south=16.72, east=81.74, west=81.65))  # Tanuku ponds
    assert land["found"] is False
