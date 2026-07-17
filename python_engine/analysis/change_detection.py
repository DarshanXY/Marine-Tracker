"""Change detection over an AOI — compare a recent window vs an older one.

Fetches the least-cloud Sentinel-2 mosaic for two time windows (days_recent,
days_old), runs FDI candidacy on each, and reports the delta in debris-candidate
DENSITY plus each window's surface composition. Answers "is this hotspot growing
or new?". Real fetch only (synthetic has no temporal signal) — returns
available=False without Sentinel Hub credentials.
"""
from __future__ import annotations

from config import settings
from satellite import band_loader, cloud_masker, threshold_applier


def _scan(bbox: dict, days_back: int) -> dict:
    arr = band_loader.fetch_bands(bbox, days_back=days_back)
    bands, scl = cloud_masker.split_scl(arr)
    surface = cloud_masker.surface_from_scl(scl) if scl is not None else None
    pixels, _ = threshold_applier.extract_candidates(
        bands, bbox, settings.fdi_threshold, max_candidates=100_000, scl=scl,
    )
    total = int(bands.shape[0] * bands.shape[1])
    return {
        "candidatePixels": len(pixels),
        "candidateDensity": round(len(pixels) / max(total, 1), 6),
        "surface": surface,
    }


def compare(bbox: dict, days_recent: int = 30, days_old: int = 180) -> dict:
    """Two-window comparison → density delta + trend label."""
    if not band_loader.available():
        return {"available": False, "reason": "real ingest not configured (needs Sentinel Hub keys)"}
    recent = _scan(bbox, days_recent)
    old = _scan(bbox, days_old)
    delta = recent["candidateDensity"] - old["candidateDensity"]
    trend = "increasing" if delta > 1e-3 else "decreasing" if delta < -1e-3 else "stable"
    return {
        "available": True,
        "recent": recent, "old": old,
        "daysRecent": days_recent, "daysOld": days_old,
        "densityDelta": round(delta, 6), "trend": trend,
    }
