"""Tune the Clay head's Plastic decision threshold — precision/recall trade-off.

The head's default argmax decision gave debris recall 0.542 @ water FP 7.6% on the
new-seas holdout. Instead: predict Plastic iff softmax P(Plastic) >= tau, else
argmax over the remaining classes. tau is SELECTED ON THE VALIDATION SET
(MARIDA+MADOS val — scene-disjoint, never used for head weights beyond best-epoch),
then REPORTED on the untouched held-out sets:
  * MARIDA+MADOS test (4-class macroF1 must not collapse)
  * RFO holdout durban+marmara (binary debris recall / water FP — the new-seas story)

Operating points chosen on val: tau_f1 (max Plastic F1) and tau_precise (highest
recall subject to Plastic precision >= 0.70). Saves models/clay_threshold.json and
stamps metrics.json['clay']['operatingPoints'].

Run:  conda run -n mpt-train python -m ml.tune_clay_threshold
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

CLASSES = ("Plastic", "Algae", "Sea_Foam", "Water")
MODELS = Path(__file__).resolve().parents[1] / "models"
TAUS = np.round(np.arange(0.05, 0.96, 0.05), 2)


def _load_emb(name):
    d = np.load(MODELS / f"clay_emb_{name}.npz")
    return d["e"].astype("float32"), d["y"].astype("int64")


@torch.no_grad()
def _probs(head, X, device, bs=32768):
    head.eval()
    out = []
    for i in range(0, len(X), bs):
        logits = head(torch.from_numpy(X[i:i + bs]).to(device))
        out.append(torch.softmax(logits, 1).cpu().numpy())
    return np.concatenate(out)


def _decide(p, tau):
    """Plastic iff P(Plastic)>=tau, else argmax of the other classes."""
    pred = p[:, 1:].argmax(1) + 1
    pred[p[:, 0] >= tau] = 0
    return pred


def _plastic_prf(y, pred):
    tp = int(((pred == 0) & (y == 0)).sum())
    fp = int(((pred == 0) & (y != 0)).sum())
    fn = int(((pred != 0) & (y == 0)).sum())
    prec = tp / max(tp + fp, 1)
    rec = tp / max(tp + fn, 1)
    f1 = 2 * prec * rec / max(prec + rec, 1e-9)
    return prec, rec, f1


def _macro_f1(y, pred):
    f1s = []
    for c in range(4):
        tp = int(((pred == c) & (y == c)).sum())
        fp = int(((pred == c) & (y != c)).sum())
        fn = int(((pred != c) & (y == c)).sum())
        prec = tp / max(tp + fp, 1)
        rec = tp / max(tp + fn, 1)
        f1s.append(2 * prec * rec / max(prec + rec, 1e-9))
    return float(np.mean(f1s))


def main():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    ck = torch.load(MODELS / "clay_head.pt", map_location="cpu", weights_only=False)
    head = nn.Sequential(nn.Linear(1024, 256), nn.ReLU(inplace=True), nn.Dropout(0.2),
                         nn.Linear(256, 4)).to(device)
    head.load_state_dict(ck["state_dict"])

    Xva, yva = _load_emb("val")
    pva = _probs(head, Xva, device)
    Xr, yr = _load_emb("rfo_test")
    pr = _probs(head, Xr, device)
    Xm, ym = _load_emb("test_marida")
    Xd, yd = _load_emb("test_mados")
    pte = np.concatenate([_probs(head, Xm, device), _probs(head, Xd, device)])
    yte = np.concatenate([ym, yd])
    deb = yr == 0

    print("tau   | VAL plastic P/R/F1      | RFO recall / waterFP | TEST macroF1")
    curve = []
    for tau in TAUS:
        vp, vr, vf = _plastic_prf(yva, _decide(pva, tau))
        rpred = _decide(pr, tau)
        rrec = float((rpred[deb] == 0).mean())
        rfp = float((rpred[~deb] == 0).mean())
        tmf = _macro_f1(yte, _decide(pte, tau))
        curve.append({"tau": float(tau), "valP": round(vp, 4), "valR": round(vr, 4), "valF1": round(vf, 4),
                      "rfoRecall": round(rrec, 4), "rfoWaterFp": round(rfp, 4), "testMacroF1": round(tmf, 4)})
        print(f"{tau:.2f}  |  {vp:.3f} / {vr:.3f} / {vf:.3f}  |  {rrec:.3f} / {rfp:.3f}       |  {tmf:.4f}")

    # operating points chosen on VAL only
    tau_f1 = max(curve, key=lambda c: c["valF1"])
    precise = [c for c in curve if c["valP"] >= 0.70]
    tau_precise = max(precise, key=lambda c: c["valR"]) if precise else tau_f1
    argmax_row = {"tau": "argmax", **{k: None for k in ("valP", "valR", "valF1")}}
    ap = _decide(pr, 1.1)  # tau>1 -> never plastic; recompute argmax properly:
    ap = pr.argmax(1)
    argmax_row["rfoRecall"] = round(float((ap[deb] == 0).mean()), 4)
    argmax_row["rfoWaterFp"] = round(float((ap[~deb] == 0).mean()), 4)
    argmax_row["testMacroF1"] = round(_macro_f1(yte, pte.argmax(1)), 4)

    print("\n=== OPERATING POINTS (selected on val, reported on holdout) ===")
    print(f"  argmax (deployed default): RFO recall {argmax_row['rfoRecall']}  FP {argmax_row['rfoWaterFp']}  testMacroF1 {argmax_row['testMacroF1']}")
    print(f"  tau_f1={tau_f1['tau']}: RFO recall {tau_f1['rfoRecall']}  FP {tau_f1['rfoWaterFp']}  testMacroF1 {tau_f1['testMacroF1']}")
    print(f"  tau_precise={tau_precise['tau']} (val P>=0.70): RFO recall {tau_precise['rfoRecall']}  FP {tau_precise['rfoWaterFp']}  testMacroF1 {tau_precise['testMacroF1']}")

    out = {"curve": curve, "argmax": argmax_row, "tauF1": tau_f1, "tauPrecise": tau_precise,
           "selection": "operating points chosen on MARIDA+MADOS val (Plastic F1 max; precision>=0.70)",
           "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    (MODELS / "clay_threshold.json").write_text(json.dumps(out, indent=2), encoding="utf-8")

    mj = json.loads((MODELS / "metrics.json").read_text(encoding="utf-8"))
    if "clay" in mj:
        mj["clay"]["operatingPoints"] = {"argmax": argmax_row, "tauF1": tau_f1, "tauPrecise": tau_precise}
        (MODELS / "metrics.json").write_text(json.dumps(mj, indent=2), encoding="utf-8")
    print("saved -> clay_threshold.json + metrics.json['clay']['operatingPoints']")


if __name__ == "__main__":
    main()
