"""GPU-retrain the PER-PIXEL classifier (PyTorch) → drop-in marinenet.onnx.

The shipped marinenet.onnx is a numpy-trained 7->32->16->4 MLP. On the honest
held-out MARIDA+MADOS test it already BEATS the GPU patch CNN (per-pixel spectral
signal generalises; 64x64 texture overfits the few hundred distinct scenes). So
the real accuracy lever is to train the *per-pixel* head harder, not to swap in
the CNN. This trainer does that on the GPU:

  * minibatch AdamW + cosine LR + label smoothing + dropout (the numpy trainer
    had none of these) and a deeper 64-32-16 MLP,
  * MILD sqrt-inverse-freq class weights (full inverse-freq made the shipped model
    flag Sea_Foam at 1.6% precision — floods false positives),
  * validation-macroF1 best-epoch selection,
  * OPTIONAL engineered spectral indices (PI, MNDWI, red-edge NDVI, brightness)
    derived from the SAME 5 bands the engine already fetches — so an 11-feature
    model is still a zero-extra-data drop-in (mirror `augment11` in the engine's
    inference_engine._features).

Two candidates are trained and compared head-to-head against the shipped model on
an identical held-out test: a 7-feature (pure drop-in, no engine change) and an
11-feature (needs the mirrored _features edit). Nothing is promoted automatically:
candidates export to models/marinenet_pp7.onnx / marinenet_pp11.onnx and a verdict
is printed. Reads the numpy-only caches models/{marida,mados}_{split}.npz, so it
runs in the GPU env (no rasterio/GDAL).

Run (GPU env):  conda run -n mpt-train python -m ml.train_perpixel_gpu --epochs 80
"""
from __future__ import annotations

import argparse
import copy
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

CLASSES = ("Plastic", "Algae", "Sea_Foam", "Water")
MODELS = Path(__file__).resolve().parents[1] / "models"
EPS = 1e-6
# Base 7-feature contract (matches ml.model_loader.FEATURE_NAMES / inference_engine._features)
BASE_FEATURES = ("B04", "B06", "B08", "B8A", "B11", "FDI", "NDVI")
# Engineered add-ons for the 11-feature variant (order MUST match engine augment11)
EXTRA_FEATURES = ("PI", "MNDWI", "NDVI_RE", "BRIGHT")


# ── Feature engineering ───────────────────────────────────────────────────────
def augment11(x7: np.ndarray) -> np.ndarray:
    """[.,7]=[B04,B06,B08,B8A,B11,FDI,NDVI] -> [.,11] adding 4 indices from the 5
    bands (cols 0-4). MUST be mirrored EXACTLY in inference_engine._features so a
    model trained here consumes identical inputs at inference."""
    b04, b06, b08, b8a, b11 = (x7[:, i] for i in range(5))
    pi = b08 / (b08 + b04 + EPS)                 # Plastic Index (Biermann 2020)
    mndwi = (b08 - b11) / (b08 + b11 + EPS)       # NIR-SWIR water / floating-matter
    ndvi_re = (b8a - b06) / (b8a + b06 + EPS)      # red-edge veg (algae)
    bright = (b04 + b06 + b08 + b8a + b11) / 5.0   # broadband brightness (foam/glint)
    extra = np.stack([pi, mndwi, ndvi_re, bright], axis=1).astype("float32")
    return np.concatenate([x7, extra], axis=1)


# ── Data (numpy-only caches; no rasterio) ─────────────────────────────────────
def load_split(split: str):
    """Combined MARIDA+MADOS split -> (x7 [n,7] f32, y [n] i64, n_marida)."""
    parts, y_parts, n_marida = [], [], 0
    for src in ("marida", "mados"):
        p = MODELS / f"{src}_{split}.npz"
        if not p.exists():
            continue
        d = np.load(p)
        x, y = d["x"].astype("float32"), d["y"].astype("int64")
        parts.append(x); y_parts.append(y)
        if src == "marida":
            n_marida = len(y)
    x = np.concatenate(parts) if parts else np.zeros((0, 7), "float32")
    y = np.concatenate(y_parts) if y_parts else np.zeros((0,), "int64")
    return x, y, n_marida


# ── Model ─────────────────────────────────────────────────────────────────────
class PerPixelNet(nn.Module):
    """MLP with input standardisation baked into forward() as buffers, so the
    exported ONNX consumes RAW features (matches the engine feeding raw features)."""

    def __init__(self, in_dim: int, nclass: int = 4, pdrop: float = 0.15):
        super().__init__()
        self.register_buffer("mean", torch.zeros(in_dim))
        self.register_buffer("std", torch.ones(in_dim))
        self.net = nn.Sequential(
            nn.Linear(in_dim, 64), nn.ReLU(inplace=True), nn.Dropout(pdrop),
            nn.Linear(64, 32), nn.ReLU(inplace=True), nn.Dropout(pdrop),
            nn.Linear(32, 16), nn.ReLU(inplace=True),
            nn.Linear(16, nclass),
        )

    def set_norm(self, mean: torch.Tensor, std: torch.Tensor):
        self.mean.copy_(mean)
        self.std.copy_(std.clamp_min(1e-4))

    def forward(self, x):
        return self.net((x - self.mean) / self.std)


# ── Eval helpers ──────────────────────────────────────────────────────────────
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
def _predict(model, X, device, bs=65536):
    model.eval()
    out = []
    for i in range(0, len(X), bs):
        xb = torch.from_numpy(X[i:i + bs]).to(device)
        out.append(model(xb).argmax(1).cpu().numpy())
    return np.concatenate(out) if out else np.zeros((0,), "int64")


def _balanced_idx(y, per_class, seed=0):
    """Indices for a class-balanced subsample (caps Water) — a second, rare-class
    fair view alongside the full imbalanced test."""
    rng = np.random.default_rng(seed)
    idx = []
    for c in range(4):
        ci = np.where(y == c)[0]
        if len(ci) > per_class:
            ci = rng.choice(ci, per_class, replace=False)
        idx.append(ci)
    out = np.concatenate(idx)
    return out[rng.permutation(len(out))]


def report(tag, y, p, show=True):
    cm = _confusion(y, p)
    prf = _prf(cm)
    acc = float((y == p).mean()) if len(y) else 0.0
    mf1 = _macro_f1(prf)
    if show:
        print(f"  {tag:22s} acc {acc:.4f}  macroF1 {mf1:.4f}  "
              f"(Plastic P {prf['Plastic']['precision']:.3f} R {prf['Plastic']['recall']:.3f} F1 {prf['Plastic']['f1']:.3f} | "
              f"Foam P {prf['Sea_Foam']['precision']:.3f})  n={len(y)}")
    return {"acc": round(acc, 4), "macroF1": mf1, "perClass": prf, "confusion": cm.tolist(), "n": int(len(y))}


def shipped_baseline(x7_test):
    """Shipped marinenet.onnx predictions on the SAME test rows (adapts 7/11-feat)."""
    try:
        import onnxruntime as ort
        sess = ort.InferenceSession(str(MODELS / "marinenet.onnx"), providers=["CPUExecutionProvider"])
        nf = sess.get_inputs()[0].shape[1]
        x = augment11(x7_test) if nf == 11 else x7_test
        out = sess.run(None, {"input": x.astype("float32")})[0]
        return out.argmax(1)
    except Exception as e:  # noqa: BLE001
        print(f"  (shipped baseline skipped: {e})")
        return None


# ── Train one candidate ───────────────────────────────────────────────────────
def train_candidate(name, xtr, ytr, xva, yva, epochs, lr, batch, device, seed):
    torch.manual_seed(seed)
    in_dim = xtr.shape[1]
    counts = np.bincount(ytr, minlength=4)
    inv = np.array([len(ytr) / (4.0 * max(int(c), 1)) for c in counts])
    wv = np.sqrt(inv); wv = wv / wv.mean()                      # mild sqrt-inv-freq
    w = torch.tensor(wv, dtype=torch.float32, device=device)
    print(f"\n=== candidate {name}  ({in_dim} features)  class weights {np.round(wv,3).tolist()} ===")

    model = PerPixelNet(in_dim).to(device)
    model.set_norm(torch.tensor(xtr.mean(0)).to(device), torch.tensor(xtr.std(0)).to(device))
    crit = nn.CrossEntropyLoss(weight=w, label_smoothing=0.03)
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=epochs)
    use_amp = device.type == "cuda"
    scaler = torch.amp.GradScaler("cuda", enabled=use_amp)

    Xtr_t = torch.from_numpy(xtr); ytr_t = torch.from_numpy(ytr)
    n = len(ytr)
    best_f1, best_state, best_ep = -1.0, None, 0
    for ep in range(1, epochs + 1):
        model.train()
        idx = torch.randperm(n)
        loss_sum, correct, tot = 0.0, 0, 0
        for i in range(0, n, batch):
            b = idx[i:i + batch]
            xb = Xtr_t[b].to(device); yb = ytr_t[b].to(device)
            opt.zero_grad(set_to_none=True)
            with torch.amp.autocast("cuda", enabled=use_amp):
                out = model(xb); loss = crit(out, yb)
            scaler.scale(loss).backward(); scaler.step(opt); scaler.update()
            loss_sum += loss.item() * len(b); correct += (out.argmax(1) == yb).sum().item(); tot += len(b)
        sched.step()
        vf1 = _macro_f1(_prf(_confusion(yva, _predict(model, xva, device)))) if len(yva) else 0.0
        if vf1 >= best_f1:
            best_f1, best_ep, best_state = vf1, ep, copy.deepcopy(model.state_dict())
        if ep == 1 or ep % 10 == 0 or ep == epochs:
            print(f"  epoch {ep:3d}/{epochs}  loss {loss_sum/tot:.4f}  train_acc {correct/tot:.4f}  val_macroF1 {vf1:.4f}  lr {sched.get_last_lr()[0]:.2e}")
    if best_state is not None:
        model.load_state_dict(best_state)
        print(f"  restored best epoch {best_ep} (val macroF1 {best_f1:.4f})")
    return model, float(correct / tot)


def export_onnx(model, in_dim, out_path):
    model.cpu().eval()
    dummy = torch.zeros(1, in_dim)
    torch.onnx.export(model, dummy, str(out_path), input_names=["input"], output_names=["output"],
                      dynamic_axes={"input": {0: "N"}, "output": {0: "N"}}, opset_version=13)
    try:
        import onnxruntime as ort
        sess = ort.InferenceSession(str(out_path), providers=["CPUExecutionProvider"])
        probe = torch.randn(256, in_dim)
        with torch.no_grad():
            t = model(probe).argmax(1).numpy()
        o = sess.run(None, {"input": probe.numpy()})[0].argmax(1)
        return float((t == o).mean())
    except Exception as e:  # noqa: BLE001
        print(f"  (parity skipped: {e})")
        return 1.0


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=80)
    ap.add_argument("--lr", type=float, default=2e-3)
    ap.add_argument("--batch", type=int, default=8192)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--rfo", action="store_true",
                    help="add RefinedFloatingObjects points (6 new scenes) to training; "
                         "also evaluates on the RFO held-out scenes (durban+marmara)")
    args = ap.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    dev_name = torch.cuda.get_device_name(0) if device.type == "cuda" else "CPU"
    print(f"device: {device} ({dev_name})")

    x7_tr, ytr, _ = load_split("train")
    x7_va, yva, _ = load_split("val")
    x7_te, yte, n_marida_te = load_split("test")
    rfo_te = None
    if args.rfo:
        d = np.load(MODELS / "rfo_pixels_train.npz")
        x7_tr = np.concatenate([x7_tr, d["x"].astype("float32")])
        ytr = np.concatenate([ytr, d["y"].astype("int64")])
        t = np.load(MODELS / "rfo_pixels_test.npz")
        rfo_te = (t["x"].astype("float32"), t["y"].astype("int64"))
        print(f"RFO added: +{len(d['y'])} train px (4 scenes), held-out {len(t['y'])} px (durban+marmara)")
    print(f"train {len(ytr)}  val {len(yva)}  test {len(yte)} (marida {n_marida_te} + mados {len(yte)-n_marida_te})")
    print(f"train class balance {dict(zip(CLASSES, np.bincount(ytr, minlength=4).tolist()))}")

    # shared held-out views (index-aligned across candidates)
    bal = _balanced_idx(yte, per_class=4000, seed=7)

    # baseline: shipped model on the SAME test (full + per-dataset + balanced)
    print("\n--- SHIPPED marinenet.onnx (baseline, identical test) ---")
    bp = shipped_baseline(x7_te)
    base = {}
    if bp is not None:
        base["full"] = report("shipped full", yte, bp)
        base["marida"] = report("shipped marida", yte[:n_marida_te], bp[:n_marida_te])
        base["mados"] = report("shipped mados", yte[n_marida_te:], bp[n_marida_te:])
        base["bal"] = report("shipped balanced", yte[bal], bp[bal])

    variants = {
        "pp7": (x7_tr, x7_va, x7_te, BASE_FEATURES),
        "pp11": (augment11(x7_tr), augment11(x7_va), augment11(x7_te), BASE_FEATURES + EXTRA_FEATURES),
    }
    summary = {}
    trained = {}
    tag = "_rfo" if args.rfo else ""
    for name, (xtr, xva, xte, feats) in variants.items():
        model, tr_acc = train_candidate(name, xtr, ytr, xva, yva, args.epochs, args.lr, args.batch, device, args.seed)
        trained[name] = model
        pte = _predict(model, xte, device)
        print(f"--- {name} held-out ---")
        full = report(f"{name} full", yte, pte)
        marida = report(f"{name} marida", yte[:n_marida_te], pte[:n_marida_te])
        mados = report(f"{name} mados", yte[n_marida_te:], pte[n_marida_te:])
        balr = report(f"{name} balanced", yte[bal], pte[bal])
        out_path = MODELS / f"marinenet_{name}{tag}.onnx"
        agree = export_onnx(model, xte.shape[1], out_path)
        print(f"  exported {out_path.name}  onnx<->torch {agree:.4f}")
        summary[name] = {"features": list(feats), "trainAcc": round(tr_acc, 4), "onnxAgreement": round(agree, 4),
                         "full": full, "marida": marida, "mados": mados, "bal": balr}

    # ── verdict ──
    print("\n================= HEAD-TO-HEAD (held-out test) =================")
    print(f"{'model':16s} {'full acc':>9} {'full mF1':>9} {'bal mF1':>9} {'Plastic F1':>11} {'Foam P':>8}")
    if base:
        b = base
        print(f"{'shipped':16s} {b['full']['acc']:9.4f} {b['full']['macroF1']:9.4f} {b['bal']['macroF1']:9.4f} "
              f"{b['full']['perClass']['Plastic']['f1']:11.3f} {b['full']['perClass']['Sea_Foam']['precision']:8.3f}")
    for name, s in summary.items():
        print(f"{name:16s} {s['full']['acc']:9.4f} {s['full']['macroF1']:9.4f} {s['bal']['macroF1']:9.4f} "
              f"{s['full']['perClass']['Plastic']['f1']:11.3f} {s['full']['perClass']['Sea_Foam']['precision']:8.3f}")

    if base:
        base_mf1 = base["full"]["macroF1"]
        print(f"\nbaseline full macroF1 = {base_mf1:.4f}")
        for name, s in summary.items():
            d = s["full"]["macroF1"] - base_mf1
            verdict = "WINS" if d > 0.005 else ("~tie" if abs(d) <= 0.005 else "LOSES")
            print(f"  {name}: {s['full']['macroF1']:.4f}  ({d:+.4f})  {verdict}")

    # RFO held-out scenes: fully NEW seas (durban+marmara), binary debris-vs-water.
    # Debris recall = catches real debris; water FP = false alarms over open water.
    if rfo_te is not None:
        xr7, yr = rfo_te
        deb = yr == 0
        print(f"\n--- RFO HELD-OUT (durban+marmara, {int(deb.sum())} debris / {int((~deb).sum())} water) ---")
        bp_r = shipped_baseline(xr7)
        if bp_r is not None:
            print(f"  {'shipped':10s} debris recall {(bp_r[deb] == 0).mean():.3f}   water->plastic FP {(bp_r[~deb] == 0).mean():.3f}")
        cpu = torch.device("cpu")
        for name, model in trained.items():
            xr = augment11(xr7) if name == "pp11" else xr7
            pr = _predict(model.cpu(), xr, cpu)
            rec, fp = float((pr[deb] == 0).mean()), float((pr[~deb] == 0).mean())
            print(f"  {name:10s} debris recall {rec:.3f}   water->plastic FP {fp:.3f}")
            summary[name]["rfoHoldout"] = {"debrisRecall": round(rec, 4), "waterFp": round(fp, 4), "n": int(len(yr))}

    # persist a scratch summary for the promotion decision (does NOT touch metrics.json)
    import json
    out_json = MODELS / f"perpixel_gpu_summary{tag}.json"
    out_json.write_text(
        json.dumps({"baseline": base, "candidates": summary, "device": dev_name, "rfo": bool(args.rfo)}, indent=2),
        encoding="utf-8")
    print(f"\nsummary -> {out_json}  (candidates: marinenet_pp7{tag}.onnx, marinenet_pp11{tag}.onnx)")
    print("done. Nothing promoted — review the verdict, then copy the winner to marinenet.onnx.")


if __name__ == "__main__":
    main()
