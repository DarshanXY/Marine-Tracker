"""CNN classification stage — classify candidate pixels into detections.

Patch model (64×64×C) → classify from windows cut out of arr6; per-pixel model or
heuristic → classify from each candidate's features. Returns (detections, plastic
count, mode) where detections are plain dicts with snake_case keys matching the
Detection schema. Ports the previous runner's CNN stage exactly; biofouling
correction is applied only if enabled (no-op by default → parity).
"""
from __future__ import annotations

from . import biofouling_corrector as bio
from . import inference_engine as infer
from .area_estimator import pixel_area_km2
from .confidence_filter import status_for

# Each candidate is one ~10 m grid cell → honest footprint is a single pixel.
_PIXEL_AREA_KM2 = pixel_area_km2()


def _detection(px: dict, fdi: float, cls: str, conf: float) -> dict:
    return {
        "lat": px["lat"], "lon": px["lon"], "classification": cls, "confidence": conf,
        "fdi_score": round(fdi, 4), "area_sq_km": _PIXEL_AREA_KM2, "status": status_for(conf),
    }


def classify_candidates(candidates: list[tuple[dict, float]], arr6, biofouling: bool = False):
    """candidates: list of (pixel, fdi). Returns (detections, plastic, mode).
    `biofouling=True` forces the biofouling correction for this call (else it's
    env-gated) — exposed as a per-request /pipeline/run option."""
    detections: list[dict] = []
    patch_used = False

    if infer.uses_patches() and arr6 is not None and candidates and "row" in candidates[0][0]:
        import numpy as np

        from satellite.patch_extractor import extract_patch
        size = infer.patch_size()
        stack = np.stack([extract_patch(arr6, px["row"], px["col"], size) for px, _ in candidates])
        preds = infer.classify_patches(stack) or []
        patch_used = bool(preds)
        for (px, fdi), (cls, conf) in zip(candidates, preds):
            cls, conf = bio.correct(cls, conf, px["bands"], fdi, force=biofouling)
            detections.append(_detection(px, fdi, cls, conf))
    else:
        for px, fdi in candidates:
            cls, conf = infer.classify(px["bands"], fdi)
            cls, conf = bio.correct(cls, conf, px["bands"], fdi, force=biofouling)
            detections.append(_detection(px, fdi, cls, conf))

    plastic = sum(1 for d in detections if d["classification"] == "Plastic")
    if patch_used:
        mode = "patch CNN"
    elif infer.model_loaded() and not infer.uses_patches():
        mode = "per-pixel model"
    else:
        mode = "heuristic"
    return detections, plastic, mode
