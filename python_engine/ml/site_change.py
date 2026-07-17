"""Temporal change detection over a site's Clay fingerprints — numpy only.

Because the embedding store keeps every observation of a site (same key, different
dates), a site's history is a little time-series of 1024-d fingerprints. Comparing
them answers "has this hotspot changed, and toward what?" WITHOUT re-downloading
scenes — the foundation model already encoded each date into a comparable vector.

Two signals per step:
  * drift        = 1 - centred cosine between consecutive fingerprints (how much the
                   site's appearance moved; centred so Clay's anisotropy doesn't
                   swamp it — same transform the similarity index uses)
  * plasticAffinity = similarity-weighted share of Plastic among the k nearest
                   reference sites (how "plastic-like" the site looks that date)

Complements analysis.change_detection (which measures FDI-candidate DENSITY from
raw scenes); this measures learned-fingerprint change.
"""
from __future__ import annotations

import numpy as np

PLASTIC = 0


def _plastic_affinity(idx, q: np.ndarray, k: int = 10) -> float:
    """Similarity-weighted fraction of the k nearest reference sites that are Plastic."""
    rows, sim = idx.search(q.reshape(1, -1), k=k)
    if rows.shape[1] == 0:
        return 0.0
    w = np.clip(sim[0], 0, None)
    labs = idx.labels[rows[0]]
    tot = float(w.sum()) or 1.0
    return float(w[labs == PLASTIC].sum() / tot)


def analyze(idx, store, key: str, k: int = 10) -> dict:
    """Change report for one site across its observations (oldest→newest)."""
    from ml.clay_index import CLASSES
    hist = store.history(key)
    n = len(hist)
    if n < 2:
        return {"available": True, "key": key, "observations": n, "change": None,
                "note": "needs at least 2 dated observations of this site"}

    prep = idx._prep  # centre-by-reference-mean + unit-normalise (query transform)
    series = []
    for h in hist:
        e = store.emb[h["row"]]
        q = np.asarray(e, "float32")
        series.append({
            "ts": h["ts"],
            "knnClass": CLASSES[int(idx.knn_predict(q.reshape(1, -1), k=k)[0])],
            "plasticAffinity": round(_plastic_affinity(idx, q, k), 4),
            "_v": prep(q)[0],
        })

    # step-wise drift between consecutive observations
    steps = []
    for a, b in zip(series, series[1:]):
        cos = float(a["_v"] @ b["_v"])
        steps.append({"from": a["ts"], "to": b["ts"], "drift": round(1.0 - cos, 4)})

    first, last = series[0], series[-1]
    aff_delta = last["plasticAffinity"] - first["plasticAffinity"]
    latest_drift = steps[-1]["drift"]
    if aff_delta > 0.15:
        trend = "intensifying"       # looking more plastic-like over time
    elif aff_delta < -0.15:
        trend = "clearing"           # looking less plastic-like
    elif latest_drift > 0.30:
        trend = "shifted"            # appearance changed markedly, class ~same
    else:
        trend = "stable"

    return {
        "available": True, "key": key, "observations": n,
        "from": first["ts"], "to": last["ts"],
        "classFrom": first["knnClass"], "classTo": last["knnClass"],
        "plasticAffinityFrom": first["plasticAffinity"],
        "plasticAffinityTo": last["plasticAffinity"],
        "plasticAffinityDelta": round(aff_delta, 4),
        "latestDrift": latest_drift,
        "trend": trend,
        "steps": steps,
        "series": [{"ts": s["ts"], "knnClass": s["knnClass"],
                    "plasticAffinity": s["plasticAffinity"]} for s in series],
    }
