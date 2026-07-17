"""ONNX model registry — lazy load + introspection + model card.

Loads CNN_MODEL_PATH (default python_engine/models/marinenet.onnx) only if the
file exists; onnxruntime is imported lazily so heuristic mode has no ORT cost or
hard dependency. Exposes what's loaded and its held-out metrics (metrics.json) as
a model card that flows /health → backend → frontend unchanged.
"""
from __future__ import annotations

import json
import logging
import os
import threading
from pathlib import Path

logger = logging.getLogger("engine.model")

CLASSES = ("Plastic", "Algae", "Sea_Foam", "Water")
# Per-pixel features fed to the model (order IS the runtime contract; must match
# inference_engine._features). The GPU-trained marinenet.onnx adds 4 engineered
# indices (PI, MNDWI, red-edge NDVI, brightness) after the base 7 — all derived
# from the same 5 bands, so still zero extra data.
FEATURE_NAMES = ("B04", "B06", "B08", "B8A", "B11", "FDI", "NDVI",
                 "PI", "MNDWI", "NDVI_RE", "BRIGHT")

_MODEL = None
_TRIED = False
# Routes run in FastAPI's threadpool, so several scans can call get_model() at
# once. Without this lock a second caller could observe _TRIED before the first
# finished loading and silently fall back to the heuristic.
_LOAD_LOCK = threading.Lock()

_MODELS_DIR = Path(__file__).resolve().parents[1] / "models"


def model_path() -> Path:
    env = os.getenv("CNN_MODEL_PATH")
    if env:
        return Path(env)
    return _MODELS_DIR / "marinenet.onnx"


class _OrtModel:
    """Thin wrapper so callers don't depend on the ORT session shape."""

    def __init__(self, session) -> None:
        self.session = session
        self.input_name = session.get_inputs()[0].name

    def run(self, x):
        return self.session.run(None, {self.input_name: x})[0]


def _strict() -> bool:
    """REQUIRE_MODEL=1 refuses to run in the un-benchmarked heuristic mode — set
    it in real/production runs so a missing or broken model fails loudly instead
    of silently degrading to hand-written rules."""
    return os.getenv("REQUIRE_MODEL", "").strip().lower() in ("1", "true", "yes", "on")


def get_model():
    """Load (once) the ONNX model if weights + onnxruntime are available.

    Uses the CUDA execution provider automatically when an onnxruntime-gpu build
    is installed, else CPU. Failures are LOGGED (not swallowed silently); with
    REQUIRE_MODEL set they raise instead of degrading to the heuristic.
    """
    global _MODEL, _TRIED
    if _TRIED:
        return _MODEL
    with _LOAD_LOCK:
        if _TRIED:  # another thread loaded it while we waited
            return _MODEL
        path = model_path()
        if not path.exists():
            _TRIED = True
            msg = (f"No model weights at {path} — detections would fall back to the "
                   f"interpretable heuristic (un-benchmarked).")
            if _strict():
                raise RuntimeError(msg + " REQUIRE_MODEL is set; refusing to start in heuristic mode.")
            logger.warning(msg)
            return None
        try:
            import onnxruntime as ort

            avail = set(ort.get_available_providers())
            prefer = [p for p in ("CUDAExecutionProvider", "CPUExecutionProvider") if p in avail] \
                or ["CPUExecutionProvider"]
            try:
                sess = ort.InferenceSession(str(path), providers=prefer)
            except Exception as gpu_exc:  # noqa: BLE001 — GPU provider present but CUDA/cuDNN missing
                if prefer != ["CPUExecutionProvider"]:
                    logger.warning("GPU execution provider unavailable (%r) — using CPU.", gpu_exc)
                    sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
                else:
                    raise
            _MODEL = _OrtModel(sess)
            logger.info("Loaded classifier %s on %s", path.name, _MODEL.session.get_providers())
        except Exception as exc:  # noqa: BLE001
            _MODEL = None
            msg = f"Failed to load classifier {path}: {exc!r} — falling back to the heuristic."
            if _strict():
                raise RuntimeError(msg + " REQUIRE_MODEL is set.") from exc
            logger.error(msg)
        _TRIED = True
    return _MODEL


def is_available() -> bool:
    return get_model() is not None


def _input_shape():
    model = get_model()
    return None if model is None else model.session.get_inputs()[0].shape


def input_kind() -> str:
    """'patch' (4-D CNN input), 'pixel' (2-D feature vector), or 'none'."""
    shape = _input_shape()
    if shape is None:
        return "none"
    return "patch" if len(shape) == 4 else "pixel"


def patch_geometry() -> dict | None:
    """For a patch model, infer {layout, channels, size} from the input shape."""
    shape = _input_shape()
    if not shape or len(shape) != 4:
        return None
    dims = [d if isinstance(d, int) else None for d in shape]
    _, a, b, c = dims
    if a in (5, 6):  # NCHW
        return {"layout": "NCHW", "channels": a, "size": b or c or 64}
    if c in (5, 6):  # NHWC
        return {"layout": "NHWC", "channels": c, "size": a or b or 64}
    return {"layout": "NCHW", "channels": 6, "size": 64}


def metrics_path() -> Path:
    return _MODELS_DIR / "metrics.json"


def _load_metrics() -> dict:
    path = metrics_path()
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return {}


def model_info() -> dict:
    """Model card: what's loaded + its held-out evaluation (from metrics.json)."""
    kind = input_kind()
    loaded = kind != "none"
    all_metrics = _load_metrics()
    section = all_metrics.get("perPixel") if kind == "pixel" else \
        all_metrics.get("patch") if kind == "patch" else None
    mode = {"pixel": "per-pixel model", "patch": "patch CNN"}.get(kind, "heuristic")
    dataset = (section or {}).get("dataset") or all_metrics.get("dataset")
    return {
        "loaded": loaded,
        "inputKind": kind,
        "mode": mode,
        "path": model_path().name if loaded else None,
        "classes": all_metrics.get("classes", list(CLASSES)),
        "dataset": dataset,
        "trained": (section or {}).get("trainedOn") or all_metrics.get("updated"),
        "geometry": patch_geometry(),
        "metrics": section,
    }


def reset() -> None:
    """Re-evaluate model availability on next call (tests / hot-swap)."""
    global _MODEL, _TRIED
    _MODEL = None
    _TRIED = False
