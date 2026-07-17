"""Unit tests for the engine's pure algorithms + schemas + new features."""
import numpy as np

from hotspot.dbscan_clusterer import cluster, dbscan
from hotspot.severity_scorer import severity_for
from satellite import spectral_indices as si
from satellite.cloud_masker import surface_from_scl
from satellite.fdi_calculator import floating_debris_index, is_candidate
from satellite.threshold_applier import extract_candidates
from schemas import Detection
from trajectory.ensemble_model import mean_and_cone
from trajectory.eta_calculator import coast_eta_hours
from trajectory.lagrangian_model import integrate_members, simulate


# ── FDI ──────────────────────────────────────────────────────────────────────
def test_fdi_positive_for_floating_material():
    # NIR well above the red-edge→SWIR baseline → positive FDI.
    assert floating_debris_index(b06=0.10, b08=0.20, b11=0.06) > 0.02


def test_fdi_near_zero_for_water():
    # Water: NIR sits ON the red-edge→SWIR baseline → FDI ≈ 0.
    fdi = floating_debris_index(b06=0.06, b08=0.05, b11=0.05)
    assert abs(fdi) < 0.02


def test_is_candidate_threshold():
    assert is_candidate(0.05, 0.02) is True
    assert is_candidate(0.01, 0.02) is False


# ── DBSCAN + severity ────────────────────────────────────────────────────────
def test_dbscan_finds_one_cluster():
    pts = [(0.0, 0.0), (0.001, 0.001), (0.002, 0.0), (5.0, 5.0)]  # 3 close + 1 far
    labels = dbscan(pts, eps=0.05, min_samples=3)
    assert labels[:3] == [0, 0, 0]
    assert labels[3] == -1  # noise


def test_cluster_grouping():
    pts = [(0.0, 0.0), (0.001, 0.0), (0.0, 0.001)]
    clusters = cluster(pts, eps=0.05, min_samples=3)
    assert len(clusters) == 1
    assert sorted(next(iter(clusters.values()))) == [0, 1, 2]


def test_severity_thresholds():
    assert severity_for(12) == "HIGH"
    assert severity_for(6) == "MEDIUM"
    assert severity_for(3) == "LOW"


# ── Drift ────────────────────────────────────────────────────────────────────
def test_simulate_shapes():
    points, cone = simulate(19.0, 72.8, horizon_hours=24)
    assert len(points) == 25 and len(cone) == 25
    assert points[0]["lat"] == 19.0 and points[0]["lon"] == 72.8


def test_backward_is_reverse_of_forward_direction():
    fwd = integrate_members(19.0, 72.8, 12, direction=1)
    bwd = integrate_members(19.0, 72.8, 12, direction=-1)
    # forward and backward move opposite ways from the same start
    assert (fwd[0][-1][1] - 72.8) * (bwd[0][-1][1] - 72.8) <= 0


def test_mean_and_cone_envelope():
    members = [[(0.0, 0.0), (1.0, 1.0)], [(0.0, 0.0), (3.0, 3.0)]]
    points, cone = mean_and_cone(members)
    assert points[1]["lat"] == 2.0
    assert cone[1]["lat_min"] == 1.0 and cone[1]["lat_max"] == 3.0


def test_coast_eta_direction_aware():
    pts = [{"t": i, "lat": 19.0, "lon": 72.8 + i * 0.1} for i in range(10)]
    eta = coast_eta_hours(pts, coast_lon=73.2)
    assert eta == 4.0  # crosses 73.2 at t=4 (72.8 + 4*0.1 = 73.2)
    assert coast_eta_hours(pts, coast_lon=None) is None


# ── SCL surface ──────────────────────────────────────────────────────────────
def test_surface_water_vs_land():
    water = surface_from_scl(np.full((10, 10), 6))       # all SCL 6 = water
    assert water["label"] == "water" and water["water_valid"] is True
    land = surface_from_scl(np.full((10, 10), 4))        # all SCL 4 = vegetation
    assert land["label"] == "land" and land["water_valid"] is False


# ── Candidacy ────────────────────────────────────────────────────────────────
def test_extract_candidates_masks_land():
    # (2,2,5) array; one pixel has strong FDI. SCL marks it as land (4) → excluded.
    arr = np.zeros((2, 2, 5), dtype="float32")
    arr[0, 0] = [0.05, 0.10, 0.20, 0.19, 0.06]  # high-FDI pixel
    bbox = {"north": 1.0, "south": 0.0, "east": 1.0, "west": 0.0}
    scl_water = np.full((2, 2), 6)
    scl_land = np.full((2, 2), 4)
    px_water, _ = extract_candidates(arr, bbox, 0.02, scl=scl_water)
    px_land, _ = extract_candidates(arr, bbox, 0.02, scl=scl_land)
    assert len(px_water) == 1 and len(px_land) == 0


# ── Spectral indices ─────────────────────────────────────────────────────────
def test_indices_readout():
    out = si.all_indices(b04=0.05, b06=0.10, b08=0.20, b11=0.06, b03=0.12)
    assert out["fdi"] > 0.02
    assert out["ndwi"] is not None          # B03 given
    assert 0.0 <= out["plasticIndex"] <= 1.0
    assert si.all_indices(b04=0.05, b06=0.1, b08=0.2, b11=0.06)["ndwi"] is None  # no B03


# ── Schema contract ──────────────────────────────────────────────────────────
def test_detection_serialises_camelcase():
    d = Detection(lat=1.0, lon=2.0, classification="Plastic", confidence=0.9,
                  fdi_score=0.05, area_sq_km=0.1)
    j = d.model_dump(by_alias=True)
    assert "fdiScore" in j and "areaSqKm" in j and j["status"] == "PENDING"
