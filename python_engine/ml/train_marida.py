"""Train the per-pixel classifier on the REAL MARIDA dataset → marinenet.onnx.

Model trained on hand-labelled Sentinel-2 pixels (Kikaki et al. 2022). Same
7-feature contract [B04,B06,B08,B8A,B11,FDI,NDVI] and ONNX output, so it drops
into the engine unchanged. Inverse-frequency class weighting copes with MARIDA's
extreme imbalance (Water ≫ Foam ~700:1). `train`/`forward`/`export_onnx`/`macro_f1`
are re-used by train_combined.py.

Run:  python -m ml.train_marida
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

from .datasets import dataset as ds
from .datasets import marida

HIDDEN1, HIDDEN2 = 32, 16


def _softmax(z):
    z = z - z.max(1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(1, keepdims=True)


def train(x, y, w_class, epochs=4000, lr=0.01, seed=0):
    """Weighted 2-hidden-layer MLP via Adam; standardisation folded into layer 1."""
    rng = np.random.default_rng(seed)
    n, feats = x.shape
    classes = 4
    mean = x.mean(0); std = x.std(0) + 1e-6
    xs = ((x - mean) / std).astype(np.float64)
    onehot = np.eye(classes)[y]
    sw = w_class[y][:, None]
    sw_sum = sw.sum()

    def he(a, b):
        return rng.normal(0, np.sqrt(2.0 / a), (a, b))

    w1, b1 = he(feats, HIDDEN1), np.zeros(HIDDEN1)
    w2, b2 = he(HIDDEN1, HIDDEN2), np.zeros(HIDDEN2)
    w3, b3 = he(HIDDEN2, classes), np.zeros(classes)
    params = [w1, b1, w2, b2, w3, b3]
    m = [np.zeros_like(p) for p in params]
    v = [np.zeros_like(p) for p in params]
    beta1, beta2 = 0.9, 0.999

    for t in range(1, epochs + 1):
        z1 = xs @ w1 + b1; a1 = np.maximum(0, z1)
        z2 = a1 @ w2 + b2; a2 = np.maximum(0, z2)
        probs = _softmax(a2 @ w3 + b3)
        dz3 = sw * (probs - onehot) / sw_sum
        gw3 = a2.T @ dz3; gb3 = dz3.sum(0)
        da2 = dz3 @ w3.T; dz2 = da2 * (z2 > 0)
        gw2 = a1.T @ dz2; gb2 = dz2.sum(0)
        da1 = dz2 @ w2.T; dz1 = da1 * (z1 > 0)
        gw1 = xs.T @ dz1; gb1 = dz1.sum(0)
        grads = [gw1, gb1, gw2, gb2, gw3, gb3]
        for i, (p, g) in enumerate(zip(params, grads)):
            m[i] = beta1 * m[i] + (1 - beta1) * g
            v[i] = beta2 * v[i] + (1 - beta2) * g * g
            mhat = m[i] / (1 - beta1 ** t); vhat = v[i] / (1 - beta2 ** t)
            p -= lr * mhat / (np.sqrt(vhat) + 1e-8)

    w1_raw = (w1 / std[:, None]).astype(np.float32)
    b1_raw = (b1 - (mean / std) @ w1).astype(np.float32)
    return [w1_raw, b1_raw, w2.astype(np.float32), b2.astype(np.float32),
            w3.astype(np.float32), b3.astype(np.float32)]


def forward(x, p):
    w1, b1, w2, b2, w3, b3 = p
    a1 = np.maximum(0, x @ w1 + b1)
    a2 = np.maximum(0, a1 @ w2 + b2)
    return a2 @ w3 + b3


def export_onnx(p, path: Path):
    import onnx
    from onnx import TensorProto, helper, numpy_helper

    w1, b1, w2, b2, w3, b3 = p
    nodes = [
        helper.make_node("Gemm", ["input", "W1", "B1"], ["z1"]),
        helper.make_node("Relu", ["z1"], ["a1"]),
        helper.make_node("Gemm", ["a1", "W2", "B2"], ["z2"]),
        helper.make_node("Relu", ["z2"], ["a2"]),
        helper.make_node("Gemm", ["a2", "W3", "B3"], ["output"]),
    ]
    inits = [numpy_helper.from_array(a, n) for a, n in
             [(w1, "W1"), (b1, "B1"), (w2, "W2"), (b2, "B2"), (w3, "W3"), (b3, "B3")]]
    graph = helper.make_graph(
        nodes, "marinenet_marida",
        [helper.make_tensor_value_info("input", TensorProto.FLOAT, [None, w1.shape[0]])],
        [helper.make_tensor_value_info("output", TensorProto.FLOAT, [None, w3.shape[1]])],
        inits,
    )
    model = helper.make_model(
        graph, opset_imports=[helper.make_opsetid("", 13)],
        producer_name="marine-plastic-tracker",
        doc_string="Per-pixel marine classifier trained on the real MARIDA dataset (Kikaki 2022).",
    )
    onnx.save(model, str(path))


def macro_f1(prf: dict) -> float:
    return float(np.mean([s["f1"] for s in prf.values()]))


def main() -> None:
    print("loading MARIDA splits (cached after first run)…")
    xtr, ytr = marida.load_split("train")
    xva, yva = marida.load_split("val")
    xte, yte = marida.load_split("test")
    print(f"train {marida.class_histogram(ytr)}")
    print(f"test  {marida.class_histogram(yte)}")

    counts = np.array([(ytr == c).sum() for c in range(4)], dtype=float)
    w_class = ytr.shape[0] / (4.0 * np.maximum(counts, 1))
    print("class weights:", {marida.CLASSES[c]: round(float(w_class[c]), 2) for c in range(4)})

    p = train(xtr, ytr, w_class)

    def report(x, y):
        pred = forward(x, p).argmax(1)
        acc = float((pred == y).mean())
        cm = ds.confusion(y, pred)
        return acc, cm, ds.per_class_prf(cm)

    tr_acc, _, _ = report(xtr, ytr)
    va_acc, _, va_prf = report(xva, yva)
    print(f"train acc {tr_acc:.3f} | val acc {va_acc:.3f} | val macro-F1 {macro_f1(va_prf):.3f}")

    out = Path(__file__).resolve().parents[1] / "models" / "marinenet.onnx"
    out.parent.mkdir(parents=True, exist_ok=True)
    export_onnx(p, out)

    import onnxruntime as ort
    sess = ort.InferenceSession(str(out), providers=["CPUExecutionProvider"])
    onnx_pred = sess.run(None, {"input": xte.astype(np.float32)})[0].argmax(1)
    numpy_pred = forward(xte, p).argmax(1)
    agreement = float((onnx_pred == numpy_pred).mean())
    test_acc = float((onnx_pred == yte).mean())
    cm = ds.confusion(yte, onnx_pred)
    prf = ds.per_class_prf(cm)
    mf1 = macro_f1(prf)

    print(f"\nHELD-OUT MARIDA TEST | overall acc {test_acc:.3f} | macro-F1 {mf1:.3f} | onnx==numpy {agreement:.3f}")
    ds.print_confusion(cm)

    ds.save_metrics(out.parent, "perPixel", {
        "model": out.name,
        "arch": f"per-pixel MLP {xtr.shape[1]}->{HIDDEN1}->{HIDDEN2}->4 (ReLU)",
        "input": "per-pixel features",
        "features": list(ds.FEATURE_NAMES),
        "trainSamples": int(xtr.shape[0]),
        "trainAccuracy": round(tr_acc, 4),
        "valAccuracy": round(va_acc, 4),
        "testAccuracy": round(test_acc, 4),
        "macroF1": round(mf1, 4),
        "onnxAgreement": round(agreement, 4),
        "perClass": prf,
        "confusion": cm.tolist(),
        "dataset": "REAL — MARIDA (Kikaki et al. 2022), official train/val/test splits",
        "trainedOn": "marida",
        "note": "Real hand-labelled Sentinel-2 pixels; imbalance handled with inverse-frequency weights.",
    })
    print(f"\nsaved -> {out}  (+ metrics.json with REAL MARIDA metrics)")


if __name__ == "__main__":
    main()
