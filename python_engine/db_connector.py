"""Optional Postgres connector.

The Node backend owns persistence (Prisma + Postgres) — the engine is stateless
by design and never REQUIRES a database. This connector is an optional
convenience for the `*_storage` modules: it tries psycopg (v3) or psycopg2 if
installed and DATABASE_URL is set, and returns None otherwise, so importing or
running the engine never fails just because no DB driver is present.
"""
from __future__ import annotations

import os

from logger import get_logger

log = get_logger("db")


def database_url() -> str | None:
    return os.getenv("DATABASE_URL") or None


def get_connection():
    """Return a live DB connection, or None if unavailable (no URL / no driver)."""
    url = database_url()
    if not url:
        return None
    try:
        import psycopg  # type: ignore  # noqa: PLC0415

        return psycopg.connect(url)
    except Exception:  # noqa: BLE001 — fall through to psycopg2 / None
        pass
    try:
        import psycopg2  # type: ignore  # noqa: PLC0415

        return psycopg2.connect(url)
    except Exception as exc:  # noqa: BLE001
        log.debug("Postgres unavailable (%s) — storage modules will no-op.", type(exc).__name__)
        return None


def available() -> bool:
    conn = get_connection()
    if conn is None:
        return False
    try:
        conn.close()
    except Exception:  # noqa: BLE001
        pass
    return True
