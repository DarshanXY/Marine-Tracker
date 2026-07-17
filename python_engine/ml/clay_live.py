"""Live Clay tier-2 — the engine's real-time call to the GPU sidecar during a scan.

After the MLP first pass produces hotspots, this cuts each hotspot's chip and asks
the Clay sidecar (clay_service, GPU env) to embed it, then fuses MLP + Clay into a
confidence tier (confidence_fusion) and a CONFIRMED / POSSIBLE label. Pure numpy +
urllib here (no torch) so it stays inside the ₹0 engine; the heavy lifting is the
sidecar's. Best-effort throughout: if the sidecar is down or slow, hotspots keep
their MLP-only result and the scan is unaffected.

Enable/point via env: CLAY_SERVICE_URL (default http://127.0.0.1:8010),
CLAY_LIVE=0 to disable.
"""
from __future__ import annotations

import json
import os
import threading
import time
import urllib.request
from pathlib import Path

from .embedding_spool import CHIP, MAX_SITES, _nearest_rowcol

URL = os.getenv("CLAY_SERVICE_URL", "http://127.0.0.1:8010").rstrip("/")
NOVEL_TAU = 0.20

# A ping to a sidecar that is UP answers in ~1ms, but one to a sidecar that is
# DOWN costs the FULL timeout: a host that drops the SYN instead of refusing it
# (firewall policy on the loopback port) turns "cheap health check" into a 1s
# stall on every call — and /capabilities is polled. So cache only the expensive
# negative answer; when the sidecar is up we still ping every time, keeping the
# current truth a scan wants. Cost of the cache: after the sidecar is started, it
# can read as offline for up to this long. Mirrors the backend's 30s queue probe.
_DOWN_TTL = 30.0
_down_until = 0.0
_probe_lock = threading.Lock()


def enabled() -> bool:
    return os.getenv("CLAY_LIVE", "1").strip().lower() not in {"0", "false", "no", "off"}


def available(timeout: float = 1.0) -> bool:
    """Is the sidecar up + model loaded? Pings unless a recent probe said 'down'."""
    global _down_until
    if not enabled():
        return False
    with _probe_lock:
        if time.monotonic() < _down_until:
            return False
    try:
        with urllib.request.urlopen(f"{URL}/health", timeout=timeout) as r:  # noqa: S310
            ready = bool(json.loads(r.read()).get("ready"))
    except Exception:  # noqa: BLE001
        ready = False
    if not ready:
        with _probe_lock:
            _down_until = time.monotonic() + _DOWN_TTL
    return ready


def reset_probe() -> None:
    """Forget a cached 'down' — call after starting the sidecar (and in tests)."""
    global _down_until
    with _probe_lock:
        _down_until = 0.0


def _plastic_affinity(idx, q, k: int = 10) -> float:
    """Similarity-weighted share of the k nearest reference sites that are Plastic —
    class-robust (unlike raw k-NN argmax, which the water-heavy library biases)."""
    rows, sim = idx.search(q, k=k)
    if rows.shape[1] == 0:
        return 0.0
    import numpy as np
    w = np.clip(sim[0], 0, None)
    labs = idx.labels[rows[0]]
    tot = float(w.sum()) or 1.0
    return float(w[labs == 0].sum() / tot)   # class 0 = Plastic


def _embed(chips, timeout: float = 20.0):
    data = json.dumps({"chips": chips}).encode("utf-8")
    req = urllib.request.Request(f"{URL}/embed", data=data,
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310
        return json.loads(r.read()).get("embeddings")


def enrich_hotspots(arr6, hotspots, candidates, max_sites: int = MAX_SITES) -> int:
    """Attach a Clay tier-2 verdict to each hotspot in place. Returns how many were
    enriched (0 if disabled / sidecar down / no reference index). Never raises."""
    if not enabled() or arr6 is None or not hotspots or not candidates:
        return 0
    try:
        import numpy as np

        from satellite.patch_extractor import extract_patch
        from ml import similarity_service as sim
        from ml.clay_index import CLASSES
        from ml.confidence_fusion import hotspot_tier

        arr = np.asarray(arr6)
        if arr.ndim != 3 or arr.shape[2] < 5:
            return 0

        picks, chips = [], []
        for h in hotspots[:max_sites]:
            rc = _nearest_rowcol(candidates, h.centroid_lat, h.centroid_lon)
            if rc is None:
                continue
            chip = extract_patch(arr, rc[0], rc[1], CHIP)[..., :5]   # 5 real bands
            chips.append(chip.astype("float32").tolist())
            picks.append(h)
        if not chips:
            return 0

        embeddings = _embed(chips)
        if not embeddings:
            return 0
        idx = sim._get()                       # reference Clay index (numpy) for k-NN + novelty
        if idx is None:
            return 0

        emb = np.asarray(embeddings, dtype="float32")
        n = 0
        for h, e in zip(picks, emb):
            q = e.reshape(1, -1)
            knn = CLASSES[int(idx.knn_predict(q, k=10)[0])]
            anom = float(idx.anomaly_score(q)[0])
            affinity = _plastic_affinity(idx, q)
            # Hotspots are MLP-Plastic clusters → mlp_class is Plastic at h.confidence.
            # Calibrated CONFIRMED/POSSIBLE from MLP conf + Clay plastic-affinity + novelty.
            fusion = hotspot_tier(h.confidence, affinity, anom)
            fusion["agreement"] = knn == "Plastic"
            h.clay_class = knn
            h.anomaly = round(anom, 4)
            h.fusion = fusion
            h.tier = "CONFIRMED" if fusion["confirmed"] else "POSSIBLE"
            n += 1
        return n
    except Exception:  # noqa: BLE001 — tier-2 is best-effort, never break a scan
        return 0
