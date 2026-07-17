"""In-process metrics — lightweight counters + timings, no Prometheus dep.

`inc()` bumps a counter, `observe()` records a duration, `snapshot()` returns the
current state for GET /metrics. Thread-safe enough for a single-worker uvicorn.
Zero dependencies, so it never affects the ₹0 demo path.
"""
from __future__ import annotations

import threading

_lock = threading.Lock()
_counters: dict[str, int] = {}
_timings: dict[str, list[float]] = {}


def inc(name: str, by: int = 1) -> None:
    with _lock:
        _counters[name] = _counters.get(name, 0) + by


def observe(name: str, ms: float) -> None:
    with _lock:
        _timings.setdefault(name, []).append(ms)
        if len(_timings[name]) > 500:      # keep only the last 500 samples
            _timings[name] = _timings[name][-500:]


def snapshot() -> dict:
    with _lock:
        timings = {}
        for k, vals in _timings.items():
            if vals:
                s = sorted(vals)
                timings[k] = {
                    "count": len(s),
                    "avgMs": round(sum(s) / len(s), 1),
                    "p50Ms": round(s[len(s) // 2], 1),
                    "p95Ms": round(s[min(len(s) - 1, int(len(s) * 0.95))], 1),
                    "maxMs": round(s[-1], 1),
                }
        return {"counters": dict(_counters), "timings": timings}
