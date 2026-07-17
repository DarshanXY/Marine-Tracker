"""Sentinel-2 SCL → surface composition + band/SCL split.

PURE functions (no module globals). The previous engine kept the last scene's
surface in a global, which leaked across scans (land showed the previous water
scan's %). Here every result is returned, so the caller owns per-scan state.

  * split_scl(arr)        → (bands5, scl) from a (H,W,6) fetch
  * surface_from_scl(scl) → water/land/cloud % + label + water_valid
  * mask_stats(scl)       → {valid_pct, masked_pct} for the candidacy keep-mask
"""
from __future__ import annotations

from .cloud_filter import KEEP_SCL

# SCL surface groups for the "what am I scanning" readout (independent of the
# candidacy keep-mask): 6 = water; 4 vegetation / 5 bare soil = LAND; 3 shadow /
# 8,9 cloud / 10 cirrus = CLOUD; the rest (0,1,2,7,11) = other/ambiguous.
_SCL_WATER = (6,)
_SCL_LAND = (4, 5)
_SCL_CLOUD = (3, 8, 9, 10)


def split_scl(arr):
    """(H,W,6) → ((H,W,5) reflectance, (H,W) SCL). No SCL channel → (arr, None)."""
    import numpy as np

    a = np.asarray(arr)
    if a.ndim == 3 and a.shape[-1] >= 6:
        return a[..., :5], a[..., 5]
    return a, None


def surface_from_scl(scl) -> dict:
    """Classify a real SCL array into water/land/cloud % + a label.

    FDI is only physically valid over water, so a run over land or cloud produces
    meaningless 'detections'. `water_valid` is the honest gate: below ~15% real
    water, candidates found here should not be trusted."""
    import numpy as np

    s = np.rint(np.asarray(scl)).astype("int32")
    n = int(s.size) or 1
    water = float(np.isin(s, _SCL_WATER).sum()) / n * 100.0
    land = float(np.isin(s, _SCL_LAND).sum()) / n * 100.0
    cloud = float(np.isin(s, _SCL_CLOUD).sum()) / n * 100.0
    other = max(0.0, 100.0 - water - land - cloud)

    if cloud >= 80:
        label = "cloud"
    elif water >= 50 and water >= land:
        label = "water"
    elif land >= 40 and land > water:
        label = "land"
    elif water < 10:
        label = "land" if land >= cloud else "cloud"
    else:
        label = "mixed"

    return {
        "water_pct": round(water, 1), "land_pct": round(land, 1),
        "cloud_pct": round(cloud, 1), "other_pct": round(other, 1),
        "label": label, "water_valid": water >= 15.0, "source": "scl",
    }


def mask_stats(scl) -> dict:
    """Fraction of pixels the candidacy keep-mask retains (SCL 2/6/7)."""
    import numpy as np

    valid = float(np.isin(np.rint(np.asarray(scl)).astype("int32"), KEEP_SCL).mean() * 100)
    return {"valid_pct": round(valid, 1), "masked_pct": round(100 - valid, 1)}
