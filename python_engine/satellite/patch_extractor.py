"""Patch extraction for a patch-based CNN (e.g. ResNet-50 on 64×64×6).

Given the multi-channel reflectance array (bands + FDI) and a candidate pixel's
grid position, cut a fixed-size window centred on it. Windows are clamped to the
array bounds and zero-padded if the array is smaller than the patch — so edge
detections still classify.
"""
from __future__ import annotations


def extract_patch(arr, row: int, col: int, size: int = 64):
    """arr: (H, W, C) float array → (size, size, C) window centred on (row, col)."""
    import numpy as np

    height, width, channels = arr.shape
    half = size // 2

    if height >= size:
        r0 = min(max(row - half, 0), height - size)
    else:
        r0 = 0
    if width >= size:
        c0 = min(max(col - half, 0), width - size)
    else:
        c0 = 0

    window = arr[r0:r0 + size, c0:c0 + size]
    if window.shape[0] != size or window.shape[1] != size:
        padded = np.zeros((size, size, channels), dtype=arr.dtype)
        padded[:window.shape[0], :window.shape[1]] = window
        window = padded
    return window
