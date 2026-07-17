"""Floating Debris Index (FDI) — Biermann et al. (2020).

Highlights material floating on water. The baseline is a linear interpolation
between the red-edge (B06) and SWIR (B11) bands evaluated at the NIR (B08)
wavelength; FDI is how far the observed NIR sits above that baseline.

    FDI = B08 − [ B06 + (B11 − B06) · ((λ8 − λ6) / (λ11 − λ6)) · 10 ]
"""
from __future__ import annotations

# Sentinel-2 central wavelengths (nanometres).
LAMBDA_B06 = 740.0
LAMBDA_B08 = 842.0
LAMBDA_B11 = 1610.0

SLOPE = (LAMBDA_B08 - LAMBDA_B06) / (LAMBDA_B11 - LAMBDA_B06)  # ≈ 0.1172


def floating_debris_index(b06: float, b08: float, b11: float) -> float:
    """FDI for a single pixel's band reflectances."""
    baseline = b06 + (b11 - b06) * SLOPE * 10.0
    return b08 - baseline


def fdi_array(b06, b08, b11):
    """Vectorised FDI over numpy arrays (same formula, elementwise)."""
    return b08 - (b06 + (b11 - b06) * SLOPE * 10.0)


def is_candidate(fdi: float, threshold: float) -> bool:
    """A pixel is a debris candidate when its FDI exceeds the threshold."""
    return fdi > threshold
