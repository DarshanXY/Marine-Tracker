"""Tiny TTL cache for expensive results (e.g. AOI pipeline runs).

A real AOI scan is a multi-second satellite fetch + inference; when the UI polls
"live" every 30 s over the same box, caching the result for a short TTL avoids
re-hitting CDSE. Keyed by a caller-supplied string; LRU-evicted past `maxsize`.
Uses a monotonic counter for recency (no wall clock, no extra deps).
"""
from __future__ import annotations

import threading
import time


class TTLCache:
    def __init__(self, ttl_seconds: float = 25.0, maxsize: int = 128) -> None:
        self.ttl = ttl_seconds
        self.maxsize = maxsize
        self._store: dict[str, tuple[float, object]] = {}
        self._lock = threading.Lock()

    def get(self, key: str):
        with self._lock:
            hit = self._store.get(key)
            if hit and (time.monotonic() - hit[0]) < self.ttl:
                return hit[1]
            if hit:
                self._store.pop(key, None)
            return None

    def put(self, key: str, value) -> None:
        with self._lock:
            if len(self._store) >= self.maxsize:
                oldest = min(self._store, key=lambda k: self._store[k][0])
                self._store.pop(oldest, None)
            self._store[key] = (time.monotonic(), value)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()
