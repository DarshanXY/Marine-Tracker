"""Sentinel-2 SCL → surface composition + band/SCL split.

PURE functions (no module globals). The previous engine kept the last scene's
surface in a global, which leaked across scans (land showed the previous water
scan's %). Here every result is returned, so the caller owns per-scan state.

  * split_scl(arr)        → (bands5, scl) from a (H,W,6) fetch
  * surface_from_scl(scl) → water/land/cloud % + label + water_valid
  * mask_stats(scl)       → {valid_pct, masked_pct} for the candidacy keep-mask
"""
from __future__ import annotations

from config import settings

# SCL surface groups for the "what am I scanning" readout (independent of the
# candidacy keep-mask): 6 = water; 4 vegetation / 5 bare soil = LAND; 3 shadow /
# 8,9 cloud / 10 cirrus = CLOUD; 2 dark / 7 unclassified / 11 snow = other. Classes
# 0 (nodata) + 1 (defective) are NO OBSERVATION — a least-cloud composite leaves
# them wherever no clear pass existed, so they must be EXCLUDED from the surface
# denominator (else land/water/cloud all dilute toward 0 and the scene reads as
# "land 0%" even when it is half land — the bug this split fixes).
_SCL_NODATA = (0, 1)
_SCL_WATER = (6,)
_SCL_LAND = (4, 5)
_SCL_CLOUD = (3, 8, 9, 10)


def reliability_for(surface: dict, mask: dict | None) -> str:  # noqa: ARG001
    """Honest one-word verdict on whether this scene's detections can be trusted.

    FDI is only meaningful over clear water that we actually OBSERVED, so the grade
    is driven by (a) coverage — how much of the AOI had a clear pass at all — and
    (b) the composition of what was seen (water vs cloud/land):
      * 'reliable'  — well-covered, mostly clear water, low cloud
      * 'degraded'  — usable, but partial coverage or some cloud/land contamination
      * 'unusable'  — barely observed, or cloud-/land-dominated where it was seen
    """
    water = surface.get("water_pct", 0.0)
    cloud = surface.get("cloud_pct", 0.0)
    coverage = surface.get("coverage_pct", 100.0)
    if coverage < 25 or not surface.get("water_valid", False) or cloud >= 60 or water < 15:
        return "unusable"
    if coverage >= 60 and cloud <= 20 and water >= 50:
        return "reliable"
    return "degraded"


def split_scl(arr):
    """(H,W,6) → ((H,W,5) reflectance, (H,W) SCL). No SCL channel → (arr, None)."""
    import numpy as np

    a = np.asarray(arr)
    if a.ndim == 3 and a.shape[-1] >= 6:
        return a[..., :5], a[..., 5]
    return a, None


def surface_from_scl(scl) -> dict:
    """Classify a real SCL array into water/land/cloud % of the OBSERVED area + a
    label + coverage.

    Percentages are OF THE OBSERVED PIXELS (nodata excluded), so a half-land AOI
    reads as ~50% land — not "0% land" diluted by no-observation gaps. `coverage_pct`
    reports how much of the AOI had a clear pass at all; low coverage is itself a
    reliability signal. FDI is only valid over water, so `water_valid` gates on both
    enough coverage AND enough observed water."""
    import numpy as np

    s = np.rint(np.asarray(scl)).astype("int32")
    total = int(s.size) or 1
    observed = int((~np.isin(s, _SCL_NODATA)).sum())
    coverage = observed / total * 100.0
    denom = observed or 1  # compose OVER the observed surface, not the full grid

    water = float(np.isin(s, _SCL_WATER).sum()) / denom * 100.0
    land = float(np.isin(s, _SCL_LAND).sum()) / denom * 100.0
    cloud = float(np.isin(s, _SCL_CLOUD).sum()) / denom * 100.0
    other = max(0.0, 100.0 - water - land - cloud)

    if observed == 0:
        label = "no-observation"
    elif cloud >= 80:
        label = "cloud"
    elif water >= 50 and water >= land:
        label = "water"
    elif land >= 40 and land > water:
        label = "land"
    elif water < 10:
        label = "land" if land >= cloud else "cloud"
    else:
        label = "mixed"

    out = {
        "water_pct": round(water, 1), "land_pct": round(land, 1),
        "cloud_pct": round(cloud, 1), "other_pct": round(other, 1),
        "coverage_pct": round(coverage, 1),
        "label": label, "water_valid": coverage >= 20.0 and water >= 15.0, "source": "scl",
    }
    out["reliability"] = reliability_for(out, None)
    return out


def mask_stats(scl) -> dict:
    """Fraction of pixels the candidacy keep-mask retains (configured SCL classes)."""
    import numpy as np

    keep = tuple(settings.ingest_keep_scl)
    valid = float(np.isin(np.rint(np.asarray(scl)).astype("int32"), keep).mean() * 100)
    return {"valid_pct": round(valid, 1), "masked_pct": round(100 - valid, 1)}
