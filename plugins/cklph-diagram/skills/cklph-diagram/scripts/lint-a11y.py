#!/usr/bin/env python3
"""Fail the build on accessibility violations in generated diagrams.

Implements the six mechanical rules from
``skills/cklph-diagram/references/accessibility.md``:

    A1  no encoding by colour alone (mechanical half)
    A2  AA contrast at the sizes actually used
    A3  SVG semantics (role, aria-labelledby, title-first, prefixed ids)
    A4  prose text alternative present
    A5  minimum *rendered* font size
    A6  prefers-reduced-motion guard on any animation
    A7  prefers-contrast: more variant present

Plus the one cognitive-load rule that is countable:

    C3  hard node ceiling

Usage:
    python scripts/lint-a11y.py out/*.html --brand cklph
    python scripts/lint-a11y.py out/foo.html --brand cklph --mode dark
    python scripts/lint-a11y.py out/*.html --brand cklph --warn-only
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from colorlib import is_exempt, parse_color, passes  # noqa: E402

def _find_brands_dir() -> Path:
    """Locate references/brands whether we are in the repo or installed alone.

    The skill is installed as a self-contained folder, but development happens
    in the fork repo where scripts also live at the root. Walk up from this
    file and take the first match, so neither layout has to know about the
    other.
    """
    here = Path(__file__).resolve()
    for base in [here.parent, *here.parents]:
        for candidate in (
            base / "references" / "brands",
            base / "skills" / "cklph-diagram" / "references" / "brands",
        ):
            if candidate.is_dir():
                return candidate
    raise SystemExit(
        "cannot locate references/brands -- run from the skill directory "
        "or the fork repo"
    )


BRANDS_DIR = _find_brands_dir()
ROOT = BRANDS_DIR.parent.parent

NODE_CEILING = 9
FONT_FLOOR_PX = 12.0
DEFAULT_RENDER_WIDTH = 720.0

SVG_OPEN_RE = re.compile(r"<svg\b([^>]*)>", re.IGNORECASE | re.DOTALL)
ATTR_RE = re.compile(r"""([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')""")
COLOR_LITERAL_RE = re.compile(
    r"(?<![\w-])(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))(?![0-9a-fA-F])"
)
FONT_SIZE_ATTR_RE = re.compile(r"""font-size\s*[:=]\s*["']?\s*([\d.]+)(px|rem|em)?""", re.I)
WRITING_MODE_RE = re.compile(r"writing-mode\s*[:=]\s*[\"']?\s*(vertical|tb)", re.I)
ANIM_RE = re.compile(r"(<animate\b|<animateTransform\b|@keyframes\b|transition\s*:)", re.I)
REDUCED_MOTION_RE = re.compile(r"prefers-reduced-motion", re.I)
CONTRAST_MORE_RE = re.compile(r"prefers-contrast\s*:\s*more", re.I)
ALT_BLOCK_RE = re.compile(r"""class\s*=\s*["'][^"']*\bdiagram-alt\b""", re.I)
NODE_RE = re.compile(r"""data-node\s*=\s*["']""", re.I)
CAT_VAR_RE = re.compile(r"var\(\s*--(cat-[1-5])\s*\)", re.I)
SHAPE_CUE_RE = re.compile(r"""\b(rx|stroke-width|stroke-dasharray)\s*=\s*["']([^"']+)""", re.I)

# Colours that are always fine wherever they appear: fully transparent, and
# pure black/white inside a prefers-contrast override.
ALWAYS_OK = {"none", "transparent", "currentcolor", "inherit"}


@dataclass
class Report:
    path: Path
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def error(self, rule: str, msg: str) -> None:
        self.errors.append(f"[{rule}] {msg}")

    def warn(self, rule: str, msg: str) -> None:
        self.warnings.append(f"[{rule}] {msg}")


def load_brand(slug: str, mode: str) -> dict[str, str]:
    """Import the brand loader without fighting its hyphenated filename."""
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "brand_tokens", Path(__file__).resolve().parent / "brand-tokens.py"
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    resolved = module.resolve_slug(slug)
    brand = module.load(resolved)
    problems = module.validate(brand, mode)
    if problems:
        raise SystemExit(
            f"error: brand '{slug}' is not renderable, so nothing linted against it "
            f"can be trusted:\n  - " + "\n  - ".join(problems)
        )
    return brand[mode]


def svg_blocks(text: str) -> list[tuple[dict[str, str], str, int]]:
    """Return ``(attrs, body, start_offset)`` for each top-level <svg>."""
    blocks = []
    for m in SVG_OPEN_RE.finditer(text):
        attrs = {
            a.group(1).lower(): (a.group(2) if a.group(2) is not None else a.group(3))
            for a in ATTR_RE.finditer(m.group(1))
        }
        end = text.lower().find("</svg>", m.end())
        body = text[m.end() : end if end != -1 else len(text)]
        blocks.append((attrs, body, m.start()))
    return blocks


def check_semantics(rep: Report, attrs: dict[str, str], body: str, index: int) -> None:
    """A3 — the accessible SVG contract."""
    if attrs.get("aria-hidden") == "true":
        return  # decorative; correctly opted out

    if attrs.get("role") != "img":
        rep.error("A3", f'svg #{index}: missing role="img"')

    labelledby = attrs.get("aria-labelledby", "").split()
    if not labelledby:
        rep.error("A3", f"svg #{index}: missing aria-labelledby")

    title_m = re.search(r"<title\b[^>]*>(.*?)</title>", body, re.S | re.I)
    desc_m = re.search(r"<desc\b[^>]*>(.*?)</desc>", body, re.S | re.I)

    if not title_m:
        rep.error("A3", f"svg #{index}: no <title>")
    if not desc_m:
        rep.error("A3", f"svg #{index}: no <desc>")

    if title_m:
        # <title> must be the first child, before <defs>.
        before = body[: title_m.start()]
        if re.search(r"<(?!!--)\w+", before):
            first = re.search(r"<(\w+)", before)
            rep.error(
                "A3",
                f"svg #{index}: <title> must be the first child; found "
                f"<{first.group(1) if first else '?'}> before it",
            )
        if len(title_m.group(1).strip()) > 60:
            rep.warn("A3", f"svg #{index}: <title> over 60 chars")
        if not title_m.group(1).strip():
            rep.error("A3", f"svg #{index}: <title> is empty")

    if desc_m and not desc_m.group(1).strip():
        rep.error("A3", f"svg #{index}: <desc> is empty")

    for tag, m in (("title", title_m), ("desc", desc_m)):
        if not m:
            continue
        id_m = re.search(rf"<{tag}\b[^>]*\bid\s*=\s*[\"']([^\"']+)", body, re.I)
        if not id_m:
            rep.error("A3", f"svg #{index}: <{tag}> has no id")
            continue
        value = id_m.group(1)
        if value in {"title", "desc"}:
            rep.error(
                "A3",
                f"svg #{index}: bare id=\"{value}\" — two inline diagrams would "
                f"collide and the second announces the first's name",
            )
        elif labelledby and value not in labelledby:
            rep.error(
                "A3", f'svg #{index}: id="{value}" not referenced by aria-labelledby'
            )


def check_font_sizes(rep: Report, attrs: dict[str, str], body: str, index: int) -> None:
    """A5 — 12px floor on *rendered* size, not viewBox size."""
    viewbox = attrs.get("viewbox", "")
    parts = viewbox.replace(",", " ").split()
    if len(parts) != 4:
        rep.error("A5", f"svg #{index}: no parsable viewBox, cannot verify font sizes")
        return
    vb_width = float(parts[2])
    render_width = float(attrs.get("data-render-width", DEFAULT_RENDER_WIDTH))
    scale = render_width / vb_width if vb_width else 1.0

    seen: set[float] = set()
    for m in FONT_SIZE_ATTR_RE.finditer(body):
        size = float(m.group(1))
        unit = (m.group(2) or "px").lower()
        if unit in {"rem", "em"}:
            size *= 16.0
        rendered = size * scale
        if rendered + 1e-6 < FONT_FLOOR_PX and size not in seen:
            seen.add(size)
            rep.error(
                "A5",
                f"svg #{index}: font-size {size:g} renders at "
                f"{rendered:.1f}px (viewBox {vb_width:g} shown at "
                f"{render_width:g}px); floor is {FONT_FLOOR_PX:g}px",
            )


def check_color_only(rep: Report, body: str, index: int) -> None:
    """A1 — categorical colour must be paired with a non-colour cue."""
    cats = set(CAT_VAR_RE.findall(body))
    if len(cats) < 2:
        return
    cues = {(m.group(1).lower(), m.group(2).strip()) for m in SHAPE_CUE_RE.finditer(body)}
    varied = {k for k, _ in cues if len({v for kk, v in cues if kk == k}) > 1}
    if not varied:
        rep.error(
            "A1",
            f"svg #{index}: {len(cats)} categorical colours "
            f"({', '.join(sorted(cats))}) with no varying shape cue — "
            f"vary rx, stroke-width, or stroke-dasharray so the categories "
            f"survive greyscale and colour-vision differences",
        )


def check_tokens(
    rep: Report, text: str, tokens: dict[str, str], mode: str
) -> None:
    """A2 — every colour literal must be a brand token.

    Contrast is enforced once, at the brand level, where it can be reasoned
    about. Here we only have to prove the diagram did not invent a colour
    outside that audited set — which is both cheaper and stricter than trying
    to infer every foreground/background pairing from the SVG source.
    """
    allowed = set()
    for value in tokens.values():
        try:
            allowed.add(parse_color(value)[:3] + (round(parse_color(value)[3], 3),))
        except ValueError:
            continue
    # the prefers-contrast override is allowed to reach for absolute black/white
    for extra in ("#ffffff", "#000000", "rgba(0,0,0,0.55)", "rgba(255,255,255,0.55)"):
        c = parse_color(extra)
        allowed.add(c[:3] + (round(c[3], 3),))

    offenders: dict[str, int] = {}
    for m in COLOR_LITERAL_RE.finditer(text):
        literal = m.group(1)
        if literal.lower() in ALWAYS_OK:
            continue
        try:
            c = parse_color(literal)
        except ValueError:
            continue
        key = c[:3] + (round(c[3], 3),)
        if key not in allowed:
            offenders[literal] = offenders.get(literal, 0) + 1

    for literal, count in sorted(offenders.items(), key=lambda kv: -kv[1]):
        rep.error(
            "A2",
            f"colour {literal} (x{count}) is not a token in this brand's "
            f"{mode} palette — untokenised colour is unaudited contrast",
        )


def check_document(rep: Report, text: str) -> None:
    """A4, A6, A7, C3 and the writing-mode ban — document-level checks."""
    if not ALT_BLOCK_RE.search(text):
        rep.error(
            "A4",
            'no prose alternative — expected an element with class="diagram-alt" '
            "(see references/prose-alternative.md)",
        )

    anim = ANIM_RE.search(text)
    if anim and not REDUCED_MOTION_RE.search(text):
        rep.error(
            "A6",
            f"animation present ({anim.group(1).strip()}) with no "
            "prefers-reduced-motion guard",
        )

    if not CONTRAST_MORE_RE.search(text):
        rep.error("A7", "no prefers-contrast: more variant block")

    nodes = len(NODE_RE.findall(text))
    if nodes > NODE_CEILING:
        rep.error(
            "C3",
            f"{nodes} nodes exceeds the ceiling of {NODE_CEILING} — split into "
            f"an overview plus a detail diagram rather than shrinking the type",
        )
    elif nodes == 0:
        rep.warn("C3", "no data-node attributes found; node ceiling not verified")

    if WRITING_MODE_RE.search(text):
        rep.error("C7", "vertical writing-mode text is unreadable in diagrams")


def lint(path: Path, tokens: dict[str, str], mode: str) -> Report:
    rep = Report(path)
    text = path.read_text(encoding="utf-8")

    blocks = svg_blocks(text)
    if not blocks:
        rep.error("A3", "no <svg> found")
    for i, (attrs, body, _) in enumerate(blocks, start=1):
        if attrs.get("aria-hidden") == "true":
            continue
        check_semantics(rep, attrs, body, i)
        check_font_sizes(rep, attrs, body, i)
        check_color_only(rep, body, i)

    check_document(rep, text)
    check_tokens(rep, text, tokens, mode)
    return rep


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("paths", nargs="+", type=Path)
    ap.add_argument("--brand", required=True)
    ap.add_argument("--mode", default="light", choices=["light", "dark"])
    ap.add_argument(
        "--warn-only", action="store_true", help="report but always exit 0"
    )
    args = ap.parse_args()

    tokens = load_brand(args.brand, args.mode)

    files = [p for p in args.paths if p.is_file()]
    if not files:
        print("error: no files to lint", file=sys.stderr)
        return 2

    failed = 0
    for path in files:
        rep = lint(path, tokens, args.mode)
        if rep.errors or rep.warnings:
            print(f"\n{path}")
            for e in rep.errors:
                print(f"  FAIL {e}")
            for w in rep.warnings:
                print(f"  warn {e if False else w}")
        else:
            print(f"ok   {path}")
        if rep.errors:
            failed += 1

    print(
        f"\n{len(files)} file(s), {failed} failing "
        f"(brand={args.brand}, mode={args.mode})"
    )
    if failed and not args.warn_only:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
