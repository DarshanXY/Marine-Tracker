"""Shared helpers for the MySQL dataset browser: config, connection, SQL-file runner, bulk insert.

Config comes from the repo-root .env (MYSQL_* keys) and can be overridden per run with
--host/--port/--user/--password, so the same scripts work against any MySQL 8 server.
"""
from __future__ import annotations

import argparse
import re
import time
from pathlib import Path

import mysql.connector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DATA = ROOT / "data"
MODELS = ROOT / "python_engine" / "models"


def read_env(path: Path = ROOT / ".env") -> dict[str, str]:
    """Minimal KEY=VALUE parser (same approach as backend/src/lib/env.ts — no dotenv dependency)."""
    out: dict[str, str] = {}
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def add_connection_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--host", help="MySQL host (default: MYSQL_HOST or 127.0.0.1)")
    p.add_argument("--port", type=int, help="MySQL port (default: MYSQL_PORT or 3306)")
    p.add_argument("--user", help="MySQL user (default: MYSQL_LOADER_USER)")
    p.add_argument("--password", help="MySQL password (default: MYSQL_LOADER_PASSWORD)")


def resolve_config(args: argparse.Namespace) -> dict:
    env = read_env()
    cfg = {
        "host": args.host or env.get("MYSQL_HOST", "127.0.0.1"),
        "port": args.port or int(env.get("MYSQL_PORT", "3306")),
        "user": args.user or env.get("MYSQL_LOADER_USER", "mpt_loader"),
        "password": args.password if args.password is not None else env.get("MYSQL_LOADER_PASSWORD", ""),
        "datasets_db": env.get("MYSQL_DATASETS_DB", "mpt_datasets"),
        "app_db": env.get("MYSQL_APP_DB", "mpt_app"),
    }
    return cfg


def connect(cfg: dict, database: str | None = None):
    """Pure-Python connector, utf8mb4, FK/unique checks off for fast bulk loads."""
    cnx = mysql.connector.connect(
        host=cfg["host"],
        port=cfg["port"],
        user=cfg["user"],
        password=cfg["password"],
        database=database,
        charset="utf8mb4",
        use_pure=True,
        connection_timeout=15,
        autocommit=False,
    )
    cur = cnx.cursor()
    cur.execute("SET SESSION foreign_key_checks = 0")
    cur.execute("SET SESSION unique_checks = 0")
    cur.execute("SET SESSION sql_notes = 0")   # silence 'table does not exist' notes from DROP IF EXISTS
    cur.close()
    return cnx


def split_sql(text: str) -> list[str]:
    """Split a .sql file into statements. Contract: full-line `--` comments, and every
    statement ends with `;` at end of line (no procedures / DELIMITER blocks)."""
    text = re.sub(r"^\s*--.*$", "", text, flags=re.MULTILINE)
    return [s.strip() for s in re.split(r";[ \t]*(?:\r?\n|$)", text) if s.strip()]


def run_sql_file(cnx, path: Path) -> int:
    cur = cnx.cursor()
    stmts = split_sql(path.read_text(encoding="utf8"))
    for s in stmts:
        cur.execute(s)
    cnx.commit()
    cur.close()
    return len(stmts)


def bulk_insert(cnx, table: str, columns: list[str], rows, chunk: int = 20000) -> int:
    """Chunked executemany (the connector rewrites it into multi-row INSERTs)."""
    sql = "INSERT INTO `{}` ({}) VALUES ({})".format(
        table, ", ".join(f"`{c}`" for c in columns), ", ".join(["%s"] * len(columns))
    )
    cur = cnx.cursor()
    buf: list = []
    n = 0
    for r in rows:
        buf.append(r)
        if len(buf) >= chunk:
            cur.executemany(sql, buf)
            n += len(buf)
            buf = []
    if buf:
        cur.executemany(sql, buf)
        n += len(buf)
    cnx.commit()
    cur.close()
    return n


class Audit:
    """Collects one row per load step -> written to the `load_audit` table at the end."""

    def __init__(self) -> None:
        self.rows: list[tuple] = []

    def add(self, step: str, table: str, loaded: int, expected: int | None, note: str = "", allow_extra: int = 0) -> None:
        """allow_extra: loaded may exceed expected by up to this many rows when the difference is a
        documented, explained drop (recorded in the note) rather than an unexplained mismatch."""
        ok = expected is None or expected <= loaded <= expected + allow_extra
        if ok and expected is not None and loaded != expected:
            note = f"{loaded - expected} more than expected - {note}"
        flag = "OK " if ok else "!! "
        exp = "" if expected is None else f" (expected {expected})"
        print(f"  {flag}{table:<32} {loaded:>10,} rows{exp}  {note}")
        self.rows.append((step, table, loaded, expected, 1 if ok else 0, note[:400]))

    def flush(self, cnx) -> None:
        bulk_insert(cnx, "load_audit", ["step", "table_name", "rows_loaded", "rows_expected", "ok", "note"], self.rows)


class Timer:
    def __init__(self, label: str) -> None:
        self.label = label

    def __enter__(self):
        self.t = time.time()
        print(f"\n[{self.label}]")
        return self

    def __exit__(self, *exc):
        print(f"  ({time.time() - self.t:.1f}s)")
