"""SCL candidacy keep-mask.

Which Sentinel-2 L2A SCL classes are KEPT as possible marine detections. The set
is settings-driven (`settings.ingest_keep_scl`) so it can be tuned without a code
change; the default keeps:
  6 = water, 7 = unclassified (floating debris is often unclassified at SCL's 20 m
  resolution).
Everything else is masked out of candidacy: dark area (2) = terrain/cloud shadow
(the biggest land/haze false-positive leak, dropped by default), cloud shadow (3),
vegetation (4) / bare soil (5) = LAND, cloud med/high (8,9), thin cirrus (10),
snow (11), nodata/defective (0,1). FDI fires on bright cloud tops, so an unmasked
monsoon scene is mostly false positives — hence the mask.
"""
from __future__ import annotations

from config import settings

# Kept for callers importing the constant directly (e.g. mask_stats). Reflects the
# configured default at import; keep_mask() reads settings live so an env override
# still applies.
KEEP_SCL = tuple(settings.ingest_keep_scl)


def keep_mask(scl):
    """Boolean array (H, W): True where the pixel may host a marine detection."""
    import numpy as np

    return np.isin(np.rint(np.asarray(scl)).astype("int32"), tuple(settings.ingest_keep_scl))
