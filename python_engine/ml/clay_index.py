"""Numpy-only similarity index over Clay embeddings — NO torch, engine-safe.

Clay turns any 64x64 chip into a 1024-d "fingerprint". This module makes those
fingerprints searchable, and is the shared engine behind four embedding features:

  * find_similar   — "find sites like this hotspot" (cosine nearest neighbours)
  * knn_predict    — retrieval classifier (label by neighbour vote; NO trained head)
  * anomaly_score  — novelty / out-of-distribution score (1 - nearest similarity)
  * fewshot        — nearest-centroid classifier from a handful of labelled examples

Generating an embedding needs Clay (torch, GPU env); SEARCHING one does not — this
file is pure numpy so the FastAPI engine (py3.14, onnxruntime, no torch) can serve
similarity over a prebuilt index (models/clay_index.npz).
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

CLASSES = ("Plastic", "Algae", "Sea_Foam", "Water")
DEFAULT_PATH = Path(__file__).resolve().parents[1] / "models" / "clay_index.npz"


def l2norm(x: np.ndarray) -> np.ndarray:
    x = np.asarray(x, dtype="float32")
    return x / (np.linalg.norm(x, axis=-1, keepdims=True) + 1e-8)


class ClayIndex:
    """A searchable library of labelled Clay embeddings + their provenance.

    Embeddings are MEAN-CENTRED before L2-normalising. Clay's raw class tokens are
    anisotropic (all ~0.99 cosine of each other — the ViT 'cone effect'), so a
    single shared direction swamps the signal. Subtracting the reference mean makes
    the discriminative variation dominate, so nearest-neighbour actually separates
    classes. The mean is stored and applied identically to every query.
    """

    def __init__(self, emb: np.ndarray, labels: np.ndarray, sources, ids=None, mean=None):
        emb = np.asarray(emb, dtype="float32")
        self.mean = emb.mean(0).astype("float32") if mean is None else np.asarray(mean, "float32")
        self.emb = l2norm(emb - self.mean)           # centred, then unit vectors
        self.labels = np.asarray(labels, dtype="int64")
        self.sources = np.asarray(sources)
        self.ids = np.asarray(ids) if ids is not None else np.arange(len(self.labels))

    def __len__(self) -> int:
        return len(self.labels)

    def _prep(self, q: np.ndarray) -> np.ndarray:
        """Centre by the reference mean, then unit-normalise — the query transform."""
        return l2norm(np.atleast_2d(np.asarray(q, dtype="float32")) - self.mean)

    # ── persistence ──
    def save(self, path=DEFAULT_PATH) -> None:
        # store centred unit vectors + the mean so load() reconstructs exactly
        np.savez_compressed(path, emb=self.emb.astype("float16"), labels=self.labels,
                            sources=self.sources, ids=self.ids, mean=self.mean)

    @classmethod
    def load(cls, path=DEFAULT_PATH) -> "ClayIndex":
        d = np.load(path, allow_pickle=True)
        # Reconstruct WITHOUT __init__ (which would re-centre): emb was stored already
        # centred+normalised, so just re-normalise and load the stored mean verbatim.
        obj = cls.__new__(cls)
        obj.mean = d["mean"].astype("float32")
        obj.emb = l2norm(d["emb"].astype("float32"))
        obj.labels = d["labels"].astype("int64")
        obj.sources = d["sources"]
        obj.ids = d["ids"] if "ids" in d.files else np.arange(len(obj.labels))
        return obj

    # ── core search ──
    def search(self, q: np.ndarray, k: int = 5, exclude_self: bool = False):
        """Return (idx [Q,k], sim [Q,k]) — cosine-nearest reference rows per query."""
        qn = self._prep(q)
        if self.emb.shape[0] == 0:                    # empty index — degrade gracefully
            empty = np.zeros((qn.shape[0], 0), dtype="int64")
            return empty, empty.astype("float32")
        sims = qn @ self.emb.T                        # centred cosine
        kk = min(k + (1 if exclude_self else 0), sims.shape[1])
        idx = np.argpartition(-sims, kk - 1, axis=1)[:, :kk]
        order = np.argsort(-np.take_along_axis(sims, idx, axis=1), axis=1)
        idx = np.take_along_axis(idx, order, axis=1)
        sim = np.take_along_axis(sims, idx, axis=1)
        if exclude_self:                              # drop the identical top hit
            idx, sim = idx[:, 1:k + 1], sim[:, 1:k + 1]
        return idx, sim

    def _describe(self, row, sim):
        return [{"class": CLASSES[int(self.labels[j])], "source": str(self.sources[j]),
                 "id": int(self.ids[j]), "similarity": round(float(v), 4)} for j, v in zip(row, sim)]

    def find_similar(self, q: np.ndarray, k: int = 5, exclude_self: bool = False):
        """Human-readable neighbours for a RAW query embedding (from Clay):
        list of [{class, source, id, similarity}] per query."""
        idx, sim = self.search(q, k, exclude_self)
        return [self._describe(row, s) for row, s in zip(idx, sim)]

    def neighbors_of(self, i: int, k: int = 5):
        """'Find sites like THIS one' where the query is an existing library row i
        (its stored vector is already centred+normalised — no re-prep). Excludes self."""
        if len(self) == 0:
            return []
        sims = self.emb[i] @ self.emb.T
        kk = min(k + 1, sims.shape[0])
        idx = np.argpartition(-sims, kk - 1)[:kk]
        idx = idx[np.argsort(-sims[idx])]
        idx = idx[idx != i][:k]
        return self._describe(idx, sims[idx])

    # ── retrieval classifier (no trained head) ──
    def knn_predict(self, q: np.ndarray, k: int = 10, exclude_self: bool = False) -> np.ndarray:
        idx, sim = self.search(q, k, exclude_self)
        preds = np.empty(len(idx), dtype="int64")
        for i, (row, s) in enumerate(zip(idx, sim)):
            votes = np.bincount(self.labels[row], weights=np.clip(s, 0, None), minlength=4)
            preds[i] = int(votes.argmax())
        return preds

    # ── novelty / out-of-distribution ──
    def anomaly_score(self, q: np.ndarray, k: int = 5) -> np.ndarray:
        """1 - mean cosine similarity to the k nearest references. High = unusual."""
        _, sim = self.search(q, k)
        return 1.0 - sim.mean(axis=1)

    # ── few-shot nearest-centroid ── (centred like everything else)
    def fewshot_centroids(self, support_emb: np.ndarray, support_labels: np.ndarray, nclass: int = 4):
        sup = self._prep(support_emb)
        support_labels = np.asarray(support_labels)
        cents = np.zeros((nclass, sup.shape[1]), "float32")
        for c in range(nclass):
            m = support_labels == c
            if m.any():
                cents[c] = sup[m].mean(0)
        return l2norm(cents)

    def fewshot_predict(self, centroids: np.ndarray, q: np.ndarray) -> np.ndarray:
        return (self._prep(q) @ centroids.T).argmax(1)


def build_from_caches(models_dir: Path, jobs) -> ClayIndex:
    """jobs: list of (clay_emb_file, source_tag). Concatenate into one index."""
    embs, labs, srcs = [], [], []
    for fname, tag in jobs:
        p = models_dir / fname
        if not p.exists():
            continue
        d = np.load(p)
        embs.append(d["e"].astype("float32"))
        labs.append(d["y"].astype("int64"))
        srcs.append(np.full(len(d["y"]), tag))
    return ClayIndex(np.concatenate(embs), np.concatenate(labs), np.concatenate(srcs))
