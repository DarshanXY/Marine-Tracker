"""Independent PLP check for the LIVE two-stage fusion (MLP → Clay).

The Plastic Litter Project anchored a real ~28 m HDPE plastic target + a wood
control and imaged them every Sentinel-2 pass (2021). ml.validate_plp already
showed the per-pixel MLP finds the target (fdiGate 0.76) but over-calls the WOOD
control as plastic (0.80) — the exact false positive the Clay tier-2 should catch.

This scores each target's 64x64 Clay chip through the same calibrated pipeline the
engine uses live: centre-pixel MLP class+conf, Clay plastic-affinity (weighted
k-NN) + novelty, and the CONFIRMED/POSSIBLE verdict (confidence_fusion.hotspot_tier).
Chips are embedded by the WARM sidecar over HTTP (reuse the loaded model — no 2nd
4.8 GB load), so this needs only rasterio + pyshp + numpy + the sidecar running.

Run (GPU env, sidecar up):  conda run -n mpt-train python -m ml.validate_plp_clay
"""
from __future__ import annotations

import json
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
PLP = ROOT / "data" / "plp" / "PLP"
MODELS = Path(__file__).resolve().parents[1] / "models"
BANDS = ("B4", "B6", "B8", "B8A", "B11")
_SLOPE10 = ((842.0 - 740.0) / (1610.0 - 740.0)) * 10.0
EPS = 1e-6
CLASSES = ("Plastic", "Algae", "Sea_Foam", "Water")
CHIP = 64
SIDECAR = "http://127.0.0.1:8010"


def _features11(arr5: np.ndarray) -> np.ndarray:
    b04, b06, b08, b8a, b11 = arr5
    fdi = b08 - (b06 + (b11 - b06) * _SLOPE10)
    ndvi = (b08 - b04) / (b08 + b04 + EPS)
    pi = b08 / (b08 + b04 + EPS)
    mndwi = (b08 - b11) / (b08 + b11 + EPS)
    ndvi_re = (b8a - b06) / (b8a + b06 + EPS)
    bright = (b04 + b06 + b08 + b8a + b11) / 5.0
    return np.stack([b04, b06, b08, b8a, b11, fdi, ndvi, pi, mndwi, ndvi_re, bright], axis=-1)


def _chip(arr5: np.ndarray, r: int, c: int) -> np.ndarray:
    """(5,H,W) → (64,64,5) window centred on (r,c), clamped + zero-padded at edges."""
    _, h, w = arr5.shape
    half = CHIP // 2
    r0 = min(max(r - half, 0), max(h - CHIP, 0)) if h >= CHIP else 0
    c0 = min(max(c - half, 0), max(w - CHIP, 0)) if w >= CHIP else 0
    win = arr5[:, r0:r0 + CHIP, c0:c0 + CHIP]
    out = np.zeros((5, CHIP, CHIP), "float32")
    out[:, :win.shape[1], :win.shape[2]] = win
    return np.transpose(out, (1, 2, 0))          # (64,64,5)


def _embed(chips: list[np.ndarray]) -> np.ndarray:
    body = json.dumps({"chips": [c.tolist() for c in chips]}).encode("utf-8")
    req = urllib.request.Request(f"{SIDECAR}/embed", data=body,
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=120) as r:  # noqa: S310
        return np.asarray(json.loads(r.read())["embeddings"], dtype="float32")


def main():
    import onnxruntime as ort
    import rasterio
    import shapefile

    from ml.clay_index import ClayIndex
    from ml.confidence_fusion import hotspot_tier, thresholds

    sess = ort.InferenceSession(str(MODELS / "marinenet.onnx"), providers=["CPUExecutionProvider"])
    idx = ClayIndex.load(MODELS / "clay_index.npz")

    sf = shapefile.Reader(str(PLP / "PLP2021" / "PLP2021_targets"))
    fields = [f[0] for f in sf.fields[1:]]
    targets: dict[str, list] = {}
    for sr in sf.shapeRecords():
        rec = dict(zip(fields, sr.record))
        targets.setdefault(str(rec["date"]), []).append((rec["type"], sr.shape.points[0], rec.get("note", "")))

    items, chips = [], []
    for tif in sorted((PLP / "PLP2021" / "Sentinel-2").glob("*.tif")):
        date = tif.name[:8]
        if date not in targets:
            continue
        with rasterio.open(tif) as s:
            desc = {d: i + 1 for i, d in enumerate(s.descriptions)}
            arr = s.read([desc[b] for b in BANDS]).astype("float32")
            inv = ~s.transform
        arr = np.nan_to_num(arr / 10000.0, nan=0.0)
        feats = _features11(arr)
        h, w = feats.shape[:2]
        for ttype, (wx, wy), note in targets[date]:
            col, row_px = inv * (wx, wy)
            r, c = int(round(row_px)), int(round(col))
            if not (0 <= r < h and 0 <= c < w):
                continue
            logits = sess.run(None, {"input": feats[r, c][:sess.get_inputs()[0].shape[1]].reshape(1, -1).astype("float32")})[0]
            e = np.exp(logits - logits.max(1, keepdims=True))
            probs = (e / e.sum(1, keepdims=True))[0]
            items.append({"date": date, "type": ttype, "note": note,
                          "mlpClass": CLASSES[int(probs.argmax())], "mlpConf": round(float(probs.max()), 3),
                          "fdi": round(float(feats[r, c, 5]), 4)})
            chips.append(_chip(arr, r, c))

    if not chips:
        print("no PLP target chips found — check data/plp/PLP paths")
        return
    print(f"embedding {len(chips)} PLP target chips via the sidecar…", flush=True)
    emb = _embed(chips)

    for it, ev in zip(items, emb):
        q = ev.reshape(1, -1)
        rows, sim = idx.search(q, k=10)
        wgt = np.clip(sim[0], 0, None)
        aff = float(wgt[idx.labels[rows[0]] == 0].sum() / (wgt.sum() + EPS))
        anom = float(idx.anomaly_score(q)[0])
        f = hotspot_tier(it["mlpConf"], aff, anom)
        it.update(plasticAffinity=round(aff, 4), anomaly=round(anom, 4),
                  tier="CONFIRMED" if f["confirmed"] else "POSSIBLE", level=f["tier"])

    def _grp(t):
        g = [i for i in items if i["type"] == t]
        if not g:
            return None
        affs = [i["plasticAffinity"] for i in g]
        mlp_plastic = sum(i["mlpClass"] == "Plastic" for i in g)
        confirmed = sum(i["tier"] == "CONFIRMED" for i in g)
        return {"n": len(g), "mlpCalledPlastic": mlp_plastic,
                "meanPlasticAffinity": round(float(np.mean(affs)), 3),
                "confirmedByFusion": confirmed,
                "downgradedToPossible": mlp_plastic - confirmed}

    summary = {"thresholds": thresholds(), "HDPE": _grp("HDPE"), "wood": _grp("wood")}
    print("\n=== PLP × Clay fusion ===")
    for it in items:
        print(f"  {it['date']} {it['type']:4s}: MLP {it['mlpClass']}@{it['mlpConf']} "
              f"| Clay plastic-affinity {it['plasticAffinity']:.2f} | tier {it['tier']} {it.get('note','')}")
    print("\nSUMMARY:")
    print(json.dumps(summary, indent=2))
    out = MODELS / "plp_clay_validation.json"
    out.write_text(json.dumps({"summary": summary, "perTarget": items}, indent=2), encoding="utf-8")
    print(f"saved -> {out}")


if __name__ == "__main__":
    main()
