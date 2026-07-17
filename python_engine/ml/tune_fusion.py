"""Calibrate the CONFIRMED / POSSIBLE fusion thresholds on REAL held-out chips.

Each held-out MARIDA+MADOS test chip has (order-aligned):
  * a centre pixel  -> the per-pixel MLP's class + confidence
  * a Clay embedding -> class-robust Plastic-affinity (weighted k-NN vote share)
                        + novelty (anomaly), via the reference ClayIndex
  * a true label

The tier a hotspot gets (CONFIRMED vs POSSIBLE) is a decision over (mlp_conf,
plastic_affinity, anomaly). Raw k-NN argmax is water-biased (the reference library
is ~10x water), which is why real plastic was landing on "Clay: Water" — so we
calibrate on the weighted Plastic-affinity instead. We grid-search the thresholds
that best separate true plastic (-> CONFIRMED) from MLP false positives (algae /
foam / water read as plastic -> POSSIBLE), and write models/fusion_thresholds.json.

Run (engine py + numpy + onnxruntime; NO torch):  python -m ml.tune_fusion
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import onnxruntime as ort

from .clay_index import ClayIndex

MODELS = Path(__file__).resolve().parents[1] / "models"
PLASTIC = 0
EPS = 1e-6


def _features_batch(centre: np.ndarray) -> np.ndarray:
    """centre [N,6] = [B04,B06,B08,B8A,B11,FDI] -> [N,11] (mirrors inference_engine._features)."""
    b04, b06, b08, b8a, b11, fdi = (centre[:, i] for i in range(6))
    ndvi = (b08 - b04) / (b08 + b04 + EPS)
    pi = b08 / (b08 + b04 + EPS)
    mndwi = (b08 - b11) / (b08 + b11 + EPS)
    ndvi_re = (b8a - b06) / (b8a + b06 + EPS)
    bright = (b04 + b06 + b08 + b8a + b11) / 5.0
    return np.stack([b04, b06, b08, b8a, b11, fdi, ndvi, pi, mndwi, ndvi_re, bright], axis=1).astype("float32")


def _mlp_predict(sess, feats: np.ndarray):
    logits = sess.run(None, {sess.get_inputs()[0].name: feats})[0]
    e = np.exp(logits - logits.max(1, keepdims=True))
    probs = e / e.sum(1, keepdims=True)
    return probs.argmax(1), probs.max(1)


def _plastic_affinity(idx: ClayIndex, emb: np.ndarray, k: int = 10) -> np.ndarray:
    """Similarity-weighted share of the k nearest reference sites that are Plastic."""
    rows, sim = idx.search(emb, k=k)
    w = np.clip(sim, 0, None)
    labs = idx.labels[rows]
    tot = w.sum(1) + EPS
    return (w * (labs == PLASTIC)).sum(1) / tot


def _build_set(sess, idx, patches_file, emb_file):
    p = np.load(MODELS / patches_file)
    d = np.load(MODELS / emb_file)
    x, y = p["x"], p["y"].astype("int64")
    emb = d["e"].astype("float32")
    centre = x[:, x.shape[1] // 2, x.shape[2] // 2, :6].astype("float32")
    mlp_cls, mlp_conf = _mlp_predict(sess, _features_batch(centre))
    aff = _plastic_affinity(idx, emb)
    anom = idx.anomaly_score(emb)
    return mlp_cls, mlp_conf.astype("float32"), aff.astype("float32"), anom.astype("float32"), y


def _score(mask_pos, mask_neg, confirmed):
    """F1 / precision / recall of the CONFIRMED decision (positive = true plastic)."""
    tp = int((confirmed & mask_pos).sum()); fn = int((~confirmed & mask_pos).sum())
    fp = int((confirmed & mask_neg).sum())
    prec = tp / max(tp + fp, 1); rec = tp / max(tp + fn, 1)
    f1 = 2 * prec * rec / max(prec + rec, 1e-9)
    return f1, prec, rec, tp, fp, fn


def main():
    sess = ort.InferenceSession(str(MODELS / "marinenet.onnx"))
    idx = ClayIndex.load(MODELS / "clay_index.npz")

    parts = [_build_set(sess, idx, pf, ef) for pf, ef in
             [("patches_test_4000_marida.npz", "clay_emb_test_marida.npz"),
              ("patches_test_4000_mados.npz", "clay_emb_test_mados.npz")]
             if (MODELS / pf).exists() and (MODELS / ef).exists()]
    mlp_cls = np.concatenate([p[0] for p in parts])
    mlp_conf = np.concatenate([p[1] for p in parts])
    aff = np.concatenate([p[2] for p in parts])
    anom = np.concatenate([p[3] for p in parts])
    y = np.concatenate([p[4] for p in parts])

    # Hotspot-relevant population: chips the MLP calls Plastic (what clusters into hotspots).
    on = mlp_cls == PLASTIC
    pos = on & (y == PLASTIC)          # true plastic MLP got right   -> want CONFIRMED
    neg = on & (y != PLASTIC)          # MLP false positive (algae/foam/water) -> want POSSIBLE
    print(f"MLP-Plastic chips: {int(on.sum())}  (true plastic {int(pos.sum())}, false-positive {int(neg.sum())})")
    print(f"Plastic-affinity: true plastic mean {aff[pos].mean():.3f} | false-pos mean {aff[neg].mean():.3f}")

    # A CONFIRMED tier must be PRECISE (few false alarms) — the rest fall to POSSIBLE
    # (the wider net), so overall recall isn't lost. Objective: max recall s.t.
    # precision >= TARGET; if unreachable, take the highest-precision point.
    TARGET = 0.92
    cand = []
    for ch in (0.5, 0.6, 0.7, 0.8):
        for am in (0.10, 0.20, 0.30, 0.40, 0.50, 0.60):
            for tau in (0.20, 0.25, 0.30, 0.35):
                confirmed = on & (mlp_conf >= ch) & (aff >= am) & (anom <= tau)
                f1, prec, rec, tp, fp, fn = _score(pos, neg, confirmed)
                cand.append({"conf_high": ch, "aff_min": am, "anomaly_tau": tau,
                             "f1": round(f1, 4), "precision": round(prec, 4), "recall": round(rec, 4),
                             "tp": tp, "fp": fp, "fn": fn})
    feasible = [c for c in cand if c["precision"] >= TARGET]
    best = (max(feasible, key=lambda c: (c["recall"], c["precision"]))
            if feasible else max(cand, key=lambda c: (c["precision"], c["recall"])))

    print("\noperating points (highest-precision first):")
    for c in sorted(cand, key=lambda c: (-c["precision"], -c["recall"]))[:6]:
        print(f"  conf>={c['conf_high']} aff>={c['aff_min']:.2f} tau<={c['anomaly_tau']}: "
              f"prec {c['precision']:.3f} rec {c['recall']:.3f} (fp {c['fp']})")

    base = on & (mlp_conf >= 0.75) & (anom <= 0.20)   # pre-calibration (no affinity gate)
    bf1, bprec, brec, *_ = _score(pos, neg, base)
    print(f"\nbaseline (conf>=0.75, no affinity gate): prec {bprec:.3f} rec {brec:.3f}")
    print(f"CHOSEN   conf>={best['conf_high']} aff>={best['aff_min']} tau<={best['anomaly_tau']}: "
          f"prec {best['precision']} rec {best['recall']} (tp {best['tp']} fp {best['fp']} fn {best['fn']})")

    out = {"conf_high": best["conf_high"], "aff_min": best["aff_min"], "anomaly_tau": best["anomaly_tau"],
           "conf_low": 0.50, "targetPrecision": TARGET,
           "calibratedOn": "MARIDA+MADOS held-out test (aligned per-pixel MLP + Clay affinity)",
           "population": "MLP-Plastic chips", "confirmedPrecision": best["precision"],
           "confirmedRecall": best["recall"]}
    (MODELS / "fusion_thresholds.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"\nwrote models/fusion_thresholds.json -> conf_high={out['conf_high']} aff_min={out['aff_min']} anomaly_tau={out['anomaly_tau']}")


if __name__ == "__main__":
    main()
