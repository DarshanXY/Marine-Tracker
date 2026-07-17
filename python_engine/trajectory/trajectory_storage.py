"""Optional trajectory persistence.

The Node backend persists trajectories per run (linked to the anchor detection).
This is an engine-side convenience: it holds the latest run's trajectories in
memory (always) and can best-effort upsert to Postgres if a driver +
DATABASE_URL exist. Never required.
"""
from __future__ import annotations

from db_connector import get_connection
from logger import get_logger

log = get_logger("trajectory")

_LATEST: list[dict] = []


def remember(trajectories: list[dict]) -> None:
    global _LATEST
    _LATEST = list(trajectories)


def latest() -> list[dict]:
    return list(_LATEST)


def persist(trajectories: list[dict]) -> int:
    """Best-effort DB write. Returns rows written (0 if no DB)."""
    conn = get_connection()
    if conn is None:
        return 0
    written = 0
    try:  # pragma: no cover — needs a live DB + driver
        import json

        with conn.cursor() as cur:
            for tr in trajectories:
                cur.execute(
                    'INSERT INTO "Trajectory" ("pathData", "horizonHours", "dataSource") '
                    "VALUES (%s,%s,%s) ON CONFLICT DO NOTHING",
                    (json.dumps({"points": tr.get("points"), "cone": tr.get("cone")}),
                     tr.get("horizon_hours"), tr.get("data_source")),
                )
                written += 1
        conn.commit()
    except Exception as exc:  # noqa: BLE001
        log.debug("trajectory persist skipped: %s", exc)
    finally:
        try:
            conn.close()
        except Exception:  # noqa: BLE001
            pass
    return written
