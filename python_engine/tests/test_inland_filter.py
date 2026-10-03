"""Inland false positives: SCL 'water' also covers ponds/aquaculture/wet fields, so
candidates deep inland are dropped from REAL scans before classification."""
import pytest

import main_pipeline as mp
from satellite import landmask

pytestmark = pytest.mark.skipif(not landmask.available(), reason="coastline dataset not present")

TANUKU = (16.7559, 81.6925)      # inland delta town (aquaculture ponds) ~45 km from the sea
OFFSHORE = (16.8501, 82.4396)    # Bay of Bengal off Kakinada
MUMBAI = (19.07, 72.88)


def test_deep_inland_flags_land_and_keeps_sea():
    got = landmask.deep_inland([TANUKU[0], OFFSHORE[0], MUMBAI[0]], [TANUKU[1], OFFSHORE[1], MUMBAI[1]])
    assert got == [True, False, True]


def test_is_land_and_availability():
    assert landmask.available()
    assert landmask.is_land(*TANUKU) is True
    assert landmask.is_land(*OFFSHORE) is False


def _cand(lat, lon):
    return ({"lat": lat, "lon": lon, "bands": {}}, 0.05)


class _SD:
    def __init__(self, source):
        self.source = source


def test_real_scans_drop_inland_candidates():
    cands = [_cand(*TANUKU), _cand(*OFFSHORE), _cand(*MUMBAI)]
    kept, dropped = mp._drop_inland(_SD("sentinelhub"), cands)
    assert dropped == 2
    assert [(c[0]["lat"], c[0]["lon"]) for c in kept] == [OFFSHORE]


def test_synthetic_scans_are_untouched():
    cands = [_cand(*TANUKU), _cand(*MUMBAI)]
    kept, dropped = mp._drop_inland(_SD("synthetic"), cands)
    assert dropped == 0 and kept == cands


def test_empty_input_is_safe():
    assert landmask.deep_inland([], []) == []
    assert mp._drop_inland(_SD("sentinelhub"), []) == ([], 0)
