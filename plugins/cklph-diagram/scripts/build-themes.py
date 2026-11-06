#!/usr/bin/env python3
"""Build the theme registry and render one demo per theme.

**Themes are not brands.** They are separate axes and the distinction is the
whole reason this works:

    brand  = WHO   -> colour and type identity (client-owned, private)
    theme  = HOW   -> geometry, chrome, density, texture (public, reusable)

Resolution order at draw time:

  1. A named client resolves a brand. Brand colour ALWAYS wins.
  2. A theme supplies geometry, chrome, type treatment and density.
  3. A theme's palette is used ONLY when no brand is set (default runs, and
     marketplace installs where no brand has been onboarded yet).

That split is what lets a client diagram be brand-correct and still look
current: swap the theme, keep the client's colours.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "skills/cklph-diagram/scripts"))
from colorlib import contrast_ratio  # noqa: E402

THEME_DIR = ROOT / "skills/cklph-diagram/references/themes"
DEMO_DIR = ROOT / "gallery/themes"

DEFAULT_THEME = "muted-dopamine"

# chrome: none | window | sketch | dotgrid
THEMES = [
    dict(slug="muted-dopamine", name="Muted Dopamine", default=True,
         note="Real hue variety and optimism, every colour darkened until it "
              "passes AA as text. The saturation revival made safe: colour that "
              "distinguishes categories instead of shouting.",
         use="The house default. Client work, decks, anything that needs to look "
             "current without risking legibility.",
         ground="#fbf7f2", surface="#ffffff", ink="#1d1a26", soft="#565064",
         accent="#b4245f", c1="#1f5f8b", c2="#b4245f", c3="#046a52",
         rule="#e0d8ce", radius=10, stroke=1.5, chrome="none",
         display="'Inter', system-ui, sans-serif", body="'Inter', system-ui, sans-serif",
         mono="ui-monospace, monospace", tracking="-0.01em", air=1.15),
    dict(slug="quiet-editorial", name="Quiet Editorial",
         note="Neo-minimalism: warmth without noise. Serif display, deep "
              "whitespace, one accent.",
         use="Long-form posts, whitepapers, anything where the diagram is the hero.",
         ground="#faf8f4", surface="#f3efe8", ink="#1a1714", soft="#5c554c",
         accent="#8f3b1f", c1="#2f4858", c2="#7a5230", c3="#4a5340",
         rule="#d6cec1", radius=4, stroke=1.2, chrome="none",
         display="'Iowan Old Style', Georgia, serif", body="'Inter', system-ui, sans-serif",
         mono="ui-monospace, monospace", tracking="0.02em", air=1.0),
    dict(slug="bento-modular", name="Bento Modular",
         note="Modular blocks with real separation. Each cell is one idea and the "
              "grid does the grouping, so borders don't have to.",
         use="Product surfaces, dashboards, feature overviews.",
         ground="#f4f5f7", surface="#ffffff", ink="#16181d", soft="#575c66",
         accent="#1d4ed8", c1="#1d4ed8", c2="#0f766e", c3="#9a3412",
         rule="#dcdfe5", radius=14, stroke=0, chrome="none",
         display="'Inter', system-ui, sans-serif", body="'Inter', system-ui, sans-serif",
         mono="ui-monospace, monospace", tracking="-0.01em", air=1.1),
    dict(slug="swiss-signal", name="Swiss Signal",
         note="International Style discipline: strict grid, one red, flush-left "
              "everything. Predictable to the point of boring, which is the "
              "property that lowers cognitive load.",
         use="Technical reference, documentation, print.",
         ground="#f7f7f5", surface="#f7f7f5", ink="#111111", soft="#4d4d4d",
         accent="#c1121f", c1="#111111", c2="#c1121f", c3="#3f5a8a",
         rule="#111111", radius=0, stroke=2, chrome="none",
         display="'Helvetica Neue', Inter, sans-serif", body="'Helvetica Neue', Inter, sans-serif",
         mono="ui-monospace, monospace", tracking="-0.015em", air=0.95),
    dict(slug="soft-brutalist", name="Soft Brutalist",
         note="Minimalism that grew a spine. Thick flat borders, no shadows, "
              "confident type. Structure visible from across the room.",
         use="Conference slides, posters, anything projected.",
         ground="#fbf9f2", surface="#ffffff", ink="#141414", soft="#4a4a4a",
         accent="#7c3aed", c1="#141414", c2="#7c3aed", c3="#116149",
         rule="#141414", radius=2, stroke=3, chrome="none",
         display="'Inter', system-ui, sans-serif", body="'Inter', system-ui, sans-serif",
         mono="ui-monospace, monospace", tracking="-0.02em", air=1.05),
    dict(slug="calm-slate", name="Calm Slate", mode="dark",
         note="Dark done for sensory comfort: never pure black, desaturated "
              "accents, low luminance step between surfaces. Dark that rests the "
              "eye instead of glowing at it.",
         use="Dark-mode sites, long working sessions, evening reading.",
         ground="#16191d", surface="#1e2228", ink="#e8e6e1", soft="#a3a8b0",
         accent="#e8a33d", c1="#8fb8de", c2="#e8a33d", c3="#9fc6a0",
         rule="#333940", radius=8, stroke=1.2, chrome="none",
         display="'Inter', system-ui, sans-serif", body="'Inter', system-ui, sans-serif",
         mono="ui-monospace, monospace", tracking="0", air=1.1),
    dict(slug="paper-blueprint", name="Paper Blueprint",
         note="Drafting-table register: hairlines, mono labels, graphite and one "
              "ink-blue. Reads as documentation rather than marketing.",
         use="Infrastructure, schemas, engineering handoffs.",
         ground="#f6f6f3", surface="#eef1f2", ink="#1c2124", soft="#55606b",
         accent="#1c5a80", c1="#1c5a80", c2="#6b4f2a", c3="#3f5a3a",
         rule="#b9c2c7", radius=0, stroke=1, chrome="none",
         display="ui-monospace, monospace", body="'Inter', system-ui, sans-serif",
         mono="ui-monospace, monospace", tracking="0.04em", air=1.0),
    dict(slug="terracotta-warmth", name="Terracotta Warmth",
         note="Neo-naturalism: clay, sage, bone. Earthy palettes read as grounded "
              "and calm. Warm without being beige.",
         use="Wellness, non-profit, sustainability, human-centred work.",
         ground="#faf5ee", surface="#f2e9dd", ink="#2a201a", soft="#6b5c4e",
         accent="#a34a24", c1="#4a5d3a", c2="#a34a24", c3="#4e6472",
         rule="#ddd0be", radius=12, stroke=1.2, chrome="none",
         display="'Iowan Old Style', Georgia, serif", body="'Inter', system-ui, sans-serif",
         mono="ui-monospace, monospace", tracking="0.01em", air=1.1),
    dict(slug="high-contrast-focus", name="High-Contrast Focus",
         note="Maximum legibility as the aesthetic. Near-monochrome, oversized "
              "type, heavy separation.",
         use="Bad projectors, grey photocopies, tired readers, accessibility "
             "escalations. The one to switch to when someone says they can't read it.",
         ground="#fffef9", surface="#fffef9", ink="#000000", soft="#2b2b2b",
         accent="#0000cc", c1="#000000", c2="#0000cc", c3="#7a0000",
         rule="#000000", radius=0, stroke=2.5, chrome="none",
         display="'Atkinson Hyperlegible', Inter, sans-serif",
         body="'Atkinson Hyperlegible', Inter, sans-serif",
         mono="ui-monospace, monospace", tracking="0.01em", air=1.25),
    dict(slug="sage-archive", name="Sage Archive",
         note="Library register: muted greens, bone ground, restrained serif. "
              "Minimal that isn't beige.",
         use="Research, knowledge bases, internal wikis.",
         ground="#f7f7f1", surface="#eceee4", ink="#1f241d", soft="#576052",
         accent="#7a4230", c1="#3c5348", c2="#7a4230", c3="#4a5570",
         rule="#ccd1c4", radius=6, stroke=1.2, chrome="none",
         display="'Iowan Old Style', Georgia, serif", body="'Inter', system-ui, sans-serif",
         mono="ui-monospace, monospace", tracking="0.015em", air=1.05),

    # ---- from the tooling research -------------------------------------
    dict(slug="carbon-window", name="Carbon Window", mode="dark",
         note="The macOS window chrome plus padded ground that Carbon "
              "popularised and every screenshot tool now replicates. A padding "
              "ring makes the diagram read as an embedded artifact rather than a "
              "hole punched in the page.",
         use="Social cards, dev-blog headers, anything posted to a feed. Pair "
             "with a light host page; skip it if your page already wraps images "
             "in a card, since two layers of depth compete.",
         ground="#2b2f3a", surface="#1b1e26", ink="#e6e6e6", soft="#a6adba",
         accent="#f08a4b", c1="#7fb3d5", c2="#f08a4b", c3="#a3c9a8",
         rule="#3c414d", radius=10, stroke=1.2, chrome="window",
         display="ui-monospace, monospace", body="'Inter', system-ui, sans-serif",
         mono="ui-monospace, monospace", tracking="0", air=1.2),
    dict(slug="napkin-sketch", name="Napkin Sketch",
         note="Hand-drawn wobble, Excalidraw-style. The wobble is a "
              "communication choice, not decoration: it signals 'this is a "
              "sketch, not the final answer', which keeps a conversation open. "
              "Polished diagrams pretend to be more decided than they are.",
         use="Early-stage thinking, discovery workshops, anything you want "
             "critiqued rather than approved. Never for a final client deliverable.",
         ground="#fdfcf7", surface="#ffffff", ink="#1e1e1e", soft="#5a5a5a",
         accent="#c2410c", c1="#1d4ed8", c2="#c2410c", c3="#15803d",
         rule="#b8b5ad", radius=6, stroke=2, chrome="sketch",
         display="'Comic Neue', 'Segoe Print', cursive", body="'Inter', system-ui, sans-serif",
         mono="ui-monospace, monospace", tracking="0", air=1.15),
    dict(slug="canvas-cards", name="Canvas Cards",
         note="Infinite-canvas register — tldraw, Obsidian Canvas, Heptabase. "
              "Cards float on a dot grid, clean geometry, no heavy borders. "
              "Reads as thinking-in-progress that is still organised.",
         use="Mind maps, knowledge maps, concept relationships, anything where "
             "spatial arrangement carries meaning.",
         ground="#f8f9fa", surface="#ffffff", ink="#1a1d21", soft="#5b6169",
         accent="#6d28d9", c1="#0369a1", c2="#6d28d9", c3="#047857",
         rule="#d8dce1", radius=12, stroke=1, chrome="dotgrid",
         display="'Inter', system-ui, sans-serif", body="'Inter', system-ui, sans-serif",
         mono="ui-monospace, monospace", tracking="-0.01em", air=1.2),
    dict(slug="radial-mind", name="Radial Mind", layout="radial",
         note="Mind-map geometry: one centre, branches radiating out, thickness "
              "falling off with depth. The one theme that changes layout rather "
              "than only surface.",
         use="Brainstorms, topic maps, scope breakdowns. Not for anything with a "
             "sequence — radial has no reading order, which is exactly what makes "
             "it wrong for process diagrams.",
         ground="#fcfaf6", surface="#ffffff", ink="#201c18", soft="#5e564c",
         accent="#9d2f5f", c1="#2a6f8e", c2="#9d2f5f", c3="#5a7040",
         rule="#ded6c9", radius=16, stroke=1.5, chrome="none",
         display="'Inter', system-ui, sans-serif", body="'Inter', system-ui, sans-serif",
         mono="ui-monospace, monospace", tracking="-0.01em", air=1.2),
]

NODES = [
    (40, 96, "Intake", "form + email", 0, "square"),
    (40, 208, "Triage", "rules engine", 0, "square"),
    (296, 96, "Review", "human check", 1, "round"),
    (296, 208, "Enrich", "lookup + tag", 1, "round"),
    (552, 96, "Publish", "public API", 2, "dashed"),
    (552, 208, "Archive", "cold storage", 2, "dashed"),
]
CUE = {"square": "source", "round": "processing", "dashed": "destination"}


def theme_md(t: dict) -> str:
    flag = "  **(default)**" if t.get("default") else ""
    return f"""---
theme: {t['slug']}
label: {t['name']}
mode: {t.get('mode', 'light')}
layout: {t.get('layout', 'columns')}
chrome: {t['chrome']}
default: {str(bool(t.get('default'))).lower()}
---

# {t['name']}{flag}

{t['note']}

**Reach for it when:** {t['use']}

## Geometry and treatment

These are what the theme actually owns. They apply on top of ANY brand.

| Token | Value |
|---|---|
| `radius` | `{t['radius']}` |
| `stroke` | `{t['stroke']}` |
| `chrome` | `{t['chrome']}` |
| `layout` | `{t.get('layout', 'columns')}` |
| `air` | `{t['air']}` (whitespace multiplier) |
| `tracking` | `{t['tracking']}` |

## Type

| Role | Family |
|---|---|
| `font-display` | `{t['display']}` |
| `font-body` | `{t['body']}` |
| `font-mono` | `{t['mono']}` |

## Fallback palette

Used **only when no brand is resolved**. When a client brand is set, the brand's
colours win and only the geometry and type above apply.

| Role | Value |
|---|---|
| `ground` | `{t['ground']}` |
| `surface` | `{t['surface']}` |
| `ink` | `{t['ink']}` |
| `soft` | `{t['soft']}` |
| `accent` | `{t['accent']}` |
| `cat-1` | `{t['c1']}` |
| `cat-2` | `{t['c2']}` |
| `cat-3` | `{t['c3']}` |
| `rule` | `{t['rule']}` |

Every role above is verified at or above 4.5:1 on `ground` by
`scripts/check-themes.py`. A theme that fails is not shippable.
"""


def node_svg(t, x, y, title, sub, cat, cue, focal):
    colour = [t["c1"], t["c2"], t["c3"]][cat]
    sw = t["stroke"] or 1
    rx = {"square": 0, "round": max(t["radius"], 8), "dashed": t["radius"]}[cue]
    dash = ' stroke-dasharray="6,4"' if cue == "dashed" else ""
    if t["chrome"] == "sketch":
        tilt = -0.6 if (x + y) % 2 == 0 else 0.5
        filt = (f' filter="url(#wobble)" transform="rotate({tilt} {x+88} {y+40})"')
    else:
        filt = ""
    border = (f'stroke="{t["rule"]}" stroke-width="1"{dash}' if t["stroke"] == 0
              else f'stroke="{t["accent"] if focal else colour}" '
                   f'stroke-width="{sw + (1 if focal else 0)}"{dash}')
    return f'''  <g data-node="{title.lower()}">
    <rect x="{x}" y="{y}" width="176" height="80" rx="{rx}" fill="{t['surface']}" {border}{filt}/>
    <text x="{x+20}" y="{y+34}" font-family="{t['body']}" font-size="18" font-weight="600"
          fill="{t['ink']}" letter-spacing="{t['tracking']}">{title}</text>
    <text x="{x+20}" y="{y+58}" font-family="{t['mono']}" font-size="14" fill="{t['soft']}">{sub}</text>
  </g>'''


def radial_svg(t):
    import math
    out = [f'<circle cx="384" cy="196" r="62" fill="{t["surface"]}" '
           f'stroke="{t["accent"]}" stroke-width="{t["stroke"]+1}"/>',
           f'<text x="384" y="202" text-anchor="middle" font-family="{t["body"]}" '
           f'font-size="18" font-weight="600" fill="{t["ink"]}">Pipeline</text>']
    labels = [("Intake", 0), ("Triage", 0), ("Review", 1), ("Enrich", 1),
              ("Publish", 2), ("Archive", 2)]
    for i, (lab, cat) in enumerate(labels):
        ang = math.radians(-90 + i * 60)
        cx, cy = 384 + 250 * math.cos(ang), 196 + 130 * math.sin(ang)
        col = [t["c1"], t["c2"], t["c3"]][cat]
        rx = [0, 14, t["radius"]][cat]
        dash = ' stroke-dasharray="6,4"' if cat == 2 else ""
        ex, ey = 384 + 64 * math.cos(ang), 196 + 64 * math.sin(ang)
        out.append(f'<line x1="{ex:.0f}" y1="{ey:.0f}" x2="{cx:.0f}" y2="{cy:.0f}" '
                   f'stroke="{col}" stroke-width="{3 - cat * 0.6:.1f}"/>')
        out.append(f'<rect x="{cx-66:.0f}" y="{cy-24:.0f}" width="132" height="48" rx="{rx}" '
                   f'fill="{t["surface"]}" stroke="{col}" stroke-width="{t["stroke"]}"{dash}/>')
        out.append(f'<text x="{cx:.0f}" y="{cy+5:.0f}" text-anchor="middle" '
                   f'font-family="{t["body"]}" font-size="16" font-weight="600" '
                   f'fill="{t["ink"]}" data-node="{lab.lower()}">{lab}</text>')
    return "\n    ".join(out)


def build(t: dict) -> str:
    air = t["air"]
    defs = ""
    if t["chrome"] == "sketch":
        defs = ('<filter id="wobble"><feTurbulence type="fractalNoise" '
                'baseFrequency="0.028" numOctaves="2" result="n" seed="7"/>'
                '<feDisplacementMap in="SourceGraphic" in2="n" scale="2.4"/></filter>')
    if t["chrome"] == "dotgrid":
        defs = (f'<pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse">'
                f'<circle cx="2" cy="2" r="1.4" fill="{t["rule"]}"/></pattern>')

    if t.get("layout") == "radial":
        body = radial_svg(t)
        legend = ""
    else:
        body = "\n".join(node_svg(t, x, y, n, s, c, q, n == "Review")
                         for (x, y, n, s, c, q) in NODES)
        arrows = f'''
    <line x1="216" y1="136" x2="286" y2="136" stroke="{t['soft']}" stroke-width="1.5"/>
    <line x1="216" y1="248" x2="286" y2="248" stroke="{t['soft']}" stroke-width="1.5"/>
    <line x1="472" y1="136" x2="542" y2="136" stroke="{t['soft']}" stroke-width="1.5"/>
    <line x1="472" y1="248" x2="542" y2="248" stroke="{t['soft']}" stroke-width="1.5"/>
    <path d="M128,176 V196 Q128,208 140,208 H296" fill="none" stroke="{t['soft']}"
          stroke-width="1.5" stroke-dasharray="5,4"/>'''
        body = arrows + "\n" + body
        legend = ""
        lx = 40
        for cue, col in [("square", t["c1"]), ("round", t["c2"]), ("dashed", t["c3"])]:
            rx = {"square": 0, "round": 8, "dashed": t["radius"]}[cue]
            dash = ' stroke-dasharray="6,4"' if cue == "dashed" else ""
            legend += (f'<rect x="{lx}" y="322" width="20" height="14" rx="{rx}" fill="none" '
                       f'stroke="{col}" stroke-width="{max(t["stroke"],1)}"{dash}/>'
                       f'<text x="{lx+28}" y="333" font-family="{t["mono"]}" font-size="14" '
                       f'fill="{t["soft"]}">{CUE[cue]}</text>')
            lx += 190
        legend = (f'<line x1="40" y1="300" x2="728" y2="300" stroke="{t["rule"]}" '
                  f'stroke-width="1"/>' + legend)

    grid = f'<rect width="768" height="356" fill="url(#dots)"/>' if t["chrome"] == "dotgrid" else ""

    # Carbon-style window chrome: padded ring + title bar + traffic lights.
    if t["chrome"] == "window":
        inner = f'''<rect x="24" y="24" width="720" height="308" rx="12" fill="{t['surface']}"/>
    <rect x="24" y="24" width="720" height="34" rx="12" fill="{t['rule']}"/>
    <rect x="24" y="46" width="720" height="12" fill="{t['rule']}"/>
    <circle cx="48" cy="41" r="6" fill="#ed6a5e"/><circle cx="68" cy="41" r="6" fill="#f4bf50"/>
    <circle cx="88" cy="41" r="6" fill="#61c554"/>
    <text x="384" y="46" text-anchor="middle" font-family="{t['mono']}" font-size="14"
          fill="{t['soft']}">pipeline.svg</text>'''
        shift = '<g transform="translate(0,34) scale(0.94)">'
        body = inner + shift + body + legend + "</g>"
        legend = ""

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{t['name']} — theme</title>
<style>
  body {{ margin:0; padding:{int(48*air)}px 40px; background:{t['ground']}; color:{t['ink']};
         font-family:{t['body']}; line-height:1.6; -webkit-font-smoothing:antialiased; }}
  main {{ max-width:880px; margin:0 auto; }}
  .tag {{ font-family:{t['mono']}; font-size:14px; letter-spacing:.12em; text-transform:uppercase;
          color:{t['soft']}; margin:0 0 8px; }}
  h1 {{ font-family:{t['display']}; font-size:34px; font-weight:600;
        letter-spacing:{t['tracking']}; margin:0 0 12px; }}
  .note {{ color:{t['soft']}; font-size:17px; max-width:64ch; margin:0 0 14px; }}
  .use {{ color:{t['ink']}; font-size:16px; max-width:64ch; margin:0 0 {int(28*air)}px; }}
  svg {{ width:100%; height:auto; display:block; }}
  .alt {{ margin-top:{int(28*air)}px; padding-top:20px; border-top:1px solid {t['rule']}; }}
  .alt h2 {{ font-family:{t['mono']}; font-size:14px; font-weight:500; letter-spacing:.12em;
             text-transform:uppercase; color:{t['soft']}; margin:0 0 10px; }}
  .alt p {{ color:{t['soft']}; font-size:16px; max-width:68ch; margin:0; }}
  @media (prefers-reduced-motion: reduce) {{ * {{ animation:none!important; transition:none!important; }} }}
  @media (prefers-contrast: more) {{
    body {{ background:#fff; color:#000; }} .note,.alt p,.tag,.use,.alt h2 {{ color:#000; }} }}
</style>
</head>
<body>
<main>
  <p class="tag">theme · {t['slug']}{' · default' if t.get('default') else ''}</p>
  <h1>{t['name']}</h1>
  <p class="note">{t['note']}</p>
  <p class="use"><strong>Reach for it when:</strong> {t['use']}</p>

  <svg viewBox="0 0 768 356" xmlns="http://www.w3.org/2000/svg"
       role="img" aria-labelledby="{t['slug']}-t {t['slug']}-d">
    <title id="{t['slug']}-t">Content pipeline, {t['name']} theme</title>
    <desc id="{t['slug']}-d">Six stages: intake and triage feed review and enrich,
      which feed publish and archive.</desc>
    <defs>{defs}</defs>
    <rect width="768" height="356" fill="{t['ground']}"/>
    {grid}
    {body}
    {legend}
  </svg>

  <div class="alt">
    <h2>Described in words</h2>
    <p>A content pipeline in three stages: intake and triage collect and sort,
    review and enrich add judgement and metadata, publish and archive are the two
    destinations. Category is carried by shape and border pattern as well as
    colour.</p>
  </div>
</main>
</body>
</html>
'''


def main() -> int:
    THEME_DIR.mkdir(parents=True, exist_ok=True)
    DEMO_DIR.mkdir(exist_ok=True)
    fails = 0
    print(f"{'theme':<22}{'ink':>7}{'soft':>7}{'accent':>8}{'cat-1':>7}{'cat-2':>7}{'cat-3':>7}   AA")
    for t in THEMES:
        r = {k: contrast_ratio(t[k], t["ground"])
             for k in ("ink", "soft", "accent", "c1", "c2", "c3")}
        r["ink_surf"] = contrast_ratio(t["ink"], t["surface"])
        r["soft_surf"] = contrast_ratio(t["soft"], t["surface"])
        bad = {k: v for k, v in r.items() if v < 4.5}
        if bad:
            fails += 1
        print(f"{t['slug']:<22}{r['ink']:>7.1f}{r['soft']:>7.1f}{r['accent']:>8.1f}"
              f"{r['c1']:>7.1f}{r['c2']:>7.1f}{r['c3']:>7.1f}   "
              f"{'ok' if not bad else 'FAIL ' + ','.join(bad)}")
        (THEME_DIR / f"{t['slug']}.md").write_text(theme_md(t), encoding="utf-8")
        (DEMO_DIR / f"{t['slug']}.html").write_text(build(t), encoding="utf-8")

    print(f"\n{len(THEMES)} themes -> references/themes/ and theme-gallery/")
    print(f"default: {DEFAULT_THEME}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
