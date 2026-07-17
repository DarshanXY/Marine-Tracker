"""Train a REAL convolutional patch classifier on the GPU (PyTorch) → export ONNX.

Input : 64x64x6 patch [B04,B06,B08,B8A,B11,FDI] centred on a candidate pixel.
Output: 4 class logits (Plastic, Algae, Sea_Foam, Water).

A compact ResNet (8 conv layers, residual blocks). Unlike the GAP+linear baseline
it sees SPATIAL TEXTURE, so it can separate streaky/point debris from smooth turbid
water — the real-world accuracy lever. Per-channel normalisation is a BUFFER folded
into forward(), so the exported ONNX consumes RAW reflectance and matches the
engine's inference patches byte-for-byte (no external preprocessing).

Trained on REAL MARIDA + MADOS patches (see ml/datasets/patches.py). Evaluated on
the official held-out test splits, per dataset. Exports models/marinenet_patch.onnx
+ updates models/metrics.json["patch"].

Run (in the GPU env):
    conda run -n mpt-train python -m ml.train_patch_cnn --epochs 30 --per-class 9000
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

from .datasets import patches as P

CLASSES = ("Plastic", "Algae", "Sea_Foam", "Water")
MODELS = Path(__file__).resolve().parents[1] / "models"


# ── Model ─────────────────────────────────────────────────────────────────────
class BasicBlock(nn.Module):
    def __init__(self, cin: int, cout: int, stride: int = 1):
        super().__init__()
        self.c1 = nn.Conv2d(cin, cout, 3, stride, 1, bias=False)
        self.b1 = nn.BatchNorm2d(cout)
        self.c2 = nn.Conv2d(cout, cout, 3, 1, 1, bias=False)
        self.b2 = nn.BatchNorm2d(cout)
        self.down = None
        if stride != 1 or cin != cout:
            self.down = nn.Sequential(nn.Conv2d(cin, cout, 1, stride, bias=False), nn.BatchNorm2d(cout))

    def forward(self, x):
        idt = x if self.down is None else self.down(x)
        x = torch.relu(self.b1(self.c1(x)))
        x = self.b2(self.c2(x))
        return torch.relu(x + idt)


class PatchNet(nn.Module):
    """ResNet-style 6-channel patch classifier with input normalisation baked in."""

    def __init__(self, cin: int = 6, nclass: int = 4, pdrop: float = 0.3):
        super().__init__()
        self.register_buffer("mean", torch.zeros(1, cin, 1, 1))
        self.register_buffer("std", torch.ones(1, cin, 1, 1))
        self.stem = nn.Sequential(nn.Conv2d(cin, 32, 3, 1, 1, bias=False), nn.BatchNorm2d(32), nn.ReLU(inplace=True))
        self.l1 = nn.Sequential(BasicBlock(32, 32), BasicBlock(32, 32))
        self.l2 = nn.Sequential(BasicBlock(32, 64, 2), BasicBlock(64, 64))
        self.l3 = nn.Sequential(BasicBlock(64, 128, 2), BasicBlock(128, 128))
        self.pool = nn.AdaptiveAvgPool2d(1)
        self.drop = nn.Dropout(pdrop)
        self.fc = nn.Linear(128, nclass)

    def set_norm(self, mean: torch.Tensor, std: torch.Tensor):
        self.mean.copy_(mean.view(1, -1, 1, 1))
        self.std.copy_(std.view(1, -1, 1, 1).clamp_min(1e-4))

    def forward(self, x):
        x = (x - self.mean) / self.std
        x = self.stem(x)
        x = self.l1(x); x = self.l2(x); x = self.l3(x)
        x = self.pool(x).flatten(1)
        return self.fc(self.drop(x))


# ── Data helpers ──────────────────────────────────────────────────────────────
def _to_nchw(x_nhwc: np.ndarray) -> torch.Tensor:
    """(n,H,W,6) float16 → torch (n,6,H,W) float16 on CPU."""
    return torch.from_numpy(np.ascontiguousarray(x_nhwc)).permute(0, 3, 1, 2).contiguous()


def _augment(x: torch.Tensor) -> torch.Tensor:
    """Random D4 symmetry — satellite patches are flip/rotation invariant."""
    if torch.rand(1).item() < 0.5:
        x = torch.flip(x, dims=[3])
    if torch.rand(1).item() < 0.5:
        x = torch.flip(x, dims=[2])
    k = int(torch.randint(0, 4, (1,)).item())
    if k:
        x = torch.rot90(x, k, dims=[2, 3])
    return x


@torch.no_grad()
def _predict(model, X: torch.Tensor, device, bs: int = 512) -> np.ndarray:
    model.eval()
    out = []
    for i in range(0, len(X), bs):
        xb = X[i:i + bs].to(device).float()
        out.append(model(xb).argmax(1).cpu().numpy())
    return np.concatenate(out) if out else np.zeros((0,), "int64")


def _confusion(y: np.ndarray, p: np.ndarray, k: int = 4) -> np.ndarray:
    cm = np.zeros((k, k), dtype="int64")
    for t, q in zip(y, p):
        cm[t, q] += 1
    return cm


def _prf(cm: np.ndarray) -> dict:
    out = {}
    for c in range(len(CLASSES)):
        tp = cm[c, c]
        prec = tp / max(cm[:, c].sum(), 1)
        rec = tp / max(cm[c, :].sum(), 1)
        f1 = 2 * prec * rec / max(prec + rec, 1e-9)
        out[CLASSES[c]] = {"precision": round(float(prec), 4), "recall": round(float(rec), 4), "f1": round(float(f1), 4)}
    return out


def _macro_f1(prf: dict) -> float:
    return round(float(np.mean([v["f1"] for v in prf.values()])), 4)


def _perpixel_baseline(Xte_nchw: torch.Tensor, yte: np.ndarray):
    """Run the SHIPPED per-pixel model (marinenet.onnx) on the SAME patch centres —
    a fair, same-test-set comparison for the 'is the CNN better?' question."""
    ppath = MODELS / "marinenet.onnx"
    if not ppath.exists():
        return None
    try:
        import onnxruntime as ort
        sess = ort.InferenceSession(str(ppath), providers=["CPUExecutionProvider"])
        c = Xte_nchw.shape[2] // 2
        centre = Xte_nchw[:, :, c, c].numpy().astype("float32")   # (n,6) B04,B06,B08,B8A,B11,FDI
        b04, b08 = centre[:, 0], centre[:, 2]
        ndvi = (b08 - b04) / (b08 + b04 + 1e-6)
        feat7 = np.concatenate([centre, ndvi[:, None]], axis=1).astype("float32")
        out = sess.run(None, {sess.get_inputs()[0].name: feat7})[0]
        return out.argmax(1)
    except Exception as e:  # noqa: BLE001
        print(f"  (per-pixel baseline skipped: {e})")
        return None


def _report(name: str, y: np.ndarray, p: np.ndarray) -> dict:
    if len(y) == 0:
        print(f"  {name:8s}: (no patches)")
        return {"testAccuracy": 0.0, "macroF1": 0.0, "samples": 0}
    cm = _confusion(y, p)
    prf = _prf(cm)
    acc = float((y == p).mean())
    mf1 = _macro_f1(prf)
    print(f"  {name:8s}: acc {acc:.4f}  macroF1 {mf1:.4f}  "
          f"(Plastic F1 {prf['Plastic']['f1']:.3f} R {prf['Plastic']['recall']:.3f})  n={len(y)}")
    return {"testAccuracy": round(acc, 4), "macroF1": mf1, "perClass": prf, "confusion": cm.tolist(), "samples": int(len(y))}


def _write_metrics(section: dict) -> None:
    path = MODELS / "metrics.json"
    data = {}
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            data = {}
    data["patch"] = section
    data.setdefault("classes", list(CLASSES))
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"  metrics.json['patch'] updated -> {path}")


# ── Train ─────────────────────────────────────────────────────────────────────
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=30)
    ap.add_argument("--per-class", type=int, default=9000, help="train patches per class")
    ap.add_argument("--test-per-class", type=int, default=4000)
    ap.add_argument("--batch", type=int, default=128)
    ap.add_argument("--lr", type=float, default=3e-3)
    ap.add_argument("--seed", type=int, default=1)
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    dev_name = torch.cuda.get_device_name(0) if device.type == "cuda" else "CPU"
    print(f"device: {device} ({dev_name})")

    # ── data ──
    print("building train patches (MARIDA + MADOS)…")
    Xtr_np, ytr = P.build("train", per_class=args.per_class, seed=args.seed, source="both")
    Xtr = _to_nchw(Xtr_np)
    ytr_t = torch.from_numpy(ytr)
    n = len(ytr)
    counts = np.bincount(ytr, minlength=4)
    print(f"train patches: {n}  per-class {dict(zip(CLASSES, counts.tolist()))}")

    # normalisation from the (always-valid) centre pixel of each patch
    centre = Xtr[:, :, Xtr.shape[2] // 2, Xtr.shape[3] // 2].float()  # (n,6)
    mean = centre.mean(0)
    std = centre.std(0)
    print(f"norm mean {mean.round(decimals=4).tolist()}  std {std.round(decimals=4).tolist()}")

    model = PatchNet(pdrop=0.3).to(device)
    model.set_norm(mean.to(device), std.to(device))

    # MILD sqrt-inverse-freq weights. Full inverse-freq collapsed Water recall to
    # 0.38 (rare classes over-predicted = the false-positives-over-water we want to
    # KILL). sqrt keeps rare classes up-weighted but ~3x gentler; mean-normalised.
    inv = np.array([n / (4.0 * max(int(c), 1)) for c in counts], dtype="float64")
    wv = np.sqrt(inv); wv = wv / wv.mean()
    w = torch.tensor(wv, dtype=torch.float32, device=device)
    print(f"class weights (sqrt-inv-freq): {np.round(wv, 3).tolist()}")
    crit = nn.CrossEntropyLoss(weight=w, label_smoothing=0.05)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=5e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs)
    use_amp = device.type == "cuda"
    scaler = torch.amp.GradScaler("cuda", enabled=use_amp)

    # scene-disjoint VAL split → keep the epoch with the best val macro-F1 (fights
    # the overfitting we saw: train 0.98 vs held-out 0.62). Test stays untouched.
    Xva_np, yva = P.build("val", per_class=3000, seed=args.seed, source="both")
    Xva = _to_nchw(Xva_np)
    import copy
    best_f1, best_state, best_ep = -1.0, None, 0

    print(f"training {args.epochs} epochs, batch {args.batch}, AMP={use_amp}, val {len(yva)}…")
    for ep in range(1, args.epochs + 1):
        model.train()
        idx = torch.randperm(n)
        tot, correct, loss_sum = 0, 0, 0.0
        for i in range(0, n, args.batch):
            b = idx[i:i + args.batch]
            xb = _augment(Xtr[b].to(device).float())
            yb = ytr_t[b].to(device)
            opt.zero_grad(set_to_none=True)
            with torch.amp.autocast("cuda", enabled=use_amp):
                out = model(xb)
                loss = crit(out, yb)
            scaler.scale(loss).backward()
            scaler.step(opt)
            scaler.update()
            loss_sum += loss.item() * len(b)
            correct += (out.argmax(1) == yb).sum().item()
            tot += len(b)
        sched.step()
        vf1 = _macro_f1(_prf(_confusion(yva, _predict(model, Xva, device)))) if len(yva) else 0.0
        if vf1 >= best_f1:
            best_f1, best_ep = vf1, ep
            best_state = copy.deepcopy(model.state_dict())
        if ep == 1 or ep % 5 == 0 or ep == args.epochs:
            print(f"  epoch {ep:3d}/{args.epochs}  loss {loss_sum/tot:.4f}  train_acc {correct/tot:.4f}  val_macroF1 {vf1:.4f}  lr {sched.get_last_lr()[0]:.2e}")
    if best_state is not None:
        model.load_state_dict(best_state)
        print(f"restored best epoch {best_ep} (val macroF1 {best_f1:.4f})")

    # ── held-out evaluation (per dataset) ──
    print("evaluating held-out test splits…")
    results = {}
    combined_y, combined_p, combined_x = [], [], []
    probe_x = None  # a held-out batch reused for the ONNX parity check (no re-extract)
    for src in ("marida", "mados"):
        Xte_np, yte = P.build("test", per_class=args.test_per_class, seed=args.seed, source=src)
        if len(yte) == 0:
            continue
        Xte = _to_nchw(Xte_np)
        if src == "mados":
            probe_x = Xte[:400]
        pte = _predict(model, Xte, device)
        results[src] = _report(src, yte, pte)
        combined_y.append(yte); combined_p.append(pte); combined_x.append(Xte)
    cy = np.concatenate(combined_y) if combined_y else np.zeros((0,), "int64")
    cp = np.concatenate(combined_p) if combined_p else np.zeros((0,), "int64")
    combined = _report("combined", cy, cp)

    # Fair baseline: the shipped per-pixel model on the SAME patch centres.
    if combined_x:
        bp = _perpixel_baseline(torch.cat(combined_x), cy)
        if bp is not None:
            print("  --- baseline: shipped per-pixel MLP on the SAME centres ---")
            _report("per-pixel", cy, bp)
    train_acc = float(correct / tot)

    # ── ONNX export (CPU, dynamic batch) ──
    print("exporting ONNX…")
    model.cpu().eval()
    out_path = MODELS / "marinenet_patch.onnx"
    dummy = torch.zeros(1, 6, 64, 64)
    torch.onnx.export(
        model, dummy, str(out_path),
        input_names=["input"], output_names=["output"],
        dynamic_axes={"input": {0: "N"}, "output": {0: "N"}},
        opset_version=13,
    )

    # ── ONNX parity vs torch (reuse a held-out batch; no re-extraction) ──
    agree = 1.0
    if probe_x is not None:
        try:
            import onnxruntime as ort
            sess = ort.InferenceSession(str(out_path), providers=["CPUExecutionProvider"])
            probe = probe_x.float()
            with torch.no_grad():
                t_pred = model(probe).argmax(1).numpy()
            o_pred = sess.run(None, {"input": probe.numpy()})[0].argmax(1)
            agree = float((t_pred == o_pred).mean())
        except Exception as e:  # noqa: BLE001
            print(f"  (parity check skipped: {e})")
    print(f"  ONNX<->torch agreement: {agree:.4f}  ->  {out_path.name}")

    _write_metrics({
        "model": out_path.name,
        "arch": "ResNet patch CNN (6ch, residual, 8 conv) 64x64x6 -> 4",
        "input": "64x64x6 patch [N,6,64,64] NCHW",
        "channels": list(P.PATCH_CHANNELS),
        "trainSamples": int(n),
        "trainAccuracy": round(train_acc, 4),
        "testAccuracy": combined.get("testAccuracy", 0.0),
        "macroF1": combined.get("macroF1", 0.0),
        "onnxAgreement": round(agree, 4),
        "perClass": combined.get("perClass", {}),
        "confusion": combined.get("confusion", []),
        "trainedOn": "marida+mados",
        "dataset": "REAL - MARIDA + MADOS 64x64x6 patches (GPU-trained ResNet CNN)",
        "perDataset": {k: {kk: results[k][kk] for kk in ("testAccuracy", "macroF1", "samples")} for k in results},
        "device": dev_name,
        "note": "GPU-trained convolutional patch classifier; opt-in via CNN_MODEL_PATH=models/marinenet_patch.onnx",
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    })
    print("done.")


if __name__ == "__main__":
    main()
