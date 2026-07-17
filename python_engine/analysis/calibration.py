"""Confidence calibration.

Raw softmax confidence is NOT a reliability estimate — e.g. the model's Sea_Foam
precision is only ~0.02, so a 0.9 'Sea_Foam' is not 90% trustworthy. `calibrate`
scales a raw confidence by that class's held-out PRECISION (from metrics.json) —
a documented, honest reliability proxy. No-op (returns the raw value) when metrics
are absent, so the base path is unchanged.
"""
from __future__ import annotations

from ml.model_loader import _load_metrics


def class_precisions() -> dict[str, float]:
    per_class = (_load_metrics().get("perPixel") or {}).get("perClass") or {}
    return {k: float(v.get("precision", 1.0)) for k, v in per_class.items()}


def calibrate(cls: str, confidence: float, precisions: dict | None = None) -> float:
    """Reliability-adjusted confidence = raw × class precision."""
    precisions = precisions if precisions is not None else class_precisions()
    return round(confidence * precisions.get(cls, 1.0), 3)
