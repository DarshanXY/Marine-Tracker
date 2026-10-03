#!/usr/bin/env python
"""Build docs/CODE_TOUR.md and docs/CODE_TOUR.html from CODE_TOUR.src.md.

Why a generator: the tour is full of "file:line" links. Typing line numbers by hand goes stale
the moment someone edits a file. Instead the source document uses ANCHORS:

    [[frontend/src/pages/MapExplorer.tsx :: function StageTimeline]]
    [[python_engine/config.py :: fdi_threshold => the FDI threshold]]

`path :: regex` = first line of `path` matching the regex. The builder looks the line up in the REAL
file, so links are always exact, and it STOPS WITH AN ERROR if an anchor no longer matches (the
function was renamed or deleted) - run it before the viva to prove every link still lands.

Outputs
  docs/CODE_TOUR.md    relative links  - open in VS Code, Ctrl+Shift+V, Ctrl+click
  docs/CODE_TOUR.html  vscode:// links - open in any browser, click -> VS Code opens at that line

    python docs/code-tour/build_code_tour.py            # rebuild both
    python docs/code-tour/build_code_tour.py --check    # only verify every anchor still resolves
"""
from __future__ import annotations

import argparse
import html
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

HERE = Path(__file__).resolve().parent
DOCS = HERE.parent
ROOT = DOCS.parent
SRC = HERE / "CODE_TOUR.src.md"

# [[ path :: regex => label ]]   ( "::" and "=> label" are optional )
ANCHOR = re.compile(r"\[\[\s*(?P<path>[^\]:=]+?)\s*(?:::\s*(?P<rx>.+?))?\s*(?:=>\s*(?P<label>.+?))?\s*\]\]")

_lines_cache: dict[Path, list[str]] = {}


def file_lines(p: Path) -> list[str]:
    if p not in _lines_cache:
        _lines_cache[p] = p.read_text(encoding="utf8", errors="replace").splitlines()
    return _lines_cache[p]


def resolve(path: str, rx: str | None) -> tuple[int | None, str | None]:
    """-> (line number, error). Line 1 when no regex is given."""
    f = ROOT / path
    if not f.exists():
        return None, f"file not found: {path}"
    if not rx:
        return 1, None
    pat = re.compile(rx)
    for i, line in enumerate(file_lines(f), start=1):
        if pat.search(line):
            return i, None
    return None, f"no line in {path} matches /{rx}/"


def build(mode: str, text: str, errors: list[str], report: list[tuple[str, int]]) -> str:
    """Replace every anchor. mode = 'md' (relative link) or 'html' (vscode:// link)."""

    def sub(m: re.Match) -> str:
        path, rx, label = m.group("path"), m.group("rx"), m.group("label")
        line, err = resolve(path, rx)
        if err:
            if mode == "md":
                errors.append(f"{err}   (anchor: {m.group(0)})")
            return f"**[BROKEN LINK: {path}]**"
        if mode == "md":
            report.append((path, line))
        shown = label if label else f"`{Path(path).name}:{line}`"
        if mode == "md":
            rel = os.path.relpath(ROOT / path, DOCS).replace("\\", "/")
            return f"[{shown}]({quote(rel)}#L{line})"
        absolute = quote(str((ROOT / path).resolve()).replace("\\", "/"), safe="/:")
        return f'[{shown}](vscode://file/{absolute}:{line} "{path}:{line}")'

    return ANCHOR.sub(sub, text)


def slug(heading: str) -> str:
    s = re.sub(r"[^\w\- ]", "", heading.lower().strip())
    return re.sub(r"\s", "-", s)


def make_toc(md_text: str) -> str:
    out = []
    for line in md_text.splitlines():
        m = re.match(r"^(#{2,3})\s+(.*)$", line)
        if m:
            depth = len(m.group(1)) - 2
            title = re.sub(r"[`*]", "", m.group(2))
            out.append(f"{'  ' * depth}- [{title}](#{slug(m.group(2))})")
    return "\n".join(out)


HTML_TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Marine Plastic Tracker - Code Tour</title>
<style>
:root { color-scheme: light; --page:#F6FEFC; --surface:#fff; --border:#D6EDE9; --ink:#0F172A; --ink2:#475569;
        --muted:#64748B; --accent:#0D9488; --wash:#F0FDFA; --code:#F1F5F9; }
* { box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: 16px; }
body { margin:0; background:var(--page); color:var(--ink); font:15px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif; }
.layout { display:grid; grid-template-columns: 290px minmax(0,1fr); gap:28px; max-width:1320px; margin:0 auto; padding:24px 20px 80px; }
nav.toc { position:sticky; top:16px; align-self:start; max-height:calc(100vh - 32px); overflow:auto; background:var(--surface);
          border:1px solid var(--border); border-radius:12px; padding:14px 16px; font-size:13px; }
nav.toc .t { font-weight:650; margin:0 0 8px; }
nav.toc ul { list-style:none; margin:0; padding:0; } nav.toc ul ul { padding-left:12px; }
nav.toc a { color:var(--ink2); text-decoration:none; display:block; padding:2px 0; }
nav.toc a:hover { color:var(--accent); }
main { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:8px 34px 34px; min-width:0; }
h1 { font-size:30px; line-height:1.2; margin:26px 0 6px; letter-spacing:-0.01em; }
h2 { font-size:22px; margin:44px 0 10px; padding-top:14px; border-top:2px solid var(--border); }
h3 { font-size:17px; margin:28px 0 6px; }
p, li { color:var(--ink); } li { margin:3px 0; }
a { color:#0F766E; } a:hover { color:var(--accent); }
a[href^="vscode://"] { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size:.9em; background:var(--wash);
                       border:1px solid var(--border); border-radius:5px; padding:0 5px; text-decoration:none; white-space:nowrap; }
a[href^="vscode://"] code { background:none; padding:0; border:0; }
code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size:.9em; background:var(--code); border-radius:4px; padding:1px 5px; }
pre { background:var(--code); border:1px solid var(--border); border-radius:10px; padding:14px 16px; overflow:auto; line-height:1.45; }
pre code { background:none; padding:0; }
table { border-collapse:collapse; width:100%; margin:12px 0; font-size:14px; display:block; overflow-x:auto; }
th, td { border:1px solid var(--border); padding:7px 10px; text-align:left; vertical-align:top; }
th { background:var(--wash); font-weight:650; }
blockquote { margin:14px 0; padding:10px 16px; border-left:4px solid var(--accent); background:var(--wash); border-radius:0 8px 8px 0; }
blockquote p { margin:4px 0; }
.meta { color:var(--muted); font-size:12px; }
@media (max-width: 980px) { .layout { grid-template-columns: 1fr; } nav.toc { position:static; max-height:none; } main { padding:6px 18px 24px; } }
@media print { nav.toc { display:none; } .layout { display:block; padding:0; } main { border:0; padding:0; } a[href^="vscode://"] { border:0; background:none; } }
</style>
</head>
<body>
<div class="layout">
<nav class="toc" aria-label="Contents"><p class="t">Contents</p>__TOC__<p class="meta">Built __BUILT__<br>Click any <code>file:line</code> link to open it in VS Code.</p></nav>
<main>
__BODY__
</main>
</div>
</body>
</html>
"""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="only verify that every anchor still resolves")
    args = ap.parse_args()

    text = SRC.read_text(encoding="utf8")
    errors: list[str] = []
    report: list[tuple[str, int]] = []
    md = build("md", text, errors, report)
    if errors:
        print(f"\n{len(errors)} BROKEN ANCHOR(S) - code was renamed or removed. Fix CODE_TOUR.src.md:\n")
        for e in errors:
            print("  x", e)
        return 1
    print(f"OK: all {len(report)} anchors resolve to real lines in {len({p for p, _ in report})} files.")
    if args.check:
        return 0

    built = datetime.now().strftime("%Y-%m-%d %H:%M")
    md = md.replace("<!--TOC-->", make_toc(md))
    (DOCS / "CODE_TOUR.md").write_text(md, encoding="utf8")

    try:
        import markdown
    except ImportError:
        print("  (python 'markdown' package missing -> skipped CODE_TOUR.html; pip install markdown)")
        print("Wrote docs/CODE_TOUR.md")
        return 0
    body_md = build("html", text, [], [])
    body_md = body_md.replace("<!--TOC-->", "")
    conv = markdown.Markdown(extensions=["tables", "fenced_code", "toc", "sane_lists"],
                             extension_configs={"toc": {"toc_depth": "2-3"}})
    body = conv.convert(body_md)
    page = (HTML_TEMPLATE.replace("__TOC__", conv.toc).replace("__BODY__", body)
            .replace("__BUILT__", built))
    (DOCS / "CODE_TOUR.html").write_text(page, encoding="utf8")
    print("Wrote docs/CODE_TOUR.md and docs/CODE_TOUR.html")
    return 0


if __name__ == "__main__":
    sys.exit(main())
