"""Spectral indices for marine-debris / water analysis.

Beyond FDI (the primary candidacy index, Biermann 2020) this adds the published
indices that corroborate a detection or improve the water mask:
  * NDVI  — vegetation/algae (red, NIR)
  * NDWI  — McFeeters (1996) water index (green B03, NIR); >0 ≈ water
  * FAI   — Hu (2009) Floating Algae Index (red, NIR, SWIR baseline)
  * PI    — Plastic Index NIR/(NIR+RED), elevated over plastic
Scalar + vectorised (numpy) forms. B03 (green) is needed only for NDWI.
"""
from __future__ import annotations

from .fdi_calculator import floating_debris_index

# Wavelengths (nm) for the FAI baseline (red → SWIR interpolated at NIR).
_LAM_RED, _LAM_NIR, _LAM_SWIR = 665.0, 842.0, 1610.0
_FAI_SLOPE = (_LAM_NIR - _LAM_RED) / (_LAM_SWIR - _LAM_RED)


def ndvi(b04: float, b08: float) -> float:
    return (b08 - b04) / (b08 + b04 + 1e-6)


def ndwi(b03: float, b08: float) -> float:
    """McFeeters NDWI (green, NIR): >0 ≈ open water. Needs B03."""
    return (b03 - b08) / (b03 + b08 + 1e-6)


def fai(b04: float, b08: float, b11: float) -> float:
    """Floating Algae Index — NIR above the red→SWIR baseline (Hu 2009)."""
    return b08 - (b04 + (b11 - b04) * _FAI_SLOPE)


def plastic_index(b04: float, b08: float) -> float:
    """PI = NIR / (NIR + RED); elevated for plastic-dominated pixels."""
    return b08 / (b08 + b04 + 1e-6)


def all_indices(b04: float, b06: float, b08: float, b11: float,
                b03: float = 0.0, b8a: float = 0.0) -> dict:
    """Full readout for one pixel. NDWI is None without a real B03."""
    return {
        "fdi": round(floating_debris_index(b06, b08, b11), 5),
        "ndvi": round(ndvi(b04, b08), 5),
        "ndwi": round(ndwi(b03, b08), 5) if b03 else None,
        "fai": round(fai(b04, b08, b11), 5),
        "plasticIndex": round(plastic_index(b04, b08), 5),
    }


# ── Vectorised (numpy) forms — for raster layers / exports ────────────────────
def ndvi_array(b04, b08):
    return (b08 - b04) / (b08 + b04 + 1e-6)


def ndwi_array(b03, b08):
    return (b03 - b08) / (b03 + b08 + 1e-6)


def fai_array(b04, b08, b11):
    return b08 - (b04 + (b11 - b04) * _FAI_SLOPE)
