#!/usr/bin/env python3
"""Verify every theme's fallback palette passes WCAG AA as text.

Every file in references/themes/ promises: "Every role above is verified at or
above 4.5:1 on `ground` by scripts/check-themes.py." This is that check.

build-themes.py checks the fourteen themes it generates, but nine art-directed
themes are hand-written and were checked by nothing. This reads the palette
table out of each theme file, so it covers all of them however they were made.

Checked at 4.5:1, as text:
  ink, soft, accent, cat-1, cat-2, cat-3  on ground
  ink, soft                               on surface
`rule` is a hairline, never text, so it is not checked here.

  python3 scripts/check-themes.py        # exit 1 on any failure
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "skills/cklph-diagram/scripts"))
from colorlib import contrast_ratio  # noqa: E402

THEME_DIR = ROOT / "skills/cklph-diagram/references/themes"
ON_GROUND = ("ink", "soft", "accent", "cat-1", "cat-2", "cat-3")
ON_SURFACE = ("ink", "soft")
AA = 4.5

ROW = re.compile(r"^\|\s*`([a-z0-9-]+)`\s*\|\s*`(#[0-9a-fA-F]{3,8})`\s*\|\s*$")


def palette(text: str) -> dict[str, str]:
    """The `| role | #hex |` rows under the "Fallback palette" heading."""
    _, _, rest = text.partition("## Fallback palette")
    out: dict[str, str] = {}
    for line in rest.splitlines():
        if line.startswith("## "):
            break
        m = ROW.match(line.strip())
        if m:
            out[m.group(1)] = m.group(2)
    return out


def main() -> int:
    files = sorted(THEME_DIR.glob("*.md"))
    if not files:
        print(f"FAIL no theme files in {THEME_DIR}")
        return 1
    fails = 0
    for f in files:
        p = palette(f.read_text(encoding="utf-8"))
        missing = [r for r in ("ground", "surface", *ON_GROUND) if r not in p]
        if missing:
            print(f"FAIL {f.stem:<24} palette missing {', '.join(missing)}")
            fails += 1
            continue
        bad = [f"{r} {contrast_ratio(p[r], p['ground']):.2f}" for r in ON_GROUND
               if contrast_ratio(p[r], p["ground"]) < AA]
        bad += [f"{r}/surface {contrast_ratio(p[r], p['surface']):.2f}" for r in ON_SURFACE
                if contrast_ratio(p[r], p["surface"]) < AA]
        if bad:
            print(f"FAIL {f.stem:<24} {'; '.join(bad)}")
            fails += 1
        else:
            print(f"ok   {f.stem}")
    print(f"\n{len(files)} theme(s) checked, {fails} failing.")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
