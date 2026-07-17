"""Resample a 2-D band to a target grid — nearest or bilinear, pure numpy.

Sentinel Hub already returns all requested bands co-registered at the requested
width×height, so the core ingest path needs no resampling. This module exists for
the general case (mixing native 10/20/60 m bands onto a common grid, as the
MADOS loader does) and for exports. No GDAL/rasterio.
"""
from __future__ import annotations


def resample(band, out_h: int, out_w: int, method: str = "bilinear"):
    """(H, W) → (out_h, out_w). method ∈ {'nearest', 'bilinear'}."""
    import numpy as np

    a = np.asarray(band, dtype="float32")
    h, w = a.shape[:2]
    if (h, w) == (out_h, out_w):
        return a

    ys = np.linspace(0, h - 1, out_h)
    xs = np.linspace(0, w - 1, out_w)

    if method == "nearest":
        return a[np.round(ys).astype(int)[:, None], np.round(xs).astype(int)[None, :]]

    y0 = np.floor(ys).astype(int)
    x0 = np.floor(xs).astype(int)
    y1 = np.minimum(y0 + 1, h - 1)
    x1 = np.minimum(x0 + 1, w - 1)
    wy = (ys - y0)[:, None]
    wx = (xs - x0)[None, :]

    top = a[y0][:, x0] * (1 - wx) + a[y0][:, x1] * wx
    bot = a[y1][:, x0] * (1 - wx) + a[y1][:, x1] * wx
    return (top * (1 - wy) + bot * wy).astype("float32")
