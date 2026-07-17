"""Train the per-pixel classifier on REAL MARIDA + MADOS combined → marinenet.onnx.

Both are hand-labelled Sentinel-2 benchmarks sharing the engine's 7-feature
contract [B04,B06,B08,B8A,B11,FDI,NDVI], so they concatenate. Combining roughly
doubles the real training signal and adds MADOS's oil-spill / turbid-water scenes.
Reports HONEST held-out metrics on the combined test split + a per-dataset
breakdown. THIS is the trainer that produced the shipped marinenet.onnx.

Run:  python -m ml.train_combined
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

from .datasets import dataset as ds
from .datasets import marida, mados
from .train_marida import HIDDEN1, HIDDEN2, export_onnx, forward, macro_f1, train


def _load(split: str):
    """Combined split → (X, y, (n_marida, n_mados))."""
    xa, ya = marida.load_split(split)
    xb, yb = mados.load_split(split)
    x = np.concatenate([xa, xb]) if len(xb) else xa
    y = np.concatenate([ya, yb]) if len(yb) else ya
    return x, y, (len(ya), len(yb))


def _report(x, y, p):
    pred = forward(x, p).argmax(1)
    acc = float((pred == y).mean()) if len(y) else 0.0
    cm = ds.confusion(y, pred)
    return acc, cm, ds.per_class_prf(cm)


def main() -> None:
    print("loading MARIDA + MADOS splits (cached after first run)…")
    xtr, ytr, (mtr, dtr) = _load("train")
    xva, yva, _ = _load("val")
    xte, yte, (mte, dte) = _load("test")
    print(f"train {len(ytr)} px  (MARIDA {mtr} + MADOS {dtr})  {marida.class_histogram(ytr)}")
    print(f"test  {len(yte)} px  (MARIDA {mte} + MADOS {dte})  {marida.class_histogram(yte)}")

    counts = np.array([(ytr == c).sum() for c in range(4)], dtype=float)
    w_class = ytr.shape[0] / (4.0 * np.maximum(counts, 1))
    print("class weights:", {marida.CLASSES[c]: round(float(w_class[c]), 2) for c in range(4)})

    p = train(xtr, ytr, w_class)

    tr_acc, _, _ = _report(xtr, ytr, p)
    va_acc, _, va_prf = _report(xva, yva, p)
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

    print(f"\nHELD-OUT COMBINED TEST | acc {test_acc:.3f} | macro-F1 {mf1:.3f} | onnx==numpy {agreement:.3f}")
    ds.print_confusion(cm)
    for name, s in prf.items():
        print(f"  {name:<9} P {s['precision']:.3f}  R {s['recall']:.3f}  F1 {s['f1']:.3f}")

    per_dataset = {}
    for tag, (xd, yd) in (("marida", (xte[:mte], yte[:mte])), ("mados", (xte[mte:], yte[mte:]))):
        if not len(yd):
            continue
        acc, _, dprf = _report(xd, yd, p)
        per_dataset[tag] = {"testAccuracy": round(acc, 4), "macroF1": round(macro_f1(dprf), 4), "samples": int(len(yd))}
        print(f"  [{tag:6s}] acc {acc:.3f} | macro-F1 {macro_f1(dprf):.3f} | n {len(yd)}")

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
        "perDataset": per_dataset,
        "dataset": "REAL — MARIDA + MADOS (Kikaki et al. 2022/2024), official train/val/test splits",
        "trainedOn": "marida+mados",
        "note": "Real hand-labelled Sentinel-2 pixels from two benchmarks; imbalance handled with inverse-frequency weights.",
    })
    print(f"\nsaved -> {out}  (+ metrics.json with REAL combined metrics)")


if __name__ == "__main__":
    main()
