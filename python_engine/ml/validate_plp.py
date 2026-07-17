"""Validate the DEPLOYED per-pixel model on PLP 2021 — real deployed plastic targets.

The Plastic Litter Project (Topouzelis et al., Aegean) anchored a ~28 m HDPE mesh
target (+ a wood control raft) at a known lagoon mouth and imaged it with every
Sentinel-2 pass, Jun-Sep 2021. The shapefile gives the surveyed target position
PER DATE. This is gold-standard, fully independent ground truth (zero overlap with
MARIDA/MADOS training scenes): does the engine's shipped model find a KNOWN ~2-3
pixel plastic target it has never seen?

Per matching (date-tif, targets): build the engine's 11-feature stack from the 5
bands (identical formulas to inference_engine._features), run models/marinenet.onnx,
then score a 3x3 window at the surveyed point:
  * HDPE hit  = any window px classified Plastic  (the platform's key number)
  * FDI gate  = any window px with FDI > 0.02     (stage-1 candidacy — if this
                misses, the pipeline never even asks the classifier)
  * wood ctrl = what the model calls the wood raft (natural-debris confuser)
  * scene FP  = % of far-from-target water px classified Plastic (false alarms)

Run:  conda run -n mpt-train python -m ml.validate_plp
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
PLP = ROOT / "data" / "plp" / "PLP"
MODELS = Path(__file__).resolve().parents[1] / "models"
BANDS = ("B4", "B6", "B8", "B8A", "B11")
_SLOPE10 = ((842.0 - 740.0) / (1610.0 - 740.0)) * 10.0
EPS = 1e-6
CLASSES = ("Plastic", "Algae", "Sea_Foam", "Water")
WIN = 1          # 3x3 window (+-1 px) around the surveyed point
EXCL = 3         # 7x7 exclusion around targets for the FP estimate
FDI_T = 0.02


def _features11(arr5: np.ndarray) -> np.ndarray:
    """(5,H,W) reflectance -> (H,W,11) engine feature stack (mirror _features)."""
    b04, b06, b08, b8a, b11 = arr5
    fdi = b08 - (b06 + (b11 - b06) * _SLOPE10)
    ndvi = (b08 - b04) / (b08 + b04 + EPS)
    pi = b08 / (b08 + b04 + EPS)
    mndwi = (b08 - b11) / (b08 + b11 + EPS)
    ndvi_re = (b8a - b06) / (b8a + b06 + EPS)
    bright = (b04 + b06 + b08 + b8a + b11) / 5.0
    return np.stack([b04, b06, b08, b8a, b11, fdi, ndvi, pi, mndwi, ndvi_re, bright], axis=-1)


def main():
    import onnxruntime as ort
    import rasterio
    import shapefile

    sess = ort.InferenceSession(str(MODELS / "marinenet.onnx"), providers=["CPUExecutionProvider"])
    n_feat = sess.get_inputs()[0].shape[1]
    print(f"model: marinenet.onnx (input [N,{n_feat}])")

    sf = shapefile.Reader(str(PLP / "PLP2021" / "PLP2021_targets"))
    fields = [f[0] for f in sf.fields[1:]]
    targets: dict[str, list] = {}
    for sr in sf.shapeRecords():
        rec = dict(zip(fields, sr.record))
        targets.setdefault(str(rec["date"]), []).append((rec["type"], sr.shape.points[0], rec.get("note", "")))

    tifs = sorted((PLP / "PLP2021" / "Sentinel-2").glob("*.tif"))
    rows = []
    for tif in tifs:
        date = tif.name[:8]
        if date not in targets:
            continue
        with rasterio.open(tif) as s:
            desc = {d: i + 1 for i, d in enumerate(s.descriptions)}
            arr = s.read([desc[b] for b in BANDS]).astype("float32")     # (5,H,W) DN
            inv = ~s.transform
        arr = arr / 10000.0
        nanmask = np.isnan(arr).any(0)
        arr = np.nan_to_num(arr, nan=0.0)
        feats = _features11(arr)                                          # (H,W,11)
        H, W = feats.shape[:2]
        flat = feats.reshape(-1, 11)[:, :n_feat].astype("float32")
        pred = sess.run(None, {"input": flat})[0].argmax(1).reshape(H, W)
        fdi = feats[..., 5]
        valid = (~nanmask) & (arr.sum(0) > EPS)

        row = {"date": date}
        excl = np.zeros((H, W), bool)
        for ttype, (wx, wy), note in targets[date]:
            col, row_px = inv * (wx, wy)
            r, c = int(round(row_px)), int(round(col))
            if not (0 <= r < H and 0 <= c < W):
                continue
            sl = np.s_[max(r - WIN, 0):r + WIN + 1, max(c - WIN, 0):c + WIN + 1]
            excl[max(r - EXCL, 0):r + EXCL + 1, max(c - EXCL, 0):c + EXCL + 1] = True
            wpred, wfdi, wval = pred[sl], fdi[sl], valid[sl]
            classes = wpred[wval]
            if ttype == "HDPE":
                row["hdpe_hit"] = bool((classes == 0).any()) if classes.size else None
                row["hdpe_fdi_gate"] = bool((wfdi[wval] > FDI_T).any()) if classes.size else None
                row["hdpe_max_fdi"] = round(float(wfdi[wval].max()), 4) if classes.size else None
                row["hdpe_note"] = note
            else:
                row["wood_as_plastic"] = bool((classes == 0).any()) if classes.size else None
                row["wood_pred"] = CLASSES[int(np.bincount(classes, minlength=4).argmax())] if classes.size else None
        far_water = valid & ~excl
        n_far = int(far_water.sum())
        row["scene_fp_pct"] = round(float((pred[far_water] == 0).mean()) * 100, 2) if n_far else None
        row["valid_px"] = n_far
        rows.append(row)
        print(f"  {date}  HDPE hit={row.get('hdpe_hit')}  fdi_gate={row.get('hdpe_fdi_gate')} "
              f"(maxFDI {row.get('hdpe_max_fdi')})  wood->{row.get('wood_pred')}  "
              f"FP {row.get('scene_fp_pct')}%  {row.get('hdpe_note','')}")

    hdpe = [r for r in rows if r.get("hdpe_hit") is not None]
    ok = [r for r in hdpe if not r.get("hdpe_note")]          # exclude 'underwater' notes
    wood = [r for r in rows if r.get("wood_pred") is not None]
    fps = [r["scene_fp_pct"] for r in rows if r.get("scene_fp_pct") is not None]
    summary = {
        "dates": len(rows),
        "hdpeHitRate": round(sum(r["hdpe_hit"] for r in hdpe) / len(hdpe), 3) if hdpe else None,
        "hdpeHitRateClean": round(sum(r["hdpe_hit"] for r in ok) / len(ok), 3) if ok else None,
        "fdiGateRate": round(sum(r["hdpe_fdi_gate"] for r in hdpe) / len(hdpe), 3) if hdpe else None,
        "woodAsPlasticRate": round(sum(r["wood_as_plastic"] for r in wood) / len(wood), 3) if wood else None,
        "medianSceneFpPct": round(float(np.median(fps)), 2) if fps else None,
        "model": "marinenet.onnx",
        "windowPx": 2 * WIN + 1,
        "dataset": "PLP 2021 (Topouzelis / Univ. Aegean) — deployed HDPE target + wood control",
    }
    print("\n=== PLP 2021 SUMMARY ===")
    for k, v in summary.items():
        print(f"  {k}: {v}")
    out = MODELS / "plp_validation.json"
    out.write_text(json.dumps({"summary": summary, "perDate": rows}, indent=2), encoding="utf-8")
    print(f"saved -> {out}")


if __name__ == "__main__":
    main()
