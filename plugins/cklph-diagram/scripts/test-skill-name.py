#!/usr/bin/env python3
"""Outcome tests for the skill's name.

In the plugin the skill is cklph-diagram:diagram, so SKILL.md says
`name: diagram` (skill names do not repeat the plugin namespace). A loose
install and a claude.ai bundle have no namespace, so install.sh writes the
full name, `cklph-diagram`, into the copy it makes. That copy then replaces
the skill already installed or uploaded under that name.

    python3 scripts/test-skill-name.py
"""

from __future__ import annotations

import os
import shutil
import re
import subprocess
import tempfile
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
PRE_RENAME = "045b4af"  # main before 3.7.0, when the skill lived in skills/cklph-diagram/
failures: list[str] = []


def case(name: str, ok: bool, detail: str = "") -> None:
    if ok:
        print(f"ok   {name}")
    else:
        failures.append(f"{name}\n    {detail.strip()[:400]}")


def fm_name(text: str) -> str | None:
    m = re.match(r"---\n(.*?)\n---\n", text, re.S)
    if not m:
        return None
    n = re.search(r"^name:\s*(\S+)\s*$", m.group(1), re.M)
    return n.group(1) if n else None


def main() -> int:
    plugin_skill = REPO / "skills/diagram/SKILL.md"
    case("the plugin's skill lives in skills/diagram/", plugin_skill.is_file())
    if plugin_skill.is_file():
        text = plugin_skill.read_text(encoding="utf-8")
        case("SKILL.md says name: diagram, so the plugin skill is cklph-diagram:diagram",
             fm_name(text) == "diagram", f"name is {fm_name(text)!r}")

    env = {k: v for k, v in os.environ.items()
           if k not in {"CKLPH_DIAGRAM_BRANDS", "XDG_CONFIG_HOME", "CKLPH_FONTS_DIR"}}
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    with tempfile.TemporaryDirectory() as d:
        home = Path(d) / "home"
        home.mkdir()
        env["HOME"] = str(home)
        r = subprocess.run(["bash", str(REPO / "install.sh"), "--dir", str(Path(d) / "skills")],
                           capture_output=True, text=True, env=env, cwd=REPO)
        installed = Path(d) / "skills/cklph-diagram/SKILL.md"
        case("a loose install lands in skills/cklph-diagram/", r.returncode == 0 and installed.is_file(),
             r.stdout + r.stderr)
        if installed.is_file():
            text = installed.read_text(encoding="utf-8")
            case("a loose install is named cklph-diagram", fm_name(text) == "cklph-diagram",
                 f"name is {fm_name(text)!r}")
            body = text.split("\n---\n", 1)[1]
            src = plugin_skill.read_text(encoding="utf-8") if plugin_skill.is_file() else ""
            case("only the frontmatter name changes", "\n---\n" in src and body == src.split("\n---\n", 1)[1])

        # A copy installed before the move from skills/cklph-diagram/ holds an
        # older committed cklph.md. A reinstall must treat it as out of date,
        # not as a local edit. Needs git history (CI checks out one commit).
        old = subprocess.run(["git", "show", f"{PRE_RENAME}:skills/cklph-diagram/references/brands/cklph.md"],
                             capture_output=True, cwd=REPO)
        target = Path(d) / "skills/cklph-diagram/references/brands/cklph.md"
        if old.returncode != 0 or not target.is_file():
            print(f"skip a copy installed before the rename updates cleanly (no {PRE_RENAME} in this checkout)")
        else:
            target.write_bytes(old.stdout)
            r = subprocess.run(["bash", str(REPO / "install.sh"), "--dir", str(Path(d) / "skills")],
                               capture_output=True, text=True, env=env, cwd=REPO)
            case("a copy installed before the rename updates cleanly",
                 r.returncode == 0 and "older committed version" in r.stdout, r.stdout + r.stderr)

        if shutil.which("zip") is None:
            print("skip the claude.ai bundle cases (install.sh --bundle needs zip)")
            r = None
        else:
            r = subprocess.run(["bash", str(REPO / "install.sh"), "--bundle"],
                               capture_output=True, text=True, env=env, cwd=REPO)
        bundle = REPO / "cklph-diagram.skill"
        try:
            ok = r is not None and r.returncode == 0 and bundle.is_file()
            if r is not None:
                case("the claude.ai bundle builds", ok, r.stdout + r.stderr)
            if ok:
                with zipfile.ZipFile(bundle) as z:
                    text = z.read("cklph-diagram/SKILL.md").decode("utf-8")
                case("the claude.ai bundle is named cklph-diagram", fm_name(text) == "cklph-diagram",
                     f"name is {fm_name(text)!r}")
        finally:
            bundle.unlink(missing_ok=True)

    for f in failures:
        print(f"FAIL {f}")
    print(f"\n{'FAILED' if failures else 'PASSED'}: skill name ({len(failures)} failing)")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
