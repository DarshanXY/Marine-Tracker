"""Spool detected-site chips for offline Clay embedding — numpy only, no torch.

At pipeline time the engine cuts a 64×64×5 Clay chip (the 5 real bands, FDI
dropped) centred on each hotspot and drops it in models/embed_queue/. The GPU
node (ml.embed_hotspots) later drains the queue, embeds with Clay, and appends to
the hotspot embedding store. This is the write half of the batch-embed / serve-
online split — cheap, engine-safe, and a no-op when there's no real scene array.

Queue file: models/embed_queue/<run_id>.npz
  chips f16[K,64,64,5]   keys/ts/region str[K]   lat/lon f32[K]   cls i64[K] conf f32[K]
"""
from __future__ import annotations

import os
from pathlib import Path

from .hotspot_embeddings import site_key

CLASSES = ("Plastic", "Algae", "Sea_Foam", "Water")
QUEUE = Path(__file__).resolve().parents[1] / "models" / "embed_queue"
CHIP = 64
MAX_SITES = 8   # cap chips/run so the queue stays small


def enabled() -> bool:
    """Opt-out via EMBED_SPOOL=0. On by default, but only ever writes when a run
    actually has a real scene array + hotspots, so it's free on synthetic demos."""
    return os.getenv("EMBED_SPOOL", "1").strip().lower() not in {"0", "false", "no", "off"}


def _nearest_rowcol(candidates, lat: float, lon: float):
    """Grid (row,col) of the candidate pixel nearest a hotspot centroid."""
    best, brc = 1e18, None
    for px, _fdi in candidates:
        d = (px["lat"] - lat) ** 2 + (px["lon"] - lon) ** 2
        if d < best and "row" in px:
            best, brc = d, (int(px["row"]), int(px["col"]))
    return brc


def spool_sites(run_id: str, arr6, sites: list[dict], candidates, region, ts: str) -> int:
    """sites: [{lat,lon,cls,conf}]. Cuts a Clay chip per site (centred via the
    nearest candidate) and queues them for embedding. Returns chips queued (0 if
    disabled / no real array / no locatable sites). Never raises into the pipeline."""
    if not enabled() or arr6 is None or not sites or not candidates:
        return 0
    try:
        import numpy as np

        from satellite.patch_extractor import extract_patch

        arr = np.asarray(arr6)
        if arr.ndim != 3 or arr.shape[2] < 5:
            return 0
        chips, keys, lats, lons, clss, confs = [], [], [], [], [], []
        for s in sites[:MAX_SITES]:
            rc = _nearest_rowcol(candidates, s["lat"], s["lon"])
            if rc is None:
                continue
            chip = extract_patch(arr, rc[0], rc[1], CHIP)[..., :5]   # drop FDI → Clay's 5 bands
            chips.append(chip.astype("float32"))
            keys.append(site_key(region, s["lat"], s["lon"]))
            lats.append(float(s["lat"])); lons.append(float(s["lon"]))
            clss.append(int(s.get("cls", 0))); confs.append(float(s.get("conf", 0.0)))
        if not chips:
            return 0
        QUEUE.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(
            QUEUE / f"{run_id}.npz",
            chips=np.stack(chips).astype("float16"),
            keys=np.array(keys), lat=np.array(lats, "float32"), lon=np.array(lons, "float32"),
            ts=np.array([ts] * len(keys)), region=np.array([str(region or "aoi")] * len(keys)),
            cls=np.array(clss, "int64"), conf=np.array(confs, "float32"),
        )
        return len(chips)
    except Exception:  # noqa: BLE001 — spooling must never break a pipeline run
        return 0


def sites_from_hotspots(hotspots) -> list[dict]:
    """Hotspot objects → spool site dicts (hotspots are Plastic clusters → cls 0)."""
    return [{"lat": h.centroid_lat, "lon": h.centroid_lon,
             "cls": CLASSES.index("Plastic"), "conf": h.confidence} for h in hotspots]
