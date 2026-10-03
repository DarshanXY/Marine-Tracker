#!/usr/bin/env python
"""Snapshot the live app database (PostgreSQL `marine_plastic`) into MySQL  ->  database `mpt_app`.

    python sync_app.py             # full rebuild of the snapshot
    python sync_app.py --dry-run   # read + convert everything, write nothing

Tables, columns, primary / unique / foreign keys and indexes are introspected from
PostgreSQL, so this keeps working when the Prisma schema changes. Rows are streamed with
`psql` (no Postgres driver needed). It is a point-in-time COPY: re-run it to refresh.

Never copied (credential material): the tables refresh_tokens and api_keys, and any column
whose name contains password / secret / hash / api_key / backup_codes (e.g. users.password_hash,
users.totp_secret). The report at the end lists exactly what was left out.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from urllib.parse import unquote, urlparse

from _common import HERE, ROOT, Timer, add_connection_args, bulk_insert, connect, read_env, resolve_config, run_sql_file

SKIP_TABLES = {"refresh_tokens", "api_keys"}
SECRET_COL = re.compile(r"(password|secret|hash|api_?key|backup_?codes)", re.I)


# ─── PostgreSQL access via psql ───────────────────────────────────────────────
def pg_conn() -> dict:
    url = read_env().get("DATABASE_URL", "")
    u = urlparse(url)
    if u.scheme not in ("postgresql", "postgres"):
        sys.exit("DATABASE_URL in .env is not a postgresql:// URL")
    return {"host": u.hostname or "localhost", "port": str(u.port or 5432), "user": unquote(u.username or ""),
            "password": unquote(u.password or ""), "db": (u.path or "/").lstrip("/")}


def psql_cmd(pg: dict, sql: str) -> list[str]:
    exe = ROOT / "infra" / "pgsql" / "bin" / "psql.exe"
    return [str(exe) if exe.exists() else "psql", "-X", "-At", "-h", pg["host"], "-p", pg["port"], "-U", pg["user"],
            "-d", pg["db"], "-c", sql]


def psql_env(pg: dict) -> dict:
    return {**os.environ, "PGPASSWORD": pg["password"], "PGCLIENTENCODING": "UTF8", "PGTZ": "UTC"}


def pg_json(pg: dict, sql: str):
    """Run a query that returns ONE json value."""
    r = subprocess.run(psql_cmd(pg, sql), env=psql_env(pg), capture_output=True, text=True, encoding="utf8")
    if r.returncode != 0:
        sys.exit(f"psql failed: {r.stderr.strip()}")
    return json.loads(r.stdout.strip() or "null")


def pg_stream(pg: dict, table: str):
    """Yield one dict per row (row_to_json, one JSON document per output line)."""
    p = subprocess.Popen(psql_cmd(pg, f'select row_to_json(t) from "{table}" t'), env=psql_env(pg),
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf8")
    for line in p.stdout:
        line = line.strip()
        if line:
            yield json.loads(line)
    err = p.stderr.read()
    if p.wait() != 0:
        raise RuntimeError(f"psql failed on {table}: {err.strip()}")


# ─── type mapping ─────────────────────────────────────────────────────────────
def mysql_type(col: dict, keyed: bool) -> tuple[str, str]:
    """-> (MySQL column type, python converter key)."""
    dt, udt = col["data_type"], col["udt_name"]
    if dt == "text":
        return ("VARCHAR(191)", "str") if keyed else ("TEXT", "str")
    if dt == "character varying":
        n = col["character_maximum_length"] or 255
        return (f"VARCHAR({min(n, 4000)})" if n <= 4000 else "TEXT", "str")
    if dt == "character":
        return (f"CHAR({col['character_maximum_length'] or 1})", "str")
    if dt == "uuid":
        return "CHAR(36)", "str"
    if dt == "integer":
        return "INT", "num"
    if dt == "smallint":
        return "SMALLINT", "num"
    if dt == "bigint":
        return "BIGINT", "num"
    if dt == "boolean":
        return "TINYINT(1)", "bool"
    if dt == "double precision":
        return "DOUBLE", "num"
    if dt == "real":
        return "FLOAT", "num"
    if dt == "numeric":
        p, s = col["numeric_precision"], col["numeric_scale"]
        return (f"DECIMAL({min(p, 65)},{min(s or 0, 30)})" if p else "DECIMAL(24,8)"), "num"
    if dt.startswith("timestamp"):
        return "DATETIME(3)", "ts"
    if dt == "date":
        return "DATE", "str"
    if dt in ("json", "jsonb", "ARRAY"):
        return "JSON", "json"
    if dt == "USER-DEFINED":
        return "VARCHAR(48)", "str"      # Postgres enum
    return "TEXT", "str"


def convert(kind: str, v):
    if v is None:
        return None
    if kind == "bool":
        return 1 if v else 0
    if kind == "json":
        return json.dumps(v)
    if kind == "ts":
        s = str(v).replace("T", " ")
        try:
            d = datetime.fromisoformat(str(v))
            if d.tzinfo:
                d = d.astimezone(timezone.utc).replace(tzinfo=None)
            return d.strftime("%Y-%m-%d %H:%M:%S.") + f"{d.microsecond // 1000:03d}"
        except ValueError:
            return s
    return v


# ─── main ─────────────────────────────────────────────────────────────────────
INTROSPECT_COLUMNS = """select coalesce(json_agg(t), '[]'::json) from (
  select table_name, column_name, ordinal_position, data_type, udt_name, is_nullable,
         character_maximum_length, numeric_precision, numeric_scale
  from information_schema.columns
  where table_schema = 'public' and table_name in (select tablename from pg_tables where schemaname = 'public')
  order by table_name, ordinal_position) t"""

INTROSPECT_INDEXES = """select coalesce(json_agg(t), '[]'::json) from (
  select cl.relname as tbl, ic.relname as idx, i.indisunique as uniq, i.indisprimary as prim,
    (select json_agg(a.attname order by k.ord)
       from unnest(i.indkey::int2[]) with ordinality k(attnum, ord)
       join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum where k.attnum > 0) as cols
  from pg_index i
  join pg_class cl on cl.oid = i.indrelid join pg_class ic on ic.oid = i.indexrelid
  join pg_namespace n on n.oid = cl.relnamespace
  where n.nspname = 'public' and i.indexprs is null and i.indpred is null) t"""

INTROSPECT_FKS = """select coalesce(json_agg(t), '[]'::json) from (
  select c.conname, cl.relname as tbl, fcl.relname as ftbl, c.confdeltype as del,
    (select json_agg(a.attname order by k.ord) from unnest(c.conkey) with ordinality k(attnum, ord)
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as cols,
    (select json_agg(a.attname order by k.ord) from unnest(c.confkey) with ordinality k(attnum, ord)
       join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum) as fcols
  from pg_constraint c
  join pg_class cl on cl.oid = c.conrelid join pg_class fcl on fcl.oid = c.confrelid
  join pg_namespace n on n.oid = cl.relnamespace
  where n.nspname = 'public' and c.contype = 'f') t"""

FK_ACTION = {"a": "NO ACTION", "r": "RESTRICT", "c": "CASCADE", "n": "SET NULL", "d": "SET NULL"}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    add_connection_args(ap)
    ap.add_argument("--dry-run", action="store_true", help="read + convert everything, write nothing")
    args = ap.parse_args()
    cfg = resolve_config(args)
    pg = pg_conn()
    print(f"Source: postgresql://{pg['user']}@{pg['host']}:{pg['port']}/{pg['db']}")

    with Timer("introspect PostgreSQL"):
        cols = pg_json(pg, INTROSPECT_COLUMNS)
        idxs = pg_json(pg, INTROSPECT_INDEXES)
        fks = pg_json(pg, INTROSPECT_FKS)
    tables: dict[str, list[dict]] = {}
    for c in cols:
        tables.setdefault(c["table_name"], []).append(c)
    is_skipped = lambda t: t in SKIP_TABLES or t.startswith("_prisma")   # credential tables + Prisma's own bookkeeping
    skipped = sorted(t for t in tables if is_skipped(t))
    tables = {t: cs for t, cs in tables.items() if not is_skipped(t)}
    fks = [f for f in fks if f["tbl"] in tables and f["ftbl"] in tables]
    idxs = [i for i in idxs if i["tbl"] in tables and i["cols"]]
    print(f"  {len(tables)} tables; skipped credential tables: {', '.join(skipped) or 'none'}")

    keyed: dict[str, set[str]] = {t: set() for t in tables}
    for i in idxs:
        keyed[i["tbl"]].update(i["cols"])
    for f in fks:
        keyed[f["tbl"]].update(f["cols"])
        keyed[f["ftbl"]].update(f["fcols"])

    dropped_cols: list[str] = []
    ddl: dict[str, str] = {}
    layout: dict[str, list[tuple[str, str]]] = {}      # table -> [(column, converter kind)]
    for t, cs in tables.items():
        lines, lay = [], []
        for c in cs:
            if SECRET_COL.search(c["column_name"]):
                dropped_cols.append(f"{t}.{c['column_name']}")
                continue
            typ, kind = mysql_type(c, c["column_name"] in keyed[t])
            lines.append(f"  `{c['column_name']}` {typ} {'NULL' if c['is_nullable'] == 'YES' else 'NOT NULL'}")
            lay.append((c["column_name"], kind))
        kept = {name for name, _ in lay}
        for i in idxs:
            if i["tbl"] != t or not set(i["cols"]) <= kept:
                continue
            cl = ", ".join(f"`{x}`" for x in i["cols"])
            if i["prim"]:
                lines.append(f"  PRIMARY KEY ({cl})")
            elif i["uniq"]:
                lines.append(f"  UNIQUE KEY `{i['idx'][:60]}` ({cl})")
            else:
                lines.append(f"  KEY `{i['idx'][:60]}` ({cl})")
        for f in fks:
            if f["tbl"] == t and set(f["cols"]) <= kept:
                lines.append("  CONSTRAINT `{}` FOREIGN KEY ({}) REFERENCES `{}` ({}) ON DELETE {}".format(
                    f["conname"][:60], ", ".join(f"`{x}`" for x in f["cols"]), f["ftbl"],
                    ", ".join(f"`{x}`" for x in f["fcols"]), FK_ACTION.get(f["del"], "NO ACTION")))
        ddl[t] = f"CREATE TABLE `{t}` (\n" + ",\n".join(lines) + "\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        layout[t] = lay

    if args.dry_run:
        for t in sorted(tables):
            n = sum(1 for _ in pg_stream(pg, t))
            print(f"  [dry] {t:<22} {n:>8,} rows  {len(layout[t])} cols")
        print("Left out:", ", ".join(dropped_cols) or "nothing")
        return 0

    print(f"Connecting to {cfg['user']}@{cfg['host']}:{cfg['port']} -> {cfg['app_db']}")
    cnx = connect(cfg, cfg["app_db"])
    cur = cnx.cursor()
    with Timer("create tables"):
        for t in sorted(tables):
            cur.execute(f"DROP TABLE IF EXISTS `{t}`")
        cur.execute("DROP TABLE IF EXISTS `sync_audit`")
        for t in sorted(tables):
            cur.execute(ddl[t])
        cur.execute("""CREATE TABLE `sync_audit` (
          `table_name` VARCHAR(64) NOT NULL PRIMARY KEY, `pg_rows` BIGINT NOT NULL, `mysql_rows` BIGINT NOT NULL,
          `ok` TINYINT(1) NOT NULL, `synced_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB COMMENT='Row counts: PostgreSQL vs this snapshot, per table'""")
        cnx.commit()

    audit_rows = []
    with Timer("copy rows"):
        for t in sorted(tables):
            lay = layout[t]
            names = [n for n, _ in lay]
            r = subprocess.run(psql_cmd(pg, f'select count(*) from "{t}"'), env=psql_env(pg), capture_output=True, text=True)
            pg_n = int(r.stdout.strip() or 0)

            def gen(t=t, lay=lay):
                for row in pg_stream(pg, t):
                    yield tuple(convert(k, row.get(n)) for n, k in lay)

            n = bulk_insert(cnx, t, names, gen(), chunk=5000) if names else 0
            cur.execute(f"SELECT COUNT(*) FROM `{t}`")
            my_n = cur.fetchone()[0]
            ok = 1 if (my_n == pg_n) else 0
            flag = "OK " if ok else "!! "
            print(f"  {flag}{t:<22} pg {pg_n:>8,}   mysql {my_n:>8,}")
            audit_rows.append((t, pg_n, my_n, ok))
        bulk_insert(cnx, "sync_audit", ["table_name", "pg_rows", "mysql_rows", "ok"], audit_rows)

    with Timer("views"):
        # one statement at a time so a view over a since-renamed table only warns
        from _common import split_sql
        for s in split_sql((HERE / "views_app.sql").read_text(encoding="utf8")):
            try:
                cur.execute(s)
            except Exception as e:   # noqa: BLE001
                print(f"  ! skipped: {s.splitlines()[0][:60]} ... ({e})")
        cnx.commit()
    cnx.close()
    print("\nLeft out (credential material):", ", ".join(skipped + dropped_cols) or "nothing")
    bad = [a for a in audit_rows if not a[3]]
    print(f"Done. {len(audit_rows)} tables, {len(bad)} count difference(s)" + (" (the live app may have written rows during the copy)" if bad else "."))
    return 0


if __name__ == "__main__":
    sys.exit(main())
