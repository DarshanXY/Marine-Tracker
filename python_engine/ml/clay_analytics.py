"""Build the Clay similarity index + MEASURE the four embedding features on real
held-out data. Pure numpy over cached embeddings (no torch/GPU needed).

Reference library = train + RFO-train embeddings (the "known sites"). Queries =
untouched test splits. Reports:
  1. Retrieval classifier   — k-NN label vote vs true label (proves fingerprints
     carry class meaning with NO trained head)
  2. Few-shot               — nearest-centroid accuracy from N examples/class
  3. Novelty / anomaly      — in-distribution (MARIDA test) vs new-seas (RFO test)
     mean anomaly score (proves out-of-distribution detection)
  4. Find-similar demo      — nearest neighbours for sample Plastic queries

Saves models/clay_index.npz + models/clay_analytics.json.
Run:  conda run -n mpt-train python -m ml.clay_analytics   (or engine py w/ numpy)
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from .clay_index import CLASSES, ClayIndex, build_from_caches

MODELS = Path(__file__).resolve().parents[1] / "models"
REF_JOBS = [("clay_emb_train.npz", "MARIDA+MADOS"), ("clay_emb_rfo_train.npz", "RefinedFloatingObjects")]


def _macro_f1(y, p):
    f1 = []
    for c in range(4):
        tp = int(((p == c) & (y == c)).sum()); fp = int(((p == c) & (y != c)).sum()); fn = int(((p != c) & (y == c)).sum())
        prec = tp / max(tp + fp, 1); rec = tp / max(tp + fn, 1)
        f1.append(2 * prec * rec / max(prec + rec, 1e-9))
    return float(np.mean(f1))


def _emb(name):
    d = np.load(MODELS / f"clay_emb_{name}.npz")
    return d["e"].astype("float32"), d["y"].astype("int64")


def main():
    rng = np.random.default_rng(0)
    print("building Clay similarity index from reference library…")
    index = build_from_caches(MODELS, REF_JOBS)
    index.save()
    print(f"  index: {len(index)} labelled sites  sources={sorted(set(index.sources.tolist()))}")
    print(f"  class mix: {dict(zip(CLASSES, np.bincount(index.labels, minlength=4).tolist()))}")

    Xm, ym = _emb("test_marida")
    Xd, yd = _emb("test_mados")
    Xr, yr = _emb("rfo_test")
    Xte = np.concatenate([Xm, Xd]); yte = np.concatenate([ym, yd])
    report = {}

    # 1) retrieval classifier — NO trained head, just nearest-neighbour vote
    print("\n1) RETRIEVAL CLASSIFIER (k-NN vote over the index, no trained head)")
    ret = {}
    for k in (1, 5, 10):
        pred = index.knn_predict(Xte, k=k)
        acc = float((pred == yte).mean()); mf1 = _macro_f1(yte, pred)
        ret[f"k{k}"] = {"acc": round(acc, 4), "macroF1": round(mf1, 4)}
        print(f"   k={k:2d}: acc {acc:.4f}  macroF1 {mf1:.4f}")
    report["retrieval"] = ret
    print("   (compare: deployed MLP 0.767 acc / Clay trained head 0.711 macroF1 on chips)")

    # 2) few-shot nearest-centroid — learn each class from only N examples
    print("\n2) FEW-SHOT nearest-centroid (learn from N examples/class)")
    Xtr, ytr = _emb("train")
    fs = {}
    for shot in (1, 5, 20, 100):
        accs = []
        for trial in range(5):
            sup_idx = []
            for c in range(4):
                ci = np.where(ytr == c)[0]
                sup_idx.append(rng.choice(ci, min(shot, len(ci)), replace=False))
            sup_idx = np.concatenate(sup_idx)
            cents = index.fewshot_centroids(Xtr[sup_idx], ytr[sup_idx])
            pred = index.fewshot_predict(cents, Xte)
            accs.append(_macro_f1(yte, pred))
        fs[f"shot{shot}"] = round(float(np.mean(accs)), 4)
        print(f"   {shot:3d}/class: macroF1 {np.mean(accs):.4f}  (avg of 5 trials)")
    report["fewShot"] = fs

    # 3) novelty / anomaly — new seas should look more "unusual" than in-distribution
    print("\n3) NOVELTY / ANOMALY score (1 - similarity to nearest known sites)")
    a_in = index.anomaly_score(Xm)          # MARIDA test = in-distribution
    a_new = index.anomaly_score(Xr)         # RFO test = new seas (durban+marmara)
    report["anomaly"] = {"inDistributionMean": round(float(a_in.mean()), 4),
                         "newSeasMean": round(float(a_new.mean()), 4),
                         "separation": round(float(a_new.mean() - a_in.mean()), 4)}
    print(f"   in-distribution (MARIDA test): {a_in.mean():.4f}")
    print(f"   new seas (RFO durban+marmara): {a_new.mean():.4f}")
    print(f"   -> new seas score {a_new.mean()-a_in.mean():+.4f} higher = flagged as more novel")

    # 4) find-similar demo — nearest labelled sites for sample Plastic queries
    print("\n4) FIND-SIMILAR demo (nearest known sites to test Plastic chips)")
    plastic_q = np.where(yte == 0)[0][:3]
    demo = []
    for qi in plastic_q:
        nbrs = index.find_similar(Xte[qi:qi + 1], k=5)[0]
        demo.append({"queryTrueClass": "Plastic", "neighbours": nbrs})
        summary = ", ".join(f"{n['class']}/{n['source'][:6]}({n['similarity']:.2f})" for n in nbrs)
        print(f"   query Plastic -> {summary}")
    report["findSimilarDemo"] = demo

    report["referenceLibrarySize"] = len(index)
    report["updated"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    (MODELS / "clay_analytics.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

    # fold headline into metrics.json['clay']
    mj = json.loads((MODELS / "metrics.json").read_text(encoding="utf-8"))
    if "clay" in mj:
        mj["clay"]["embeddingFeatures"] = {
            "retrievalKnn": ret, "fewShot": fs, "anomaly": report["anomaly"],
            "note": ("Pure-numpy similarity over cached Clay embeddings powers find-similar, "
                     "retrieval classification, few-shot, and novelty detection — engine-safe (no torch).")}
        (MODELS / "metrics.json").write_text(json.dumps(mj, indent=2), encoding="utf-8")
    print(f"\nsaved -> clay_index.npz + clay_analytics.json + metrics.json['clay']['embeddingFeatures']")


if __name__ == "__main__":
    main()
