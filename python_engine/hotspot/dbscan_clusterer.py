"""DBSCAN clustering (from scratch, no scikit-learn dependency).

Groups nearby plastic detections into hotspots. Distance is decimal degrees
(adequate at the pilot's regional scale). Spec defaults: eps = 0.09°,
min_samples = 3. `cluster` returns {cluster_label: [member_indices]} for the
non-noise clusters — the shape the pipeline consumes.
"""
from __future__ import annotations

import math

Point = tuple[float, float]

NOISE = -1
UNCLASSIFIED = None


def _dist(a: Point, b: Point) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def dbscan(points: list[Point], eps: float, min_samples: int) -> list[int]:
    """Return a cluster label per point (-1 = noise)."""
    n = len(points)
    labels: list[int | None] = [UNCLASSIFIED] * n

    def neighbours(idx: int) -> list[int]:
        return [j for j in range(n) if _dist(points[idx], points[j]) <= eps]

    cluster = -1
    for i in range(n):
        if labels[i] is not UNCLASSIFIED:
            continue
        seeds = neighbours(i)
        if len(seeds) < min_samples:
            labels[i] = NOISE
            continue
        cluster += 1
        labels[i] = cluster
        k = 0
        while k < len(seeds):
            j = seeds[k]
            k += 1
            if labels[j] == NOISE:
                labels[j] = cluster
            if labels[j] is not UNCLASSIFIED:
                continue
            labels[j] = cluster
            j_neighbours = neighbours(j)
            if len(j_neighbours) >= min_samples:
                seeds.extend(nb for nb in j_neighbours if nb not in seeds)

    return [NOISE if lab is UNCLASSIFIED else int(lab) for lab in labels]


def cluster(points: list[Point], eps: float, min_samples: int) -> dict[int, list[int]]:
    """DBSCAN → {cluster_label: [member indices]} for non-noise clusters only."""
    labels = dbscan(points, eps, min_samples)
    clusters: dict[int, list[int]] = {}
    for i, lab in enumerate(labels):
        if lab >= 0:
            clusters.setdefault(lab, []).append(i)
    return clusters
