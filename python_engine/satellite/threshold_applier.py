"""FDI candidacy — turn a (H,W,5) reflectance array into candidate pixels.

Vectorised FDI over the whole array; a pixel is a candidate iff FDI > threshold
AND (if an SCL layer is given) its class is in the keep-mask. Returns
(pixels, arr6) where arr6 = (H,W,6) [B04,B06,B08,B8A,B11,FDI] used for patch
extraction. Pure numpy + network-free → unit-testable with a synthetic array.
"""
from __future__ import annotations

from .cloud_filter import keep_mask
from .fdi_calculator import fdi_array


def extract_candidates(arr, bbox: dict, threshold: float, max_candidates: int = 500, scl=None):
    """(H,W,5) reflectance → (pixels, arr6). Each pixel carries lat/lon, grid
    row/col and its bands; candidacy = FDI > threshold ∧ SCL keep-mask."""
    import numpy as np

    a = np.asarray(arr, dtype="float32")
    b04, b06, b08, b8a, b11 = a[..., 0], a[..., 1], a[..., 2], a[..., 3], a[..., 4]
    fdi = fdi_array(b06, b08, b11)
    arr6 = np.concatenate([a, fdi[..., None].astype("float32")], axis=-1)  # (H,W,6)

    height, width = fdi.shape
    candidate = fdi > threshold
    if scl is not None:
        candidate &= keep_mask(scl)
    ys, xs = np.where(candidate)
    count = len(ys)
    if count > max_candidates:
        pick = np.linspace(0, count - 1, max_candidates).astype(int)
        ys, xs = ys[pick], xs[pick]

    north, south = bbox["north"], bbox["south"]
    west, east = bbox["west"], bbox["east"]

    pixels: list[dict] = []
    for y, x in zip(ys.tolist(), xs.tolist()):
        lat = north - (y + 0.5) / height * (north - south)
        lon = west + (x + 0.5) / width * (east - west)
        pixels.append({
            "lat": round(float(lat), 5),
            "lon": round(float(lon), 5),
            "row": int(y),
            "col": int(x),
            "bands": {
                "B04": float(b04[y, x]), "B06": float(b06[y, x]), "B08": float(b08[y, x]),
                "B8A": float(b8a[y, x]), "B11": float(b11[y, x]),
            },
        })
    return pixels, arr6
