"""Optional hotspot persistence.

The Node backend (Prisma + Postgres) is the SYSTEM OF RECORD — it persists every
run's hotspots via /api/pipeline/run. This module is an optional, engine-side
convenience: it keeps the most recent run's hotspots in memory (always) and, if a
Postgres connection is available, can upsert them too. Never required; importing
or running the engine works with no database.
"""
from __future__ import annotations

from db_connector import get_connection
from logger import get_logger

log = get_logger("hotspot")

# In-memory ring of the latest hotspots (engine-local, best-effort).
_LATEST: list[dict] = []


def remember(hotspots: list[dict]) -> None:
    """Replace the in-memory latest-hotspots snapshot."""
    global _LATEST
    _LATEST = list(hotspots)


def latest() -> list[dict]:
    return list(_LATEST)


def persist(hotspots: list[dict]) -> int:
    """Best-effort DB upsert. Returns rows written (0 if no DB). Node backend is
    the primary writer, so this is a no-op unless a driver + DATABASE_URL exist."""
    conn = get_connection()
    if conn is None:
        return 0
    written = 0
    try:  # pragma: no cover — exercised only with a live DB + driver
        with conn.cursor() as cur:
            for h in hotspots:
                cur.execute(
                    'INSERT INTO "Hotspot" (label, "centroidLat", "centroidLon", '
                    '"detectionCount", severity, confidence, "etaHours") '
                    "VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                    (h.get("label"), h.get("centroid_lat"), h.get("centroid_lon"),
                     h.get("detection_count"), h.get("severity"), h.get("confidence"),
                     h.get("eta_hours")),
                )
                written += 1
        conn.commit()
    except Exception as exc:  # noqa: BLE001
        log.debug("hotspot persist skipped: %s", exc)
    finally:
        try:
            conn.close()
        except Exception:  # noqa: BLE001
            pass
    return written
