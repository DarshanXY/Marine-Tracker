"""Model evaluation — confusion matrix + per-class precision/recall/F1.

`per_class_prf` / `confusion` / `macro_f1` are the metrics the training pipeline
reports. `evaluate_npz` loads a cached MARIDA/MADOS split
(models/<name>_<split>.npz — the 7-feature vectors + labels) and scores the
loaded ONNX model on it, so held-out accuracy can be re-checked anytime.

Run:  python -m ml.evaluate            # evaluates marida+mados test splits
"""
from __future__ import annotations

from pathlib import Path

CLASSES = ("Plastic", "Algae", "Sea_Foam", "Water")
_MODELS_DIR = Path(__file__).resolve().parents[1] / "models"


def confusion(y_true, y_pred, n: int = 4):
    import numpy as np

    cm = np.zeros((n, n), dtype=int)
    for t, p in zip(y_true, y_pred):
        cm[int(t), int(p)] += 1
    return cm


def per_class_prf(cm) -> dict:
    import numpy as np

    cm = np.asarray(cm)
    out: dict = {}
    for i, name in enumerate(CLASSES):
        tp = cm[i, i]
        fp = cm[:, i].sum() - tp
        fn = cm[i, :].sum() - tp
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
        out[name] = {"precision": round(float(prec), 4), "recall": round(float(rec), 4), "f1": round(float(f1), 4)}
    return out


def macro_f1(prf: dict) -> float:
    return round(sum(v["f1"] for v in prf.values()) / max(len(prf), 1), 4)


def evaluate_npz(name: str = "marida", split: str = "test") -> dict | None:
    """Score the loaded ONNX model on a cached split → metrics dict, or None."""
    import numpy as np

    from .model_loader import get_model

    path = _MODELS_DIR / f"{name}_{split}.npz"
    model = get_model()
    if not path.exists() or model is None:
        return None
    d = np.load(path)
    x = d["x"].astype("float32")
    y = d["y"]
    out = np.asarray(model.run(x), dtype="float32")
    pred = out.argmax(1)
    cm = confusion(y, pred)
    prf = per_class_prf(cm)
    return {
        "accuracy": round(float((pred == y).mean()), 4),
        "macroF1": macro_f1(prf),
        "perClass": prf,
        "confusion": cm.tolist(),
        "samples": int(len(y)),
    }


if __name__ == "__main__":
    for ds in ("marida", "mados"):
        res = evaluate_npz(ds, "test")
        print(f"{ds} test:", res if res else "(no cache or no model)")
