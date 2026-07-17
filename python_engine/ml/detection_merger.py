"""Merge near-duplicate detections (opt-in dedupe).

Adjacent candidate pixels can produce several detections for one physical patch.
`merge` collapses detections within `eps_deg` into the highest-confidence
representative. Off in the main path (kept 1:1 with the validated pipeline);
useful before exports or reporting.
"""
from __future__ import annotations

import math


def merge(detections: list[dict], eps_deg: float = 0.002) -> list[dict]:
    kept: list[dict] = []
    for d in sorted(detections, key=lambda x: x.get("confidence", 0.0), reverse=True):
        if all(math.hypot(d["lat"] - k["lat"], d["lon"] - k["lon"]) > eps_deg for k in kept):
            kept.append(d)
    return kept
