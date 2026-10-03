#!/usr/bin/env python
"""Build dashboard.html - charts + tables drawn from the MySQL views.

    python build_dashboard.py                 # reads mpt_datasets (and mpt_app if present)
    python build_dashboard.py --out my.html

The output is ONE self-contained file (data embedded, no server, no internet needed): double-click it.
Re-run after reloading the data.
"""
from __future__ import annotations

import argparse
import json
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

from _common import HERE, add_connection_args, connect, resolve_config


def jsonable(v):
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, (bytes, bytearray)):
        return None
    return v


def rows(cur, sql: str) -> list[dict]:
    try:
        cur.execute(sql)
    except Exception as e:  # noqa: BLE001  (a missing view just means an empty chart)
        print(f"  ! {sql[:70]} ... {e}")
        return []
    cols = [d[0] for d in cur.description]
    return [{c: jsonable(v) for c, v in zip(cols, r)} for r in cur.fetchall()]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    add_connection_args(ap)
    ap.add_argument("--out", default=str(HERE / "dashboard.html"))
    args = ap.parse_args()
    cfg = resolve_config(args)

    cnx = connect(cfg, cfg["datasets_db"])
    cur = cnx.cursor()
    data = {
        "overview": rows(cur, "SELECT * FROM v_dataset_overview"),
        "inventory": rows(cur, "SELECT * FROM v_table_inventory"),
        "classBalance": rows(cur, "SELECT * FROM v_class_balance"),
        "pixelsByDs": rows(cur, "SELECT dataset_id, split, class_name, pixels FROM v_pixels_by_dataset_class"),
        "spectral": rows(cur, "SELECT * FROM v_spectral_signature"),
        "maridaClasses": rows(cur, "SELECT * FROM v_marida_class_distribution ORDER BY labelled_pixels DESC"),
        "madosClasses": rows(cur, "SELECT * FROM v_mados_class_distribution ORDER BY labelled_pixels DESC"),
        "maridaSplits": rows(cur, "SELECT * FROM v_marida_split_summary ORDER BY FIELD(split,'train','val','test','unassigned')"),
        "madosSplits": rows(cur, "SELECT * FROM v_mados_split_summary ORDER BY FIELD(split,'train','val','test','unassigned')"),
        "maridaScenes": rows(cur, "SELECT * FROM v_marida_scene_overview ORDER BY debris_pixels DESC LIMIT 12"),
        "rfo": rows(cur, "SELECT * FROM v_rfo_site_summary"),
        "plp": rows(cur, "SELECT * FROM v_plp_targets_by_material ORDER BY campaign_year, material"),
        "models": rows(cur, "SELECT * FROM v_model_comparison ORDER BY FIELD(run_key,'per_pixel','patch_cnn','clay_head')"),
        "classScores": rows(cur, "SELECT * FROM v_model_class_scores"),
        "confusion": rows(cur, "SELECT * FROM v_confusion_matrix"),
        "audit": rows(cur, "SELECT step, table_name, rows_loaded, rows_expected, ok, note FROM load_audit ORDER BY audit_id"),
    }
    audit = data["audit"]
    meta = {
        "generated": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "host": cfg["host"], "port": cfg["port"],
        "datasets_db": cfg["datasets_db"], "app_db": cfg["app_db"],
        "audit": {"total": len(audit), "ok": sum(1 for a in audit if a["ok"])},
        "has_app": False,
    }
    try:
        cur.execute(f"USE `{cfg['app_db']}`")
        cur.execute("SELECT COUNT(*) FROM detections")
        cur.fetchall()                      # drain the result before issuing more queries
        meta["has_app"] = True
        data["app"] = {
            "byClass": rows(cur, "SELECT * FROM v_detections_by_class"),
            "perDay": rows(cur, "SELECT * FROM v_detections_per_day ORDER BY day"),
            "hotspots": rows(cur, "SELECT * FROM v_hotspots_by_severity"),
            "inventory": rows(cur, "SELECT * FROM v_app_table_inventory"),
        }
    except Exception as e:  # noqa: BLE001
        print(f"  (no mpt_app snapshot - skipping the app section: {e})")
    data["meta"] = meta
    cnx.close()

    payload = json.dumps(data, ensure_ascii=False).replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    html = (HERE / "dashboard_template.html").read_text(encoding="utf8").replace("/*__DATA__*/null", payload)
    out = Path(args.out)
    out.write_text(html, encoding="utf8")
    print(f"Wrote {out}  ({out.stat().st_size / 1024:.0f} KB)  - open it in a browser.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
