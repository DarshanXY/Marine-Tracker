"""Hotspot detection: cluster plastic detections, score severity, raise alerts.

    dbscan_clusterer.cluster  →  severity_scorer.severity_for  →  alert_trigger.alerts_for
Optionally persisted via hotspot_storage (the Node backend is the primary store).
"""
