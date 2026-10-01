#!/usr/bin/env python3
"""Resolve a brand from the token registry.

Reads ``skills/cklph-diagram/references/brands/<slug>.md``, validates it, and
emits the tokens as a CSS custom-property block or JSON.

The point of this script is the refusal path. A brand file that is still a stub,
or still contains TODOs, or fails AA contrast, must not render — that is what
stops a CKLPH-skinned diagram landing inside a client deliverable.

    python scripts/brand-tokens.py cklph                 # CSS block
    python scripts/brand-tokens.py cklph --mode dark
    python scripts/brand-tokens.py cklph --json
    python scripts/brand-tokens.py cklph --check         # contrast audit only
    python scripts/brand-tokens.py --list
    python scripts/brand-tokens.py --resolve            # which brand this project uses
    python scripts/brand-tokens.py --resolve --from ~/Development/fundae-site

A project can pin its brand with a ``.cklph-diagram`` marker file at its root
containing one line, ``brand: <slug>``. ``--resolve`` finds it (walking up from
``--from`` to the enclosing git root, never past it), validates it, and prints
``<slug><TAB><source>``. With no marker the answer is the house brand. A marker
that is malformed, or names a brand that is missing or still a stub, is refused:
falling back to the house brand there is the exact failure the registry exists
to prevent.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from colorlib import check_ramp, is_exempt, passes  # noqa: E402

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


BRANDS = _find_brands_dir()
ROOT = BRANDS.parent.parent

ROW_RE = re.compile(r"^\|\s*`?([a-z0-9-]+)`?\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|")
FM_RE = re.compile(r"^---\n(.*?)\n---", re.DOTALL)
COLOR_RE = re.compile(r"^(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))$")
FONT_LINK_RE = re.compile(
    r'<link\s+rel="stylesheet"\s+href="(https://fonts\.googleapis\.com/[^"]+)"\s*/?>'
)

# Typography roles map onto the three CSS font variables the templates consume.
# One family per variable; the size ramp lives in the stylesheet, not in a
# custom property, because sizes vary per size preset (output-spec.md §2).
FONT_ROLE_TO_VAR = {
    "title": "font-display",
    "node-name": "font-sans",
    "sublabel": "font-mono",
}

# Generic CSS families are keywords -- quoting them breaks the declaration.
CSS_GENERIC_FAMILIES = {
    "serif", "sans-serif", "monospace", "cursive", "fantasy",
    "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded",
    "math", "emoji", "fangsong", "inherit", "initial", "unset",
}

CORE_ROLES = [
    "paper",
    "paper-2",
    "ink",
    "ink-2",
    "muted",
    "soft",
    "rule",
    "rule-solid",
    "accent",
    "accent-tint",
    "link",
]


class BrandError(RuntimeError):
    """Raised when a brand cannot be resolved. Always fatal by design."""


DEFAULT_BRAND = "cklph"
MARKER_NAME = ".cklph-diagram"
# Marker content arrives with whatever repo was cloned, so it is untrusted data:
# a slug is a filename stem, never a path, and nothing else is accepted.
MARKER_SLUG_RE = re.compile(r"[a-z0-9_][a-z0-9_-]{0,63}")
MARKER_LINE_RE = re.compile(r"brand:[ \t]*(\S+)[ \t]*")
MARKER_MAX_BYTES = 4096


def find_marker(start: Path) -> Path | None:
    """The nearest ``.cklph-diagram`` between ``start`` and its git root.

    Never searches above the git root, and outside a git repo checks ``start``
    only -- a stray marker in a home directory must not brand every project
    beneath it.
    """
    start = start.resolve()
    if start.is_file():
        start = start.parent
    chain = [start, *start.parents]
    root = next((d for d in chain if (d / ".git").exists()), None)
    search = chain[: chain.index(root) + 1] if root else [start]
    for d in search:
        if (d / MARKER_NAME).is_file():
            return d / MARKER_NAME
    return None


def parse_marker(path: Path) -> str:
    """Return the slug a marker names. Anything unexpected is fatal, not ignored."""
    def bad(why: str) -> BrandError:
        return BrandError(
            f"{path} is not a valid brand marker: {why}.\n"
            f"  expected exactly one line: brand: <slug>  (lowercase, [a-z0-9_-])\n"
            f"  refusing rather than falling back to the house brand."
        )

    raw = path.read_bytes()
    if len(raw) > MARKER_MAX_BYTES:
        raise bad(f"larger than {MARKER_MAX_BYTES} bytes")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise bad("not UTF-8 text") from None
    lines = [ln.strip() for ln in text.splitlines()]
    lines = [ln for ln in lines if ln and not ln.startswith("#")]
    if len(lines) != 1:
        raise bad(f"{len(lines)} non-comment lines")
    m = MARKER_LINE_RE.fullmatch(lines[0])
    if not m:
        raise bad("the line is not 'brand: <slug>'")
    slug = m.group(1)
    if not MARKER_SLUG_RE.fullmatch(slug) or slug == "_template":
        raise bad(f"{slug[:40]!r} is not a brand slug")
    return slug


def resolve_project_brand(start: Path) -> tuple[str, str]:
    """(slug, human-readable source) for the project containing ``start``."""
    marker = find_marker(start)
    if marker is None:
        return DEFAULT_BRAND, f"house default (no {MARKER_NAME} marker)"
    named = parse_marker(marker)
    try:
        slug = resolve_slug(named)
    except BrandError as exc:
        raise BrandError(f"marker {marker} names brand {named!r}, which is not in the registry.\n{exc}") from None
    return slug, f"marker {marker}"


def available() -> list[str]:
    return sorted(p.stem for p in BRANDS.glob("*.md"))


def resolve_slug(name: str) -> str:
    """Map a user-supplied name or alias onto a brand file stem."""
    want = name.strip().lower().replace(" ", "-")
    if (BRANDS / f"{want}.md").exists():
        return want
    for path in BRANDS.glob("*.md"):
        fm = FM_RE.match(path.read_text(encoding="utf-8"))
        if not fm:
            continue
        aliases = re.search(r"^aliases:\s*\[(.*?)\]", fm.group(1), re.MULTILINE)
        if aliases:
            names = [a.strip().strip("'\"").lower() for a in aliases.group(1).split(",")]
            if want in names:
                return path.stem
    raise BrandError(
        f"no brand file for {name!r}.\n"
        f"  known brands: {', '.join(available())}\n"
        f"  to add one: copy references/brands/_template.md to "
        f"references/brands/{want}.md and run brand onboarding."
    )


def css_font_stack(cell: str) -> str:
    """Turn a Typography-table cell into a valid CSS font-family value.

    The table is written for humans -- ``The Silver Editorial, Georgia, serif``
    -- but CSS needs multi-word family names quoted while generic keywords must
    stay bare. Trailing markdown emphasis (the ``*italic*`` on the callout row)
    is annotation, not part of the family.
    """
    cell = cell.strip().strip("`")
    cell = re.sub(r"\*+italic\*+", "", cell, flags=re.I).strip()
    if not cell or cell.upper() == "TODO":
        return ""
    parts = []
    for raw in cell.split(","):
        family = raw.strip().strip("'\"")
        if not family:
            continue
        if family.lower() in CSS_GENERIC_FAMILIES or " " not in family:
            parts.append(family)
        else:
            parts.append(f'"{family}"')
    return ", ".join(parts)


def load(slug: str) -> dict:
    path = BRANDS / f"{slug}.md"
    if not path.exists():
        raise BrandError(f"missing brand file: {path}")
    text = path.read_text(encoding="utf-8")

    fm_match = FM_RE.match(text)
    if not fm_match:
        raise BrandError(f"{slug}: missing YAML frontmatter")
    fm = {}
    for line in fm_match.group(1).splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            fm[k.strip()] = v.strip()

    tokens_light: dict[str, str] = {}
    tokens_dark: dict[str, str] = {}
    shape_cues: dict[str, str] = {}
    fonts: dict[str, str] = {}

    for raw in text.splitlines():
        m = ROW_RE.match(raw)
        if not m:
            continue
        role, light, dark = m.group(1), m.group(2).strip(), m.group(3).strip()
        if role in {"Role", "Step", "Token"}:
            continue
        light = light.strip("`")
        dark = dark.strip("`")
        if COLOR_RE.match(light):
            tokens_light[role] = light
            if COLOR_RE.match(dark):
                tokens_dark[role] = dark
        elif role in FONT_ROLE_TO_VAR:
            # Typography table: | `title` | Family, fallback, generic | 28px | 400 |
            stack = css_font_stack(light)
            if stack:
                fonts[FONT_ROLE_TO_VAR[role]] = stack
        # capture the shape pairing declared alongside categorical colours
        cue = raw.split("|")
        if role.startswith("cat-") and len(cue) > 4:
            shape_cues[role] = cue[4].strip()

    link = FONT_LINK_RE.search(text)

    return {
        "slug": slug,
        "label": fm.get("label", slug),
        "status": fm.get("status", "unknown"),
        "source": fm.get("source", ""),
        "light": tokens_light,
        "dark": tokens_dark,
        "shape_cues": shape_cues,
        "fonts": fonts,
        "font_link": link.group(0) if link else "",
        "has_todo": "TODO" in text,
    }


def validate(brand: dict, mode: str = "light") -> list[str]:
    """Return a list of blocking problems. Empty list means renderable."""
    problems: list[str] = []

    if brand["status"] != "live":
        problems.append(
            f"brand '{brand['slug']}' has status '{brand['status']}' — not onboarded.\n"
            f"    Run brand onboarding before rendering anything for "
            f"{brand['label']}. Do NOT fall back to CKLPH tokens."
        )
    if brand["has_todo"]:
        problems.append(f"brand '{brand['slug']}' still contains TODO placeholders")

    tokens = brand[mode]
    missing = [r for r in CORE_ROLES if r not in tokens]
    if missing:
        problems.append(f"missing core roles in {mode}: {', '.join(missing)}")

    paper = tokens.get("paper")
    if paper:
        for role, value in tokens.items():
            if is_exempt(role):
                continue
            try:
                ok, got, need = passes(value, paper, role, base=paper)
            except ValueError as exc:
                problems.append(f"{role}: {exc}")
                continue
            if not ok:
                problems.append(
                    f"contrast {role} on paper ({mode}): {got:.2f}:1, needs {need:.1f}:1"
                )
        if "accent" in tokens and "accent-tint" in tokens:
            ok, got, need = passes(
                tokens["accent"], tokens["accent-tint"], "accent", base=paper
            )
            if not ok:
                problems.append(
                    f"contrast accent on accent-tint ({mode}): {got:.2f}:1, "
                    f"needs {need:.1f}:1"
                )

    # Ramps are fills: judged on monotonicity and step separation, not on
    # contrast against paper. See colorlib.check_ramp.
    seq = [(r, tokens[r]) for r in sorted(tokens) if r.startswith("seq-")]
    problems += [f"sequential scale ({mode}): {p}" for p in check_ramp(seq)]

    neg = [(r, tokens[r]) for r in ("div-neg-2", "div-neg-1", "div-mid") if r in tokens]
    pos = [(r, tokens[r]) for r in ("div-mid", "div-pos-1", "div-pos-2") if r in tokens]
    problems += [f"diverging scale, negative half ({mode}): {p}" for p in check_ramp(neg)]
    problems += [f"diverging scale, positive half ({mode}): {p}" for p in check_ramp(pos)]

    cats = [r for r in tokens if r.startswith("cat-")]
    uncued = [c for c in cats if not brand["shape_cues"].get(c)]
    if uncued:
        problems.append(
            "categorical tokens without a declared shape cue "
            f"({', '.join(uncued)}) — colour alone is not an encoding"
        )

    # A brand that declares no faces renders in whatever the template happened
    # to hardcode, which is how a client deliverable ends up in someone else's
    # typeface. Treat a missing family exactly like a missing colour.
    missing_fonts = [v for v in FONT_ROLE_TO_VAR.values() if not brand["fonts"].get(v)]
    if missing_fonts:
        wanted = ", ".join(
            f"{role} -> --{var}"
            for role, var in FONT_ROLE_TO_VAR.items()
            if var in missing_fonts
        )
        problems.append(
            f"missing typography families ({', '.join(missing_fonts)}) — "
            f"fill the Typography table rows: {wanted}"
        )
    return problems


def to_css(brand: dict, mode: str) -> str:
    tokens = brand[mode]
    lines = [
        f"/* {brand['label']} ({brand['slug']}) — {mode} */",
        f"/* source: {brand['source']} */",
    ]
    if brand["font_link"]:
        lines.append(f"/* webfont: {brand['font_link']} */")
    lines.append(":root {")
    lines += [f"  --{var}: {stack};" for var, stack in sorted(brand["fonts"].items())]
    lines += [f"  --{role}: {value};" for role, value in tokens.items()]
    lines.append("}")
    lines.append("")
    lines.append("@media (prefers-contrast: more) {")
    lines.append("  :root {")
    if mode == "light":
        lines += [
            "    --paper: #ffffff;",
            "    --ink: #000000;",
            "    --muted: #000000;",
            "    --soft: #000000;",
            "    --rule: rgba(0,0,0,0.55);",
        ]
    else:
        lines += [
            "    --paper: #000000;",
            "    --ink: #ffffff;",
            "    --muted: #ffffff;",
            "    --soft: #ffffff;",
            "    --rule: rgba(255,255,255,0.55);",
        ]
    lines.append("  }")
    lines.append("}")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("brand", nargs="?", help="brand slug or alias")
    ap.add_argument("--mode", default="light", choices=["light", "dark"])
    ap.add_argument("--json", action="store_true", help="emit JSON instead of CSS")
    ap.add_argument("--check", action="store_true", help="validate only, emit nothing")
    ap.add_argument("--list", action="store_true", help="list known brands")
    ap.add_argument("--resolve", action="store_true",
                    help=f"print the brand this project uses ({MARKER_NAME} marker, else {DEFAULT_BRAND})")
    ap.add_argument("--from", dest="start", default=".", metavar="DIR",
                    help="where --resolve starts looking (default: current directory)")
    args = ap.parse_args()

    if args.resolve:
        if args.brand:
            ap.error("--resolve takes no brand argument: it reports the project's brand")
        try:
            slug, source = resolve_project_brand(Path(args.start).expanduser())
            brand = load(slug)
        except BrandError as exc:
            print(f"REFUSED — {exc}", file=sys.stderr)
            return 2
        problems = validate(brand, "light") + validate(brand, "dark")
        if problems:
            print(f"REFUSED — {source} selects brand '{slug}', which cannot render:", file=sys.stderr)
            for p in dict.fromkeys(problems):
                print(f"  - {p}", file=sys.stderr)
            return 1
        print(f"{slug}\t{source}")
        return 0

    if args.list or not args.brand:
        print("brands in the registry:\n")
        for slug in available():
            if slug == "_template":
                continue
            b = load(slug)
            flag = "live " if b["status"] == "live" else "STUB "
            print(f"  {flag} {slug:<16} {b['label']}")
        print("\n  _template        (copy this to add a client)")
        return 0

    try:
        slug = resolve_slug(args.brand)
        brand = load(slug)
    except BrandError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    problems = validate(brand, args.mode)
    if problems:
        print(f"REFUSED — cannot render brand '{slug}':", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1

    if args.check:
        n = len(brand[args.mode])
        print(f"ok: {slug} ({brand['label']}) — {n} tokens, {args.mode}, AA clean")
        return 0

    if args.json:
        print(json.dumps(brand, indent=2))
    else:
        print(to_css(brand, args.mode))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
