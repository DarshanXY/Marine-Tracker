"""Shared synthetic Sentinel-2 dataset for the baseline classifiers.

A richer, larger stand-in for MARIDA/MADOS: a small spectral LIBRARY with several
endmembers per class, within-class variance, linear sub-pixel MIXING, additive
sun-glint contamination, coastal turbidity and per-band sensor noise. It is still
SYNTHETIC — the point is a reproducible, dependency-light (pure numpy) dataset
that makes the ONNX path real end-to-end. A real labelled dataset drops into the
SAME contract:  per-pixel features [B04,B06,B08,B8A,B11,FDI,NDVI] → 4 classes, and
64x64x6 patches [B04,B06,B08,B8A,B11,FDI] → 4 classes.

Because the library deliberately overlaps at the class boundaries (weathered
plastic vs. turbid water, debris+foam vs. whitecaps, diffuse bloom vs. sargassum),
it is HARDER than a one-endmember-per-class toy — which is exactly why the
per-pixel head is a small MLP rather than a bare linear model.
"""
from __future__ import annotations

import numpy as np

CLASSES = ("Plastic", "Algae", "Sea_Foam", "Water")
# Per-pixel feature order — the model contract (matches ml.model_loader.FEATURE_NAMES
# and ml.inference_engine._features).
FEATURE_NAMES = ("B04", "B06", "B08", "B8A", "B11", "FDI", "NDVI")
# Patch channel order (no NDVI — the CNN sees the raw stack + FDI).
PATCH_CHANNELS = ("B04", "B06", "B08", "B8A", "B11", "FDI")

# FDI slope: (λ_B08 − λ_B06) / (λ_B11 − λ_B06), ×10 as in the Biermann formula.
SLOPE10 = ((842.0 - 740.0) / (1610.0 - 740.0)) * 10.0

# Spectral library: (b06, b06_sd, b11, b11_sd, fdi_lo, fdi_hi, b04, b04_sd) per
# endmember. b08 is derived from the FDI baseline so FDI is controlled directly;
# b8a is a near-copy of b08. Several endmembers per class create realistic spread
# and overlap. Weights bias sampling toward the more common sub-types.
_LIBRARY: dict[int, list[tuple[str, float, tuple]]] = {
    0: [  # Plastic / floating marine debris — positive FDI, moderate red
        ("hdpe_dense",  0.45, (0.10, 0.02, 0.060, 0.010, 0.045, 0.090, 0.055, 0.012)),
        ("weathered",   0.35, (0.09, 0.02, 0.055, 0.010, 0.022, 0.050, 0.045, 0.012)),
        ("debris_foam", 0.20, (0.14, 0.02, 0.110, 0.020, 0.020, 0.045, 0.110, 0.020)),
    ],
    1: [  # Algae / sargassum / bloom — high NDVI (low red), modest FDI
        ("sargassum",     0.55, (0.09, 0.02, 0.050, 0.010, 0.015, 0.045, 0.020, 0.006)),
        ("bloom_diffuse", 0.45, (0.08, 0.02, 0.050, 0.010, 0.008, 0.030, 0.025, 0.008)),
    ],
    2: [  # Sea foam / whitecaps / sun glint — bright, flat, weak FDI
        ("whitecap",  0.60, (0.16, 0.02, 0.140, 0.020, -0.006, 0.012, 0.150, 0.025)),
        ("sun_glint", 0.40, (0.20, 0.03, 0.180, 0.030, -0.008, 0.010, 0.190, 0.030)),
    ],
    3: [  # Water — dark to turbid, FDI near zero
        ("open_clear",    0.60, (0.06, 0.015, 0.030, 0.008, -0.012, 0.008, 0.030, 0.008)),
        ("coastal_turbid", 0.40, (0.11, 0.020, 0.050, 0.012, -0.010, 0.010, 0.090, 0.020)),
    ],
}


def _fdi_baseline(b06, b11):
    return b06 + (b11 - b06) * SLOPE10


def _sample_bands(cls: int, rng: np.random.Generator) -> np.ndarray:
    """One endmember draw → [b04, b06, b08, b8a, b11] (pre-noise reflectance)."""
    subs = _LIBRARY[cls]
    weights = np.array([w for _, w, _ in subs])
    idx = rng.choice(len(subs), p=weights / weights.sum())
    _, _, (b06_m, b06_s, b11_m, b11_s, f_lo, f_hi, b04_m, b04_s) = subs[idx]
    b06 = max(0.0, b06_m + rng.normal(0, b06_s))
    b11 = max(0.0, b11_m + rng.normal(0, b11_s))
    fdi = rng.uniform(f_lo, f_hi)
    b08 = max(0.0, _fdi_baseline(b06, b11) + fdi)
    b8a = b08 * rng.uniform(0.93, 0.97)
    b04 = max(0.0, b04_m + rng.normal(0, b04_s))
    return np.array([b04, b06, b08, b8a, b11], dtype=np.float64)


def _mix_and_contaminate(cls: int, rng: np.random.Generator) -> np.ndarray:
    """Sub-pixel mixing (within-class), additive sun glint, sensor noise."""
    bands = _sample_bands(cls, rng)
    if rng.random() < 0.30:  # within-class mixing (label-safe)
        f = rng.uniform(0.2, 0.8)
        bands = f * bands + (1 - f) * _sample_bands(cls, rng)
    if rng.random() < 0.15:  # additive broadband sun glint — preserves FDI
        bands = bands + rng.uniform(0.0, 0.03)
    bands = bands + rng.normal(0, 0.004, size=5)  # per-band sensor noise
    return np.clip(bands, 0.0, None)


def _features_from_bands(bands: np.ndarray) -> np.ndarray:
    """[b04,b06,b08,b8a,b11] → [b04,b06,b08,b8a,b11,FDI,NDVI]."""
    b04, b06, b08, b8a, b11 = bands
    fdi = b08 - _fdi_baseline(b06, b11)
    ndvi = (b08 - b04) / (b08 + b04 + 1e-6)
    return np.array([b04, b06, b08, b8a, b11, fdi, ndvi], dtype=np.float32)


def pixel_dataset(n: int = 40000, seed: int = 42) -> tuple[np.ndarray, np.ndarray]:
    """Per-pixel training set → (X [n,7] float32, y [n] int64), balanced classes."""
    rng = np.random.default_rng(seed)
    x = np.empty((n, 7), dtype=np.float32)
    y = np.empty(n, dtype=np.int64)
    for i in range(n):
        cls = i % 4
        x[i] = _features_from_bands(_mix_and_contaminate(cls, rng))
        y[i] = cls
    return x, y


# --- Patch interface ------------------------------------------------------- #
def _patch_channels(bands: np.ndarray) -> np.ndarray:
    """[b04,b06,b08,b8a,b11] → 6-channel patch signal [B04,B06,B08,B8A,B11,FDI]."""
    b04, b06, b08, b8a, b11 = bands
    fdi = b08 - _fdi_baseline(b06, b11)
    return np.array([b04, b06, b08, b8a, b11, fdi], dtype=np.float32)


def patch_pooled_dataset(n: int = 16000, seed: int = 43) -> tuple[np.ndarray, np.ndarray]:
    """Global-average-pooled patch features → (X [n,6], y [n])."""
    rng = np.random.default_rng(seed)
    x = np.empty((n, 6), dtype=np.float32)
    y = np.empty(n, dtype=np.int64)
    for i in range(n):
        cls = i % 4
        target = _patch_channels(_mix_and_contaminate(cls, rng))
        if cls == 3:
            pooled = target
        else:
            water = _patch_channels(_mix_and_contaminate(3, rng))
            cover = rng.uniform(0.4, 1.0)
            pooled = cover * target + (1 - cover) * water
        x[i] = pooled + rng.normal(0, 0.002, size=6).astype(np.float32)
        y[i] = cls
    return x, y


def make_patches(n: int, seed: int, size: int = 64) -> tuple[np.ndarray, np.ndarray]:
    """Full spatial patches for held-out verification → (X [n,size,size,6] NHWC, y)."""
    rng = np.random.default_rng(seed)
    x = np.zeros((n, size, size, 6), dtype=np.float32)
    y = np.zeros(n, dtype=np.int64)
    for i in range(n):
        cls = i % 4
        bg = _patch_channels(_mix_and_contaminate(3, rng))
        patch = np.broadcast_to(bg, (size, size, 6)).astype(np.float32).copy()
        if cls != 3:
            target = _patch_channels(_mix_and_contaminate(cls, rng))
            cover = rng.uniform(0.4, 1.0)
            side = int(round(size * cover ** 0.5))
            r0 = rng.integers(0, max(1, size - side + 1))
            c0 = rng.integers(0, max(1, size - side + 1))
            patch[r0:r0 + side, c0:c0 + side, :] = target
        patch += rng.normal(0, 0.004, (size, size, 6)).astype(np.float32)
        x[i] = np.clip(patch, 0.0, None)
        y[i] = cls
    return x, y


# --- Evaluation helpers ---------------------------------------------------- #
def confusion(y_true: np.ndarray, y_pred: np.ndarray, k: int = 4) -> np.ndarray:
    m = np.zeros((k, k), dtype=np.int64)
    for t, p in zip(y_true.tolist(), y_pred.tolist()):
        m[t, p] += 1
    return m


def per_class_prf(cm: np.ndarray) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    for i, name in enumerate(CLASSES):
        tp = int(cm[i, i])
        fn = int(cm[i, :].sum() - tp)
        fp = int(cm[:, i].sum() - tp)
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
        out[name] = {"precision": round(prec, 4), "recall": round(rec, 4), "f1": round(f1, 4)}
    return out


def print_confusion(cm: np.ndarray) -> None:
    head = "            " + "".join(f"{c[:8]:>10}" for c in CLASSES)
    print(head + "   (pred ->)")
    for i, name in enumerate(CLASSES):
        row = "".join(f"{int(v):>10}" for v in cm[i])
        print(f"{name:>10}  {row}")


DATASET_DESC = (
    "synthetic Sentinel-2 spectral library: 9 endmembers across 4 classes with "
    "within-class mixing, additive sun-glint, coastal turbidity and sensor noise"
)


def save_metrics(models_dir, key: str, section: dict) -> None:
    """Merge one section into models/metrics.json (read-modify-write)."""
    import json
    from datetime import datetime, timezone
    from pathlib import Path

    path = Path(models_dir) / "metrics.json"
    data: dict = {}
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            data = {}
    data[key] = section
    data["dataset"] = DATASET_DESC
    data["classes"] = list(CLASSES)
    data["updated"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
