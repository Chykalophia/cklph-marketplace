#!/usr/bin/env python3
"""Render the three proof diagrams for a given brand.

This is a **verification harness**, not the production path. Normal use of the
skill is Claude authoring the SVG by hand against the references. This script
exists to answer the Phase 1 acceptance question mechanically:

    does the same architecture diagram render correctly in two different
    brands from the same directory, and pass the a11y lint in both?

    python scripts/build-examples.py --brand cklph --out out/
    python scripts/build-examples.py --brand _default --mode dark --out out/
"""

from __future__ import annotations

import argparse
import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILL_SCRIPTS = ROOT / "skills/cklph-diagram/scripts"
sys.path.insert(0, str(SKILL_SCRIPTS))

_spec = importlib.util.spec_from_file_location(
    "brand_tokens", SKILL_SCRIPTS / "brand-tokens.py"
)
brand_tokens = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(brand_tokens)

GRID = 4
R = 8  # elbow radius


def snap(v: float) -> int:
    """Every coordinate lands on the 4px grid. Non-negotiable upstream, kept."""
    return int(round(v / GRID) * GRID)


def elbow(x1: int, y1: int, x2: int, y2: int, first: str = "v") -> str:
    """Orthogonal path with one rounded corner. No diagonals, ever.

    ``first`` picks which axis moves first — 'v' for vertical-then-horizontal.
    The corner is a quarter arc of radius R so the connector reads as drawn
    rather than generated.
    """
    sx = 1 if x2 > x1 else -1
    sy = 1 if y2 > y1 else -1
    if first == "v":
        return (
            f"M {x1} {y1} L {x1} {y2 - sy * R} "
            f"Q {x1} {y2} {x1 + sx * R} {y2} L {x2} {y2}"
        )
    return (
        f"M {x1} {y1} L {x2 - sx * R} {y1} "
        f"Q {x2} {y1} {x2} {y1 + sy * R} L {x2} {y2}"
    )


def shell(
    slug: str,
    title: str,
    eyebrow: str,
    css_vars: str,
    svg: str,
    alt_html: str,
    fonts: str,
) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
{fonts}
<style>
{css_vars}
* {{ box-sizing: border-box; }}
body {{
  margin: 0; padding: 48px 32px;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-sans);
  line-height: 1.5;
}}
.wrap {{ max-width: 784px; margin: 0 auto; }}
.eyebrow {{
  font-family: var(--font-mono); font-size: 12px; font-weight: 500;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted);
  margin: 0 0 8px;
}}
h1 {{ font-family: var(--font-display); font-size: 28px; font-weight: 400; margin: 0 0 24px; }}
svg {{ width: 100%; height: auto; display: block; }}
.diagram-alt {{
  margin-top: 32px; border-top: 1px solid var(--rule); padding-top: 16px;
  font-size: 16px;
}}
.diagram-alt summary {{
  font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--muted); cursor: pointer;
}}
.diagram-alt ol {{ padding-left: 20px; }}
.diagram-alt li {{ margin-bottom: 8px; }}
footer {{
  margin-top: 32px; padding-top: 16px; border-top: 1px solid var(--rule);
  font-family: var(--font-mono); font-size: 12px; color: var(--muted);
}}
</style>
</head>
<body>
<div class="wrap">
<p class="eyebrow">{eyebrow}</p>
<h1>{title}</h1>
{svg}
<details class="diagram-alt">
<summary>Text description of this diagram</summary>
<div id="{slug}-alt">
{alt_html}
</div>
</details>
<footer>{eyebrow} &middot; rendered from the {slug.split('-')[-1]} brand token registry</footer>
</div>
</body>
</html>
"""


def defs(slug: str) -> str:
    return f"""  <defs>
    <marker id="{slug}-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="var(--muted)"/>
    </marker>
    <marker id="{slug}-arrow-accent" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="var(--accent)"/>
    </marker>
  </defs>"""


def node(
    slug: str,
    idx: int,
    x: int,
    y: int,
    w: int,
    h: int,
    name: str,
    sub: str,
    tag: str,
    cat: str,
    rx: int,
    dash: str | None = None,
    focal: bool = False,
) -> str:
    """A node box. Category colour always ships with a shape cue (rx / dash)."""
    stroke = "var(--accent)" if focal else f"var(--{cat})"
    fill = "var(--accent-tint)" if focal else "var(--paper-2)"
    dash_attr = f' stroke-dasharray="{dash}"' if dash else ""
    cx = x + w // 2
    return f"""  <g data-node="{idx}">
    <rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="var(--paper)"/>
    <rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"
          stroke="{stroke}" stroke-width="{2 if focal else 1.2}"{dash_attr}/>
    <text x="{x + 12}" y="{y + 24}" fill="var(--muted)" font-size="12"
          font-family="var(--font-mono)" letter-spacing="0.08em">{tag}</text>
    <text x="{cx}" y="{y + 48}" fill="var(--ink)" font-size="16" font-weight="600"
          font-family="var(--font-sans)" text-anchor="middle">{name}</text>
    <text x="{cx}" y="{y + 68}" fill="var(--muted)" font-size="12"
          font-family="var(--font-mono)" text-anchor="middle">{sub}</text>
  </g>"""


def arrow_label(x: int, y: int, text: str, w: int = 48) -> str:
    """Label sits 16px clear of the stroke with an opaque mask behind it."""
    return f"""    <rect x="{x - w // 2}" y="{y - 32}" width="{w}" height="16" rx="2" fill="var(--paper)"/>
    <text x="{x}" y="{y - 20}" fill="var(--muted)" font-size="12"
          font-family="var(--font-mono)" text-anchor="middle" letter-spacing="0.06em">{text}</text>"""


def architecture(slug: str) -> tuple[str, str]:
    w, h, gap = 136, 88, 56
    y = 112
    xs = [32, 32 + w + gap, 32 + 2 * (w + gap), 32 + 3 * (w + gap)]
    notify_x, notify_y = xs[2], y + h + 96

    lines = [
        f'<svg viewBox="0 0 784 480" data-render-width="784" role="img"',
        f'     aria-labelledby="{slug}-title {slug}-desc"',
        f'     xmlns="http://www.w3.org/2000/svg">',
        f"  <title id=\"{slug}-title\">Lead intake pipeline</title>",
        f"  <desc id=\"{slug}-desc\">Form submissions enter through an edge intake"
        f" worker, queue, and are processed by a worker that writes to the CRM and"
        f" triggers notifications asynchronously.</desc>",
        defs(slug),
        f'  <rect width="100%" height="100%" fill="var(--paper)"/>',
        "  <g fill=\"none\" stroke-width=\"1.2\">",
    ]

    mid_y = y + h // 2
    for i in range(3):
        x1, x2 = xs[i] + w, xs[i + 1]
        lines.append(
            f'    <path d="M {x1} {mid_y} L {x2 - 8} {mid_y}" stroke="var(--muted)"'
            f' marker-end="url(#{slug}-arrow)"/>'
        )
        lines.append(arrow_label((x1 + x2) // 2, mid_y, ["POST", "PULL", "WRITE"][i]))

    lines.append(
        f'    <path d="M {xs[2] + w // 2} {y + h} L {xs[2] + w // 2} {notify_y - 8}"'
        f' stroke="var(--accent)" marker-end="url(#{slug}-arrow-accent)"/>'
    )
    elbow_path = elbow(xs[3] + w // 2, y + h, notify_x + w + 8, notify_y + 44, first="v")
    lines.append(
        f'    <path d="{elbow_path}" stroke="var(--muted)" stroke-dasharray="4,3"'
        f' marker-end="url(#{slug}-arrow)"/>'
    )
    lines.append("  </g>")

    specs = [
        ("Intake", "edge worker", "EDGE", "cat-1", 0, None, False),
        ("Queue", "durable, 7d", "QUEUE", "cat-3", 12, None, False),
        ("Worker", "retry x3", "PROC", "cat-2", 8, None, True),
        ("CRM", "system of record", "STORE", "cat-1", 0, None, False),
    ]
    for i, (name, sub, tag, cat, rx, dash, focal) in enumerate(specs):
        lines.append(node(slug, i + 1, xs[i], y, w, h, name, sub, tag, cat, rx, dash, focal))
    lines.append(
        node(slug, 5, notify_x, notify_y, w, h, "Notify", "best effort",
             "SIDE", "cat-4", 8, "4,3", False)
    )

    ly = 432
    lines.append(
        f'  <line x1="32" y1="{ly - 16}" x2="744" y2="{ly - 16}" stroke="var(--rule)"'
        f' stroke-width="1"/>'
    )
    legend = [
        ("Square = pipeline", "cat-1", 0, None),
        ("Round = buffer", "cat-3", 10, None),
        ("Dashed = off-path", "cat-4", 0, "4,3"),
    ]
    lx = 32
    for label, cat, rx, dash in legend:
        d = f' stroke-dasharray="{dash}"' if dash else ""
        lines.append(
            f'  <rect x="{lx}" y="{ly}" width="16" height="16" rx="{rx}" fill="none"'
            f' stroke="var(--{cat})" stroke-width="1.2"{d}/>'
            f'<text x="{lx + 28}" y="{ly + 15}" fill="var(--muted)" font-size="12"'
            f' font-family="var(--font-mono)">{label}</text>'
        )
        lx += 192
    lines.append("</svg>")

    alt = """<p><strong>What it shows.</strong> How a submitted lead form travels
from the public edge to the CRM, and what happens off to the side.</p>
<p><strong>Reading order.</strong> Left to right, starting at Intake.</p>
<ol>
<li><strong>Intake</strong> (edge worker) &mdash; receives the form POST and validates it.</li>
<li><strong>Queue</strong> (durable, 7 day retention) &mdash; buffers work so a slow CRM never drops a lead.</li>
<li><strong>Worker</strong> (retries three times) &mdash; the focal node; this is where the retry logic lives and where failures actually surface.</li>
<li><strong>CRM</strong> &mdash; the system of record. Terminal.</li>
<li><strong>Notify</strong> (async, best effort) &mdash; fires Slack and email. Deliberately off the critical path.</li>
</ol>
<p><strong>Connections.</strong> Intake &rarr; Queue (POST, synchronous).
Queue &rarr; Worker (PULL, synchronous). Worker &rarr; CRM (WRITE, synchronous).
Worker &rarr; Notify (synchronous trigger, highlighted). CRM &rarr; Notify
(dashed: asynchronous, may lag or fail without blocking).</p>
<p><strong>Highlighted.</strong> Worker is the focal node &mdash; every retry and
every failure mode in this pipeline is its responsibility.</p>"""
    return "\n".join(lines), alt


def quadrant(slug: str) -> tuple[str, str]:
    x0, y0, size = 96, 72, 320
    items = [
        ("Retainer SEO", 0.72, 0.30, "cat-1", 0, None),
        ("Brand sprint", 0.30, 0.24, "cat-2", 5, None),
        ("Platform build", 0.80, 0.78, "cat-3", 10, None),
        ("One-off audit", 0.22, 0.66, "cat-4", 0, "3,2"),
    ]
    lines = [
        '<svg viewBox="0 0 560 512" data-render-width="784" role="img"',
        f'     aria-labelledby="{slug}-title {slug}-desc"',
        '     xmlns="http://www.w3.org/2000/svg">',
        f'  <title id="{slug}-title">Service line positioning</title>',
        f'  <desc id="{slug}-desc">Four service lines plotted by margin against'
        f' delivery repeatability, showing that platform builds carry the highest'
        f' margin but the lowest repeatability.</desc>',
        defs(slug),
        '  <rect width="100%" height="100%" fill="var(--paper)"/>',
        f'  <rect x="{x0}" y="{y0}" width="{size}" height="{size}" fill="var(--paper-2)"'
        f' stroke="var(--rule-solid)" stroke-width="1"/>',
        f'  <line x1="{x0 + size // 2}" y1="{y0}" x2="{x0 + size // 2}" y2="{y0 + size}"'
        f' stroke="var(--rule-solid)" stroke-width="1"/>',
        f'  <line x1="{x0}" y1="{y0 + size // 2}" x2="{x0 + size}" y2="{y0 + size // 2}"'
        f' stroke="var(--rule-solid)" stroke-width="1"/>',
        f'  <text x="{x0 + size // 2}" y="{y0 - 16}" fill="var(--muted)" font-size="12"'
        f' font-family="var(--font-mono)" text-anchor="middle"'
        f' letter-spacing="0.16em">HIGH MARGIN</text>',
        f'  <text x="{x0 + size // 2}" y="{y0 + size + 28}" fill="var(--muted)"'
        f' font-size="12" font-family="var(--font-mono)" text-anchor="middle"'
        f' letter-spacing="0.16em">LOW MARGIN</text>',
        f'  <text x="{x0 - 16}" y="{y0 + size // 2}" fill="var(--muted)" font-size="12"'
        f' font-family="var(--font-mono)" text-anchor="end">ONE-OFF</text>',
        f'  <text x="{x0 + size + 16}" y="{y0 + size // 2}" fill="var(--muted)"'
        f' font-size="12" font-family="var(--font-mono)">REPEATABLE</text>',
    ]
    ly = y0 + size + 64
    for i, (name, fx, fy, cat, rx, dash) in enumerate(items, start=1):
        cx, cy = snap(x0 + fx * size), snap(y0 + fy * size)
        d = f' stroke-dasharray="{dash}"' if dash else ""
        lines.append(
            f'  <g data-node="{i}">'
            f'<rect x="{cx - 10}" y="{cy - 10}" width="20" height="20" rx="{rx}"'
            f' fill="var(--paper)" stroke="var(--{cat})" stroke-width="2"{d}/>'
            f'<text x="{cx}" y="{cy + 34}" fill="var(--ink)" font-size="12"'
            f' font-weight="600" font-family="var(--font-sans)"'
            f' text-anchor="middle">{name}</text></g>'
        )
    lines.append(
        f'  <line x1="96" y1="{ly - 16}" x2="464" y2="{ly - 16}" stroke="var(--rule)"'
        f' stroke-width="1"/>'
        f'<text x="96" y="{ly + 4}" fill="var(--muted)" font-size="12"'
        f' font-family="var(--font-mono)">Shape = service line.</text>'
        f'<text x="96" y="{ly + 24}" fill="var(--muted)" font-size="12"'
        f' font-family="var(--font-mono)">Position = margin x repeatability.</text>'
    )
    lines.append("</svg>")

    alt = """<p><strong>What it shows.</strong> Four Chykalophia service lines
plotted by margin (vertical) against how repeatable delivery is (horizontal).</p>
<p><strong>Reading order.</strong> Top-right quadrant first &mdash; high margin,
repeatable &mdash; then clockwise.</p>
<ol>
<li><strong>Retainer SEO</strong> &mdash; high margin, repeatable. The quadrant you want more of.</li>
<li><strong>Brand sprint</strong> &mdash; high margin, one-off. Good money, no compounding.</li>
<li><strong>Platform build</strong> &mdash; low margin, repeatable. Volume work; margin is the problem, not demand.</li>
<li><strong>One-off audit</strong> &mdash; low margin, one-off. The quadrant to price out of or productise.</li>
</ol>
<p><strong>Encoding.</strong> Position carries the meaning. Marker shape (square,
rounded, double, dashed) repeats the service-line identity so the chart survives
greyscale printing.</p>"""
    return "\n".join(lines), alt


def timeline(slug: str) -> tuple[str, str]:
    events = [
        ("Q1", "Discovery", "2 weeks"),
        ("Q2", "Build", "8 weeks"),
        ("Q3", "Launch", "1 week"),
        ("Q4", "Retainer", "ongoing"),
    ]
    y = 120
    x0, step = 88, 176
    lines = [
        '<svg viewBox="0 0 784 256" data-render-width="784" role="img"',
        f'     aria-labelledby="{slug}-title {slug}-desc"',
        '     xmlns="http://www.w3.org/2000/svg">',
        f'  <title id="{slug}-title">Engagement phases</title>',
        f'  <desc id="{slug}-desc">A four-phase engagement running from a two-week'
        f' discovery through an eight-week build and a one-week launch into an'
        f' ongoing retainer.</desc>',
        defs(slug),
        '  <rect width="100%" height="100%" fill="var(--paper)"/>',
        f'  <line x1="{x0}" y1="{y}" x2="{x0 + 3 * step + 24}" y2="{y}"'
        f' stroke="var(--rule-solid)" stroke-width="1.2"/>',
    ]
    for i, (tag, name, dur) in enumerate(events):
        cx = x0 + i * step
        focal = name == "Launch"
        rx = [0, 5, 10, 0][i]
        cat = ["cat-1", "cat-2", "cat-3", "cat-4"][i]
        stroke = "var(--accent)" if focal else f"var(--{cat})"
        dash = ' stroke-dasharray="4,3"' if i == 3 else ""
        lines.append(
            f'  <g data-node="{i + 1}">'
            f'<rect x="{cx - 10}" y="{y - 10}" width="20" height="20" rx="{rx}"'
            f' fill="var(--paper)" stroke="{stroke}" stroke-width="2"{dash}/>'
            f'<text x="{cx}" y="{y - 32}" fill="var(--muted)" font-size="12"'
            f' font-family="var(--font-mono)" text-anchor="middle"'
            f' letter-spacing="0.16em">{tag}</text>'
            f'<text x="{cx}" y="{y + 40}" fill="var(--ink)" font-size="16"'
            f' font-weight="600" font-family="var(--font-sans)"'
            f' text-anchor="middle">{name}</text>'
            f'<text x="{cx}" y="{y + 60}" fill="var(--muted)" font-size="12"'
            f' font-family="var(--font-mono)" text-anchor="middle">{dur}</text></g>'
        )
    lines.append(
        f'  <line x1="88" y1="208" x2="712" y2="208" stroke="var(--rule)"'
        f' stroke-width="1"/>'
        f'<text x="88" y="228" fill="var(--muted)" font-size="12"'
        f' font-family="var(--font-mono)">Dashed marker = open-ended.'
        f' Accent = the phase with the hard external date.</text>'
    )
    lines.append("</svg>")

    alt = """<p><strong>What it shows.</strong> The four phases of a standard
engagement and how long each runs.</p>
<p><strong>Reading order.</strong> Left to right, Q1 through Q4.</p>
<ol>
<li><strong>Discovery</strong> (Q1, two weeks) &mdash; scoping and access.</li>
<li><strong>Build</strong> (Q2, eight weeks) &mdash; the bulk of delivery.</li>
<li><strong>Launch</strong> (Q3, one week) &mdash; highlighted, because it is the
only phase with a hard external date and therefore the only one that cannot absorb slip.</li>
<li><strong>Retainer</strong> (Q4, ongoing) &mdash; dashed marker: open-ended, no fixed end.</li>
</ol>"""
    return "\n".join(lines), alt


BUILDERS = {
    "architecture": (architecture, "Lead intake pipeline", "ARCHITECTURE"),
    "quadrant": (quadrant, "Service line positioning", "QUADRANT"),
    "timeline": (timeline, "Engagement phases", "TIMELINE"),
}


def font_link(brand: dict) -> str:
    """The brand file's own webfont <link>, or nothing if it uses system faces.

    Hardcoding this per slug is how every brand but one ends up rendering in
    someone else's typeface, so the brand file is the only source of truth.
    """
    return brand["font_link"]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--brand", required=True)
    ap.add_argument("--mode", default="light", choices=["light", "dark"])
    ap.add_argument("--out", type=Path, default=ROOT / "out")
    ap.add_argument("--types", nargs="*", default=list(BUILDERS))
    args = ap.parse_args()

    try:
        slug = brand_tokens.resolve_slug(args.brand)
        brand = brand_tokens.load(slug)
    except brand_tokens.BrandError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    problems = brand_tokens.validate(brand, args.mode)
    if problems:
        print(f"REFUSED — will not render '{args.brand}':", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1

    # to_css already emits --font-* from the brand's Typography table.
    css = brand_tokens.to_css(brand, args.mode)

    args.out.mkdir(parents=True, exist_ok=True)
    written = []
    for name in args.types:
        builder, title, eyebrow = BUILDERS[name]
        file_slug = f"{name}-{slug.strip('_')}-{args.mode}"
        svg, alt = builder(file_slug)
        html = shell(
            file_slug,
            title,
            f"{brand['label'].upper()} &middot; {eyebrow}",
            css,
            svg,
            alt,
            font_link(brand),
        )
        path = args.out / f"{file_slug}.html"
        path.write_text(html, encoding="utf-8")
        written.append(path)

    for p in written:
        print(f"wrote {p}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
