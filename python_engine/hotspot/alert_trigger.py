"""Alert generation from hotspots.

Turns HIGH/MEDIUM hotspots into alert dicts. Type is COAST_PROXIMITY when a
coast-landfall ETA is within 48 h, else HOTSPOT. The Node backend owns delivery
(WebSocket / dedupe / email); this stage just produces the candidate alerts the
pipeline reports and persists.
"""
from __future__ import annotations

from .severity_scorer import is_alertable

COAST_ETA_ALERT_HOURS = 48.0


def alert_for(hotspot: dict) -> dict | None:
    """One hotspot → an alert dict, or None if not alertable."""
    if not is_alertable(hotspot.get("severity", "LOW")):
        return None
    eta = hotspot.get("eta_hours")
    coastal = eta is not None and eta <= COAST_ETA_ALERT_HOURS
    label = hotspot.get("label", "hotspot")
    count = hotspot.get("detection_count", 0)
    conf = hotspot.get("confidence", 0.0)
    if coastal:
        return {
            "type": "COAST_PROXIMITY", "severity": hotspot["severity"],
            "title": f"Drift forecast: coastal landfall ETA {round(eta)} h — {label}",
            "message": f"{label}: {count} detections ({round(conf * 100)}% conf) forecast to reach the coast in ~{round(eta)} h.",
            "eta_hours": eta,
        }
    return {
        "type": "HOTSPOT", "severity": hotspot["severity"],
        "title": f"{hotspot['severity']} plastic hotspot — {label}",
        "message": f"{label}: {count} detections clustered at {round(conf * 100)}% confidence.",
        "eta_hours": eta,
    }


def alerts_for(hotspots: list[dict]) -> list[dict]:
    """All alertable hotspots → alert dicts."""
    return [a for a in (alert_for(h) for h in hotspots) if a is not None]
