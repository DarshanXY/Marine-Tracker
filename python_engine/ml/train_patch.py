"""Train the PATCH-based baseline classifier and export it to ONNX.

The ONNX takes 64x64x6 patches ([N,6,64,64] NCHW; channels B04,B06,B08,B8A,B11,FDI)
and outputs 4 class logits — the exact shape the engine's patch path feeds. The
head is global-average-pool + linear (ReduceMean + Gemm), a reproducible pure-numpy
BASELINE (not a real ResNet-50; a trained ResNet-50 exported to the same contract
drops in with no code change). Trained on the synthetic library with targets at
FRACTIONAL coverage (0.4–1.0). Sub-0.4 coverage is the honest GAP blind spot.

Run:  python -m ml.train_patch
Then: set CNN_MODEL_PATH=models/marinenet_patch.onnx to use it (default stays per-pixel).
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

from .datasets import dataset as ds

SIZE = 64
CHANNELS = 6  # B04, B06, B08, B8A, B11, FDI


def train(x: np.ndarray, y: np.ndarray, classes: int = 4, epochs: int = 900, lr: float = 0.4):
    """Logistic head on pooled channel-means; standardisation folded into the Gemm."""
    n, feats = x.shape
    mean = x.mean(0); std = x.std(0) + 1e-6
    xs = (x - mean) / std
    w = np.zeros((feats, classes)); b = np.zeros(classes)
    onehot = np.eye(classes)[y]
    for _ in range(epochs):
        logits = xs @ w + b
        logits -= logits.max(1, keepdims=True)
        e = np.exp(logits); probs = e / e.sum(1, keepdims=True)
        w -= lr * (xs.T @ (probs - onehot) / n)
        b -= lr * (probs - onehot).mean(0)
    w_raw = (w / std[:, None]).astype(np.float32)
    b_raw = (b - (mean / std) @ w).astype(np.float32)
    return w_raw, b_raw


def export_onnx(w_raw: np.ndarray, b_raw: np.ndarray, path: Path) -> None:
    import onnx
    from onnx import TensorProto, helper, numpy_helper

    pool = helper.make_node("ReduceMean", ["input"], ["pooled"], axes=[2, 3], keepdims=0)
    gemm = helper.make_node("Gemm", ["pooled", "W", "b"], ["output"], alpha=1.0, beta=1.0)
    graph = helper.make_graph(
        [pool, gemm], "marinenet_patch",
        [helper.make_tensor_value_info("input", TensorProto.FLOAT, [None, CHANNELS, SIZE, SIZE])],
        [helper.make_tensor_value_info("output", TensorProto.FLOAT, [None, 4])],
        [numpy_helper.from_array(w_raw, "W"), numpy_helper.from_array(b_raw, "b")],
    )
    model = helper.make_model(
        graph, opset_imports=[helper.make_opsetid("", 13)],
        producer_name="marine-plastic-tracker",
        doc_string="Baseline patch classifier (global-average-pool + linear) on synthetic 64x64x6 patches.",
    )
    onnx.save(model, str(path))


def main() -> None:
    x, y = ds.patch_pooled_dataset(16000, seed=43)
    w_raw, b_raw = train(x, y)
    pooled_acc = float(((x @ w_raw + b_raw).argmax(1) == y).mean())
    print(f"patch head train acc (pooled): {pooled_acc:.3f}")

    out = Path(__file__).resolve().parents[1] / "models" / "marinenet_patch.onnx"
    out.parent.mkdir(parents=True, exist_ok=True)
    export_onnx(w_raw, b_raw, out)

    import onnxruntime as ort
    sess = ort.InferenceSession(str(out), providers=["CPUExecutionProvider"])
    xp, yp = ds.make_patches(1200, seed=7, size=SIZE)
    x_nchw = np.transpose(xp, (0, 3, 1, 2)).astype(np.float32)
    pred = sess.run(None, {"input": x_nchw})[0].argmax(1)
    patch_acc = float((pred == yp).mean())
    cm = ds.confusion(yp, pred)
    prf = ds.per_class_prf(cm)

    print(f"patch held-out acc: {patch_acc:.3f} | input [N,{CHANNELS},{SIZE},{SIZE}]")
    ds.print_confusion(cm)

    ds.save_metrics(out.parent, "patch", {
        "model": out.name,
        "arch": "patch GAP + linear (ReduceMean + Gemm), baseline for ResNet-50",
        "input": f"{SIZE}x{SIZE}x{CHANNELS} patch [N,{CHANNELS},{SIZE},{SIZE}] NCHW",
        "channels": list(ds.PATCH_CHANNELS),
        "trainSamples": int(x.shape[0]),
        "trainAccuracy": round(pooled_acc, 4),
        "testAccuracy": round(patch_acc, 4),
        "perClass": prf,
        "confusion": cm.tolist(),
        "note": "opt-in via CNN_MODEL_PATH; sub-0.4-coverage targets are the GAP blind spot",
    })
    print(f"saved -> {out}  (+ metrics.json)")


if __name__ == "__main__":
    main()
