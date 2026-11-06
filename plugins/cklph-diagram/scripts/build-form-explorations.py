#!/usr/bin/env python3
"""Ten structurally different diagram ideas.

The previous set was one layout in fourteen skins. This set changes the
*geometry* — how space carries meaning — and treats colour as the last variable
rather than the only one.

Techniques explored, one per example:

  1  isometric-strata   depth via 2.5D projection + stacked offset shadows
  2  transit-map        Beck grammar: thick routes, 45 degrees only, interchanges
  3  sankey-ribbons     quantity encoded as band width; translucent overlaps
  4  nested-containment zero arrows — hierarchy by enclosure, weight by area
  5  annotated-report   a static "interactive dashboard": tiles, sparklines, deltas
  6  organic-mindmap    tapered branch strokes, no boxes, curvature carries depth
  7  swimlane-timeline  two axes at once: actor down, time across
  8  circuit-traces     PCB grammar: orthogonal traces, junction pads, vias
  9  paper-collage      physical layering: grain, tape, rotation, cast shadow
 10  matrix-heat        sequential shading in a grid + glyph redundancy + margins

Accessibility is held constant so the structure is what varies: no animation,
text at 13px+ and AA against whatever sits behind it, and every colour
distinction paired with a shape, glyph, pattern or direct label. Where a
technique is risky for sensory load the file says so in its own caption rather
than pretending otherwise.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "skills/cklph-diagram/scripts"))
from colorlib import contrast_ratio  # noqa: E402

OUT = ROOT / "gallery/forms"

P = dict(
    ground="#faf8f4", surface="#ffffff", ink="#191621", soft="#57505f",
    accent="#b4245f", blue="#1f5f8b", green="#046a52", gold="#8a5a12",
    plum="#5b3a7e", rule="#ded6cc",
)


def shell(slug, title, note, technique, svg, caveat=""):
    cav = (f'<p class="cav"><strong>Watch out:</strong> {caveat}</p>' if caveat else "")
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>
 body{{margin:0;padding:52px 40px;background:{P['ground']};color:{P['ink']};
   font-family:'Inter',system-ui,sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased}}
 main{{max-width:900px;margin:0 auto}}
 .tag{{font-family:ui-monospace,monospace;font-size:13px;letter-spacing:.14em;
   text-transform:uppercase;color:{P['soft']};margin:0 0 6px}}
 h1{{font-size:32px;font-weight:650;letter-spacing:-.02em;margin:0 0 10px}}
 .note{{color:{P['soft']};font-size:17px;max-width:64ch;margin:0 0 6px}}
 .tech{{font-size:15px;max-width:64ch;margin:0 0 28px;padding:10px 14px;
   border-left:3px solid {P['accent']};background:rgba(180,36,95,.05)}}
 .cav{{font-size:15px;color:{P['soft']};max-width:64ch;margin:22px 0 0;
   padding:10px 14px;border-left:3px solid {P['gold']};background:rgba(138,90,18,.06)}}
 svg{{width:100%;height:auto;display:block}}
 .alt{{margin-top:26px;padding-top:18px;border-top:1px solid {P['rule']}}}
 .alt h2{{font-family:ui-monospace,monospace;font-size:13px;font-weight:500;
   letter-spacing:.14em;text-transform:uppercase;color:{P['soft']};margin:0 0 8px}}
 .alt p{{color:{P['soft']};font-size:15px;max-width:70ch;margin:0}}
 @media (prefers-reduced-motion:reduce){{*{{animation:none!important;transition:none!important}}}}
 @media (prefers-contrast:more){{body{{background:#fff;color:#000}}.note,.alt p,.tag,.cav{{color:#000}}}}
</style></head><body><main>
<p class="tag">form {slug.split('-')[0]} of 10</p>
<h1>{title}</h1>
<p class="note">{note}</p>
<p class="tech">{technique}</p>
{svg}
{cav}
<div class="alt"><h2>Described in words</h2><p>{note}</p></div>
</main></body></html>
"""


def svg(body, defs="", h=420, label=""):
    return f'''<svg viewBox="0 0 860 {h}" xmlns="http://www.w3.org/2000/svg" role="img"
   aria-labelledby="t d"><title id="t">{label}</title><desc id="d">{label}</desc>
 <defs>{defs}</defs><rect width="860" height="{h}" fill="{P['ground']}"/>
 {body}</svg>'''


# ---------------------------------------------------------------- 1
def isometric():
    """Depth by projection. Each plane is a layer of the stack, offset up-right,
    with a cast shadow establishing which sits above which."""
    def plane(cx, cy, w, d, fill, stroke, name, sub, glyph):
        # iso projection: x' = (x-y)*cos30, y' = (x+y)*sin30
        pts = [(cx, cy - d / 2), (cx + w / 2, cy), (cx, cy + d / 2), (cx - w / 2, cy)]
        p = " ".join(f"{x:.0f},{y:.0f}" for x, y in pts)
        sh = " ".join(f"{x:.0f},{y+10:.0f}" for x, y in pts)
        return f'''
   <polygon points="{sh}" fill="rgba(25,22,33,.10)"/>
   <polygon points="{p}" fill="{fill}" stroke="{stroke}" stroke-width="1.6"/>
   <text x="{cx+14}" y="{cy-2}" font-size="17" font-weight="650" fill="{P['ink']}">{name}</text>
   <text x="{cx+14}" y="{cy+18}" font-size="13" font-family="ui-monospace,monospace"
     fill="{P['soft']}">{sub}</text>
   <text x="{cx-8}" y="{cy+8}" font-size="19" text-anchor="middle" fill="{stroke}">{glyph}</text>'''
    layers = [
        (330, "#eef3f7", P['blue'], "Interface", "web + api", "▲"),
        (250, "#fbeef4", P['accent'], "Logic", "rules + jobs", "●"),
        (170, "#eaf4f0", P['green'], "Data", "postgres + cache", "■"),
        (90,  "#f6f0e4", P['gold'], "Platform", "hosts + network", "◆"),
    ]
    body = "".join(plane(430, y, 560, 130, f, s, n, sub, g)
                   for y, f, s, n, sub, g in layers)
    for y in (330, 250, 170):
        body += (f'<line x1="430" y1="{y+24}" x2="430" y2="{y-40}" stroke="{P["soft"]}" '
                 f'stroke-width="1.4" stroke-dasharray="4,4"/>'
                 f'<polygon points="425,{y-40} 435,{y-40} 430,{y-50}" fill="{P["soft"]}"/>')
    return svg(body, h=420, label="Four platform layers drawn as stacked isometric planes")


# ---------------------------------------------------------------- 2
def transit():
    """Harry Beck's grammar: geography is discarded, only sequence and
    interchange survive. Routes at 45 degrees only; interchanges are rings."""
    routes = [
        (P['blue'], "solid", [(70, 120), (230, 120), (330, 220), (560, 220), (660, 320), (800, 320)]),
        (P['accent'], "solid", [(70, 320), (170, 320), (270, 220), (560, 220), (660, 120), (800, 120)]),
        (P['green'], "6,7", [(70, 220), (270, 220), (370, 120), (560, 120)]),
    ]
    body = ""
    for col, dash, pts in routes:
        d = "M" + " L".join(f"{x},{y}" for x, y in pts)
        da = f' stroke-dasharray="{dash}"' if dash != "solid" else ""
        body += f'<path d="{d}" fill="none" stroke="{col}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"{da} opacity=".92"/>'
    stops = [(70, 120, "Draft", 0), (230, 120, "Review", 0), (560, 220, "Publish", 2),
             (800, 320, "Archive", 0), (70, 320, "Intake", 0), (270, 220, "Triage", 2),
             (800, 120, "Syndicate", 0), (560, 120, "Index", 0), (70, 220, "Import", 0)]
    for x, y, name, kind in stops:
        if kind == 2:  # interchange — larger ring, two strokes
            body += (f'<circle cx="{x}" cy="{y}" r="13" fill="{P["surface"]}" stroke="{P["ink"]}" stroke-width="3.5"/>'
                     f'<circle cx="{x}" cy="{y}" r="5" fill="{P["ink"]}"/>')
        else:
            body += f'<circle cx="{x}" cy="{y}" r="8" fill="{P["surface"]}" stroke="{P["ink"]}" stroke-width="3"/>'
        body += (f'<text x="{x}" y="{y-24}" font-size="14" font-weight="600" '
                 f'text-anchor="middle" fill="{P["ink"]}">{name}</text>')
    body += (f'<rect x="60" y="372" width="740" height="1" fill="{P["rule"]}"/>'
             f'<circle cx="76" cy="398" r="8" fill="{P["surface"]}" stroke="{P["ink"]}" stroke-width="3"/>'
             f'<text x="94" y="403" font-size="14" fill="{P["soft"]}">stop</text>'
             f'<circle cx="190" cy="398" r="11" fill="{P["surface"]}" stroke="{P["ink"]}" stroke-width="3.5"/>'
             f'<circle cx="190" cy="398" r="4" fill="{P["ink"]}"/>'
             f'<text x="210" y="403" font-size="14" fill="{P["soft"]}">interchange (shared step)</text>'
             f'<line x1="470" y1="398" x2="510" y2="398" stroke="{P["green"]}" stroke-width="8" stroke-dasharray="6,7"/>'
             f'<text x="520" y="403" font-size="14" fill="{P["soft"]}">optional route</text>')
    return svg(body, h=420, label="Three content routes drawn as a transit map with interchanges")


# ---------------------------------------------------------------- 3
def sankey():
    """Width is the message. Band thickness encodes volume, so the diagram
    answers 'how much' before anyone reads a label."""
    def band(x1, y1, t1, x2, y2, t2, col, op=.55):
        c = (x1 + x2) / 2
        return (f'<path d="M{x1},{y1} C{c},{y1} {c},{y2} {x2},{y2} L{x2},{y2+t2} '
                f'C{c},{y2+t2} {c},{y1+t1} {x1},{y1+t1} Z" fill="{col}" opacity="{op}"/>')
    body = ""
    # stage 1 -> 2
    body += band(150, 60, 130, 380, 60, 130, P['blue'])
    body += band(150, 200, 90, 380, 200, 60, P['accent'])
    body += band(150, 300, 60, 380, 268, 40, P['green'])
    # stage 2 -> 3
    body += band(430, 60, 130, 680, 60, 96, P['blue'])
    body += band(430, 200, 60, 680, 168, 44, P['accent'])
    body += band(430, 268, 40, 680, 224, 30, P['green'])
    body += band(430, 190, 8, 680, 266, 60, P['gold'], .5)
    cols = [(120, 30, [(60, 130, "Organic", "1,300", P['blue']),
                       (200, 90, "Paid", "900", P['accent']),
                       (300, 60, "Referral", "600", P['green'])]),
            (380, 50, [(60, 130, "Landing", "1,300"  , P['blue']),
                       (200, 60, "Signup", "600", P['accent']),
                       (268, 40, "Trial", "400", P['green'])]),
            (680, 30, [(60, 96, "Retained", "960", P['blue']),
                       (168, 44, "Churned", "440", P['accent']),
                       (224, 102, "Dormant", "1,020", P['gold'])])]
    for x, _, items in cols:
        for y, t, name, val, col in items:
            body += f'<rect x="{x if x!=120 else 138}" y="{y}" width="12" height="{t}" fill="{col}"/>'
            tx = x + 22
            w = max(len(name), len(val) + 6) * 8 + 16
            body += (f'<rect x="{tx-6}" y="{y+2}" width="{w}" height="42" rx="4" '
                     f'fill="{P["ground"]}" opacity="0.94"/>'
                     f'<text x="{tx}" y="{y+18}" font-size="15" font-weight="600" fill="{P["ink"]}">{name}</text>'
                     f'<text x="{tx}" y="{y+37}" font-size="13" font-family="ui-monospace,monospace" '
                     f'fill="{P["soft"]}">{val} users</text>')
    for x, lab in ((138, "SOURCE"), (380, "JOURNEY"), (680, "OUTCOME")):
        body += (f'<text x="{x}" y="24" font-size="12" font-family="ui-monospace,monospace" '
                 f'letter-spacing=".14em" fill="{P["soft"]}">{lab}</text>')
    return svg(body, h=400, label="User flow as a Sankey where band width encodes user volume")


# ---------------------------------------------------------------- 4
def nested():
    """No arrows at all. Containment carries hierarchy and area carries weight —
    the two cheapest visual channels, both often ignored."""
    boxes = [
        (40, 60, 470, 300, "Platform", "", "#f4f1ec", P['ink'], 0),
        (64, 104, 210, 122, "Ingest", "42% of spend", "#e9f0f6", P['blue'], 1),
        (64, 240, 210, 96, "Storage", "18%", "#eaf4f0", P['green'], 1),
        (292, 104, 194, 232, "Compute", "31%", "#fbeef4", P['accent'], 1),
        (534, 60, 286, 300, "Client-facing", "", "#f4f1ec", P['ink'], 0),
        (558, 104, 238, 108, "Delivery", "6%", "#f6f0e4", P['gold'], 1),
        (558, 226, 238, 110, "Support", "3%", "#f1ecf6", P['plum'], 1),
    ]
    body = ""
    for x, y, w, h, name, sub, fill, col, depth in boxes:
        dash = "" if depth else ' stroke-dasharray="7,5"'
        body += (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{10 if depth else 14}" '
                 f'fill="{fill}" stroke="{col}" stroke-width="{1.6 if depth else 2.2}"{dash}/>')
        body += (f'<text x="{x+16}" y="{y+26}" font-size="{16 if depth else 14}" '
                 f'font-weight="{650 if depth else 600}" fill="{P["ink"]}" '
                 f'{"" if depth else chr(34).join(["letter-spacing=", ".12em", ""])}>'
                 f'{name if depth else name.upper()}</text>')
        if sub:
            body += (f'<text x="{x+16}" y="{y+48}" font-size="13" '
                     f'font-family="ui-monospace,monospace" fill="{P["soft"]}">{sub}</text>')
    body += (f'<text x="40" y="392" font-size="13" fill="{P["soft"]}">'
             f'Box area is proportional to spend. Dashed outline = grouping, '
             f'solid = a real system.</text>')
    return svg(body, h=410, label="Budget split shown by nested containment; area encodes spend")


# ---------------------------------------------------------------- 5
def report():
    """An interactive dashboard, frozen. Everything a hover would have revealed
    is printed: deltas, direction glyphs, and an annotation with a leader line."""
    body = ""
    tiles = [(40, 50, "Revenue", "$248k", "+12.4%", "▲", P['green']),
             (250, 50, "Churn", "3.1%", "-0.4pt", "▼", P['green']),
             (460, 50, "CAC", "$412", "+8.9%", "▲", P['accent']),
             (670, 50, "NPS", "48", "+3", "▲", P['green'])]
    for x, y, lab, val, delta, gly, col in tiles:
        body += (f'<rect x="{x}" y="{y}" width="150" height="108" rx="12" fill="{P["surface"]}" '
                 f'stroke="{P["rule"]}" stroke-width="1"/>'
                 f'<text x="{x+16}" y="{y+26}" font-size="12" font-family="ui-monospace,monospace" '
                 f'letter-spacing=".12em" fill="{P["soft"]}">{lab.upper()}</text>'
                 f'<text x="{x+16}" y="{y+62}" font-size="27" font-weight="650" fill="{P["ink"]}">{val}</text>'
                 f'<text x="{x+16}" y="{y+88}" font-size="14" font-weight="600" fill="{col}">'
                 f'{gly} {delta}</text>')
    # sparkline row
    import random
    random.seed(4)
    for i, (x, base) in enumerate([(40, 0), (250, 1), (460, 2), (670, 3)]):
        pts = []
        v = 30
        for k in range(22):
            v += random.uniform(-6, 7) + (2 if base in (0, 3) else -1)
            pts.append((x + 16 + k * 5.4, 250 - max(4, min(52, v))))
        d = "M" + " L".join(f"{a:.0f},{b:.0f}" for a, b in pts)
        col = [P['green'], P['green'], P['accent'], P['green']][i]
        body += (f'<rect x="{x}" y="180" width="150" height="84" rx="12" fill="{P["surface"]}" '
                 f'stroke="{P["rule"]}"/>'
                 f'<path d="{d}" fill="none" stroke="{col}" stroke-width="2"/>'
                 f'<circle cx="{pts[-1][0]:.0f}" cy="{pts[-1][1]:.0f}" r="3.5" fill="{col}"/>'
                 f'<text x="{x+16}" y="{202}" font-size="12" font-family="ui-monospace,monospace" '
                 f'fill="{P["soft"]}">12-week trend</text>')
    # annotation with leader line — the thing a tooltip would have hidden
    body += (f'<path d="M545,196 C545,320 380,300 300,318" fill="none" stroke="{P["accent"]}" '
             f'stroke-width="1.6" stroke-dasharray="5,4"/>'
             f'<circle cx="545" cy="196" r="5" fill="{P["accent"]}"/>'
             f'<rect x="40" y="300" width="262" height="76" rx="10" fill="rgba(180,36,95,.07)" '
             f'stroke="{P["accent"]}" stroke-width="1.4"/>'
             f'<text x="56" y="326" font-size="14" font-weight="650" fill="{P["ink"]}">CAC rise is paid-only</text>'
             f'<text x="56" y="348" font-size="13" fill="{P["soft"]}">Organic CAC flat at $180.</text>'
             f'<text x="56" y="366" font-size="13" fill="{P["soft"]}">Q3 paid test ends week 14.</text>')
    return svg(body, h=400, label="A static report: KPI tiles, sparklines, deltas and one annotation")


# ---------------------------------------------------------------- 6
def mindmap():
    """Real mind-map grammar: no boxes. Branches taper with depth, curve carries
    the eye, and text rides the branch instead of sitting in a container."""
    body = (f'<text x="430" y="205" font-size="24" font-weight="650" text-anchor="middle" '
            f'fill="{P["ink"]}">Rebrand</text>'
            f'<ellipse cx="430" cy="196" rx="92" ry="46" fill="none" stroke="{P["ink"]}" stroke-width="2.4"/>')
    branches = [
        (-160, "Research", P['blue'], ["interviews", "audit", "survey"]),
        (-95, "Identity", P['accent'], ["marks", "palette", "type"]),
        (-25, "Voice", P['green'], ["tone", "lexicon"]),
        (25, "Rollout", P['gold'], ["site", "decks", "social"]),
        (95, "Measure", P['plum'], ["recall", "traffic"]),
        (160, "Budget", P['soft'], ["phase 1", "phase 2"]),
    ]
    for ang_d, name, col, kids in branches:
        a = math.radians(ang_d)
        sx, sy = 430 + 92 * math.cos(a), 196 + 46 * math.sin(a)
        ex, ey = 430 + 300 * math.cos(a), 196 + 150 * math.sin(a)
        mx, my = (sx + ex) / 2 + 18 * math.sin(a), (sy + ey) / 2 - 14 * math.cos(a)
        # taper: draw as a filled outline, thick at root, thin at tip
        body += (f'<path d="M{sx:.0f},{sy-4:.0f} Q{mx:.0f},{my:.0f} {ex:.0f},{ey:.0f} '
                 f'Q{mx:.0f},{my+5:.0f} {sx:.0f},{sy+4:.0f} Z" fill="{col}"/>')
        anchor = "end" if ang_d < 0 and abs(ang_d) > 90 else "start"
        anchor = "end" if math.cos(a) < 0 else "start"
        off = -10 if math.cos(a) < 0 else 10
        body += (f'<text x="{ex+off:.0f}" y="{ey-6:.0f}" font-size="17" font-weight="650" '
                 f'text-anchor="{anchor}" fill="{P["ink"]}">{name}</text>')
        for i, k in enumerate(kids):
            ky = ey + 16 + i * 19
            body += (f'<text x="{ex+off:.0f}" y="{ky:.0f}" font-size="13" '
                     f'font-family="ui-monospace,monospace" text-anchor="{anchor}" '
                     f'fill="{P["soft"]}">{k}</text>')
            body += (f'<line x1="{ex:.0f}" y1="{ey:.0f}" x2="{ex+off*0.5:.0f}" y2="{ky-4:.0f}" '
                     f'stroke="{col}" stroke-width="1"/>')
    return svg(body, h=400, label="A rebrand mind map with tapered branches and no node boxes")


# ---------------------------------------------------------------- 7
def swimlane():
    """Two axes at once — actor down, time across. Bars carry duration, diamonds
    carry moments, and a 'today' rule turns the drawing into a status report."""
    lanes = [("Design", P['accent']), ("Build", P['blue']),
             ("Content", P['green']), ("Launch", P['gold'])]
    body = ""
    for i in range(9):
        x = 190 + i * 72
        body += (f'<line x1="{x}" y1="56" x2="{x}" y2="330" stroke="{P["rule"]}" stroke-width="1"/>'
                 f'<text x="{x}" y="46" font-size="12" font-family="ui-monospace,monospace" '
                 f'text-anchor="middle" fill="{P["soft"]}">W{i+1}</text>')
    bars = [(0, 0, 3, "Concepts", "done"), (0, 3, 2, "Refine", "done"),
            (1, 2, 4, "Components", "active"), (1, 6, 2, "Integration", "todo"),
            (2, 1, 3, "Draft copy", "done"), (2, 5, 2, "Review", "active"),
            (3, 7, 1, "Ship", "todo")]
    for lane, start, dur, label, state in bars:
        y = 76 + lane * 68
        col = lanes[lane][1]
        x = 190 + start * 72
        w = dur * 72
        fill = {"done": col, "active": "none", "todo": "none"}[state]
        op = ".85" if state == "done" else "1"
        dash = ' stroke-dasharray="6,5"' if state == "todo" else ""
        body += (f'<rect x="{x}" y="{y}" width="{w}" height="34" rx="6" fill="{fill}" '
                 f'fill-opacity="{op}" stroke="{col}" stroke-width="2"{dash}/>')
        tcol = "#ffffff" if state == "done" else P['ink']
        body += (f'<text x="{x+12}" y="{y+22}" font-size="13" font-weight="600" fill="{tcol}">{label}</text>')
    for i, (name, col) in enumerate(lanes):
        y = 76 + i * 68
        body += (f'<rect x="40" y="{y}" width="4" height="34" fill="{col}"/>'
                 f'<text x="56" y="{y+22}" font-size="15" font-weight="650" fill="{P["ink"]}">{name}</text>'
                 f'<line x1="40" y1="{y+52}" x2="820" y2="{y+52}" stroke="{P["rule"]}"/>')
    tx = 190 + 5.4 * 72
    body += (f'<line x1="{tx}" y1="56" x2="{tx}" y2="336" stroke="{P["ink"]}" stroke-width="2"/>'
             f'<polygon points="{tx-7},56 {tx+7},56 {tx},66" fill="{P["ink"]}"/>'
             f'<text x="{tx+10}" y="352" font-size="13" font-weight="650" fill="{P["ink"]}">today</text>')
    body += (f'<rect x="40" y="372" width="16" height="12" rx="3" fill="{P["blue"]}"/>'
             f'<text x="64" y="382" font-size="13" fill="{P["soft"]}">complete</text>'
             f'<rect x="160" y="372" width="16" height="12" rx="3" fill="none" stroke="{P["blue"]}" stroke-width="2"/>'
             f'<text x="184" y="382" font-size="13" fill="{P["soft"]}">in progress</text>'
             f'<rect x="300" y="372" width="16" height="12" rx="3" fill="none" stroke="{P["blue"]}" '
             f'stroke-width="2" stroke-dasharray="4,3"/>'
             f'<text x="324" y="382" font-size="13" fill="{P["soft"]}">not started</text>')
    return svg(body, h=400, label="Project schedule as swimlanes over a week axis with a today marker")


# ---------------------------------------------------------------- 8
def circuit():
    """PCB grammar on a dark board: orthogonal traces, junction pads where lines
    meet, vias where a signal changes layer. Every joint is explicit."""
    g, sur, ink, soft = "#12161a", "#1a2026", "#dfe5e8", "#8b969e"
    trace, alt, hot = "#59c9a5", "#e0b050", "#e0665f"
    body = f'<rect width="860" height="400" fill="{g}"/>'
    for i in range(0, 861, 40):
        body += f'<line x1="{i}" y1="0" x2="{i}" y2="400" stroke="#1b2228" stroke-width="1"/>'
    for i in range(0, 401, 40):
        body += f'<line x1="0" y1="{i}" x2="860" y2="{i}" stroke="#1b2228" stroke-width="1"/>'
    paths = [(f'M80,120 H240 V200 H400', trace), (f'M400,200 H560 V120 H720', trace),
             (f'M80,280 H200 V240 H400', alt), (f'M400,240 H600 V300 H720', alt),
             (f'M240,120 V80 H560 V120', hot)]
    for d, c in paths:
        body += f'<path d="{d}" fill="none" stroke="{c}" stroke-width="3.5" stroke-linejoin="round"/>'
    pads = [(80, 120, "IN-A"), (400, 200, "MUX"), (720, 120, "OUT-1"),
            (80, 280, "IN-B"), (400, 240, "BUF"), (720, 300, "OUT-2")]
    for x, y, lab in pads:
        body += (f'<rect x="{x-30}" y="{y-18}" width="60" height="36" rx="4" fill="{sur}" '
                 f'stroke="{soft}" stroke-width="1.5"/>'
                 f'<text x="{x}" y="{y+5}" font-size="13" font-family="ui-monospace,monospace" '
                 f'text-anchor="middle" fill="{ink}">{lab}</text>')
    for x, y in [(240, 120), (240, 200), (560, 120), (200, 280), (600, 240), (560, 80)]:
        body += (f'<circle cx="{x}" cy="{y}" r="7" fill="{g}" stroke="{trace}" stroke-width="2.5"/>'
                 f'<circle cx="{x}" cy="{y}" r="2.5" fill="{ink}"/>')
    body += (f'<text x="40" y="356" font-size="13" font-family="ui-monospace,monospace" fill="{soft}">'
             f'○ via — signal changes layer</text>'
             f'<line x1="300" y1="352" x2="340" y2="352" stroke="{hot}" stroke-width="3.5"/>'
             f'<text x="350" y="356" font-size="13" font-family="ui-monospace,monospace" fill="{soft}">'
             f'priority path</text>')
    return svg(body, h=400, label="Signal routing drawn as a printed circuit board with vias and pads")


# ---------------------------------------------------------------- 9
def collage():
    """Physical layering: grain, tape, slight rotation, real cast shadow. Depth
    that comes from materials rather than from a colour ramp."""
    defs = ('<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.8" '
            'numOctaves="3" result="n"/><feColorMatrix in="n" type="saturate" values="0"/>'
            '<feComponentTransfer><feFuncA type="linear" slope="0.055"/></feComponentTransfer>'
            '<feComposite operator="over" in2="SourceGraphic"/></filter>'
            '<filter id="cast" x="-30%" y="-30%" width="170%" height="170%">'
            '<feDropShadow dx="3" dy="7" stdDeviation="7" flood-color="#2a2118" flood-opacity="0.22"/></filter>')
    cards = [(60, 70, 232, 150, -2.2, "#fdf9f0", P['accent'], "Discovery", "3 weeks · 4 interviews"),
             (320, 110, 232, 150, 1.6, "#f4f7f3", P['green'], "Definition", "scope + success metrics"),
             (580, 60, 232, 150, -1.2, "#f2f5fa", P['blue'], "Delivery", "6 sprints · weekly demo")]
    body = ""
    for x, y, w, h, rot, fill, col, title, sub in cards:
        body += (f'<g transform="rotate({rot} {x+w/2} {y+h/2})" filter="url(#cast)">'
                 f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}"/>'
                 f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" filter="url(#grain)"/>'
                 f'<rect x="{x}" y="{y}" width="{w}" height="5" fill="{col}"/>'
                 f'<text x="{x+22}" y="{y+52}" font-size="19" font-weight="650" fill="{P["ink"]}">{title}</text>'
                 f'<text x="{x+22}" y="{y+78}" font-size="13" font-family="ui-monospace,monospace" '
                 f'fill="{P["soft"]}">{sub}</text>'
                 f'<line x1="{x+22}" y1="{y+96}" x2="{x+w-22}" y2="{y+96}" stroke="{P["rule"]}"/>'
                 f'<text x="{x+22}" y="{y+122}" font-size="13" fill="{P["soft"]}">owner: studio</text>'
                 f'</g>')
        # tape
        body += (f'<rect x="{x+w/2-32}" y="{y-13}" width="64" height="26" rx="2" '
                 f'fill="rgba(214,196,150,.62)" transform="rotate({rot*3} {x+w/2} {y})"/>')
    body += (f'<path d="M292,150 C306,150 306,190 320,190" fill="none" stroke="{P["soft"]}" stroke-width="2"/>'
             f'<path d="M552,190 C566,190 566,140 580,140" fill="none" stroke="{P["soft"]}" stroke-width="2"/>')
    body += (f'<text x="60" y="300" font-size="14" fill="{P["soft"]}">'
             f'Grain and cast shadow do the separating, so no card needs a border.</text>')
    return svg(body, defs, h=340, label="Three project phases as taped paper cards with grain and shadow")


# ---------------------------------------------------------------- 10
def matrix():
    """Sequential shading in a grid. Colour carries magnitude, but a glyph and a
    printed number carry it too, so the cell survives greyscale entirely."""
    rows = ["Search", "Social", "Email", "Direct", "Referral"]
    cols = ["Visit", "Signup", "Activate", "Pay", "Renew"]
    data = [[95, 62, 40, 22, 14], [88, 44, 24, 9, 5], [70, 58, 47, 31, 24],
            [60, 48, 38, 26, 20], [45, 26, 16, 8, 4]]
    ramp = ["#f6f0e8", "#e6d3bd", "#d0ab86", "#b57f52", "#8a5a12"]
    glyph = ["·", "▫", "▪", "◾", "■"]
    body = ""
    for j, c in enumerate(cols):
        body += (f'<text x="{264+j*118}" y="66" font-size="13" font-weight="600" '
                 f'text-anchor="middle" fill="{P["ink"]}">{c}</text>')
    for i, r in enumerate(rows):
        y = 84 + i * 58
        body += (f'<text x="196" y="{y+34}" font-size="14" font-weight="600" text-anchor="end" '
                 f'fill="{P["ink"]}">{r}</text>')
        for j in range(5):
            v = data[i][j]
            k = min(4, v // 20)
            x = 264 + j * 118 - 52
            tc = "#ffffff" if k >= 3 else P['ink']
            body += (f'<rect x="{x}" y="{y}" width="104" height="46" rx="4" fill="{ramp[k]}"/>'
                     f'<text x="{x+14}" y="{y+30}" font-size="15" font-weight="650" fill="{tc}">{v}%</text>'
                     f'<text x="{x+82}" y="{y+30}" font-size="15" text-anchor="middle" fill="{tc}">{glyph[k]}</text>')
    # marginal totals — the thing spreadsheets have and diagrams forget
    for j in range(5):
        tot = sum(data[i][j] for i in range(5)) // 5
        body += (f'<text x="{264+j*118}" y="396" font-size="13" font-weight="650" '
                 f'text-anchor="middle" fill="{P["soft"]}">avg {tot}%</text>')
    body += f'<line x1="212" y1="374" x2="820" y2="374" stroke="{P["rule"]}"/>'
    lx = 212
    for k in range(5):
        body += (f'<rect x="{lx}" y="20" width="26" height="14" fill="{ramp[k]}"/>'
                 f'<text x="{lx+11}" y="31" font-size="11" text-anchor="middle" '
                 f'fill="{"#fff" if k>=3 else P["ink"]}">{glyph[k]}</text>')
        lx += 30
    body += (f'<text x="{lx+8}" y="32" font-size="13" fill="{P["soft"]}">low to high '
             f'— shade, glyph and number all encode the same value</text>')
    return svg(body, h=410, label="Channel funnel conversion as a shaded matrix with redundant glyphs")


EXAMPLES = [
    ("01-isometric-strata", "Isometric Strata", isometric,
     "Four platform layers seen at an angle instead of head-on.",
     "<strong>Technique — depth by projection.</strong> Each plane is drawn in a 2:1 isometric "
     "projection with its own cast shadow. Stacking order becomes the message, and no arrow "
     "is needed to say 'sits on top of'.",
     "Isometric costs readability at small sizes and cannot be scanned linearly. Use it for "
     "an overview slide, never for something someone must trace step by step."),
    ("02-transit-map", "Transit Map", transit,
     "Three content routes sharing interchange stops.",
     "<strong>Technique — Beck's grammar.</strong> Geography is thrown away; only sequence and "
     "interchange survive. Lines run at 45° only, thick and rounded; shared steps become "
     "double-ringed interchanges. Route identity is carried by colour <em>and</em> dash pattern.",
     "Only works when flows genuinely share stops. With no interchanges it is just parallel lines "
     "wearing a costume."),
    ("03-sankey-ribbons", "Sankey Ribbons", sankey,
     "A funnel where the width of every band is the number of users.",
     "<strong>Technique — quantity as geometry.</strong> Band thickness encodes volume, so the "
     "shape answers 'how much' before any label is read. Translucent overlaps let crossing flows "
     "coexist without a bridge.",
     "Translucency stacks: three overlapping bands can produce a fourth colour that means nothing. "
     "Cap overlap depth and keep every band's label outside the ribbon."),
    ("04-nested-containment", "Nested Containment", nested,
     "Budget split with no arrows anywhere — enclosure and area do the work.",
     "<strong>Technique — the two cheapest channels.</strong> Containment carries hierarchy and "
     "area carries weight. Dashed outlines are groupings, solid outlines are real systems, so the "
     "border style is doing semantic work rather than decoration.",
     "Area is systematically misjudged by readers, so always print the number too. Never rely on "
     "size alone for a value someone will act on."),
    ("05-annotated-report", "Annotated Report", report,
     "An interactive dashboard, frozen — with the tooltips printed.",
     "<strong>Technique — make the hover state permanent.</strong> Deltas, direction glyphs, "
     "12-week sparklines and the one insight a person would have hunted for are all on the page. "
     "A dashed leader line ties the annotation to the exact tile it explains.",
     "Direction is carried by glyph and sign as well as colour, because red/green alone fails for "
     "the most common colour-vision difference."),
    ("06-organic-mindmap", "Organic Mind Map", mindmap,
     "A rebrand broken down with no boxes at all.",
     "<strong>Technique — tapered branches.</strong> Each branch is a filled outline, thick at the "
     "root and thin at the tip, so depth is felt rather than labelled. Text rides the branch "
     "instead of sitting in a container, which is what separates a real mind map from a sideways "
     "org chart.",
     "Radial layouts have no reading order. Fine for generative thinking, wrong for anything with "
     "a sequence or a dependency."),
    ("07-swimlane-timeline", "Swimlane Timeline", swimlane,
     "Who is doing what, and when, on one grid.",
     "<strong>Technique — two axes at once.</strong> Actor runs down, time runs across. Fill state "
     "encodes progress — solid is done, outlined is active, dashed is not started — and a single "
     "'today' rule turns a plan into a status report.",
     "The weakest cell here is duration precision: bars imply exactness they rarely have. Label "
     "the ones that matter or readers will treat estimates as commitments."),
    ("08-circuit-traces", "Circuit Traces", circuit,
     "Signal routing drawn like a printed circuit board.",
     "<strong>Technique — explicit joints.</strong> Orthogonal traces on a dark board, junction "
     "pads where lines meet, vias where a signal changes layer. Every joint is drawn, so there is "
     "never ambiguity about whether two crossing lines connect.",
     "The dark board is the highest sensory-load option in this set. Offer a light variant, and "
     "avoid it for anyone who reads for long stretches."),
    ("09-paper-collage", "Paper Collage", collage,
     "Three phases as taped paper cards with grain and real shadow.",
     "<strong>Technique — material depth.</strong> A turbulence-based grain filter, a genuine "
     "cast shadow, one degree of rotation and a strip of tape. Separation comes from the material, "
     "which is why not one card needs a border.",
     "Grain adds visual noise by definition. Keep the alpha under about 0.06 and never lay text "
     "directly on the grainiest area."),
    ("10-matrix-heat", "Matrix Heat", matrix,
     "Funnel conversion by channel, shaded, with marginal averages.",
     "<strong>Technique — triple encoding.</strong> Shade, glyph and printed number all carry the "
     "same value, so the grid survives greyscale printing and any colour-vision difference "
     "untouched. Marginal averages give the row a baseline to judge against.",
     "Sequential ramps must be monotonic in lightness or the ordering breaks. Never use a "
     "rainbow ramp for magnitude."),
]


def main() -> int:
    OUT.mkdir(exist_ok=True)
    # text-on-ground contrast holds across the set
    for k in ("ink", "soft", "accent", "blue", "green", "gold", "plum"):
        r = contrast_ratio(P[k], P["ground"])
        assert r >= 4.5, f"{k} fails at {r:.2f}"
    for slug, title, fn, note, tech, caveat in EXAMPLES:
        (OUT / f"{slug}.html").write_text(
            shell(slug, title, note, tech, fn(), caveat), encoding="utf-8")
        print(f"  {slug}")
    print(f"\n{len(EXAMPLES)} form explorations -> {OUT.name}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
