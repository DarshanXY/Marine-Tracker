"""Train the DEFAULT per-pixel classifier on the synthetic library → ONNX.

A small 1-hidden-layer MLP (7 → 16 → 4, ReLU) trained by pure-numpy Adam on the
richer synthetic spectral library (dataset.py). Input standardisation is folded
into the first Gemm so the ONNX takes RAW features [B04,B06,B08,B8A,B11,FDI,NDVI].
An honest SYNTHETIC baseline — the real MARIDA+MADOS model (train_combined.py) is
what ships. A trained model exported to the same [N,7]→[N,4] contract drops in at
CNN_MODEL_PATH.

Run:  python -m ml.train
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

from .datasets import dataset as ds

HIDDEN = 16


def _softmax(z: np.ndarray) -> np.ndarray:
    z = z - z.max(1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(1, keepdims=True)


def train(x: np.ndarray, y: np.ndarray, hidden: int = HIDDEN,
          epochs: int = 800, lr: float = 0.01, seed: int = 0):
    """Adam-trained MLP; returns raw-feature weights (standardisation folded in)."""
    rng = np.random.default_rng(seed)
    n, feats = x.shape
    classes = int(y.max()) + 1
    mean = x.mean(0); std = x.std(0) + 1e-6
    xs = ((x - mean) / std).astype(np.float64)
    onehot = np.eye(classes)[y]

    w1 = rng.normal(0, np.sqrt(2.0 / feats), (feats, hidden))
    b1 = np.zeros(hidden)
    w2 = rng.normal(0, np.sqrt(2.0 / hidden), (hidden, classes))
    b2 = np.zeros(classes)
    params = [w1, b1, w2, b2]
    m = [np.zeros_like(p) for p in params]
    v = [np.zeros_like(p) for p in params]
    b1t, b2t = 0.9, 0.999

    for t in range(1, epochs + 1):
        h_pre = xs @ w1 + b1
        h = np.maximum(0, h_pre)
        probs = _softmax(h @ w2 + b2)
        dlogits = (probs - onehot) / n
        gw2 = h.T @ dlogits; gb2 = dlogits.sum(0)
        dh = (dlogits @ w2.T) * (h_pre > 0)
        gw1 = xs.T @ dh; gb1 = dh.sum(0)
        grads = [gw1, gb1, gw2, gb2]
        for i, (p, g) in enumerate(zip(params, grads)):
            m[i] = b1t * m[i] + (1 - b1t) * g
            v[i] = b2t * v[i] + (1 - b2t) * g * g
            mhat = m[i] / (1 - b1t ** t); vhat = v[i] / (1 - b2t ** t)
            p -= lr * mhat / (np.sqrt(vhat) + 1e-8)

    w1_raw = (w1 / std[:, None]).astype(np.float32)
    b1_raw = (b1 - (mean / std) @ w1).astype(np.float32)
    return w1_raw, b1_raw, w2.astype(np.float32), b2.astype(np.float32)


def forward(x: np.ndarray, p) -> np.ndarray:
    w1, b1, w2, b2 = p
    h = np.maximum(0, x @ w1 + b1)
    return h @ w2 + b2


def export_onnx(p, path: Path) -> None:
    import onnx
    from onnx import TensorProto, helper, numpy_helper

    w1, b1, w2, b2 = p
    n1 = helper.make_node("Gemm", ["input", "W1", "b1"], ["h_pre"], alpha=1.0, beta=1.0)
    n2 = helper.make_node("Relu", ["h_pre"], ["h"])
    n3 = helper.make_node("Gemm", ["h", "W2", "b2"], ["output"], alpha=1.0, beta=1.0)
    graph = helper.make_graph(
        [n1, n2, n3], "marinenet_baseline",
        [helper.make_tensor_value_info("input", TensorProto.FLOAT, [None, w1.shape[0]])],
        [helper.make_tensor_value_info("output", TensorProto.FLOAT, [None, w2.shape[1]])],
        [numpy_helper.from_array(w1, "W1"), numpy_helper.from_array(b1, "b1"),
         numpy_helper.from_array(w2, "W2"), numpy_helper.from_array(b2, "b2")],
    )
    model = helper.make_model(
        graph, opset_imports=[helper.make_opsetid("", 13)],
        producer_name="marine-plastic-tracker",
        doc_string="Baseline per-pixel marine-plastic classifier (MLP on synthetic spectra).",
    )
    onnx.save(model, str(path))


def main() -> None:
    x, y = ds.pixel_dataset(40000, seed=42)
    xv, yv = ds.pixel_dataset(8000, seed=7)
    xt, yt = ds.pixel_dataset(8000, seed=123)

    p = train(x, y)
    train_acc = float((forward(x, p).argmax(1) == y).mean())
    val_acc = float((forward(xv, p).argmax(1) == yv).mean())
    print(f"MLP 7->{HIDDEN}->4 | train acc {train_acc:.3f} | val acc {val_acc:.3f}")

    out = Path(__file__).resolve().parents[1] / "models" / "marinenet.onnx"
    out.parent.mkdir(parents=True, exist_ok=True)
    export_onnx(p, out)

    import onnxruntime as ort
    sess = ort.InferenceSession(str(out), providers=["CPUExecutionProvider"])
    onnx_pred = sess.run(None, {"input": xt.astype(np.float32)})[0].argmax(1)
    numpy_pred = forward(xt, p).argmax(1)
    agreement = float((onnx_pred == numpy_pred).mean())
    test_acc = float((onnx_pred == yt).mean())
    cm = ds.confusion(yt, onnx_pred)
    prf = ds.per_class_prf(cm)

    print(f"onnx == numpy: {agreement:.3f} | held-out test acc: {test_acc:.3f}")
    ds.print_confusion(cm)

    ds.save_metrics(out.parent, "perPixel", {
        "model": out.name,
        "arch": f"per-pixel MLP {x.shape[1]}->{HIDDEN}->4 (ReLU)",
        "input": "per-pixel features",
        "features": list(ds.FEATURE_NAMES),
        "trainSamples": int(x.shape[0]),
        "trainAccuracy": round(train_acc, 4),
        "valAccuracy": round(val_acc, 4),
        "testAccuracy": round(test_acc, 4),
        "onnxAgreement": round(agreement, 4),
        "perClass": prf,
        "confusion": cm.tolist(),
    })
    print(f"saved -> {out}  (+ metrics.json)")


if __name__ == "__main__":
    main()
