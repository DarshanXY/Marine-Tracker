"""Engine-safe similarity service over the Clay embedding index (numpy only).

Lazy-loads models/clay_index.npz once. Powers the /similarity endpoints:
find-similar, retrieval classification, novelty scoring. Generating a query
embedding needs Clay (torch, GPU env); this service only SEARCHES a prebuilt
index, so the ₹0 FastAPI engine serves it with numpy and NO torch dependency.
Absent index -> available() False -> endpoints answer 503 (graceful, like the
rest of the engine's optional capabilities).
"""
from __future__ import annotations

from pathlib import Path

_INDEX = None
_TRIED = False
_PATH = Path(__file__).resolve().parents[1] / "models" / "clay_index.npz"
_NOVEL_TAU = 0.20   # anomaly above this = flag as novel/out-of-distribution

# Per-site embedding store (built by the offline GPU embedder). Reloaded when the
# file mtime changes so newly-embedded hotspots appear without an engine restart.
_STORE = None
_STORE_MTIME = None
_HPATH = Path(__file__).resolve().parents[1] / "models" / "hotspot_embeddings.npz"


def _get():
    global _INDEX, _TRIED
    if _INDEX is not None:
        return _INDEX
    if not _PATH.exists():
        return None            # not built yet — don't latch, so a later build is picked up
    if _TRIED:
        return _INDEX          # file exists but a prior load failed (e.g. corrupt) — don't retry-spin
    _TRIED = True
    try:
        from ml.clay_index import ClayIndex
        _INDEX = ClayIndex.load(_PATH)
    except Exception:  # noqa: BLE001 — never break the engine over an optional feature
        _INDEX = None
    return _INDEX


def _store():
    """Lazy per-site embedding store, refreshed on file mtime change (so the
    offline embedder's appends are served without restarting the engine)."""
    global _STORE, _STORE_MTIME
    if not _HPATH.exists():
        return None
    m = _HPATH.stat().st_mtime
    if _STORE is None or m != _STORE_MTIME:
        try:
            from ml.hotspot_embeddings import HotspotEmbeddingStore
            _STORE, _STORE_MTIME = HotspotEmbeddingStore.load(_HPATH), m
        except Exception:  # noqa: BLE001 — optional feature, never break the engine
            _STORE = None
    return _STORE


def reset() -> None:
    global _INDEX, _TRIED, _STORE, _STORE_MTIME
    _INDEX, _TRIED, _STORE, _STORE_MTIME = None, False, None, None


def available() -> bool:
    return _get() is not None


def info() -> dict:
    idx = _get()
    if idx is None:
        return {"available": False}
    from ml.clay_index import CLASSES
    mix = {CLASSES[c]: int((idx.labels == c).sum()) for c in range(4)}
    st = _store()
    site_store = {"embeddedSites": len(st.keys_unique()), "observations": len(st)} if st else \
        {"embeddedSites": 0, "observations": 0}
    return {"available": True, "size": len(idx), "dim": int(idx.emb.shape[1]),
            "classMix": mix, "sources": sorted(set(idx.sources.tolist())),
            "siteStore": site_store,
            "model": "Clay v1.5 foundation embeddings (1024-d, mean-centred cosine)"}


def search_embedding(vec, k: int = 6) -> dict:
    """A RAW 1024-d Clay embedding (from the GPU embedder) -> nearest labelled
    sites + retrieval class vote + novelty score."""
    idx = _get()
    if idx is None:
        return {"available": False}
    import numpy as np
    from ml.clay_index import CLASSES
    q = np.asarray(vec, dtype="float32").reshape(1, -1)
    if q.shape[1] != idx.emb.shape[1]:
        return {"available": True, "error": f"embedding must be {idx.emb.shape[1]}-d"}
    anom = float(idx.anomaly_score(q)[0])
    return {"available": True, "neighbours": idx.find_similar(q, k=k)[0],
            "knnClass": CLASSES[int(idx.knn_predict(q, k=10)[0])],
            "anomaly": round(anom, 4), "novel": bool(anom > _NOVEL_TAU)}


def hotspot(key: str, k: int = 6) -> dict:
    """True 'sites like THIS hotspot': look up the site's cached Clay embedding and
    return its nearest labelled reference sites + retrieval class + novelty. If the
    site hasn't been embedded yet (queued but the GPU node hasn't run), returns
    pending=True so the UI can fall back to the class-neighbourhood view."""
    idx = _get()
    if idx is None:
        return {"available": False}
    st = _store()
    if st is None or not st.has(key):
        return {"available": True, "pending": True, "key": key}
    import numpy as np
    from ml.clay_index import CLASSES
    from ml.confidence_fusion import fuse
    emb, meta = st.latest(key)
    q = np.asarray(emb, dtype="float32").reshape(1, -1)
    anom = float(idx.anomaly_score(q)[0])
    novel = bool(anom > _NOVEL_TAU)
    knn_class = CLASSES[int(idx.knn_predict(q, k=10)[0])]
    mlp_class = CLASSES[meta["cls"]] if 0 <= meta["cls"] < len(CLASSES) else str(meta["cls"])
    fusion = fuse(mlp_class, meta["conf"], clay_class=knn_class, anomaly=anom, novel=novel)
    return {"available": True, "pending": False, "key": key,
            "observedAt": meta["ts"], "lat": meta["lat"], "lon": meta["lon"],
            "observations": len(st.history(key)),
            "neighbours": idx.find_similar(q, k=k)[0],
            "mlpClass": mlp_class, "mlpConfidence": round(meta["conf"], 3),
            "knnClass": knn_class, "anomaly": round(anom, 4), "novel": novel,
            "fusion": fusion}


def sites(limit: int = 200) -> dict:
    """List the embedded sites (one row per unique site, newest observation) so the
    UI can offer them for per-hotspot intelligence without needing a map click."""
    st = _store()
    if st is None:
        return {"available": False, "count": 0, "sites": []}
    from ml.clay_index import CLASSES
    out = []
    for key in st.keys_unique():
        latest = st.latest(key)
        if latest is None:
            continue
        _emb, meta = latest
        out.append({"key": key, "region": meta["region"], "lat": meta["lat"], "lon": meta["lon"],
                    "mlpClass": CLASSES[meta["cls"]] if 0 <= meta["cls"] < len(CLASSES) else str(meta["cls"]),
                    "observedAt": meta["ts"], "observations": len(st.history(key))})
    out.sort(key=lambda s: (s["region"], s["key"]))
    return {"available": True, "count": len(out), "sites": out[:limit]}


def change(key: str) -> dict:
    """Temporal change for a site: how its Clay fingerprint has drifted across its
    dated observations + whether it's looking more/less plastic-like over time."""
    idx = _get()
    if idx is None:
        return {"available": False}
    st = _store()
    if st is None or not st.has(key):
        return {"available": True, "key": key, "observations": 0, "change": None,
                "note": "site not embedded yet"}
    from ml.site_change import analyze
    return analyze(idx, st, key)


def demo(k: int = 6, cls: int = 0) -> dict:
    """'Find sites like this' without an embedder: pick a labelled library item and
    return its nearest neighbours (lets the UI show the feature live at ₹0)."""
    idx = _get()
    if idx is None:
        return {"available": False}
    import numpy as np
    from ml.clay_index import CLASSES
    name = CLASSES[cls] if 0 <= cls < len(CLASSES) else str(cls)
    rows = np.where(idx.labels == cls)[0]
    if len(rows) == 0:
        # index IS available, this class just has no reference sites — not a 503
        return {"available": True, "queryClass": name, "neighbours": []}
    i = int(rows[len(rows) // 2])
    return {"available": True, "queryClass": name, "queryId": int(idx.ids[i]),
            "querySource": str(idx.sources[i]), "neighbours": idx.neighbors_of(i, k=k)}
