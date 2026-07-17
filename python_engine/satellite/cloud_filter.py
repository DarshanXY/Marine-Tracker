"""SCL candidacy keep-mask.

Which Sentinel-2 L2A SCL classes are KEPT as possible marine detections:
  2 = dark area (water can be dark), 6 = water, 7 = unclassified (floating debris
  is often unclassified at SCL's 20 m resolution).
Everything else is masked out of candidacy: cloud shadow (3), vegetation (4) /
bare soil (5) = LAND, cloud med/high (8,9), thin cirrus (10), snow (11),
nodata/defective (0,1). FDI fires on bright cloud tops, so an unmasked monsoon
scene is mostly false positives — hence the mask.
"""
from __future__ import annotations

KEEP_SCL = (2, 6, 7)


def keep_mask(scl):
    """Boolean array (H, W): True where the pixel may host a marine detection."""
    import numpy as np

    return np.isin(np.rint(np.asarray(scl)).astype("int32"), KEEP_SCL)
