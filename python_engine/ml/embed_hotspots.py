"""Drain the chip queue -> Clay embeddings -> hotspot embedding store.

The engine spools detected-site chips (ml.embedding_spool) it cannot embed itself
(no torch at runtime). This job embeds every queued chip and appends the raw
fingerprints to the store so the engine can serve true per-hotspot similarity +
change detection.

TWO paths, sidecar preferred:
  * SIDECAR (default when clay_service :8010 is up): POST chips to /embed — reuses
    the ALREADY-loaded Clay model, so NO second 4.8 GB load (no GPU OOM) and NO
    torch needed here. This makes `--watch` a tiny always-on poller in the base env.
  * OFFLINE fallback (sidecar down): lazy-load the frozen Clay encoder locally
    (needs the GPU env). Only used when the sidecar isn't running.

Both use the SAME locked recipe (5 real bands, mask_ratio=0, class token) so the
fingerprints are identical either way.

Run:
  python -m ml.embed_hotspots                 # drain once via sidecar (base env)
  python -m ml.embed_hotspots --watch 60      # always-on poller, every 60 s
  conda run -n mpt-train python -m ml.embed_hotspots   # offline fallback if sidecar down
  --keep   don't delete drained queue files (default: delete after success)
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.request
from pathlib import Path

import numpy as np

from .embedding_spool import QUEUE
from .hotspot_embeddings import DEFAULT_PATH, HotspotEmbeddingStore

SIDECAR = "http://127.0.0.1:8010"


def _sidecar_up(timeout: float = 1.0) -> bool:
    try:
        with urllib.request.urlopen(f"{SIDECAR}/health", timeout=timeout) as r:  # noqa: S310
            return bool(json.loads(r.read()).get("ready"))
    except Exception:  # noqa: BLE001
        return False


def _embed_via_sidecar(chips: np.ndarray, bs: int = 32) -> np.ndarray:
    """POST [K,64,64,5] chips to the running sidecar -> [K,1024]. No local Clay load."""
    out = []
    for i in range(0, len(chips), bs):
        body = json.dumps({"chips": chips[i:i + bs].tolist()}).encode("utf-8")
        req = urllib.request.Request(f"{SIDECAR}/embed", data=body,
                                     headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=60) as r:  # noqa: S310
            emb = json.loads(r.read()).get("embeddings")
        if not emb:
            raise RuntimeError("sidecar returned no embeddings")
        out.append(np.asarray(emb, dtype="float32"))
    return np.concatenate(out) if out else np.zeros((0, 1024), "float32")


def _make_embedder(prefer_sidecar: bool = True):
    """Return (embed_fn(chips)->[K,1024], label). Sidecar if up, else lazy-load Clay."""
    if prefer_sidecar and _sidecar_up():
        return _embed_via_sidecar, "sidecar :8010 (shared model, no extra GPU load)"
    # Offline fallback — needs torch + the GPU env.
    import torch  # noqa: PLC0415

    from .clay_embed import embed_chips, load_clay  # noqa: PLC0415
    dev = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"sidecar down -> loading Clay encoder locally on {dev} (4.8GB)...", flush=True)
    mm, mean, std, waves = load_clay(dev)
    return (lambda chips, bs=32: embed_chips(mm, chips, mean, std, waves, dev, bs=bs)), f"offline Clay ({dev})"


def drain_once(embed_fn, keep: bool = False) -> int:
    """Embed every queued chip file via embed_fn, append to the store. Returns rows added."""
    files = sorted(QUEUE.glob("*.npz")) if QUEUE.exists() else []
    if not files:
        return 0
    recs, drained = [], []
    for f in files:
        try:
            # Context-managed so the npz handle is CLOSED before we unlink it —
            # else Windows refuses to delete the still-open file (WinError 32).
            with np.load(f, allow_pickle=True) as d:
                chips = d["chips"].astype("float32")          # [K,64,64,5]
                meta = [(str(d["keys"][i]), float(d["lat"][i]), float(d["lon"][i]),
                         str(d["ts"][i]), str(d["region"][i]), int(d["cls"][i]), float(d["conf"][i]))
                        for i in range(len(chips))]
            emb = embed_fn(chips)                          # [K,1024]
            for i, (key, lat, lon, ts, region, cls, conf) in enumerate(meta):
                recs.append({"key": key, "emb": emb[i], "lat": lat, "lon": lon,
                             "ts": ts, "region": region, "cls": cls, "conf": conf})
            drained.append(f)
            print(f"  embedded {len(chips)} chip(s) from {f.name}", flush=True)
        except Exception as e:  # noqa: BLE001 — skip a bad/locked file, keep going
            print(f"  [skip] {f.name}: {e}")
    if not recs:
        return 0
    store = HotspotEmbeddingStore.load(DEFAULT_PATH)
    added = store.append(recs)
    store.save(DEFAULT_PATH)
    print(f"store: +{added} new row(s) -> {len(store)} total ({DEFAULT_PATH.name})", flush=True)
    if not keep:
        for f in drained:
            f.unlink(missing_ok=True)
    return added


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep", action="store_true", help="keep drained queue files")
    ap.add_argument("--watch", type=int, default=0, metavar="SECONDS",
                    help="poll the queue forever every N s (always-on drainer)")
    args = ap.parse_args()

    if args.watch:
        print(f"embed-drainer watching {QUEUE} every {args.watch}s (sidecar-first)...", flush=True)
        while True:
            try:
                if _sidecar_up():
                    n = drain_once(_embed_via_sidecar, keep=args.keep)
                    if n:
                        print(f"drained {n} site(s)", flush=True)
                # sidecar down -> skip this tick (don't load Clay in a poller); retry next tick
            except Exception as e:  # noqa: BLE001 — a poller must never die
                print(f"  [watch] {e}", flush=True)
            time.sleep(args.watch)

    embed_fn, label = _make_embedder()
    print(f"embedding via {label}")
    if drain_once(embed_fn, keep=args.keep) == 0:
        print("queue empty - nothing to embed")


if __name__ == "__main__":
    main()
