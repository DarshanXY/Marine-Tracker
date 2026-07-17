"""Reflectance band normalisation utilities.

Sentinel Hub returns surface reflectance (rhorc) already ~[0,1], but cloud tops
and sun-glint can exceed 1 (physically expected). `normalize_reflectance` makes
an array safe for index math — replaces non-finite values and clips to a sane
range — WITHOUT altering the FDI candidacy path (which uses raw reflectance to
stay identical to the validated pipeline). Use this for exports, training-data
sanitising, or display. Pure numpy.
"""
from __future__ import annotations


def normalize_reflectance(arr, lo: float = 0.0, hi: float = 1.6):
    """Clip to [lo, hi] and strip NaN/inf. hi=1.6 keeps bright cloud tops."""
    import numpy as np

    a = np.asarray(arr, dtype="float32")
    a = np.nan_to_num(a, nan=0.0, posinf=hi, neginf=lo)
    return np.clip(a, lo, hi)


def finite(arr):
    """Replace non-finite values with 0 (no clipping) — a minimal safety pass."""
    import numpy as np

    return np.nan_to_num(np.asarray(arr, dtype="float32"), nan=0.0, posinf=0.0, neginf=0.0)
