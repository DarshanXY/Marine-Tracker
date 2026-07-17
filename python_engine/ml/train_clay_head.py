"""Train a small head on FROZEN Clay v1.5 embeddings → the foundation-model stage.

Inputs are the cached [N,1024] class-token embeddings (ml.clay_embed) of the SAME
labelled 64x64 chips the patch CNN used — so this answers, on identical held-out
data, whether a pretrained foundation backbone beats (a) the from-scratch CNN that
overfit (macroF1 0.555) and (b) the deployed 11-feat per-pixel MLP (macroF1 0.787).

Head: 1024 -> 256 -> 4 MLP (dropout), sqrt-inv-freq weights, label smoothing,
AdamW, val-macroF1 best-epoch — the exact discipline that worked for pp11.
--rfo additionally trains on RefinedFloatingObjects embeddings (4 new scenes) and
evaluates the binary debris-vs-water RFO holdout (durban+marmara).

Artifacts: models/clay_head.pt + models/clay_head_summary.json. (The 4.8 GB Clay
backbone stays offline; the head is engine-integrable later via a batch embed step.)

Run:  conda run -n mpt-train python -m ml.train_clay_head --rfo
"""
from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

from .train_perpixel_gpu import augment11

CLASSES = ("Plastic", "Algae", "Sea_Foam", "Water")
MODELS = Path(__file__).resolve().parents[1] / "models"


def _load_emb(name):
    p = MODELS / f"clay_emb_{name}.npz"
    if not p.exists():
        return None
    d = np.load(p)
    return d["e"].astype("float32"), d["y"].astype("int64")


def _confusion(y, p, k=4):
    cm = np.zeros((k, k), "int64")
    np.add.at(cm, (y, p), 1)
    return cm


def _prf(cm):
    out = {}
    for c in range(len(CLASSES)):
        tp = cm[c, c]
        prec = tp / max(cm[:, c].sum(), 1)
        rec = tp / max(cm[c, :].sum(), 1)
        f1 = 2 * prec * rec / max(prec + rec, 1e-9)
        out[CLASSES[c]] = {"precision": round(float(prec), 4), "recall": round(float(rec), 4), "f1": round(float(f1), 4)}
    return out


def _macro_f1(prf):
    return round(float(np.mean([v["f1"] for v in prf.values()])), 4)


@torch.no_grad()
def _predict(model, X, device, bs=32768):
    model.eval()
    out = []
    for i in range(0, len(X), bs):
        out.append(model(torch.from_numpy(X[i:i + bs]).to(device)).argmax(1).cpu().numpy())
    return np.concatenate(out) if out else np.zeros((0,), "int64")


def report(tag, y, p):
    cm = _confusion(y, p)
    prf = _prf(cm)
    acc = float((y == p).mean()) if len(y) else 0.0
    mf1 = _macro_f1(prf)
    print(f"  {tag:22s} acc {acc:.4f}  macroF1 {mf1:.4f}  "
          f"(Plastic P {prf['Plastic']['precision']:.3f} R {prf['Plastic']['recall']:.3f})  n={len(y)}")
    return {"acc": round(acc, 4), "macroF1": mf1, "perClass": prf, "confusion": cm.tolist(), "n": int(len(y))}


def _pp11_on_chip_centres(patch_cache: str):
    """Deployed marinenet.onnx on the SAME chips' centre pixels (fair baseline)."""
    import onnxruntime as ort
    d = np.load(MODELS / patch_cache)
    x = d["x"].astype("float32")
    c = x.shape[1] // 2
    centre = x[:, c, c, :]                       # (n,6) [B04,B06,B08,B8A,B11,FDI]
    b04, b08 = centre[:, 0], centre[:, 2]
    ndvi = (b08 - b04) / (b08 + b04 + 1e-6)
    x7 = np.concatenate([centre, ndvi[:, None]], axis=1).astype("float32")
    sess = ort.InferenceSession(str(MODELS / "marinenet.onnx"), providers=["CPUExecutionProvider"])
    nf = sess.get_inputs()[0].shape[1]
    xin = augment11(x7) if nf == 11 else x7
    return sess.run(None, {"input": xin})[0].argmax(1), d["y"].astype("int64")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=60)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--batch", type=int, default=4096)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--rfo", action="store_true")
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"device: {device}")

    Xtr, ytr = _load_emb("train")
    Xva, yva = _load_emb("val")
    if args.rfo:
        r = _load_emb("rfo_train")
        if r is not None:
            Xtr = np.concatenate([Xtr, r[0]]); ytr = np.concatenate([ytr, r[1]])
            print(f"RFO embeddings added: +{len(r[1])} train")
    counts = np.bincount(ytr, minlength=4)
    print(f"train {len(ytr)} {dict(zip(CLASSES, counts.tolist()))}  val {len(yva)}")

    inv = np.array([len(ytr) / (4.0 * max(int(c), 1)) for c in counts])
    wv = np.sqrt(inv); wv = wv / wv.mean()
    w = torch.tensor(wv, dtype=torch.float32, device=device)
    print(f"class weights {np.round(wv, 3).tolist()}")

    head = nn.Sequential(nn.Linear(1024, 256), nn.ReLU(inplace=True), nn.Dropout(0.2),
                         nn.Linear(256, 4)).to(device)
    crit = nn.CrossEntropyLoss(weight=w, label_smoothing=0.03)
    opt = torch.optim.AdamW(head.parameters(), lr=args.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs)

    Xtr_t, ytr_t = torch.from_numpy(Xtr), torch.from_numpy(ytr)
    n = len(ytr)
    best_f1, best_state, best_ep = -1.0, None, 0
    for ep in range(1, args.epochs + 1):
        head.train()
        idx = torch.randperm(n)
        loss_sum, correct = 0.0, 0
        for i in range(0, n, args.batch):
            b = idx[i:i + args.batch]
            xb, yb = Xtr_t[b].to(device), ytr_t[b].to(device)
            opt.zero_grad(set_to_none=True)
            out = head(xb)
            loss = crit(out, yb)
            loss.backward(); opt.step()
            loss_sum += loss.item() * len(b); correct += (out.argmax(1) == yb).sum().item()
        sched.step()
        vf1 = _macro_f1(_prf(_confusion(yva, _predict(head, Xva, device))))
        if vf1 >= best_f1:
            best_f1, best_ep, best_state = vf1, ep, copy.deepcopy(head.state_dict())
        if ep == 1 or ep % 10 == 0 or ep == args.epochs:
            print(f"  epoch {ep:3d}/{args.epochs}  loss {loss_sum/n:.4f}  train_acc {correct/n:.4f}  val_macroF1 {vf1:.4f}")
    head.load_state_dict(best_state)
    print(f"restored best epoch {best_ep} (val macroF1 {best_f1:.4f})")

    # ── identical held-out comparison ──
    print("\n--- CLAY HEAD held-out (4-class) ---")
    res = {}
    ys, ps = [], []
    for src in ("test_marida", "test_mados"):
        Xe, ye = _load_emb(src)
        pe = _predict(head, Xe, device)
        res[src] = report(f"clay {src}", ye, pe)
        ys.append(ye); ps.append(pe)
    combined = report("clay combined", np.concatenate(ys), np.concatenate(ps))

    print("--- baseline: deployed per-pixel model on the SAME chip centres ---")
    bys, bps = [], []
    for cache in ("patches_test_4000_marida.npz", "patches_test_4000_mados.npz"):
        bp, by = _pp11_on_chip_centres(cache)
        bys.append(by); bps.append(bp)
    base = report("pp11 combined", np.concatenate(bys), np.concatenate(bps))

    rfo_block = None
    if args.rfo:
        r = _load_emb("rfo_test")
        if r is not None:
            Xr, yr = r
            pr = _predict(head, Xr, device)
            deb = yr == 0
            rec, fp = float((pr[deb] == 0).mean()), float((pr[~deb] == 0).mean())
            print(f"\n--- RFO HELD-OUT (durban+marmara) ---")
            print(f"  clay head : debris recall {rec:.3f}  water->plastic FP {fp:.3f}  n={len(yr)}")
            import onnxruntime as ort
            t = np.load(MODELS / "rfo_pixels_test.npz")
            sess = ort.InferenceSession(str(MODELS / "marinenet.onnx"), providers=["CPUExecutionProvider"])
            nf = sess.get_inputs()[0].shape[1]
            xin = augment11(t["x"].astype("float32")) if nf == 11 else t["x"].astype("float32")
            bp = sess.run(None, {"input": xin})[0].argmax(1)
            brec, bfp = float((bp[deb] == 0).mean()), float((bp[~deb] == 0).mean())
            print(f"  pp11      : debris recall {brec:.3f}  water->plastic FP {bfp:.3f}")
            rfo_block = {"clay": {"debrisRecall": round(rec, 4), "waterFp": round(fp, 4)},
                         "pp11": {"debrisRecall": round(brec, 4), "waterFp": round(bfp, 4)}, "n": int(len(yr))}

    d = combined["macroF1"] - base["macroF1"]
    verdict = "WINS" if d > 0.005 else ("~tie" if abs(d) >= -0.005 and d >= -0.005 else "LOSES")
    print(f"\nVERDICT vs deployed pp11 on identical held-out: clay {combined['macroF1']:.4f} "
          f"vs pp11 {base['macroF1']:.4f}  ({d:+.4f})  {verdict}")

    torch.save({"state_dict": head.state_dict(), "arch": "1024-256-4", "classes": list(CLASSES)},
               MODELS / "clay_head.pt")
    (MODELS / "clay_head_summary.json").write_text(json.dumps({
        "arch": "frozen Clay v1.5 encoder (1024-d cls token) + MLP head 1024-256-4",
        "trainEmbeddings": int(len(ytr)), "valBest": best_f1,
        "perDataset": res, "combined": combined, "baselinePp11": base,
        "rfoHoldout": rfo_block, "deltaMacroF1": round(float(d), 4), "verdict": verdict,
    }, indent=2), encoding="utf-8")
    print(f"saved -> clay_head.pt + clay_head_summary.json")


if __name__ == "__main__":
    main()
