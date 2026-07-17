"""Drain the chip queue → Clay embeddings → hotspot embedding store (GPU, offline).

The engine spools detected-site chips (ml.embedding_spool) it cannot embed itself
(no torch at runtime). This GPU-side job loads the frozen Clay encoder once, embeds
every queued chip with the SAME locked recipe as ml.clay_embed (5 real bands,
mask_ratio=0, class token), and appends the raw fingerprints to the store so the
engine can serve true per-hotspot similarity + change detection.

Run (GPU env):  conda run -n mpt-train python -m ml.embed_hotspots
  --keep    don't delete drained queue files (default: delete after success)
  --once    process the current queue and exit (default; a --watch loop could poll)
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from .clay_embed import embed_chips, load_clay
from .hotspot_embeddings import DEFAULT_PATH, HotspotEmbeddingStore
from .embedding_spool import QUEUE


def _records_from_queue(mm, mean, std, waves, dev, batch: int) -> list[dict]:
    files = sorted(QUEUE.glob("*.npz")) if QUEUE.exists() else []
    if not files:
        print("queue empty — nothing to embed")
        return []
    recs, drained = [], []
    for f in files:
        try:
            d = np.load(f, allow_pickle=True)
            chips = d["chips"].astype("float32")          # [K,64,64,5] reflectance
            emb = embed_chips(mm, chips, mean, std, waves, dev, bs=batch)  # [K,1024]
            for i in range(len(chips)):
                recs.append({"key": str(d["keys"][i]), "emb": emb[i],
                             "lat": float(d["lat"][i]), "lon": float(d["lon"][i]),
                             "ts": str(d["ts"][i]), "region": str(d["region"][i]),
                             "cls": int(d["cls"][i]), "conf": float(d["conf"][i])})
            drained.append(f)
            print(f"  embedded {len(chips)} chip(s) from {f.name}", flush=True)
        except Exception as e:  # noqa: BLE001 — skip a bad queue file, keep going
            print(f"  [skip] {f.name}: {e}")
    _records_from_queue.drained = drained  # type: ignore[attr-defined]
    return recs


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep", action="store_true", help="keep drained queue files")
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--once", action="store_true", default=True)
    args = ap.parse_args()

    import torch
    dev = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"device: {dev}")
    print("loading Clay encoder (4.8GB ckpt)…", flush=True)
    mm, mean, std, waves = load_clay(dev)

    recs = _records_from_queue(mm, mean, std, waves, dev, args.batch)
    if not recs:
        return
    store = HotspotEmbeddingStore.load(DEFAULT_PATH)
    added = store.append(recs)
    store.save(DEFAULT_PATH)
    print(f"store: +{added} new row(s) -> {len(store)} total ({DEFAULT_PATH.name})")

    if not args.keep:
        for f in getattr(_records_from_queue, "drained", []):
            f.unlink(missing_ok=True)
        print("drained queue files removed")


if __name__ == "__main__":
    main()
