"""Scheduled detection sweep — one live run per monitored region.

Running one pipeline PER region tags detections with a region (a combined
all-regions run cannot attribute detections). This is the callable the external
scheduler ultimately drives via the Node backend. The engine has no in-process
loop of its own.

Run manually:  python -m scheduler.pipeline_runner
"""
from __future__ import annotations

from logger import get_logger
from main_pipeline import run_pipeline
from satellite.download import REGIONS

log = get_logger("scheduler")


def run_all_regions(scene_size: int = 48) -> list[dict]:
    """Run the pipeline once per region → per-region summary list."""
    results: list[dict] = []
    for code in REGIONS:
        try:
            r = run_pipeline(region=code, scene_size=scene_size)
            results.append({
                "region": code, "detections": r.stats.detections,
                "plastic": r.stats.plastic, "hotspots": r.stats.hotspots,
                "provider": r.stats.provider,
            })
            log.info("region %s: %s detections, %s hotspots", code, r.stats.detections, r.stats.hotspots)
        except Exception as exc:  # noqa: BLE001 — one region failing must not stop the rest
            log.warning("scheduled run failed for %s: %s", code, exc)
            results.append({"region": code, "error": str(exc)[:200]})
    return results


if __name__ == "__main__":
    for row in run_all_regions():
        print(row)
