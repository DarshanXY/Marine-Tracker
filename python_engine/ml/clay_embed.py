"""Cache Clay v1.5 embeddings for our labelled 64x64 chips (GPU, offline).

Loads the frozen Clay encoder once, then embeds every chip in the existing patch
caches (models/patches_<split>_<cap>[_src].npz, NHWC float16, channels
[B04,B06,B08,B8A,B11,FDI]) using ONLY the 5 real bands (FDI dropped — Clay wants
raw spectra + wavelengths). Recipe (smoke-verified on the RTX 4050):
mask_ratio=0 -> model.model.encoder(datacube) -> class token [:,0,:] = [N,1024].
Saves models/clay_emb_<name>.npz {e float16 [N,1024], y int64}.

Run (GPU env):  conda run -n mpt-train python -m ml.clay_embed
Optionally --only rfo  to embed the RFO chip cache produced by ml.datasets.rfo.
"""
from __future__ import annotations

import argparse
import time
from pathlib import Path

import numpy as np
import torch
import yaml

MODELS = Path(__file__).resolve().parents[1] / "models"
CLAY = MODELS / "clay"
SENSOR = "sentinel-2-l2a"
OUR = ["B04", "B06", "B08", "B8A", "B11"]
KEY = {"B04": "red", "B06": "rededge2", "B08": "nir", "B8A": "nir08", "B11": "swir16"}

# (cache file, output name) — inputs are NHWC chips whose first 5 channels are the bands
JOBS = [
    ("patches_train_9000.npz", "train"),
    ("patches_val_3000.npz", "val"),
    ("patches_test_4000_marida.npz", "test_marida"),
    ("patches_test_4000_mados.npz", "test_mados"),
    ("rfo_chips_train.npz", "rfo_train"),
    ("rfo_chips_test.npz", "rfo_test"),
]


def load_clay(dev):
    from claymodel.module import ClayMAEModule
    md = yaml.safe_load((CLAY / "metadata.yaml").read_text())[SENSOR]["bands"]
    mean = np.array([md["mean"][KEY[b]] for b in OUR], "float32")
    std = np.array([md["std"][KEY[b]] for b in OUR], "float32")
    waves = [md["wavelength"][KEY[b]] * 1000 for b in OUR]
    model = ClayMAEModule.load_from_checkpoint(
        str(CLAY / "clay-v1.5.ckpt"), metadata_path=str(CLAY / "metadata.yaml"), map_location="cpu")
    model.eval().to(dev)
    mm = model.model
    mm.mask_ratio = 0.0
    if hasattr(mm, "encoder") and hasattr(mm.encoder, "mask_ratio"):
        mm.encoder.mask_ratio = 0.0
    return mm, mean, std, waves


@torch.no_grad()
def embed_chips(mm, chips_nhwc5, mean, std, waves, dev, bs=64):
    """chips (N,64,64,5) reflectance 0-1 -> [N,1024] float32 (class token)."""
    n = len(chips_nhwc5)
    out = np.zeros((n, 1024), "float32")
    wl = torch.tensor(waves, dtype=torch.float32, device=dev)
    t0 = time.time()
    for i in range(0, n, bs):
        x = chips_nhwc5[i:i + bs].astype("float32")
        x = (x * 10000.0 - mean) / std                      # Clay DN normalisation
        chip = torch.from_numpy(x).permute(0, 3, 1, 2).contiguous().to(dev)
        b = chip.shape[0]
        cube = {"platform": SENSOR, "time": torch.zeros(b, 4, device=dev),
                "latlon": torch.zeros(b, 4, device=dev), "pixels": chip,
                "gsd": torch.tensor(10.0, device=dev), "waves": wl}
        tok = mm.encoder(cube)[0]                           # [b, 1+P, 1024]
        out[i:i + b] = tok[:, 0, :].float().cpu().numpy()   # class token
        if (i // bs) % 40 == 0:
            done = i + b
            rate = done / max(time.time() - t0, 1e-6)
            print(f"    {done}/{n}  ({rate:.0f} chips/s)", flush=True)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default=None, help="substring filter on job name (e.g. 'rfo')")
    ap.add_argument("--batch", type=int, default=64)
    args = ap.parse_args()

    dev = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"device: {dev} ({torch.cuda.get_device_name(0) if dev.type=='cuda' else 'CPU'})")
    print("loading Clay encoder (4.8GB ckpt)…", flush=True)
    t = time.time()
    mm, mean, std, waves = load_clay(dev)
    print(f"loaded in {time.time()-t:.0f}s")

    for src_name, out_name in JOBS:
        if args.only and args.only not in out_name:
            continue
        src = MODELS / src_name
        dst = MODELS / f"clay_emb_{out_name}.npz"
        if not src.exists():
            print(f"[skip] {src_name} (not found)")
            continue
        if dst.exists():
            print(f"[skip] {dst.name} (already cached)")
            continue
        d = np.load(src)
        x, y = d["x"], d["y"]
        chips5 = x[..., :5]                                  # drop FDI channel
        print(f"[embed] {src_name}: {len(y)} chips -> {dst.name}", flush=True)
        e = embed_chips(mm, chips5, mean, std, waves, dev, bs=args.batch)
        np.savez_compressed(dst, e=e.astype("float16"), y=y.astype("int64"))
        print(f"    saved {dst.name}  e{e.shape}")
    print("ALL EMBEDDINGS CACHED")


if __name__ == "__main__":
    main()
