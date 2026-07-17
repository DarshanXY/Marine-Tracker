"""Biofouling correction (opt-in enhancement).

Floating plastic accumulates algae/biofilm within days at sea; biofouling raises
NDVI and dampens the NIR/FDI signal, pushing weathered plastic toward the 'Algae'
class. This applies a small, documented correction: a candidate the model calls
Algae but with a plastic-like FDI and only moderate NDVI is nudged back toward
Plastic at reduced confidence.

HEURISTIC and OFF by default (enable with env BIOFOULING_CORRECTION=on) so it
never silently changes the validated held-out metrics.
"""
from __future__ import annotations

import os


def enabled() -> bool:
    return os.getenv("BIOFOULING_CORRECTION", "off").lower() in {"1", "true", "on", "yes"}


def correct(cls: str, confidence: float, bands: dict, fdi: float, force: bool = False) -> tuple[str, float]:
    """Return a possibly-corrected (class, confidence). No-op unless enabled (env)
    or `force` (per-request opt-in)."""
    if not (force or enabled()):
        return cls, confidence
    b04 = bands.get("B04", 0.0)
    b08 = bands.get("B08", 0.0)
    ndvi = (b08 - b04) / (b08 + b04 + 1e-6)
    # Algae-classified but plastic-like FDI and not strongly vegetated → likely
    # biofouled plastic. Reclassify at a deliberately reduced confidence.
    if cls == "Algae" and fdi > 0.03 and ndvi < 0.45:
        return "Plastic", round(min(0.75, confidence * 0.85 + 0.1), 2)
    return cls, confidence
