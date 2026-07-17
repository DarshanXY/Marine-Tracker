"""Inference — ONNX predict + per-pixel heuristic fallback.

`classify(bands, fdi)` returns (class, confidence) for one pixel: the trained
per-pixel model when loaded, else an interpretable spectral heuristic. Patch
models classify from 64×64 windows via `predict_patches` (used by the
batch_classifier CNN stage), so per-pixel calls with a patch model fall back to
the heuristic. Behaviour is identical to the validated pipeline.
"""
from __future__ import annotations

from .model_loader import CLASSES, get_model, input_kind, is_available, patch_geometry


def model_loaded() -> bool:
    return is_available()


def uses_patches() -> bool:
    return input_kind() == "patch"


def patch_size() -> int:
    geom = patch_geometry()
    return geom["size"] if geom else 64


def _features(bands: dict[str, float], fdi: float) -> list[float]:
    b04 = bands.get("B04", 0.0)
    b06 = bands.get("B06", 0.0)
    b08 = bands.get("B08", 0.0)
    b8a = bands.get("B8A", 0.0)
    b11 = bands.get("B11", 0.0)
    eps = 1e-6
    ndvi = (b08 - b04) / (b08 + b04 + eps)
    # Engineered spectral indices — mirror ml.train_perpixel_gpu.augment11 EXACTLY
    # (the GPU-trained marinenet.onnx expects them). All derive from the same 5
    # bands the pipeline already fetches, so they cost zero extra data.
    pi = b08 / (b08 + b04 + eps)                 # Plastic Index (Biermann 2020)
    mndwi = (b08 - b11) / (b08 + b11 + eps)        # NIR-SWIR water / floating matter
    ndvi_re = (b8a - b06) / (b8a + b06 + eps)       # red-edge vegetation (algae)
    bright = (b04 + b06 + b08 + b8a + b11) / 5.0    # broadband brightness (foam/glint)
    return [b04, b06, b08, b8a, b11, fdi, ndvi, pi, mndwi, ndvi_re, bright]


def predict(features: list[float]) -> tuple[str, float] | None:
    """Run the model on one feature vector → (class, confidence), or None."""
    model = get_model()
    if model is None:
        return None
    import numpy as np

    out = np.asarray(model.run(np.asarray([features], dtype="float32")), dtype="float32")
    if out.ndim == 1:
        out = out[None, :]
    e = np.exp(out - out.max(axis=1, keepdims=True))
    probs = e / e.sum(axis=1, keepdims=True)
    idx = int(probs.argmax(axis=1)[0])
    conf = float(probs.max(axis=1)[0])
    return (CLASSES[idx] if idx < len(CLASSES) else str(idx)), round(conf, 2)


def predict_patches(patches) -> list[tuple[str, float]] | None:
    """patches: (N, size, size, C) NHWC float32 → list of (class, confidence)."""
    model = get_model()
    if model is None:
        return None
    import numpy as np

    geom = patch_geometry() or {"layout": "NCHW"}
    x = np.asarray(patches, dtype="float32")
    if geom["layout"] == "NCHW":
        x = np.transpose(x, (0, 3, 1, 2))
    out = np.asarray(model.run(x), dtype="float32")
    if out.ndim == 1:
        out = out[None, :]
    e = np.exp(out - out.max(axis=1, keepdims=True))
    probs = e / e.sum(axis=1, keepdims=True)
    idx = probs.argmax(axis=1)
    conf = probs.max(axis=1)
    return [
        (CLASSES[i] if i < len(CLASSES) else str(i), round(float(c), 2))
        for i, c in zip(idx.tolist(), conf.tolist())
    ]


def classify_patches(patches) -> list[tuple[str, float]] | None:
    return predict_patches(patches)


def classify(bands: dict[str, float], fdi: float) -> tuple[str, float]:
    """Return (class, confidence 0–1) for one candidate pixel (model or heuristic)."""
    if not uses_patches():
        predicted = predict(_features(bands, fdi))
        if predicted is not None:
            return predicted

    b04 = bands.get("B04", 0.0)
    b08 = bands.get("B08", 0.0)
    b11 = bands.get("B11", 0.0)
    ndvi = (b08 - b04) / (b08 + b04 + 1e-6)
    brightness = (b04 + b08 + b11) / 3.0

    if fdi > 0.028 and ndvi < 0.55:
        return "Plastic", round(min(0.98, 0.62 + fdi * 6.0), 2)
    if ndvi > 0.55:
        return "Algae", round(min(0.9, 0.55 + ndvi * 0.3), 2)
    if brightness > 0.22 and fdi < 0.02:
        return "Sea_Foam", round(min(0.85, 0.5 + brightness), 2)
    if fdi > 0.02:
        return "Plastic", round(min(0.7, 0.5 + fdi * 5.0), 2)
    return "Water", round(0.5 + max(0.0, fdi) * 2.0, 2)
