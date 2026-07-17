"""Per-site Clay embedding store — numpy only, engine-safe (NO torch).

The engine (py3.14, no torch) cannot run Clay live, so detected-site fingerprints
are produced in a BATCH step on the GPU node (ml.embed_hotspots) and served here.
This is the standard "batch-embed offline, serve online" split: the ₹0 web engine
answers "sites like THIS hotspot" and "how has THIS site changed" over a prebuilt
store, no GPU at request time.

Store file: models/hotspot_embeddings.npz — append-only, one row per (site, time):
  keys   str[N]     stable site key  region:lat,lon  (site_key())
  emb    f16[N,1024] RAW Clay class token (un-centred — the reference ClayIndex
                     centres queries by ITS mean, so store the raw space)
  lat/lon f32[N]     site centroid
  ts     str[N]      ISO acquisition/observation time (lexicographically sortable)
  region str[N]      monitored-region code or 'aoi'
  cls    i64[N]      MLP class at embed time (0-3) — context for fusion/change
  conf   f32[N]      MLP confidence at embed time

Multiple rows may share a key (same place, different dates) → this is the raw
material for temporal change detection. `latest(key)` picks the newest row.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

DEFAULT_PATH = Path(__file__).resolve().parents[1] / "models" / "hotspot_embeddings.npz"
DIM = 1024
_FIELDS = ("keys", "emb", "lat", "lon", "ts", "region", "cls", "conf")


def site_key(region: str | None, lat: float, lon: float, prec: int = 3) -> str:
    """Stable key for a place, so re-scanning the same site resolves to the same
    row(s). 3 dp ≈ 110 m — finer than one 640 m scene, coarse enough to re-hit."""
    reg = (region or "aoi").strip() or "aoi"
    return f"{reg}:{round(float(lat), prec)},{round(float(lon), prec)}"


class HotspotEmbeddingStore:
    """A time-stamped library of per-site Clay embeddings + provenance."""

    def __init__(self, keys, emb, lat, lon, ts, region, cls, conf):
        self.keys = np.asarray(keys)
        self.emb = np.asarray(emb, dtype="float32")
        self.lat = np.asarray(lat, dtype="float32")
        self.lon = np.asarray(lon, dtype="float32")
        self.ts = np.asarray(ts)
        self.region = np.asarray(region)
        self.cls = np.asarray(cls, dtype="int64")
        self.conf = np.asarray(conf, dtype="float32")

    def __len__(self) -> int:
        return len(self.keys)

    @classmethod
    def empty(cls) -> "HotspotEmbeddingStore":
        return cls(np.array([], dtype="<U1"), np.zeros((0, DIM), "float32"),
                   np.array([], "float32"), np.array([], "float32"),
                   np.array([], dtype="<U1"), np.array([], dtype="<U1"),
                   np.array([], "int64"), np.array([], "float32"))

    @classmethod
    def load(cls, path=DEFAULT_PATH) -> "HotspotEmbeddingStore":
        p = Path(path)
        if not p.exists():
            return cls.empty()
        d = np.load(p, allow_pickle=True)
        return cls(d["keys"], d["emb"].astype("float32"), d["lat"], d["lon"],
                   d["ts"], d["region"], d["cls"], d["conf"])

    def save(self, path=DEFAULT_PATH) -> None:
        np.savez_compressed(path, keys=self.keys, emb=self.emb.astype("float16"),
                            lat=self.lat, lon=self.lon, ts=self.ts,
                            region=self.region, cls=self.cls, conf=self.conf)

    # ── lookup ──
    def has(self, key: str) -> bool:
        return bool(np.any(self.keys == key))

    def _rows(self, key: str) -> np.ndarray:
        """Row indices for a key, oldest→newest (ISO strings sort lexically)."""
        rows = np.where(self.keys == key)[0]
        return rows[np.argsort(self.ts[rows])] if len(rows) else rows

    def latest(self, key: str):
        """(emb[1024], meta) for the newest observation of a site, or None."""
        rows = self._rows(key)
        if not len(rows):
            return None
        i = int(rows[-1])
        return self.emb[i], self._meta(i)

    def history(self, key: str) -> list[dict]:
        """All observations of a site, oldest→newest (for change detection)."""
        return [self._meta(int(i)) for i in self._rows(key)]

    def _meta(self, i: int) -> dict:
        return {"key": str(self.keys[i]), "ts": str(self.ts[i]),
                "lat": float(self.lat[i]), "lon": float(self.lon[i]),
                "region": str(self.region[i]), "cls": int(self.cls[i]),
                "conf": float(self.conf[i]), "row": int(i)}

    def keys_unique(self) -> list[str]:
        return sorted(set(self.keys.tolist()))

    # ── growth (used by the offline embedder) ──
    def append(self, recs: list[dict]) -> int:
        """Add rows from dicts {key,emb,lat,lon,ts,region,cls,conf}. De-dupes an
        exact (key, ts) that already exists so re-embedding is idempotent. Returns
        the number of NEW rows added."""
        existing = set(zip(self.keys.tolist(), self.ts.tolist()))
        fresh = [r for r in recs if (str(r["key"]), str(r["ts"])) not in existing]
        if not fresh:
            return 0
        self.keys = np.concatenate([self.keys, np.array([r["key"] for r in fresh])])
        self.emb = np.concatenate([self.emb, np.asarray([r["emb"] for r in fresh], "float32")])
        self.lat = np.concatenate([self.lat, np.array([r["lat"] for r in fresh], "float32")])
        self.lon = np.concatenate([self.lon, np.array([r["lon"] for r in fresh], "float32")])
        self.ts = np.concatenate([self.ts, np.array([r["ts"] for r in fresh])])
        self.region = np.concatenate([self.region, np.array([r["region"] for r in fresh])])
        self.cls = np.concatenate([self.cls, np.array([r["cls"] for r in fresh], "int64")])
        self.conf = np.concatenate([self.conf, np.array([r["conf"] for r in fresh], "float32")])
        return len(fresh)
