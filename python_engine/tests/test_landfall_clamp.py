"""Landfall clamp — a drifting parcel that reaches the coast halts there.

Pins the requirement: the drawn path ends on the coast, etaHours keeps today's
meaning, and the landfall PROBABILITY is numerically unchanged.
"""
import math

import pytest

from trajectory.ensemble_model import DEFAULT_WINDAGE, mean_and_cone
from trajectory.eta_calculator import coast_eta_hours
from trajectory.lagrangian_model import integrate_members
from trajectory.landfall import landfall_stats
from trajectory.path_clamp import clamp_path_to_coast
from trajectory import forecast as fc
import main_pipeline
from schemas import Hotspot
from config import settings


@pytest.fixture(autouse=True)
def _synthetic_forcing(monkeypatch):
    """Pin synthetic (offline) forcing so forecasts are deterministic and the
    probability-invariance check compares like with like — integrate_members
    below is called with forcing=None, which must match what forecast() uses."""
    monkeypatch.setattr(settings, "demo_mode", True)


# ── The helper, in isolation ─────────────────────────────────────────────────
def _straight_east(n=10, start=72.8, step=0.1, lat=19.0):
    """A due-east path; lon = start + i*step."""
    pts = [{"t": i, "lat": lat, "lon": round(start + i * step, 5)} for i in range(n)]
    cone = [{"t": i, "lat_min": lat - 0.05, "lat_max": lat + 0.05,
             "lon_min": p["lon"] - 0.02, "lon_max": p["lon"] + 0.02}
            for i, p in enumerate(pts)]
    return pts, cone


def test_clamp_truncates_at_coast_and_ends_on_it():
    pts, cone = _straight_east()             # reaches 73.2 at t=4
    cp, cc, end_h, reason = clamp_path_to_coast(pts, cone, coast_lon=73.2)
    assert reason == "landfall"
    assert end_h == 4.0
    assert len(cp) == 5 and len(cc) == 5     # 0..4 inclusive
    assert cp[-1]["lon"] == 73.2             # terminal longitude ASSIGNED verbatim


def test_clamp_preserves_eta_rederivable_from_payload():
    # A consumer must be able to recompute the ETA from the clamped path.
    pts, cone = _straight_east()
    cp, _cc, _h, _r = clamp_path_to_coast(pts, cone, coast_lon=73.2)
    assert coast_eta_hours(cp, 73.2) == coast_eta_hours(pts, 73.2) == 4.0


def test_clamp_terminal_vertex_inside_its_cone():
    # Build a path whose interpolated terminal latitude would fall outside the
    # raw index-k cone unless the clamp expands it.
    pts = [{"t": 0, "lat": 19.0, "lon": 72.90},
           {"t": 1, "lat": 19.5, "lon": 73.10}]
    cone = [{"t": 0, "lat_min": 19.0, "lat_max": 19.0, "lon_min": 72.90, "lon_max": 72.90},
            {"t": 1, "lat_min": 19.45, "lat_max": 19.55, "lon_min": 73.05, "lon_max": 73.10}]
    cp, cc, _h, _r = clamp_path_to_coast(pts, cone, coast_lon=73.00)
    term = cp[-1]
    assert cc[-1]["lat_min"] <= term["lat"] <= cc[-1]["lat_max"]


def test_clamp_noop_when_never_reaches_coast():
    pts, cone = _straight_east()             # max lon 73.7
    cp, cc, end_h, reason = clamp_path_to_coast(pts, cone, coast_lon=99.0)
    assert reason == "horizon"
    assert len(cp) == len(pts)               # untouched length
    assert end_h == float(pts[-1]["t"])


def test_clamp_caps_cone_even_without_mean_crossing():
    # The mean path stops short of the coast, but the cone's east edge overshoots
    # it; the envelope must not bulge past the coast.
    pts = [{"t": 0, "lat": 19.0, "lon": 72.80}, {"t": 1, "lat": 19.0, "lon": 72.90}]
    cone = [{"t": 0, "lat_min": 19.0, "lat_max": 19.0, "lon_min": 72.80, "lon_max": 72.85},
            {"t": 1, "lat_min": 19.0, "lat_max": 19.0, "lon_min": 72.88, "lon_max": 72.99}]
    _cp, cc, _h, reason = clamp_path_to_coast(pts, cone, coast_lon=72.95)
    assert reason == "horizon"               # mean never crosses 72.95
    assert cc[-1]["lon_max"] == 72.95        # but the cone edge is capped


def test_clamp_noop_when_coast_none():
    pts, cone = _straight_east()
    cp, cc, _h, reason = clamp_path_to_coast(pts, cone, coast_lon=None)
    assert reason == "horizon" and cp is pts and cc is cone


def test_clamp_west_approach():
    # Coast to the WEST: parcel drifts to decreasing longitude.
    pts = [{"t": i, "lat": 19.0, "lon": round(73.0 - i * 0.1, 5)} for i in range(6)]
    cone = [{"t": i, "lat_min": 18.95, "lat_max": 19.05,
             "lon_min": p["lon"] - 0.02, "lon_max": p["lon"] + 0.02}
            for i, p in enumerate(pts)]
    cp, _cc, end_h, reason = clamp_path_to_coast(pts, cone, coast_lon=72.6)
    assert reason == "landfall" and end_h == 4.0 and cp[-1]["lon"] == 72.6


# ── The ensemble hazard the design exists to avoid ───────────────────────────
def test_mean_and_cone_goes_ragged_if_members_are_clamped():
    """Proves WHY the clamp works on the aggregated path, never on members.

    mean_and_cone reads the horizon off member 0 alone, so hand-clamped ragged
    members either silently drop hours or IndexError depending on order.
    """
    short = [(0.0, 0.0), (1.0, 1.0)]                 # 2 points
    long = [(0.0, 0.0), (1.0, 1.0), (2.0, 2.0)]      # 3 points
    # member 0 short → horizon read as 1 → the 3rd hour of `long` is dropped.
    pts, _ = mean_and_cone([short, long])
    assert len(pts) == 2
    # member 0 long → horizon read as 2 → indexing short[2] raises.
    with pytest.raises(IndexError):
        mean_and_cone([long, short])


# ── End-to-end through forecast() ────────────────────────────────────────────
def test_forecast_clamped_path_ends_at_coast():
    # MUM hotspot drifts onto the coast under real/synthetic forcing.
    out = fc.forecast(19.02, 72.88, 72, coast_lon=72.95, include_backtrack=False)
    assert out["pathEndReason"] == "landfall"
    assert out["points"][-1]["lon"] == 72.95
    assert out["pathEndHours"] == float(int(out["etaHours"]))
    # requested horizon is preserved separately from where the path ends
    assert out["horizonHours"] == 72
    assert out["coastModel"] == "meridian" and out["coastLon"] == 72.95


def test_forecast_landfall_probability_unchanged_by_clamp():
    """The clamp must not perturb the landfall probability at all.

    Recompute it from the RAW members and assert equality with the payload.
    """
    lat, lon, coast = 19.02, 72.88, 72.95
    members = integrate_members(lat, lon, 72, DEFAULT_WINDAGE, None, direction=1)
    expected = landfall_stats(members, coast)
    out = fc.forecast(lat, lon, 72, coast_lon=coast, include_backtrack=False)
    assert out["landfall"]["probability"] == expected["probability"]
    assert out["landfall"]["madeLandfall"] == expected["madeLandfall"]


def test_forecast_cone_is_camelcase():
    # The Areas page reads latMin/lonMin; snake_case silently rendered nothing.
    out = fc.forecast(19.0, 72.6, 24, coast_lon=None, include_backtrack=False)
    c = out["cone"][0]
    assert {"t", "latMin", "latMax", "lonMin", "lonMax"} == set(c)


def test_forecast_open_ocean_keeps_full_horizon():
    # Drifting away from any coast → full path, honest "horizon" reason.
    out = fc.forecast(13.08, 80.10, 48, coast_lon=None, include_backtrack=False)
    assert out["pathEndReason"] == "horizon"
    assert len(out["points"]) == 49
    assert out["etaHours"] is None


# ── Pipeline agrees with forecast at the same start/coast ─────────────────────
def test_pipeline_clamps_when_given_a_real_coast():
    """_drift_stage(clamp=True) must halt the drawn track at the coast, matching
    the on-demand forecast, so the two map surfaces never show different physics."""
    h = Hotspot(label="MUM-H1", centroid_lat=19.02, centroid_lon=72.88,
                detection_count=12, severity="HIGH", confidence=0.8)
    trajs, _src, _log = main_pipeline._drift_stage([h], lambda _h: 72.95, clamp=True)
    assert trajs, "expected a trajectory for the top hotspot"
    last = trajs[0].points[-1]
    assert last.lon == pytest.approx(72.95, abs=1e-6)


def test_pipeline_no_clamp_leaves_full_track():
    h = Hotspot(label="MUM-H1", centroid_lat=19.02, centroid_lon=72.88,
                detection_count=12, severity="HIGH", confidence=0.8)
    trajs, _src, _log = main_pipeline._drift_stage([h], lambda _h: 72.95, clamp=False)
    # Full horizon retained; end runs past the coast (the pre-clamp behaviour).
    assert len(trajs[0].points) == main_pipeline.settings.drift_horizon_hours + 1
