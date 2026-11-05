#!/usr/bin/env python3
"""Outcome tests for the local brands directory.

Client brand files live outside the skill, so a plugin update (which replaces
the skill folder) cannot delete them. brand-tokens.py searches, in order:

    $CKLPH_DIAGRAM_BRANDS                       when set (must be a directory)
    ${XDG_CONFIG_HOME:-~/.config}/cklph-diagram/brands   when it exists
    the bundled references/brands               always

Each case builds a throwaway HOME, runs the real CLIs, and checks the exit code
and output. The refusals matter most: a brand defined twice, or an override
that points nowhere, must stop the run rather than pick a file by search order.

Every case sets HOME, XDG_CONFIG_HOME and CKLPH_DIAGRAM_BRANDS itself, so the
result is the same in CI and on a machine that has real client brands.

    python3 scripts/test-brands-dir.py
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SKILL = REPO / "skills/diagram"
TOKENS = SKILL / "scripts/brand-tokens.py"
LINT = SKILL / "scripts/lint-a11y.py"
BUNDLED = SKILL / "references/brands"
TEMPLATE_HTML = SKILL / "assets/template.html"

failures: list[str] = []


def run(script: Path, *args: str, env: dict[str, str], cwd: Path | None = None) -> subprocess.CompletedProcess:
    full = {k: v for k, v in os.environ.items()
            if k not in {"HOME", "XDG_CONFIG_HOME", "CKLPH_DIAGRAM_BRANDS", "CKLPH_FONTS_DIR"}}
    full["PYTHONDONTWRITEBYTECODE"] = "1"
    full.update(env)
    return subprocess.run([sys.executable, str(script), *args], capture_output=True,
                          text=True, env=full, cwd=cwd)


def case(name: str, ok: bool, detail: str = "") -> None:
    if ok:
        print(f"ok   {name}")
    else:
        failures.append(f"{name}\n    {detail.strip()[:400]}")


def client_brand(slug: str, *, status: str = "live", font: str | None = None) -> str:
    """A renderable brand file: the neutral skin under a client's name."""
    text = (BUNDLED / "_default.md").read_text(encoding="utf-8")
    text = text.replace("brand: _default", f"brand: {slug}", 1)
    text = text.replace("label: Neutral editorial", f"label: Client {slug}", 1)
    text = text.replace("status: live", f"status: {status}", 1)
    text = text.replace("aliases: [neutral, unbranded, house-neutral]", f"aliases: [{slug}-co]", 1)
    if font:
        text += ("\n### Local fonts\n\n| Family | Weight | Style | File |\n|---|---|---|---|\n"
                 f"| Client Serif | 400 | normal | `{font}` |\n")
    return text


def home(tmp: Path, name: str) -> Path:
    h = tmp / name
    h.mkdir()
    return h


def run_all(tmp: Path) -> None:
    # 1. The default local dir under ~/.config, with no env var set.
    h = home(tmp, "h1")
    local = h / ".config/cklph-diagram/brands"
    local.mkdir(parents=True)
    (local / "acme.md").write_text(client_brand("acme"), encoding="utf-8")
    env = {"HOME": str(h)}
    r = run(TOKENS, "acme", "--check", env=env)
    case("a client brand in ~/.config/cklph-diagram/brands renders", r.returncode == 0, r.stdout + r.stderr)
    r = run(TOKENS, "Acme Co", "--check", env=env)
    case("its alias resolves too", r.returncode == 0, r.stdout + r.stderr)
    r = run(TOKENS, "cklph", "--check", env=env)
    case("bundled brands still render beside a local dir", r.returncode == 0, r.stdout + r.stderr)
    r = run(TOKENS, "--list", env=env)
    case("--list shows the local brand, marked local, and the bundled ones",
         r.returncode == 0 and "acme" in r.stdout and "(local)" in r.stdout and "cklph" in r.stdout,
         r.stdout + r.stderr)
    r = run(TOKENS, "acme", env=env)
    case("the CSS block is emitted for a local brand", r.returncode == 0 and "--paper" in r.stdout,
         r.stdout + r.stderr)

    # 2. A project marker naming a local brand.
    proj = tmp / "client-site"
    (proj / ".git").mkdir(parents=True)
    (proj / ".cklph-diagram").write_text("brand: acme\n", encoding="utf-8")
    r = run(TOKENS, "--resolve", "--from", str(proj), env=env)
    case("a .cklph-diagram marker can name a local brand",
         r.returncode == 0 and r.stdout.split("\t")[0] == "acme", r.stdout + r.stderr)

    # 3. lint-a11y goes through the same lookup.
    r = run(LINT, str(TEMPLATE_HTML), "--brand", "acme", env=env)
    case("lint-a11y lints against a local brand", r.returncode == 0 and "brand=acme" in r.stdout,
         r.stdout + r.stderr)

    # 4. XDG_CONFIG_HOME moves the default dir.
    h = home(tmp, "h2")
    xdg = tmp / "xdg"
    (xdg / "cklph-diagram/brands").mkdir(parents=True)
    (xdg / "cklph-diagram/brands/bolt.md").write_text(client_brand("bolt"), encoding="utf-8")
    r = run(TOKENS, "bolt", "--check", env={"HOME": str(h), "XDG_CONFIG_HOME": str(xdg)})
    case("XDG_CONFIG_HOME is honoured", r.returncode == 0, r.stdout + r.stderr)

    # 5. CKLPH_DIAGRAM_BRANDS wins over ~/.config.
    h = home(tmp, "h3")
    (h / ".config/cklph-diagram/brands").mkdir(parents=True)
    (h / ".config/cklph-diagram/brands/wrong.md").write_text(client_brand("wrong"), encoding="utf-8")
    custom = tmp / "custom-brands"
    custom.mkdir()
    (custom / "crane.md").write_text(client_brand("crane"), encoding="utf-8")
    env = {"HOME": str(h), "CKLPH_DIAGRAM_BRANDS": str(custom)}
    r = run(TOKENS, "crane", "--check", env=env)
    case("CKLPH_DIAGRAM_BRANDS is searched", r.returncode == 0, r.stdout + r.stderr)
    r = run(TOKENS, "wrong", "--check", env=env)
    case("CKLPH_DIAGRAM_BRANDS replaces ~/.config, not adds to it", r.returncode != 0, r.stdout + r.stderr)

    # 6. Refusals.
    r = run(TOKENS, "cklph", "--check", env={"HOME": str(h), "CKLPH_DIAGRAM_BRANDS": str(tmp / "missing")})
    case("CKLPH_DIAGRAM_BRANDS pointing at nothing is refused, not ignored",
         r.returncode != 0 and "not a directory" in r.stderr, r.stdout + r.stderr)

    r = run(TOKENS, "Acme Co", "--check", env={"HOME": str(tmp / "h1"), "CKLPH_DIAGRAM_BRANDS": "  "})
    case("a blank CKLPH_DIAGRAM_BRANDS counts as unset", r.returncode == 0, r.stdout + r.stderr)

    spaced = tmp / "spaced brands "
    spaced.mkdir()
    (spaced / "edge.md").write_text(client_brand("edge"), encoding="utf-8")
    r = run(TOKENS, "edge", "--check", env={"HOME": str(h), "CKLPH_DIAGRAM_BRANDS": str(spaced)})
    case("a CKLPH_DIAGRAM_BRANDS path with a trailing space is kept as given",
         r.returncode == 0, r.stdout + r.stderr)

    dup = tmp / "dup-brands"
    dup.mkdir()
    shutil.copy(BUNDLED / "cklph.md", dup / "cklph.md")
    env = {"HOME": str(h), "CKLPH_DIAGRAM_BRANDS": str(dup)}
    r = run(TOKENS, "cklph", "--check", env=env)
    case("a brand defined both locally and bundled is refused",
         r.returncode != 0 and "defined twice" in r.stderr, r.stdout + r.stderr)
    r = run(TOKENS, "--list", env=env)
    case("--list refuses a duplicate instead of crashing",
         r.returncode == 2 and "defined twice" in r.stderr and "Traceback" not in r.stderr,
         r.stdout + r.stderr)
    r = run(LINT, str(TEMPLATE_HTML), "--brand", "cklph", env=env)
    case("lint-a11y refuses the duplicate cleanly",
         r.returncode != 0 and "defined twice" in r.stderr and "Traceback" not in r.stderr,
         r.stdout + r.stderr)

    clash = tmp / "clash-brands"
    clash.mkdir()
    (clash / "quiet.md").write_text(
        client_brand("quiet").replace("aliases: [quiet-co]", "aliases: [neutral]"), encoding="utf-8")
    r = run(TOKENS, "neutral", "--check", env={"HOME": str(h), "CKLPH_DIAGRAM_BRANDS": str(clash)})
    case("an alias claimed by a local and a bundled brand is refused",
         r.returncode == 2 and "more than one brand" in r.stderr, r.stdout + r.stderr)

    stub = tmp / "stub-brands"
    stub.mkdir()
    (stub / "draft.md").write_text(client_brand("draft", status="stub"), encoding="utf-8")
    r = run(TOKENS, "draft", "--check", env={"HOME": str(h), "CKLPH_DIAGRAM_BRANDS": str(stub)})
    case("a local stub brand is still refused", r.returncode == 1 and "REFUSED" in r.stderr,
         r.stdout + r.stderr)

    r = run(TOKENS, "nobody", "--check", env={"HOME": str(h), "CKLPH_DIAGRAM_BRANDS": str(stub)})
    case("an unknown brand points at the local dir to add it",
         r.returncode == 2 and str(stub / "nobody.md") in r.stderr, r.stdout + r.stderr)

    # 7. Licensed fonts sit beside the local brands, not inside the skill.
    fonted = tmp / "fonted-brands"
    (fonted / "fonts/delta").mkdir(parents=True)
    (fonted / "delta.md").write_text(client_brand("delta", font="Delta-Regular.woff2"), encoding="utf-8")
    env = {"HOME": str(h), "CKLPH_DIAGRAM_BRANDS": str(fonted)}
    r = run(TOKENS, "delta", "--check", env=env)
    case("a missing local font is reported", r.returncode == 0 and "not installed" in r.stdout,
         r.stdout + r.stderr)
    (fonted / "fonts/delta/Delta-Regular.woff2").write_bytes(b"wOF2" + bytes(range(256)))
    r = run(TOKENS, "delta", "--check", env=env)
    case("a font in <local dir>/fonts/<slug>/ is found", r.returncode == 0 and "not installed" not in r.stdout,
         r.stdout + r.stderr)


def main() -> int:
    with tempfile.TemporaryDirectory() as d:
        run_all(Path(d))
    for f in failures:
        print(f"FAIL {f}")
    print(f"\n{'FAILED' if failures else 'PASSED'}: local brands directory ({len(failures)} failing)")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
