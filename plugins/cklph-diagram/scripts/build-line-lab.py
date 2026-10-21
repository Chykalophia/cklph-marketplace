#!/usr/bin/env python3
"""Demo 22 — the line lab.

Thirty-four connector treatments, grouped by what the technique actually does
rather than by how it looks. Every one is drawn on the same 200px span so they
can be compared honestly.

Groups:
  A  weight and taper      -- thickness as emphasis and as direction
  B  gradient              -- colour ramp along the path; direction without an arrowhead
  C  dash vocabulary       -- pattern as semantics, not decoration
  D  depth, glow, shadow   -- lift a line off the page (dark band where glow belongs)
  E  composition           -- lines built from more than one stroke
  F  geometry              -- the shape of the route itself

Two rules hold across all of them:

  * A line's meaning must survive greyscale. Where colour carries meaning, a
    dash pattern, weight or terminal shape carries it too.
  * Glow and neon only work on a dark ground. They are shown there rather than
    faked on white, because a glow on a light background is just a blurry line.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "skills/cklph-diagram/scripts"))
from colorlib import contrast_ratio  # noqa: E402

OUT = ROOT / "gallery/ui"
G, INK, SOFT = "#faf8f4", "#191621", "#57505f"
ACC, BLUE, GREEN, GOLD, PLUM, TEAL = "#b4245f", "#1f5f8b", "#046a52", "#8a5a12", "#5b3a7e", "#0d6e7a"
DARK = "#101820"

W, COLS = 1120, 4
CELL, ROW = 268, 118
L = 200  # span every specimen is drawn across

DEFS = f"""
<linearGradient id="lg-duo" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="200" y2="0">
  <stop offset="0" stop-color="{BLUE}"/><stop offset="1" stop-color="{GREEN}"/></linearGradient>
<linearGradient id="lg-fade" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="200" y2="0">
  <stop offset="0" stop-color="{ACC}" stop-opacity="1"/>
  <stop offset="1" stop-color="{ACC}" stop-opacity="0.08"/></linearGradient>
<linearGradient id="lg-ghost" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="200" y2="0">
  <stop offset="0" stop-color="{PLUM}" stop-opacity="0"/>
  <stop offset="0.5" stop-color="{PLUM}" stop-opacity="1"/>
  <stop offset="1" stop-color="{PLUM}" stop-opacity="0"/></linearGradient>
<linearGradient id="lg-spec" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="200" y2="0">
  <stop offset="0" stop-color="{BLUE}"/><stop offset="0.35" stop-color="{TEAL}"/>
  <stop offset="0.7" stop-color="{GOLD}"/><stop offset="1" stop-color="{ACC}"/></linearGradient>
<linearGradient id="lg-taper" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="200" y2="0">
  <stop offset="0" stop-color="{TEAL}"/><stop offset="1" stop-color="{TEAL}" stop-opacity=".25"/>
</linearGradient>
<linearGradient id="lg-neon" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="200" y2="0">
  <stop offset="0" stop-color="#5fd4c4"/><stop offset="1" stop-color="#7aa8ff"/></linearGradient>
<linearGradient id="lg-emboss" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#ffffff" stop-opacity=".9"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".25"/></linearGradient>
<filter id="b2"><feGaussianBlur stdDeviation="2"/></filter>
<filter id="b4"><feGaussianBlur stdDeviation="4"/></filter>
<filter id="b7"><feGaussianBlur stdDeviation="7"/></filter>
<marker id="ar" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
  <polygon points="0 0, 9 3.5, 0 7" fill="{INK}"/></marker>
<marker id="arw" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
  <polygon points="0 0, 9 3.5, 0 7" fill="#dfe9ef"/></marker>
"""


# --- specimen renderers: each draws across x=0..200 at y=0 --------------
def S(mk, name, use, dark=False):
    return (name, use, mk, dark)


SPECS = [
    # ---------------- A. weight and taper
    ("HEADER", "A · WEIGHT AND TAPER", "thickness as emphasis, and as direction", None, False),
    S(f'<line x1="0" y1="0" x2="{L}" y2="0" stroke="{INK}" stroke-width="0.8"/>',
      "hairline 0.8", "background relations; never for the main path"),
    S(f'<line x1="0" y1="0" x2="{L}" y2="0" stroke="{INK}" stroke-width="2" marker-end="url(#ar)"/>',
      "standard 2.0", "the default; everything else is a deviation"),
    S(f'<line x1="0" y1="0" x2="{L}" y2="0" stroke="{INK}" stroke-width="5" stroke-linecap="round"/>',
      "heavy 5.0", "the one path that matters on the page"),
    S(f'<path d="M0,-4 Q100,-1.5 {L},-0.6 Q100,1.5 0,4 Z" fill="{TEAL}"/>',
      "tapered", "direction without an arrowhead; thick end is the source"),
    S(f'<path d="M0,-1 Q100,-6 {L},-1 Q100,6 0,1 Z" fill="{PLUM}"/>',
      "spindle", "volume peaking mid-route; rare, but reads instantly"),
    S(f'<line x1="0" y1="0" x2="{L}" y2="0" stroke="{INK}" stroke-width="6"/>'
      f'<line x1="0" y1="0" x2="{L}" y2="0" stroke="{G}" stroke-width="2.4"/>',
      "cased / outlined", "survives crossing a busy field; the case is a moat"),

    # ---------------- B. gradient
    ("HEADER", "B · GRADIENT", "colour ramp along the path", None, False),
    S(f'<line x1="0" y1="0" x2="{L}" y2="0" stroke="url(#lg-duo)" stroke-width="3.5" stroke-linecap="round"/>',
      "two-tone", "hand-off between two owners or two systems"),
    S(f'<line x1="0" y1="0" x2="{L}" y2="0" stroke="url(#lg-fade)" stroke-width="5" stroke-linecap="round"/>',
      "fade out", "direction with no marker; never label the faded end"),
    S(f'<line x1="0" y1="0" x2="{L}" y2="0" stroke="url(#lg-ghost)" stroke-width="3.5"/>',
      "ghost ends", "a path continuing beyond the frame"),
    S(f'<line x1="0" y1="0" x2="{L}" y2="0" stroke="url(#lg-spec)" stroke-width="6" stroke-linecap="round"/>',
      "multi-stop", "stages along one route; needs a legend or it is decoration"),
    S(f'<path d="M0,-4.5 Q100,-2 {L},-0.6 Q100,2 0,4.5 Z" fill="url(#lg-taper)"/>',
      "gradient + taper", "two direction cues at once; the most legible of the set"),
    S(f'<line x1="0" y1="0" x2="{L}" y2="0" stroke="url(#lg-duo)" stroke-width="11" opacity=".18"/>'
      f'<line x1="0" y1="0" x2="{L}" y2="0" stroke="url(#lg-duo)" stroke-width="3" stroke-linecap="round"/>',
      "gradient + halo", "keeps a thin gradient visible on a busy ground"),

    # ---------------- C. dash vocabulary
    ("HEADER", "C · DASH VOCABULARY", "pattern as semantics, not decoration", None, False),
    S(f'<line x1="0" y1="0" x2="{L}" y2="0" stroke="{INK}" stroke-width="2" stroke-dasharray="10,6" marker-end="url(#ar)"/>',
      "dashed", "planned, optional, or not yet built"),
    S(f'<line x1="0" y1="0" x2="{L}" y2="0" stroke="{INK}" stroke-width="2.6" stroke-dasharray="0.1,8" stroke-linecap="round"/>',
      "dotted", "weak or inferred relation"),
    S(f'<line x1="0" y1="0" x2="{L}" y2="0" stroke="{INK}" stroke-width="2" stroke-dasharray="14,5,2,5"/>',
      "dash-dot", "boundary or trust edge; borrowed from drafting"),
    S(f'<line x1="0" y1="0" x2="{L}" y2="0" stroke="{BLUE}" stroke-width="2.4" stroke-dasharray="2,4,6,4,12,4,20,4"/>',
      "graduated dash", "dashes lengthen downstream — direction, no marker"),
    S(f'<line x1="0" y1="0" x2="{L}" y2="0" stroke="{SOFT}" stroke-width="5" opacity=".35"/>'
      f'<line x1="0" y1="0" x2="{L}" y2="0" stroke="{ACC}" stroke-width="2" stroke-dasharray="9,6"/>',
      "planned over actual", "two states on one route; the classic migration line"),
    S(f'<line x1="0" y1="-2.5" x2="{L}" y2="-2.5" stroke="{GREEN}" stroke-width="2"/>'
      f'<line x1="0" y1="2.5" x2="{L}" y2="2.5" stroke="{GREEN}" stroke-width="2" stroke-dasharray="8,5"/>',
      "solid + dashed pair", "bidirectional where the return leg is conditional"),

    # ---------------- D. depth, glow, shadow  (dark band)
    ("HEADER", "D · DEPTH, GLOW, SHADOW", "lifting a line off the ground", None, True),
    S(f'<line x1="2" y1="4" x2="{L+2}" y2="4" stroke="#000" stroke-width="4" opacity=".45" filter="url(#b2)"/>'
      f'<line x1="0" y1="0" x2="{L}" y2="0" stroke="#dfe9ef" stroke-width="3.5" marker-end="url(#arw)"/>',
      "cast shadow", "one lifted path above others; separation only, never meaning", True),
    S(f'<line x1="0" y1="0" x2="{L}" y2="0" stroke="#5fd4c4" stroke-width="12" opacity=".22" filter="url(#b4)"/>'
      f'<line x1="0" y1="0" x2="{L}" y2="0" stroke="#5fd4c4" stroke-width="2.5"/>',
      "soft halo", "the honest version of glow — blur under, crisp core", True),
    S(f'<line x1="0" y1="0" x2="{L}" y2="0" stroke="#7aa8ff" stroke-width="16" opacity=".18" filter="url(#b7)"/>'
      f'<line x1="0" y1="0" x2="{L}" y2="0" stroke="#7aa8ff" stroke-width="7" opacity=".35" filter="url(#b2)"/>'
      f'<line x1="0" y1="0" x2="{L}" y2="0" stroke="#eaf2ff" stroke-width="2"/>',
      "neon (3-layer)", "wide dim, mid soft, white-hot core. Dark grounds only", True),
    S(f'<line x1="0" y1="0" x2="{L}" y2="0" stroke="url(#lg-neon)" stroke-width="10" opacity=".2" filter="url(#b4)"/>'
      f'<line x1="0" y1="0" x2="{L}" y2="0" stroke="url(#lg-neon)" stroke-width="3" stroke-linecap="round"/>',
      "gradient neon", "route identity plus lift, on one stroke", True),
    S(f'<line x1="0" y1="0" x2="{L}" y2="0" stroke="#2b3a45" stroke-width="7" stroke-linecap="round"/>'
      f'<line x1="0" y1="-1.4" x2="{L}" y2="-1.4" stroke="#8fa8b8" stroke-width="1.6" opacity=".8"/>'
      f'<line x1="0" y1="1.8" x2="{L}" y2="1.8" stroke="#000" stroke-width="1.6" opacity=".5"/>',
      "embossed", "a channel cut into the surface; light above, dark below", True),
    S(f'<line x1="0" y1="0" x2="{L}" y2="0" stroke="#dfe9ef" stroke-width="3" opacity=".14" filter="url(#b4)"/>'
      f'<line x1="60" y1="0" x2="{L}" y2="0" stroke="#dfe9ef" stroke-width="3" opacity=".45"/>'
      f'<line x1="130" y1="0" x2="{L}" y2="0" stroke="#dfe9ef" stroke-width="3"/>',
      "trail", "implies motion while staying completely static", True),

    # ---------------- E. composition
    ("HEADER", "E · COMPOSITION", "lines built from more than one stroke", None, False),
    S("".join(f'<path d="M0,{-7+k*4.6} C70,{-7+k*4.6} 120,0 {L},0" fill="none" stroke="{PLUM}" stroke-width="1.7"/>'
              for k in range(4)),
      "bundle", "many-to-one without four separate arrows"),
    S(f'<line x1="0" y1="-4" x2="{L}" y2="-4" stroke="{INK}" stroke-width="1.8"/>'
      f'<line x1="0" y1="4" x2="{L}" y2="4" stroke="{INK}" stroke-width="1.8"/>'
      + "".join(f'<line x1="{k*20+6}" y1="-4" x2="{k*20+6}" y2="4" stroke="{INK}" stroke-width="1.4"/>'
                for k in range(10)),
      "track / railway", "a route with stations, or a physical run"),
    S(f'<path d="M0,-6 C70,-6 120,-6 {L},-6 L{L},6 C120,6 70,6 0,6 Z" fill="{GREEN}" opacity=".28"/>'
      f'<path d="M0,-6 C70,-6 120,-6 {L},-6" fill="none" stroke="{GREEN}" stroke-width="1.6"/>'
      f'<path d="M0,6 C70,6 120,6 {L},6" fill="none" stroke="{GREEN}" stroke-width="1.6"/>',
      "ribbon", "a flow with volume; the Sankey primitive"),
    S(f'<line x1="0" y1="0" x2="{L}" y2="0" stroke="{BLUE}" stroke-width="9" stroke-linecap="round"/>'
      f'<line x1="0" y1="-2" x2="{L}" y2="-2" stroke="#ffffff" stroke-width="2" opacity=".55" stroke-linecap="round"/>',
      "pipe / tube", "physical conduit; the highlight sells the volume"),
    S(f'<line x1="0" y1="0" x2="{L}" y2="0" stroke="{SOFT}" stroke-width="1.4"/>'
      + "".join(f'<circle cx="{k*40}" cy="0" r="4.5" fill="{G}" stroke="{GOLD}" stroke-width="2"/>'
                for k in range(6)),
      "beaded", "discrete hops along a route; each bead is a real stop"),
    S("".join(f'<line x1="{k*50}" y1="0" x2="{k*50+44}" y2="0" stroke="{c}" stroke-width="5" stroke-linecap="round"/>'
              for k, c in enumerate([BLUE, TEAL, GOLD, ACC])),
      "segmented", "stages on one route, each segment its own owner"),

    # ---------------- F. geometry
    ("HEADER", "F · GEOMETRY", "the shape of the route itself", None, False),
    S(f'<path d="M0,-14 H90 V14 H{L}" fill="none" stroke="{INK}" stroke-width="2" marker-end="url(#ar)"/>',
      "orthogonal", "grid-aligned; the default for infrastructure"),
    S(f'<path d="M0,-14 H82 Q90,-14 90,-6 V6 Q90,14 98,14 H{L}" fill="none" stroke="{INK}" stroke-width="2" marker-end="url(#ar)"/>',
      "rounded elbow", "orthogonal with the corners taken off"),
    S(f'<path d="M0,-14 C90,-14 90,14 {L},14" fill="none" stroke="{INK}" stroke-width="2" marker-end="url(#ar)"/>',
      "bezier S", "organic routing; harder to follow when many overlap"),
    S(f'<path d="M0,10 Q100,-26 {L},10" fill="none" stroke="{INK}" stroke-width="2" marker-end="url(#ar)"/>',
      "arc", "a return path or a long jump over other content"),
    S(f'<path d="M0,14 H50 V-2 H100 V-14 H150 V-14 H{L}" fill="none" stroke="{INK}" stroke-width="2"/>',
      "stepped", "escalation or a staged rollout"),
    S(f'<path d="M0,0 H70 A9,9 0 0 1 88,0 H{L}" fill="none" stroke="{INK}" stroke-width="2"/>'
      f'<line x1="79" y1="-16" x2="79" y2="16" stroke="{SOFT}" stroke-width="1.6"/>',
      "line-jump", "crossing without connecting; the only honest crossing"),
]


def build():
    body, defs = "", DEFS
    y = 54
    col = 0
    dark_runs = []
    cells = []
    for spec in SPECS:
        if spec[0] == "HEADER":
            if col:
                y += ROW
                col = 0
            cells.append(("H", spec[1], spec[2], y, spec[4]))
            y += 46
            continue
        name, use, mk, dark = spec
        cells.append(("S", name, use, y, (mk, dark, col)))
        col += 1
        if col == COLS:
            col = 0
            y += ROW
    total = y + ROW + 40

    # dark bands behind group D
    for kind, a, b, cy, extra in cells:
        if kind == "H" and extra:
            dark_runs.append(cy - 30)
    for dy in dark_runs:
        body += f'<rect x="0" y="{dy+6}" width="{W}" height="{52+ROW*2}" fill="{DARK}"/>'

    col = 0
    for kind, a, b, cy, extra in cells:
        if kind == "H":
            dark = extra
            c = "#8fa8b8" if dark else SOFT
            body += (f'<text x="40" y="{cy}" font-size="12.5" font-family="ui-monospace,monospace" '
                     f'letter-spacing=".16em" fill="{c}">{a}</text>'
                     f'<text x="40" y="{cy+18}" font-size="13" fill="{c}" opacity=".85">{b}</text>'
                     f'<line x1="40" y1="{cy+28}" x2="{W-40}" y2="{cy+28}" '
                     f'stroke="{"#2b3a45" if dark else "#ded6cc"}"/>')
            col = 0
            continue
        mk, dark, c0 = extra
        x = 40 + c0 * CELL
        tc = "#dfe9ef" if dark else INK
        sc = "#8fa8b8" if dark else SOFT
        body += f'<g transform="translate({x},{cy+20})">{mk}</g>'
        body += f'<text x="{x}" y="{cy+54}" font-size="13.5" font-weight="600" fill="{tc}">{a}</text>'
        # Captions must stay inside their cell or they collide with the next
        # column. Wrap on words at the measured character budget.
        line, lines = "", []
        for word in b.split():
            trial = f"{line} {word}".strip()
            if len(trial) > 34 and line:
                lines.append(line)
                line = word
            else:
                line = trial
        if line:
            lines.append(line)
        for i, ln in enumerate(lines[:2]):
            suffix = "…" if (i == 1 and len(lines) > 2) else ""
            body += (f'<text x="{x}" y="{cy+72+i*15}" font-size="12" fill="{sc}">{ln}{suffix}</text>')

    return (f'<svg viewBox="0 0 {W} {total}" xmlns="http://www.w3.org/2000/svg" role="img" '
            f'aria-labelledby="t d"><title id="t">Connector line specimen</title>'
            f'<desc id="d">Thirty-four connector treatments grouped by weight and taper, gradient, '
            f'dash vocabulary, depth and glow, composition, and geometry.</desc>'
            f'<defs>{defs}</defs><rect width="{W}" height="{total}" fill="{G}"/>{body}</svg>')


HTML = """<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Line Lab</title>
<style>
 body{{margin:0;padding:52px 40px;background:{G};color:{INK};
  font-family:'Inter',system-ui,sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased}}
 main{{max-width:1180px;margin:0 auto}}
 .tag{{font-family:ui-monospace,monospace;font-size:13px;letter-spacing:.14em;
  text-transform:uppercase;color:{SOFT};margin:0 0 6px}}
 h1{{font-size:32px;font-weight:650;letter-spacing:-.02em;margin:0 0 10px}}
 .note{{color:{SOFT};font-size:17px;max-width:66ch;margin:0 0 6px}}
 .tech{{font-size:15px;max-width:68ch;margin:0 0 28px;padding:10px 14px;
  border-left:3px solid {ACC};background:rgba(180,36,95,.05)}}
 .cav{{font-size:15px;color:{SOFT};max-width:68ch;margin:22px 0 0;padding:10px 14px;
  border-left:3px solid {GOLD};background:rgba(138,90,18,.06)}}
 svg{{width:100%;height:auto;display:block}}
 .alt{{margin-top:26px;padding-top:18px;border-top:1px solid #ded6cc}}
 .alt h2{{font-family:ui-monospace,monospace;font-size:13px;font-weight:500;letter-spacing:.14em;
  text-transform:uppercase;color:{SOFT};margin:0 0 8px}}
 .alt p{{color:{SOFT};font-size:15px;max-width:72ch;margin:0 0 8px}}
 @media (prefers-reduced-motion:reduce){{*{{animation:none!important;transition:none!important}}}}
 @media (prefers-contrast:more){{body{{background:#fff;color:#000}}.note,.alt p,.tag,.cav{{color:#000}}}}
</style></head><body><main>
<p class="tag">demo 22 of 22 · line lab</p>
<h1>Connectors</h1>
<p class="note">Thirty-four line treatments on the same 200px span, so the comparison is fair.</p>
<p class="tech"><strong>Grouped by job, not by look.</strong> Weight and taper handle emphasis and
direction. Gradients replace arrowheads. Dash patterns carry state — planned, inferred, standby.
Depth lifts one path above the rest. Composition builds a line from several strokes. Geometry is the
route itself. Glow specimens sit on a dark band because that is the only place glow is real.</p>
{svg}
<p class="cav"><strong>Watch out:</strong> a diagram should use two line treatments, three at the
absolute most. Every additional one is a legend entry and a thing to remember. Direction cues stack
badly too — taper plus gradient plus arrowhead is one idea said three times. And any treatment that
fades, thins or glows loses contrast somewhere along its length, so never place a label on the weak
end.</p>
<div class="alt"><h2>Described in words</h2>
<p>Six groups. <strong>Weight and taper:</strong> hairline, standard, heavy, tapered, spindle, cased.
<strong>Gradient:</strong> two-tone, fade-out, ghost ends, multi-stop, gradient-plus-taper, halo.
<strong>Dash:</strong> dashed, dotted, dash-dot, graduated, planned-over-actual, solid-plus-dashed pair.
<strong>Depth:</strong> cast shadow, soft halo, three-layer neon, gradient neon, embossed, trail.
<strong>Composition:</strong> bundle, track, ribbon, pipe, beaded, segmented.
<strong>Geometry:</strong> orthogonal, rounded elbow, bezier, arc, stepped, line-jump.</p>
<p>Each is captioned with the job it does, so the sheet is a selection guide rather than a swatch book.</p>
</div>
</main></body></html>"""


def main() -> int:
    OUT.mkdir(exist_ok=True)
    for c in (INK, SOFT, ACC, BLUE, GREEN, GOLD, PLUM, TEAL):
        assert contrast_ratio(c, G) >= 4.5, c
    n = sum(1 for s in SPECS if s[0] != "HEADER")
    (OUT / "22-line-lab.html").write_text(
        HTML.format(G=G, INK=INK, SOFT=SOFT, ACC=ACC, GOLD=GOLD, svg=build()), encoding="utf-8")
    print(f"22-line-lab.html — {n} specimens")
    return 0


if __name__ == "__main__":
    sys.exit(main())
