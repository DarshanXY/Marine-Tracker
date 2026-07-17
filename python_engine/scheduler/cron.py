"""External-scheduler contract (the engine runs NO in-process scheduler).

Sentinel-2 revisits a spot ~every 5 days, so a 6-hour cadence keeps drift
forecasts + alerts current without hammering providers. The actual trigger is
external — the repo ships infra/auto-detect.ps1 and the Node backend's
/api/pipeline/scheduled-run endpoint. This module centralises the recommended
cadence and explains the setup.
"""
from __future__ import annotations

import os

DEFAULT_INTERVAL_HOURS = 6


def default_interval_hours() -> float:
    try:
        return float(os.getenv("DETECTION_INTERVAL_HOURS", DEFAULT_INTERVAL_HOURS))
    except ValueError:
        return float(DEFAULT_INTERVAL_HOURS)


def describe() -> str:
    return (
        "External scheduler only (no in-process loop). Recommended cadence "
        f"{default_interval_hours()} h. Trigger via infra/auto-detect.ps1 or the "
        "Node backend /api/pipeline/scheduled-run."
    )
