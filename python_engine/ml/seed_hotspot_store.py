"""Seed the hotspot embedding store from REAL cached Clay embeddings — numpy only.

The live per-hotspot pipeline is: engine spools a chip → GPU node (ml.embed_hotspots)
embeds it → this store serves its neighbours. That GPU step needs real scenes + torch.
To make the feature demonstrable at ₹0 (and to exercise the serving path in tests),
this seeds the store with a spread of already-computed Clay embeddings from the held-
out test cache — real fingerprints of real ocean chips — keyed to monitored Indian-
Ocean sites, as if the GPU node had already embedded them.

Run:  python -m ml.seed_hotspot_store          (engine py + numpy is enough)
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

from .hotspot_embeddings import DEFAULT_PATH, HotspotEmbeddingStore, site_key

MODELS = Path(__file__).resolve().parents[1] / "models"

# Representative monitored sites (region code, lat, lon) around Indian seas.
SITES = [
    ("CHN", 13.08, 80.27), ("AND", 11.74, 92.66), ("MUM", 18.95, 72.80),
    ("KOC", 9.93, 76.26), ("VIZ", 17.72, 83.30), ("GOA", 15.40, 73.80),
]
PER_CLASS = 8      # embeddings to seed per surface class
BASE_TS = "2025-11-15T05:30:00Z"
LATER_TS = "2025-12-20T05:30:00Z"   # a second pass ~5 weeks later (for change detection)


def main() -> None:
    src = MODELS / "clay_emb_test_marida.npz"
    if not src.exists():
        print(f"[abort] {src.name} not found — run ml.clay_embed first")
        return
    d = np.load(src)
    e, y = d["e"].astype("float32"), d["y"].astype("int64")

    recs, n = [], 0
    for c in range(4):
        rows = np.where(y == c)[0][:PER_CLASS]
        for j, r in enumerate(rows):
            reg, lat0, lon0 = SITES[n % len(SITES)]
            # deterministic per-row jitter (~1-2 km) so keys are distinct, no RNG
            lat = round(lat0 + (n % 5) * 0.011 - 0.02, 3)
            lon = round(lon0 + (j % 5) * 0.013 - 0.02, 3)
            recs.append({
                "key": site_key(reg, lat, lon), "emb": e[r],
                "lat": lat, "lon": lon, "ts": BASE_TS, "region": reg,
                "cls": int(c), "conf": round(0.70 + ((n * 7) % 25) / 100.0, 2),
            })
            n += 1

    # Temporal observations: give a few sites a second, later pass whose fingerprint
    # is blended toward a strong Plastic exemplar (a site "intensifying") or a Water
    # exemplar (a site "clearing"), so /similarity/change has real drift to report out
    # of the box. Blend toward an EXEMPLAR (not the class mean) with a heavy weight —
    # raw Clay tokens are anisotropic, so a light blend barely moves the vector.
    plastic_ex = e[y == 0][0] if (y == 0).any() else e[0]
    water_ex = e[y == 3][0] if (y == 3).any() else e[0]

    def later(rec: dict, target, w: float) -> dict:
        blended = (1 - w) * rec["emb"] + w * target
        return {**rec, "emb": blended.astype("float32"), "ts": LATER_TS}

    # recs are grouped by class: 0-7 Plastic, 8-15 Algae, 16-23 Sea_Foam, 24-31 Water
    if len(recs) >= 32:
        recs.append(later(recs[26], plastic_ex, 0.8))     # Water site   -> intensifying
        recs.append(later(recs[2], water_ex, 0.8))        # Plastic site -> clearing
        recs.append(later(recs[16], recs[16]["emb"], 0.0))  # Sea_Foam    -> stable (same look)

    store = HotspotEmbeddingStore.load(DEFAULT_PATH)
    added = store.append(recs)
    store.save(DEFAULT_PATH)
    print(f"seeded {added} site embeddings -> {len(store)} rows, "
          f"{len(store.keys_unique())} unique sites ({DEFAULT_PATH.name})")
    for k in store.keys_unique()[:6]:
        print(f"  e.g. key = {k}")


if __name__ == "__main__":
    main()
