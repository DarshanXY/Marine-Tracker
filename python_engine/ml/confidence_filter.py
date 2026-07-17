"""Confidence gating for detections.

`status_for` maps a confidence to the CONFIRMED/PENDING label (auto-confirm at
≥0.85, else needs human validation) — identical to the validated pipeline.
`filter_by_confidence` optionally drops low-confidence detections (off in the
main path; useful for stricter reports/exports).
"""
from __future__ import annotations

AUTO_CONFIRM = 0.85


def status_for(confidence: float) -> str:
    return "CONFIRMED" if confidence >= AUTO_CONFIRM else "PENDING"


def filter_by_confidence(detections: list[dict], min_conf: float = 0.0) -> list[dict]:
    return [d for d in detections if d.get("confidence", 0.0) >= min_conf]
