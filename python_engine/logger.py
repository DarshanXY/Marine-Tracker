"""Central logging for the engine.

`get_logger(name)` returns a namespaced logger under `marine_engine`, configured
once with a concise stdout format. Level from LOG_LEVEL (default INFO). Kept tiny
and dependency-free — the engine's philosophy is stdlib-only for core paths.
"""
from __future__ import annotations

import logging
import os
import sys

_CONFIGURED = False
_ROOT = "marine_engine"


def _configure() -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s", "%H:%M:%S")
    )
    root = logging.getLogger(_ROOT)
    root.setLevel(os.getenv("LOG_LEVEL", "INFO").upper())
    root.handlers[:] = [handler]
    root.propagate = False
    _CONFIGURED = True


def get_logger(name: str = "") -> logging.Logger:
    _configure()
    return logging.getLogger(f"{_ROOT}.{name}" if name else _ROOT)
