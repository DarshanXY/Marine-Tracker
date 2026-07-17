"""Hotspot severity from cluster size.

Spec thresholds: HIGH ≥ 10, MEDIUM ≥ 5, LOW ≥ 3 detections. `severity_for` is the
label; `is_alertable` is the gate the alert stage uses (HIGH/MEDIUM).
"""
from __future__ import annotations

HIGH_MIN = 10
MEDIUM_MIN = 5


def severity_for(count: int) -> str:
    if count >= HIGH_MIN:
        return "HIGH"
    if count >= MEDIUM_MIN:
        return "MEDIUM"
    return "LOW"


def is_alertable(severity: str) -> bool:
    return severity in ("HIGH", "MEDIUM")
