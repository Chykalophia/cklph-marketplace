#!/usr/bin/env python3
"""Assert that a standalone SVG export keeps the brand it was rendered in.

For each brand-rendered HTML file, run the packaged ``export_svg.py`` and check
the *result*, not the code path:

  * every ``var(--x)`` the exported SVG uses is defined inside it, so no colour
    or font silently falls back to the viewer's defaults; and
  * the ``@import`` it carries is the source page's own Google Fonts URL, so a
    client diagram does not leave its HTML wrapper in the house typefaces.

    python3 scripts/verify-export.py out/*-cklph-light.html
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

SKILL_SCRIPTS = Path(__file__).resolve().parent.parent / "skills/cklph-diagram/scripts"
sys.path.insert(0, str(SKILL_SCRIPTS))

import importlib.util  # noqa: E402

_spec = importlib.util.spec_from_file_location("export_svg", SKILL_SCRIPTS / "export_svg.py")
export_svg = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(export_svg)

FONT_LINK_RE = re.compile(r'<link\b[^>]*rel="stylesheet"[^>]*href="(https://fonts\.googleapis\.com/[^"]+)"')


def check(path: Path) -> list[str]:
    html = path.read_text(encoding="utf-8")
    svg = export_svg.export_svg_document(html, path)
    problems = []

    used = set(re.findall(r"var\(\s*(--[\w-]+)", svg))
    defined = set(re.findall(r"(--[\w-]+)\s*:", svg))
    for name in sorted(used - defined):
        problems.append(f"uses {name} but the export never defines it")

    link = FONT_LINK_RE.search(html)
    imported = re.search(r"@import url\('([^']+)'\)", svg)
    if link and not imported:
        problems.append("source has a font stylesheet but the export imports none")
    elif link and imported:
        want = link.group(1).replace("&amp;", "&")
        got = imported.group(1).replace("&amp;", "&")
        if want != got:
            problems.append(f"export imports {got[:70]}… not the source's {want[:70]}…")
    return problems


def main(argv: list[str]) -> int:
    if not argv:
        print("usage: verify-export.py <brand-rendered.html> ...", file=sys.stderr)
        return 2
    failed = 0
    for arg in argv:
        path = Path(arg)
        problems = check(path)
        if problems:
            failed += 1
            print(f"FAIL {path}")
            for p in problems:
                print(f"  - {p}")
        else:
            print(f"ok   {path}")
    print(f"\n{len(argv)} file(s), {failed} failing")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
