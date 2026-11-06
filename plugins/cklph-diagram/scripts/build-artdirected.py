#!/usr/bin/env python3
"""Demos 23-44 — art direction.

Built from the premise that the word is not "modern", it is **art-directed**,
and that what makes a default diagram look cheap is a short enumerable list.
Demos 32-40 isolate one fix each so the effect can be seen on its own; 41 puts
the untreated and treated versions side by side.

  Style families        23 editorial · 24 visual essay · 25 disciplined sketch
                        26 isometric · 27 dark glass · 28 node-UI
                        29 constellation · 30 swiss · 31 motion filmstrip
  The nine fixes        32 stroke discipline · 33 type hierarchy · 34 elevation
                        35 radius scale · 36 terminators · 37 spacing grid
                        38 treated ground · 39 icon system · 40 palette ramp
  Composites            41 before/after · 42 editorial isometric
                        43 dark node-UI · 44 social card

Two grounded details worth keeping: elevation should clarify layering rather
than make things float, nested radii must be concentric (child <= parent), and
borders on non-neutral grounds get tinted toward the same hue instead of
reaching for a new one. Shadow stacks are layered ambient + direct light paired
with a crisp border, not one soft blob.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "skills/cklph-diagram/scripts"))
from colorlib import contrast_ratio  # noqa: E402

OUT = ROOT / "gallery/artdirected"
W, H = 900, 430

# warm neutral ramp + two restrained accents (fix #3 and #10)
N = {50: "#faf8f5", 100: "#f2eee8", 200: "#e4ded4", 300: "#c9c1b4",
     500: "#736a5f", 700: "#4e483f", 900: "#231f1a"}
A1, A2 = "#a8442a", "#2f5d6b"          # restrained, not primaries
DK = {"bg": "#08090a", "sur": "#111315", "sur2": "#16191c",
      "bd": "#24282c", "tx": "#f2f3f4", "dim": "#9aa1a8", "acc": "#7b8cf0"}


def shell(n, title, note, tech, svg, caveat=""):
    cav = f'<p class="cav"><strong>Watch out:</strong> {caveat}</p>' if caveat else ""
    return f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>{title}</title><style>
 body{{margin:0;padding:52px 40px;background:{N[50]};color:{N[900]};font-family:'Inter',system-ui,sans-serif;
  line-height:1.6;-webkit-font-smoothing:antialiased}}
 main{{max-width:960px;margin:0 auto}}
 .tag{{font-family:ui-monospace,monospace;font-size:13px;letter-spacing:.14em;text-transform:uppercase;
  color:{N[500]};margin:0 0 6px}}
 h1{{font-size:33px;font-weight:650;letter-spacing:-.022em;margin:0 0 10px}}
 .note{{color:{N[700]};font-size:17px;max-width:64ch;margin:0 0 6px}}
 .tech{{font-size:15px;max-width:68ch;margin:0 0 28px;padding:10px 14px;border-left:3px solid {A1};
  background:rgba(168,68,42,.05)}}
 .cav{{font-size:15px;color:{N[700]};max-width:68ch;margin:22px 0 0;padding:10px 14px;
  border-left:3px solid {N[300]};background:rgba(138,129,117,.08)}}
 svg{{width:100%;height:auto;display:block}}
 .alt{{margin-top:26px;padding-top:18px;border-top:1px solid {N[200]}}}
 .alt h2{{font-family:ui-monospace,monospace;font-size:13px;font-weight:500;letter-spacing:.14em;
  text-transform:uppercase;color:{N[500]};margin:0 0 8px}}
 .alt p{{color:{N[700]};font-size:15px;max-width:72ch;margin:0}}
 @media (prefers-reduced-motion:reduce){{*{{animation:none!important;transition:none!important}}}}
 @media (prefers-contrast:more){{body{{background:#fff;color:#000}}.note,.alt p,.tag,.cav{{color:#000}}}}
</style></head><body><main>
<p class="tag">demo {n}</p><h1>{title}</h1><p class="note">{note}</p><p class="tech">{tech}</p>
{svg}{cav}
<div class="alt"><h2>Described in words</h2><p>{note}</p></div></main></body></html>"""


def sv(body, defs="", w=W, h=H, bg=N[50], label=""):
    return (f'<svg viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg" role="img" '
            f'aria-labelledby="t d"><title id="t">{label}</title><desc id="d">{label}</desc>'
            f'<defs>{defs}</defs><rect width="{w}" height="{h}" fill="{bg}"/>{body}</svg>')


BLUR = "".join(f'<filter id="f{b}" x="-50%" y="-50%" width="200%" height="200%">'
               f'<feGaussianBlur stdDeviation="{b}"/></filter>' for b in (2, 4, 8, 16, 26))
GRAIN = ('<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3"/>'
         '<feColorMatrix type="saturate" values="0"/>'
         '<feComponentTransfer><feFuncA type="linear" slope=".05"/></feComponentTransfer></filter>')


def txt(x, y, s, size=15, w=400, fill=None, fam="'Inter',sans-serif", anc="start", ls="0"):
    return (f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{w}" fill="{fill or N[900]}" '
            f'font-family="{fam}" text-anchor="{anc}" letter-spacing="{ls}">{s}</text>')


# ============================================================ 23 editorial
def editorial():
    d = GRAIN
    b = f'<rect width="{W}" height="{H}" fill="#f6f0e4"/><rect width="{W}" height="{H}" fill="#f6f0e4" filter="url(#grain)" opacity=".5"/>'
    def blob(cx, cy, rx, ry, fill, stroke, label, sub):
        # irregular hand-drawn outline: a closed path with varied control points
        p = (f'M{cx-rx},{cy-4} C{cx-rx+6},{cy-ry-6} {cx-rx*0.3},{cy-ry} {cx},{cy-ry+2} '
             f'C{cx+rx*0.5},{cy-ry-4} {cx+rx},{cy-ry*0.5} {cx+rx-2},{cy+2} '
             f'C{cx+rx+4},{cy+ry-2} {cx+rx*0.4},{cy+ry} {cx-2},{cy+ry-3} '
             f'C{cx-rx*0.5},{cy+ry+4} {cx-rx-3},{cy+ry*0.5} {cx-rx},{cy-4} Z')
        return (f'<path d="{p}" fill="{fill}" opacity=".85"/>'
                f'<path d="{p}" fill="none" stroke="{stroke}" stroke-width="2.4" stroke-linejoin="round"/>'
                f'<path d="{p}" fill="none" stroke="{stroke}" stroke-width="1" opacity=".45" '
                f'transform="translate(2,2.5)"/>'
                + txt(cx, cy - 2, label, 19, 600, "#2c2318", "Georgia,serif", "middle")
                + txt(cx, cy + 20, sub, 13, 400, "#6b5c48", "Georgia,serif", "middle"))
    b += blob(180, 140, 96, 56, "#e8c9a0", "#8a5a2b", "Idea", "unstructured")
    b += blob(450, 200, 104, 62, "#c9dcc4", "#3f6b46", "Structure", "shaped")
    b += blob(720, 140, 92, 54, "#d9c4dd", "#6b4270", "Artefact", "shipped")
    for x1, y1, x2, y2 in ((280, 150, 344, 190), (556, 190, 626, 150)):
        b += (f'<path d="M{x1},{y1} C{(x1+x2)/2},{y1+18} {(x1+x2)/2},{y2+18} {x2},{y2}" fill="none" '
              f'stroke="#8a5a2b" stroke-width="2.2" stroke-linecap="round"/>'
              f'<path d="M{x2-9},{y2-4} L{x2},{y2} L{x2-6},{y2+8}" fill="none" stroke="#8a5a2b" stroke-width="2.2"/>')
    b += txt(60, 336, "Every idea passes through a shape before it becomes a thing.",
             17, 400, "#6b5c48", "Georgia,serif")
    b += txt(60, 366, "— the only sentence on the page", 13, 400, "#8a7a63", "Georgia,serif")
    b += f'<line x1="60" y1="300" x2="240" y2="300" stroke="#8a5a2b" stroke-width="1.5"/>'
    return sv(b, d, bg="#f6f0e4", label="Three hand-drawn blobs showing idea becoming artefact")


# ============================================================ 24 visual essay
def essay():
    b = ""
    b += f'<rect x="300" y="40" width="1" height="{H-90}" fill="{N[200]}"/>'
    steps = [(70, "01", "Request arrives", "edge accepts, tags, and stamps a trace id"),
             (150, "02", "Policy check", "the only place a request can be refused"),
             (230, "03", "Fan-out", "three workers, none of which can retry alone"),
             (310, "04", "Reconcile", "last writer wins; this is deliberate")]
    for y, num, title, note in steps:
        b += txt(60, y, num, 13, 500, A1, "ui-monospace,monospace", ls=".1em")
        b += txt(96, y, title, 18, 600)
        b += txt(96, y + 22, note, 14, 400, N[500])
        b += f'<circle cx="300" cy="{y-6}" r="5" fill="{N[50]}" stroke="{A1}" stroke-width="2"/>'
    b += f'<path d="M300,64 V316" stroke="{N[300]}" stroke-width="1.5" stroke-dasharray="3,5"/>'
    # margin annotation, the essay move
    b += (f'<path d="M700,140 C640,140 620,170 566,176" fill="none" stroke="{A2}" stroke-width="1.5" '
          f'stroke-dasharray="4,4"/><circle cx="566" cy="176" r="4" fill="{A2}"/>'
          f'<rect x="700" y="96" width="150" height="96" rx="10" fill="{N[100]}"/>'
          + txt(716, 122, "Where it breaks", 14, 650, A2)
          + txt(716, 144, "Policy runs before", 13, 400, N[700])
          + txt(716, 162, "auth resolves, so a", 13, 400, N[700])
          + txt(716, 180, "401 reads as a 403.", 13, 400, N[700]))
    b += txt(60, 380, "Numbered steps, one rule line, one margin note. The note is the point.",
             14, 400, N[500])
    return sv(b, label="A numbered four-step process with a margin annotation")


# ============================================================ 25 disciplined sketch
def sketch():
    import random
    random.seed(9)
    def rough(x, y, w, h, col, fill_op=.16):
        """Two offset passes + hachure fill — Rough.js grammar by hand."""
        o = ""
        for pas in range(2):
            pts, j = [], 2.2
            for (px, py) in ((x, y), (x + w, y), (x + w, y + h), (x, y + h), (x, y)):
                pts.append((px + random.uniform(-j, j), py + random.uniform(-j, j)))
            o += ('<path d="M' + " L".join(f"{a:.1f},{b:.1f}" for a, b in pts) +
                  f'" fill="none" stroke="{col}" stroke-width="{1.7-pas*.5:.1f}" '
                  f'stroke-linecap="round" opacity="{1-pas*.35}"/>')
        for k in range(int(w / 9)):
            sx = x + k * 9
            o = (f'<line x1="{sx:.0f}" y1="{y+h:.0f}" x2="{sx+h*0.6:.0f}" y2="{y:.0f}" '
                 f'stroke="{col}" stroke-width="1" opacity="{fill_op}"/>') + o
        return o
    b = ""
    cells = [(60, 90, "Sketch", A1), (340, 90, "Critique", "#3f6b46"), (620, 90, "Commit", A2)]
    for x, y, name, col in cells:
        b += rough(x, y, 200, 96, col)
        b += txt(x + 100, y + 46, name, 20, 600, N[900], "'Comic Neue',cursive", "middle")
        b += txt(x + 100, y + 70, "revise freely", 13, 400, N[500], "'Comic Neue',cursive", "middle")
    for x1, x2 in ((260, 340), (540, 620)):
        b += (f'<path d="M{x1},136 C{x1+28},132 {x2-28},140 {x2},138" fill="none" stroke="{N[700]}" '
              f'stroke-width="1.8" stroke-linecap="round"/>'
              f'<path d="M{x2-10},131 L{x2},138 L{x2-11},144" fill="none" stroke="{N[700]}" stroke-width="1.8"/>')
    b += rough(60, 250, 760, 84, N[500], .08)
    b += txt(84, 284, "The wobble is on a perfect grid underneath.", 17, 400, N[700], "'Comic Neue',cursive")
    b += txt(84, 310, "Imperfect stroke, exact alignment — that combination is what reads as considered rather than careless.",
             13, 400, N[500])
    return sv(b, label="Three sketched boxes with hachure fill and hand-drawn arrows")


# ============================================================ 26 isometric
def isometric():
    d = BLUR
    b = f'<rect width="{W}" height="{H}" fill="{N[100]}"/>'
    def block(cx, cy, w, dep, hgt, top, left, right, name, sub):
        hw, hd = w / 2, dep / 2
        tp = f"{cx},{cy-hd} {cx+hw},{cy} {cx},{cy+hd} {cx-hw},{cy}"
        lf = f"{cx-hw},{cy} {cx},{cy+hd} {cx},{cy+hd+hgt} {cx-hw},{cy+hgt}"
        rt = f"{cx+hw},{cy} {cx},{cy+hd} {cx},{cy+hd+hgt} {cx+hw},{cy+hgt}"
        return (f'<ellipse cx="{cx}" cy="{cy+hd+hgt+16}" rx="{hw*0.9}" ry="{hd*0.42}" '
                f'fill="{N[900]}" opacity=".16" filter="url(#f8)"/>'
                f'<polygon points="{lf}" fill="{left}"/><polygon points="{rt}" fill="{right}"/>'
                f'<polygon points="{tp}" fill="{top}"/>'
                f'<polygon points="{tp}" fill="none" stroke="{N[50]}" stroke-width="1" opacity=".5"/>'
                + txt(cx, cy + 4, name, 15, 650, "#20242b", anc="middle")
                + txt(cx, cy + 22, sub, 12, 400, "#4a5361", "ui-monospace,monospace", "middle"))
    # three-tone face shading: top lightest, right mid, left darkest
    b += block(230, 130, 200, 92, 46, "#9ec2d6", "#4d7d96", "#6d9db4", "edge", "cdn · waf")
    b += block(230, 268, 200, 92, 46, "#c7b4d8", "#7a5f92", "#9a7fb0", "app", "8 pods")
    b += block(620, 130, 200, 92, 46, "#e0c39a", "#a07a44", "#c09a62", "queue", "12k/s")
    b += block(620, 268, 200, 92, 46, "#a8cbb2", "#4f7d5e", "#6d9c7c", "store", "primary")
    for x1, y1, x2, y2 in ((330, 176, 520, 176), (330, 314, 520, 314), (230, 222, 230, 268)):
        b += (f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{N[700]}" stroke-width="2" '
              f'opacity=".55" stroke-dasharray="6,5"/>')
    b += txt(60, 400, "30° projection, three-tone faces, one ground shadow per block. "
                      "The shadow is what stops it looking like flat clipart.", 14, 400, N[500])
    return sv(b, d, bg=N[100], label="Four extruded isometric blocks with ground shadows")


# ============================================================ 27 dark glass
def darkglass():
    d = (BLUR + GRAIN +
         '<radialGradient id="wash" cx=".5" cy=".1" r=".8">'
         f'<stop offset="0" stop-color="{DK["acc"]}" stop-opacity=".30"/>'
         f'<stop offset="1" stop-color="{DK["acc"]}" stop-opacity="0"/></radialGradient>'
         '<linearGradient id="edge" x1="0" y1="0" x2="0" y2="1">'
         '<stop offset="0" stop-color="#ffffff" stop-opacity=".16"/>'
         '<stop offset="1" stop-color="#ffffff" stop-opacity=".04"/></linearGradient>')
    b = (f'<rect width="{W}" height="{H}" fill="{DK["bg"]}"/>'
         f'<rect width="{W}" height="{H}" fill="url(#wash)"/>')
    for gx in range(0, W + 1, 24):
        b += f'<line x1="{gx}" y1="0" x2="{gx}" y2="{H}" stroke="#ffffff" stroke-opacity=".025"/>'
    for gy in range(0, H + 1, 24):
        b += f'<line x1="0" y1="{gy}" x2="{W}" y2="{gy}" stroke="#ffffff" stroke-opacity=".025"/>'
    # focal glow behind the one node that matters
    b += f'<circle cx="450" cy="196" r="120" fill="{DK["acc"]}" opacity=".22" filter="url(#f26)"/>'
    def card(x, y, w, h, name, sub, focal=False):
        return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{DK["sur"]}" opacity=".92"/>'
                f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="none" '
                f'stroke="url(#edge)" stroke-width="1"/>'
                + (f'<rect x="{x+1}" y="{y+1}" width="{w-2}" height="{h-2}" rx="11" fill="none" '
                   f'stroke="{DK["acc"]}" stroke-opacity=".5" stroke-width="1"/>' if focal else "")
                + txt(x + 18, y + 32, name, 16, 550, DK["tx"], "ui-monospace,monospace", ls="-.01em")
                + txt(x + 18, y + 54, sub, 13, 400, DK["dim"], "ui-monospace,monospace"))
    b += card(60, 150, 200, 92, "ingest", "3 regions")
    b += card(350, 140, 200, 112, "transform", "focal path", True)
    b += card(640, 150, 200, 92, "serve", "p99 24ms")
    for x1, x2 in ((260, 350), (550, 640)):
        b += (f'<line x1="{x1}" y1="196" x2="{x2}" y2="196" stroke="{DK["acc"]}" stroke-width="1.5" '
              f'stroke-dasharray="6,5" opacity=".8"/>')
    b += txt(60, 330, "one accent · hairline borders · radial wash · grain", 13, 400,
             DK["dim"], "ui-monospace,monospace", ls=".14em")
    b += txt(60, 366, "Depth comes from border contrast and shadow layering, not from background colour shifts.",
             14, 400, DK["dim"])
    b += f'<rect width="{W}" height="{H}" fill="{DK["bg"]}" filter="url(#grain)" opacity=".55"/>'
    return sv(b, d, bg=DK["bg"], label="Three dark glass cards with a radial glow behind the focal node")


# ============================================================ 28 node UI
def nodeui():
    d = (BLUR + '<pattern id="dg" width="18" height="18" patternUnits="userSpaceOnUse">'
         f'<circle cx="1.6" cy="1.6" r="1.4" fill="{N[300]}"/></pattern>')
    b = f'<rect width="{W}" height="{H}" fill="{N[50]}"/><rect width="{W}" height="{H}" fill="url(#dg)"/>'
    def node(x, y, title, kind, rows, col, w=190):
        h = 48 + len(rows) * 26
        o = (f'<rect x="{x+1}" y="{y+3}" width="{w}" height="{h}" rx="10" fill="{N[900]}" opacity=".10" filter="url(#f4)"/>'
             f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="#ffffff"/>'
             f'<path d="M{x},{y+10} a10,10 0 0 1 10,-10 h{w-20} a10,10 0 0 1 10,10 v20 h-{w} Z" fill="{col}" opacity=".13"/>'
             f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="none" stroke="{N[200]}"/>'
             + txt(x + 14, y + 21, title, 14, 650, N[900], "ui-monospace,monospace")
             + txt(x + w - 14, y + 21, kind, 11, 500, col, "ui-monospace,monospace", "end", ".08em"))
        for i, (k, v) in enumerate(rows):
            yy = y + 48 + i * 26
            o += txt(x + 14, yy, k, 12.5, 400, N[500], "ui-monospace,monospace")
            o += txt(x + w - 14, yy, v, 12.5, 500, N[900], "ui-monospace,monospace", "end")
        # port handles
        o += (f'<circle cx="{x}" cy="{y+h/2}" r="5" fill="#ffffff" stroke="{col}" stroke-width="2"/>'
              f'<circle cx="{x+w}" cy="{y+h/2}" r="5" fill="#ffffff" stroke="{col}" stroke-width="2"/>')
        return o
    b += node(60, 90, "source", "INPUT", [("rows", "1.2M"), ("format", "parquet")], A2)
    b += node(360, 70, "transform", "LOGIC", [("steps", "4"), ("lang", "sql"), ("cache", "on")], A1)
    b += node(660, 90, "sink", "OUTPUT", [("target", "s3"), ("mode", "upsert")], "#3f6b46")
    for x1, y1, x2, y2 in ((250, 140, 360, 133), (550, 133, 660, 140)):
        b += (f'<path d="M{x1},{y1} C{x1+55},{y1} {x2-55},{y2} {x2},{y2}" fill="none" '
              f'stroke="{N[500]}" stroke-width="2"/>')
    # status pills
    for i, (lab, col) in enumerate([("running", "#3f6b46"), ("queued", "#8a6a1e"), ("idle", N[500])]):
        x = 60 + i * 128
        b += (f'<rect x="{x}" y="300" width="{len(lab)*7.6+34:.0f}" height="26" rx="13" fill="{col}" opacity=".12"/>'
              f'<circle cx="{x+16}" cy="313" r="4.5" fill="{col}"/>'
              + txt(x + 28, 318, lab, 13, 500, N[900]))
    # minimap chrome
    b += (f'<rect x="700" y="288" width="140" height="86" rx="8" fill="#ffffff" stroke="{N[200]}"/>'
          f'<rect x="712" y="300" width="28" height="18" rx="3" fill="{A2}" opacity=".4"/>'
          f'<rect x="756" y="312" width="30" height="20" rx="3" fill="{A1}" opacity=".4"/>'
          f'<rect x="800" y="300" width="26" height="18" rx="3" fill="#3f6b46" opacity=".4"/>'
          f'<rect x="706" y="294" width="70" height="46" rx="4" fill="none" stroke="{N[500]}" stroke-dasharray="3,3"/>'
          + txt(700, 390, "minimap", 12, 400, N[500], "ui-monospace,monospace"))
    b += txt(60, 390, "Cards with headers, port handles, status pills, dot grid — it reads as a running product.",
             14, 400, N[500])
    return sv(b, d, label="A node-based editor canvas with card nodes and port handles")


# ============================================================ 29 constellation
def constellation():
    import random
    random.seed(21)
    d = BLUR
    b = f'<rect width="{W}" height="{H}" fill="#0b0e13"/>'
    clusters = [(230, 190, "#6f9bd8", 20), (520, 150, "#c98a5e", 16), (660, 300, "#79b79a", 14)]
    pts = []
    for cx, cy, col, cnt in clusters:
        for i in range(cnt):
            a = random.uniform(0, 6.283)
            r = random.uniform(8, 118) ** 0.85
            pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r * .8, col,
                        random.random()))
    # edges: very low opacity, so density itself becomes shading
    for i in range(len(pts)):
        for j in range(i + 1, len(pts)):
            dx, dy = pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]
            if dx * dx + dy * dy < 6200:
                b += (f'<line x1="{pts[i][0]:.0f}" y1="{pts[i][1]:.0f}" x2="{pts[j][0]:.0f}" '
                      f'y2="{pts[j][1]:.0f}" stroke="{pts[i][2]}" stroke-width="1" opacity=".10"/>')
    for x, y, col, cent in pts:
        r = 2 + cent * 6
        if cent > .82:
            b += f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r*3:.0f}" fill="{col}" opacity=".18" filter="url(#f4)"/>'
        b += f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r:.1f}" fill="{col}" opacity="{.45+cent*.55:.2f}"/>'
    # labels only above a "zoom threshold" — i.e. only the hubs
    for cx, cy, col, _ in clusters:
        b += txt(cx, cy - 130, {"#6f9bd8": "auth", "#c98a5e": "billing",
                                "#79b79a": "search"}[col], 15, 600, "#e8eef6", anc="middle", ls=".06em")
    b += txt(60, 396, "Node size is centrality, colour is cluster, edges sit at 10% — density becomes shading.",
             14, 400, "#8f9bab")
    return sv(b, d, bg="#0b0e13", label="A force-directed constellation graph with three clusters")


# ============================================================ 30 swiss
def swiss():
    b = ""
    b += f'<line x1="60" y1="70" x2="840" y2="70" stroke="{N[900]}" stroke-width="2"/>'
    b += txt(60, 56, "SYSTEM OVERVIEW", 12, 500, N[900], "'Helvetica Neue',sans-serif", ls=".18em")
    b += txt(840, 56, "2026", 12, 500, N[500], "'Helvetica Neue',sans-serif", "end", ls=".18em")
    cols = [("01", "Ingest", "1,284,900", "events / day"),
            ("02", "Process", "312", "workers"),
            ("03", "Store", "48.2", "TB resident"),
            ("04", "Serve", "24", "ms p99")]
    for i, (num, name, val, unit) in enumerate(cols):
        x = 60 + i * 200
        b += txt(x, 110, num, 12, 500, A1, "'Helvetica Neue',sans-serif", ls=".14em")
        b += txt(x, 150, name, 25, 600, N[900], "'Helvetica Neue',sans-serif", ls="-.02em")
        # tabular numerals: the detail that separates a report from a slide
        b += (f'<text x="{x}" y="206" font-size="34" font-weight="300" fill="{N[900]}" '
              f'font-family="\'Helvetica Neue\',sans-serif" style="font-variant-numeric:tabular-nums" '
              f'letter-spacing="-.02em">{val}</text>')
        b += txt(x, 228, unit, 13, 400, N[500], "'Helvetica Neue',sans-serif")
        if i:
            b += f'<line x1="{x-30}" y1="96" x2="{x-30}" y2="240" stroke="{N[200]}"/>'
    b += f'<line x1="60" y1="270" x2="840" y2="270" stroke="{N[900]}" stroke-width="1"/>'
    for i, (a, bl) in enumerate([("Ingest → Process", "asynchronous, at-least-once"),
                                 ("Process → Store", "batched, 30s windows"),
                                 ("Store → Serve", "read replica, eventual")]):
        y = 302 + i * 30
        b += txt(60, y, a, 15, 600, N[900], "'Helvetica Neue',sans-serif")
        b += txt(320, y, bl, 15, 400, N[500], "'Helvetica Neue',sans-serif")
        b += f'<line x1="60" y1="{y+10}" x2="840" y2="{y+10}" stroke="{N[200]}"/>'
    b += txt(60, 410, "No boxes. Rules, numerals and type do the structural work.", 13, 400, N[500])
    return sv(b, label="A Swiss typographic system overview with no boxes")


# ============================================================ 31 motion filmstrip
def filmstrip():
    b = ""
    frames = 5
    for f in range(frames):
        x = 40 + f * 172
        b += (f'<rect x="{x}" y="80" width="156" height="150" rx="8" fill="#ffffff" stroke="{N[200]}"/>'
              + txt(x + 10, 100, f"{f*1.5:.1f}s", 11, 500, N[500], "ui-monospace,monospace"))
        prog = f / (frames - 1)
        for i in range(3):
            cy = 128 + i * 34
            lit = prog > i / 3
            col = A1 if lit else N[200]
            b += (f'<rect x="{x+18}" y="{cy}" width="52" height="24" rx="5" fill="{col}" '
                  f'opacity="{.9 if lit else 1}"/>')
            b += (f'<rect x="{x+92}" y="{cy}" width="46" height="24" rx="5" fill="none" '
                  f'stroke="{col}" stroke-width="1.6"/>')
            dash = max(1, 46 * min(1, max(0, prog * 3 - i)))
            b += (f'<line x1="{x+70}" y1="{cy+12}" x2="{x+70+22*min(1,max(0,prog*3-i)):.0f}" '
                  f'y2="{cy+12}" stroke="{col}" stroke-width="2"/>')
    b += f'<line x1="40" y1="262" x2="836" y2="262" stroke="{N[300]}"/>'
    for f in range(frames):
        x = 40 + f * 172 + 78
        b += f'<circle cx="{x}" cy="262" r="4" fill="{A1 if f==0 else N[300]}"/>'
    b += txt(40, 300, "A six-second loop, drawn as its key frames.", 17, 600)
    b += txt(40, 326, "Static beats animation for print and for accessibility; the filmstrip keeps the "
                      "sequencing legible without motion. Ship the loop for social, this for the doc.",
             14, 400, N[500])
    return sv(b, label="Five key frames of an animated loop shown as a filmstrip")


# ============================================================ 32-40 the nine fixes
def fix_stroke():
    b = txt(60, 60, "Pure black vs tinted stroke", 15, 650)
    for i, (lab, fill, stroke, note) in enumerate([
            ("#000 at 100%", "#e8eef4", "#000000", "reads as clipart"),
            ("neutral 900 @ 70%", "#e8eef4", "rgba(35,31,26,.7)", "softer, still crisp"),
            ("tinted from fill", "#e8eef4", "#3d5c73", "derived from the fill hue"),
            ("tinted + inner ring", "#e8eef4", "#3d5c73", "the expensive one")]):
        x = 60 + i * 205
        b += f'<rect x="{x}" y="90" width="170" height="96" rx="10" fill="{fill}" stroke="{stroke}" stroke-width="1.6"/>'
        if i == 3:
            b += f'<rect x="{x+3}" y="93" width="164" height="90" rx="7.5" fill="none" stroke="#ffffff" stroke-opacity=".85"/>'
        b += txt(x, 208, lab, 13, 600) + txt(x, 226, note, 12, 400, N[500])
    b += txt(60, 280, "Rule: never #000. Use the darkest neutral at 60–80%, or derive the stroke from the "
                      "fill's own hue so the edge belongs to the shape.", 14, 400, N[700])
    return sv(b, h=320, label="Four stroke treatments from pure black to tinted with inner ring")


def fix_type():
    b = txt(60, 56, "Three weights, four sizes, tabular numerals", 15, 650)
    rows = [("Display", 30, 600, "-.022em"), ("Title", 20, 600, "-.012em"),
            ("Body", 15, 400, "0"), ("Label", 12, 500, ".12em")]
    for i, (n, s, w, ls) in enumerate(rows):
        y = 108 + i * 52
        b += txt(60, y, n.upper(), 11, 500, N[500], "ui-monospace,monospace", ls=".14em")
        b += txt(150, y + 4, f"Ingest pipeline", s, w, N[900], ls=ls)
        b += txt(560, y + 4, f"{s}px / {w} / {ls}", 12, 400, N[500], "ui-monospace,monospace")
        b += f'<line x1="60" y1="{y+18}" x2="840" y2="{y+18}" stroke="{N[200]}"/>'
    for i, (lab, val) in enumerate([("proportional", "1,284,900"), ("tabular", "1,284,900")]):
        y = 340 + i * 34
        b += txt(60, y, lab, 12, 500, N[500], "ui-monospace,monospace")
        style = 'style="font-variant-numeric:tabular-nums"' if i else ""
        b += (f'<text x="200" y="{y}" font-size="22" font-weight="400" fill="{N[900]}" {style}>{val}</text>')
        b += (f'<text x="360" y="{y}" font-size="22" font-weight="400" fill="{N[900]}" {style}>1,111,111</text>')
    b += txt(60, 412, "Metrics must use tabular numerals or columns of numbers will not align.",
             14, 400, N[700])
    return sv(b, h=440, label="A type scale of four sizes with proportional and tabular numerals compared")


def fix_elev():
    d = BLUR
    b = txt(60, 56, "A shadow stack, not a shadow", 15, 650)
    layers = [("border only", [("bd", 0, 0, 0)]),
              ("+ ambient", [("bd", 0, 0, 0), ("am", 0, 2, 2)]),
              ("+ distance", [("bd", 0, 0, 0), ("am", 0, 2, 2), ("di", 0, 8, 8)]),
              ("+ inner ring", [("bd", 0, 0, 0), ("am", 0, 2, 2), ("di", 0, 8, 8), ("ir", 0, 0, 0)])]
    for i, (lab, stack) in enumerate(layers):
        x = 60 + i * 205
        for kind, dx, dy, bl in stack:
            if kind == "am":
                b += f'<rect x="{x+dx}" y="{90+dy}" width="170" height="92" rx="12" fill="{N[900]}" opacity=".10" filter="url(#f2)"/>'
            if kind == "di":
                b += f'<rect x="{x+dx+6}" y="{90+dy}" width="158" height="92" rx="12" fill="{N[900]}" opacity=".08" filter="url(#f8)"/>'
        b += f'<rect x="{x}" y="90" width="170" height="92" rx="12" fill="#ffffff" stroke="{N[200]}"/>'
        if any(k == "ir" for k, *_ in stack):
            b += f'<rect x="{x+2.5}" y="92.5" width="165" height="87" rx="10" fill="none" stroke="#fafafa"/>'
        b += txt(x, 206, lab, 13, 600)
    b += txt(60, 254, "Each layer has a job: a 1px spread makes the border, a 2px blur is ambient light, "
                      "an 8px blur handles distance, and an inner near-white ring makes the card glow from "
                      "within. That is why it reads as built rather than floating.", 14, 400, N[700])
    b += txt(60, 316, "Elevation should clarify layering — do not nest elevated surfaces without reason.",
             14, 400, N[500])
    return sv(b, d, h=350, label="Four cards showing a shadow stack built up layer by layer")


def fix_radius():
    b = txt(60, 56, "Concentric radii: child ≤ parent, curves aligned", 15, 650)
    b += f'<rect x="60" y="90" width="330" height="180" rx="20" fill="{N[100]}" stroke="{N[200]}"/>'
    b += f'<rect x="76" y="106" width="298" height="72" rx="12" fill="#ffffff" stroke="{N[200]}"/>'
    b += f'<rect x="90" y="120" width="120" height="44" rx="8" fill="{A2}" opacity=".16"/>'
    b += txt(84, 206, "20 → 12 → 8 · curves stay parallel", 13, 400, N[700])
    b += txt(84, 232, "correct", 14, 650, "#3f6b46")
    b += f'<rect x="470" y="90" width="330" height="180" rx="4" fill="{N[100]}" stroke="{N[200]}"/>'
    b += f'<rect x="486" y="106" width="298" height="72" rx="18" fill="#ffffff" stroke="{N[200]}"/>'
    b += f'<rect x="500" y="120" width="120" height="44" rx="2" fill={chr(34)}{A1}{chr(34)} opacity=".16"/>'
    b += txt(494, 206, "4 → 18 → 2 · corners fight each other", 13, 400, N[700])
    b += txt(494, 232, "wrong", 14, 650, A1)
    b += txt(60, 292, "Pick one radius scale and never deviate. A child corner larger than its parent is the "
                      "single most common tell in a default diagram.", 14, 400, N[700])
    return sv(b, h=330, label="Concentric versus mismatched corner radii compared")


def fix_terminators():
    b = txt(60, 56, "The filled triangle is the tell", 15, 650)
    ends = [("default triangle", f'<polygon points="0,-5 11,0 0,5" fill="{N[900]}"/>', "instantly reads as default"),
            ("open chevron", f'<path d="M0,-5 L10,0 L0,5" fill="none" stroke="{N[900]}" stroke-width="1.8"/>', "lighter, still directional"),
            ("dot origin", f'<circle cx="0" cy="0" r="4.5" fill="{N[50]}" stroke="{N[900]}" stroke-width="2"/>', "marks the source, not the target"),
            ("tapered", f'<path d="M-40,-3 Q-10,-1 2,0 Q-10,1 -40,3 Z" fill="{N[900]}"/>', "the stroke is the arrow"),
            ("bracket", f'<path d="M2,-7 L2,7 M2,0 L-6,0" stroke="{N[900]}" stroke-width="2" fill="none"/>', "terminates without pointing"),
            ("socket", f'<circle cx="0" cy="0" r="6" fill="none" stroke="{N[900]}" stroke-width="2"/><circle cx="0" cy="0" r="2" fill="{N[900]}"/>', "a port, not a destination")]
    for i, (lab, mk, note) in enumerate(ends):
        x, y = 60 + (i % 3) * 270, 110 + (i // 3) * 110
        b += f'<line x1="{x}" y1="{y}" x2="{x+150}" y2="{y}" stroke="{N[900]}" stroke-width="2"/>'
        b += f'<g transform="translate({x+150},{y})">{mk}</g>'
        b += txt(x, y + 30, lab, 13.5, 600) + txt(x, y + 48, note, 12, 400, N[500])
    b += txt(60, 340, "Custom terminators are cheap to draw and change the read completely.", 14, 400, N[700])
    return sv(b, h=370, label="Six connector terminators compared against the default triangle")


def fix_grid():
    b = txt(60, 56, "8px grid, with optical adjustment", 15, 650)
    for gx in range(60, 841, 8):
        b += f'<line x1="{gx}" y1="86" x2="{gx}" y2="250" stroke="{A2}" stroke-opacity=".10"/>'
    xs = [(60, 176, "16"), (252, 176, "16"), (444, 176, "16")]
    for i, (x, w, gap) in enumerate(xs):
        b += f'<rect x="{x}" y="102" width="{w}" height="88" rx="8" fill="#ffffff" stroke="{N[200]}"/>'
        b += txt(x + 14, 134, "aligned", 14, 600)
        b += txt(x + 14, 156, "8px multiples", 12, 400, N[500], "ui-monospace,monospace")
        if i < 2:
            b += (f'<line x1="{x+w}" y1="210" x2="{x+w+16}" y2="210" stroke="{A1}" stroke-width="1.5"/>'
                  + txt(x + w + 8, 228, gap, 11, 500, A1, "ui-monospace,monospace", "middle"))
    b += f'<rect x="644" y="100" width="176" height="92" rx="8" fill="{N[100]}" stroke="{A1}" stroke-dasharray="5,4"/>'
    b += txt(658, 134, "optical", 14, 600)
    b += txt(658, 156, "−2px, looks right", 12, 400, A1, "ui-monospace,monospace")
    b += txt(60, 288, "Everything on the grid, then break it by a pixel or two where the eye disagrees with "
                      "the maths. Circles and triangles almost always need the adjustment.", 14, 400, N[700])
    return sv(b, h=330, label="Cards on an 8px grid with one optically adjusted")


def fix_ground():
    d = (BLUR + GRAIN +
         '<pattern id="dots2" width="16" height="16" patternUnits="userSpaceOnUse">'
         f'<circle cx="1.5" cy="1.5" r="1.3" fill="{N[300]}"/></pattern>'
         '<radialGradient id="rw" cx=".5" cy=".3" r=".75">'
         f'<stop offset="0" stop-color="{A2}" stop-opacity=".16"/>'
         f'<stop offset="1" stop-color="{A2}" stop-opacity="0"/></radialGradient>')
    b = txt(60, 56, "Untreated white is the giveaway", 15, 650)
    panels = [("pure white", '<rect x="{x}" y="90" width="180" height="120" fill="#ffffff" stroke="' + N[200] + '"/>'),
              ("dot grid", '<rect x="{x}" y="90" width="180" height="120" fill="#ffffff" stroke="' + N[200] + '"/>'
                           '<rect x="{x}" y="90" width="180" height="120" fill="url(#dots2)"/>'),
              ("radial wash", '<rect x="{x}" y="90" width="180" height="120" fill="#ffffff" stroke="' + N[200] + '"/>'
                              '<rect x="{x}" y="90" width="180" height="120" fill="url(#rw)"/>'),
              ("grain", '<rect x="{x}" y="90" width="180" height="120" fill="#ffffff" stroke="' + N[200] + '"/>'
                        '<rect x="{x}" y="90" width="180" height="120" fill="#ffffff" filter="url(#grain)" opacity=".8"/>')]
    for i, (lab, mk) in enumerate(panels):
        x = 60 + i * 200
        b += mk.format(x=x)
        b += f'<rect x="{x+34}" y="126" width="112" height="48" rx="8" fill="{N[50]}" stroke="{N[300]}"/>'
        b += txt(x + 90, 155, "node", 13, 600, N[900], anc="middle")
        b += txt(x, 232, lab, 13.5, 600)
    b += txt(60, 282, "All four grounds are legible. Only the first looks like a default export.",
             14, 400, N[700])
    return sv(b, d, h=320, label="Four background treatments: plain, dot grid, radial wash and grain")


def fix_icons():
    b = txt(60, 56, "One grid, one stroke weight", 15, 650)
    def ico(x, y, kind, sw=1.8, col=None):
        c = col or N[900]
        g = f'<g transform="translate({x},{y})" fill="none" stroke="{c}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round">'
        p = {"server": '<rect x="1" y="2" width="22" height="8" rx="2"/><rect x="1" y="14" width="22" height="8" rx="2"/><circle cx="6" cy="6" r="1.3" fill="'+c+'"/><circle cx="6" cy="18" r="1.3" fill="'+c+'"/>',
             "cloud": '<path d="M6,18 a5,5 0 0 1 0,-10 a7,7 0 0 1 13,2 a4,4 0 0 1 -1,8 Z"/>',
             "db": '<ellipse cx="12" cy="5" rx="9" ry="3.4"/><path d="M3,5 v14 a9,3.4 0 0 0 18,0 V5"/><path d="M3,12 a9,3.4 0 0 0 18,0"/>',
             "shield": '<path d="M12,2 l9,4 v7 a11,11 0 0 1 -9,9 a11,11 0 0 1 -9,-9 V6 Z"/>',
             "queue": '<rect x="2" y="6" width="6" height="12" rx="1.5"/><rect x="10" y="6" width="6" height="12" rx="1.5"/><rect x="18" y="6" width="4" height="12" rx="1.5"/>',
             "globe": '<circle cx="12" cy="12" r="9.5"/><path d="M2.5,12 h19"/><path d="M12,2.5 a14,9.5 0 0 1 0,19 a14,9.5 0 0 1 0,-19"/>'}[kind]
        return g + p + "</g>"
    for i, k in enumerate(["server", "cloud", "db", "shield", "queue", "globe"]):
        x = 66 + i * 116
        b += f'<rect x="{x-14}" y="94" width="52" height="52" rx="10" fill="{N[100]}"/>'
        b += ico(x, 106, k)
        b += txt(x + 12, 168, k, 12, 500, N[500], "ui-monospace,monospace", "middle")
    b += txt(60, 216, "Same 24px box, same 1.8 stroke, same round joins.", 14, 400, N[700])
    for i, (k, sw) in enumerate([("server", 1), ("cloud", 2.6), ("db", 1.8)]):
        x = 66 + i * 116
        b += f'<rect x="{x-14}" y="244" width="52" height="52" rx="10" fill="#fdecec"/>'
        b += ico(x, 256, k, sw, A1)
        b += txt(x + 12, 318, f"{sw}px", 12, 500, A1, "ui-monospace,monospace", "middle")
    b += txt(60, 352, "Mixed weights from three icon packs — the most common way a good diagram goes cheap.",
             14, 400, N[700])
    return sv(b, h=386, label="A consistent icon set compared with mismatched stroke weights")


def fix_palette():
    b = txt(60, 56, "A tinted neutral ramp plus two accents", 15, 650)
    for i, (k, v) in enumerate(sorted(N.items())):
        x = 60 + i * 106
        b += f'<rect x="{x}" y="86" width="92" height="64" rx="8" fill="{v}" stroke="{N[300]}"/>'
        b += txt(x, 168, f"neutral {k}", 12, 500, N[700], "ui-monospace,monospace")
        b += txt(x, 186, v, 11, 400, N[500], "ui-monospace,monospace")
    for i, (lab, c) in enumerate([("accent 1", A1), ("accent 2", A2)]):
        x = 60 + i * 106
        b += f'<rect x="{x}" y="216" width="92" height="64" rx="8" fill="{c}"/>'
        b += txt(x, 298, lab, 12, 500, N[700], "ui-monospace,monospace")
        b += txt(x, 316, c, 11, 400, N[500], "ui-monospace,monospace")
    for i, (lab, c) in enumerate([("primary red", "#ff0000"), ("primary blue", "#0000ff"),
                                  ("primary green", "#00cc00")]):
        x = 380 + i * 106
        b += f'<rect x="{x}" y="216" width="92" height="64" rx="8" fill="{c}"/>'
        b += txt(x, 298, lab, 12, 500, A1, "ui-monospace,monospace")
        b += txt(x, 316, "avoid", 11, 400, A1, "ui-monospace,monospace")
    b += txt(60, 356, "The neutrals are warm, not grey — every one carries a trace of the accent hue. "
                      "That shared tint is what makes a palette feel authored.", 14, 400, N[700])
    return sv(b, h=390, label="A warm neutral ramp with two restrained accents beside saturated primaries")


# ============================================================ 41 before / after
def beforeafter():
    d = BLUR
    b = ""
    # BEFORE — every failure on purpose
    b += f'<rect x="0" y="0" width="450" height="{H}" fill="#ffffff"/>'
    b += txt(24, 34, "BEFORE", 12, 700, "#000000", "Arial,sans-serif", ls=".1em")
    boxes = [(30, 70, "#ff0000", 0), (170, 70, "#0000ff", 8), (310, 70, "#00cc00", 3)]
    for x, y, c, r in boxes:
        b += f'<rect x="{x}" y="{y}" width="110" height="60" rx="{r}" fill="#ffffff" stroke="#000000" stroke-width="2"/>'
        b += (f'<text x="{x+55}" y="{y+35}" font-size="13" fill="#000000" font-family="Arial" '
              f'text-anchor="middle">Service</text>')
    for x1, x2 in ((140, 170), (280, 310)):
        b += (f'<line x1="{x1}" y1="100" x2="{x2-8}" y2="100" stroke="#000000" stroke-width="2"/>'
              f'<polygon points="{x2-8},95 {x2},100 {x2-8},105" fill="#000000"/>')
    b += f'<rect x="30" y="180" width="110" height="60" rx="0" fill="#ff0000" opacity=".25" stroke="#000" stroke-width="2"/>'
    b += f'<rect x="185" y="176" width="120" height="66" rx="12" fill="#0000ff" opacity=".25" stroke="#000" stroke-width="2"/>'
    for i, s in enumerate(["Pure #000 strokes", "Saturated primaries", "Mixed radii 0/3/8/12",
                           "One type weight", "Default triangles", "Untreated white"]):
        b += txt(30, 286 + i * 22, f"× {s}", 12.5, 400, "#000000", "Arial,sans-serif")

    # AFTER — the same content, nine fixes applied
    b += f'<rect x="450" y="0" width="450" height="{H}" fill="{N[50]}"/>'
    b += f'<rect x="450" y="0" width="450" height="{H}" fill="url(#rw2)"/>'
    b += txt(474, 34, "AFTER", 12, 500, N[500], "ui-monospace,monospace", ls=".16em")
    cards = [(480, 74, "Ingest", "edge", A2), (620, 74, "Transform", "core", A1), (760, 74, "Serve", "api", "#3f6b46")]
    for x, y, name, kind, col in cards:
        b += f'<rect x="{x+1}" y="{y+3}" width="112" height="62" rx="10" fill="{N[900]}" opacity=".09" filter="url(#f4)"/>'
        b += f'<rect x="{x}" y="{y}" width="112" height="62" rx="10" fill="#ffffff" stroke="{N[200]}"/>'
        b += f'<rect x="{x+2}" y="{y+2}" width="108" height="58" rx="8" fill="none" stroke="#fafafa"/>'
        b += f'<rect x="{x+12}" y="{y+12}" width="4" height="4" rx="2" fill="{col}"/>'
        b += txt(x + 24, y + 16, kind.upper(), 9.5, 500, col, "ui-monospace,monospace", ls=".14em")
        b += txt(x + 12, y + 42, name, 15, 600, N[900], ls="-.012em")
    for x1, x2 in ((592, 620), (732, 760)):
        b += (f'<path d="M{x1},105 Q{(x1+x2)/2},105 {x2-7},105" fill="none" stroke="{N[500]}" stroke-width="1.6"/>'
              f'<path d="M{x2-13},101 L{x2-6},105 L{x2-13},109" fill="none" stroke="{N[500]}" stroke-width="1.6"/>')
    b += f'<rect x="480" y="180" width="112" height="62" rx="10" fill="{A2}" opacity=".10"/>'
    b += f'<rect x="480" y="180" width="112" height="62" rx="10" fill="none" stroke="{A2}" stroke-opacity=".45"/>'
    b += f'<rect x="632" y="180" width="112" height="62" rx="10" fill="{A1}" opacity=".10"/>'
    b += f'<rect x="632" y="180" width="112" height="62" rx="10" fill="none" stroke="{A1}" stroke-opacity=".45"/>'
    for i, s in enumerate(["Tinted strokes, no #000", "Warm ramp + 2 accents", "One radius scale",
                           "3 weights, 4 sizes", "Custom terminators", "Dot grid + wash"]):
        b += txt(480, 286 + i * 22, f"· {s}", 12.5, 400, N[700])
    b += f'<line x1="450" y1="0" x2="450" y2="{H}" stroke="{N[300]}"/>'
    d += ('<radialGradient id="rw2" cx=".5" cy=".2" r=".8">'
          f'<stop offset="0" stop-color="{A2}" stop-opacity=".10"/>'
          f'<stop offset="1" stop-color="{A2}" stop-opacity="0"/></radialGradient>')
    return sv(b, d, label="The same three-service diagram before and after nine art-direction fixes")


# ============================================================ 42-44 composites
def edit_iso():
    d = BLUR + GRAIN
    b = f'<rect width="{W}" height="{H}" fill="#f4ecdd"/><rect width="{W}" height="{H}" fill="#f4ecdd" filter="url(#grain)" opacity=".55"/>'
    def blk(cx, cy, w, dep, hgt, top, lf, rt, name):
        hw, hd = w / 2, dep / 2
        return (f'<ellipse cx="{cx}" cy="{cy+hd+hgt+12}" rx="{hw*.85}" ry="{hd*.4}" fill="#5a4630" opacity=".18" filter="url(#f8)"/>'
                f'<polygon points="{cx-hw},{cy} {cx},{cy+hd} {cx},{cy+hd+hgt} {cx-hw},{cy+hgt}" fill="{lf}"/>'
                f'<polygon points="{cx+hw},{cy} {cx},{cy+hd} {cx},{cy+hd+hgt} {cx+hw},{cy+hgt}" fill="{rt}"/>'
                f'<polygon points="{cx},{cy-hd} {cx+hw},{cy} {cx},{cy+hd} {cx-hw},{cy}" fill="{top}"/>'
                f'<polygon points="{cx},{cy-hd} {cx+hw},{cy} {cx},{cy+hd} {cx-hw},{cy}" fill="none" stroke="#6b5433" stroke-width="1.6"/>'
                + txt(cx, cy + 4, name, 15, 600, "#3a2c1c", "Georgia,serif", "middle"))
    b += blk(210, 150, 190, 88, 42, "#e0c9a0", "#a8875a", "#c4a476", "collect")
    b += blk(460, 240, 190, 88, 42, "#c9d8bd", "#7f9370", "#9bb08a", "refine")
    b += blk(700, 150, 190, 88, 42, "#d8c0cd", "#96738a", "#b492a6", "publish")
    for x1, y1, x2, y2 in ((305, 194, 372, 240), (555, 240, 620, 194)):
        b += (f'<path d="M{x1},{y1} C{(x1+x2)/2},{y1+14} {(x1+x2)/2},{y2+14} {x2},{y2}" fill="none" '
              f'stroke="#6b5433" stroke-width="2" stroke-linecap="round"/>')
    b += txt(60, 356, "Warm paper and a hand-set serif over a strict 30° projection.", 17, 400, "#5a4630", "Georgia,serif")
    b += txt(60, 384, "Two families that are usually kept apart; the grain is what lets them sit together.", 13, 400, "#7d6a4e")
    return sv(b, d, bg="#f4ecdd", label="Isometric blocks rendered in a warm editorial palette")


def dark_node():
    d = (BLUR + '<pattern id="dg2" width="22" height="22" patternUnits="userSpaceOnUse">'
         '<circle cx="1.4" cy="1.4" r="1.2" fill="#ffffff" fill-opacity=".07"/></pattern>'
         '<radialGradient id="gl" cx=".5" cy=".5" r=".5">'
         f'<stop offset="0" stop-color="{DK["acc"]}" stop-opacity=".34"/>'
         f'<stop offset="1" stop-color="{DK["acc"]}" stop-opacity="0"/></radialGradient>')
    b = (f'<rect width="{W}" height="{H}" fill="{DK["bg"]}"/>'
         f'<rect width="{W}" height="{H}" fill="url(#dg2)"/>'
         f'<ellipse cx="450" cy="180" rx="240" ry="150" fill="url(#gl)"/>')
    def n(x, y, title, kind, rows, col, focal=False):
        h = 44 + len(rows) * 24
        o = (f'<rect x="{x}" y="{y}" width="196" height="{h}" rx="10" fill="{DK["sur"]}"/>'
             f'<rect x="{x}" y="{y}" width="196" height="{h}" rx="10" fill="none" '
             f'stroke="{DK["acc"] if focal else DK["bd"]}" stroke-opacity="{.7 if focal else 1}"/>'
             f'<path d="M{x},{y+10} a10,10 0 0 1 10,-10 h176 a10,10 0 0 1 10,10 v18 h-196 Z" fill="{col}" fill-opacity=".16"/>'
             + txt(x + 14, y + 19, title, 13, 550, DK["tx"], "ui-monospace,monospace", ls="-.01em")
             + txt(x + 182, y + 19, kind, 10, 500, col, "ui-monospace,monospace", "end", ls=".12em"))
        for i, (k, v) in enumerate(rows):
            yy = y + 46 + i * 24
            o += txt(x + 14, yy, k, 12, 400, DK["dim"], "ui-monospace,monospace")
            o += txt(x + 182, yy, v, 12, 500, DK["tx"], "ui-monospace,monospace", "end")
        o += (f'<circle cx="{x}" cy="{y+h/2}" r="4.5" fill="{DK["bg"]}" stroke="{col}" stroke-width="1.8"/>'
              f'<circle cx="{x+196}" cy="{y+h/2}" r="4.5" fill="{DK["bg"]}" stroke="{col}" stroke-width="1.8"/>')
        return o
    b += n(60, 110, "ingest", "SRC", [("rate", "12k/s"), ("lag", "0.4s")], "#5fb0d8")
    b += n(352, 92, "enrich", "CORE", [("hits", "98.2%"), ("p99", "24ms"), ("cache", "warm")], DK["acc"], True)
    b += n(644, 110, "publish", "SINK", [("topics", "6"), ("acks", "all")], "#79b79a")
    for x1, y1, x2, y2 in ((256, 152, 352, 152), (548, 152, 644, 152)):
        b += (f'<path d="M{x1},{y1} C{x1+40},{y1} {x2-40},{y2} {x2},{y2}" fill="none" '
              f'stroke="{DK["acc"]}" stroke-width="1.5" stroke-opacity=".75" stroke-dasharray="5,4"/>')
    b += txt(60, 316, "LINEAR × REACT FLOW", 11, 500, DK["dim"], "ui-monospace,monospace", ls=".18em")
    b += txt(60, 348, "Near-black ground, hairline borders, one indigo accent, port handles and a header "
                      "tint per node. The two families share a grammar, so they combine cleanly.",
             14, 400, DK["dim"])
    return sv(b, d, bg=DK["bg"], label="A dark node-based canvas combining Linear and React Flow conventions")


def social():
    """1200×630 — the LinkedIn scroll-stopper aspect."""
    d = (BLUR + GRAIN + '<radialGradient id="sw" cx=".2" cy=".15" r=".9">'
         f'<stop offset="0" stop-color="{A1}" stop-opacity=".18"/>'
         f'<stop offset="1" stop-color="{A1}" stop-opacity="0"/></radialGradient>')
    Ws, Hs = 1200, 630
    b = (f'<rect width="{Ws}" height="{Hs}" fill="{N[50]}"/>'
         f'<rect width="{Ws}" height="{Hs}" fill="url(#sw)"/>')
    b += txt(72, 96, "SYSTEM NOTE / 04", 15, 500, A1, "ui-monospace,monospace", ls=".2em")
    b += (f'<text x="72" y="176" font-size="58" font-weight="600" fill="{N[900]}" '
          f'letter-spacing="-.026em">Every retry is a</text>'
          f'<text x="72" y="240" font-size="58" font-weight="600" fill="{N[900]}" '
          f'letter-spacing="-.026em">decision you deferred.</text>')
    b += f'<line x1="72" y1="286" x2="330" y2="286" stroke="{A1}" stroke-width="3"/>'
    stages = [("attempt", A2, 0), ("fail", A1, 1), ("wait", N[500], 2), ("attempt", A2, 3), ("give up", N[700], 4)]
    for name, col, i in stages:
        x = 72 + i * 216
        b += f'<rect x="{x+2}" y="360" width="180" height="86" rx="14" fill="{N[900]}" opacity=".08" filter="url(#f8)"/>'
        b += f'<rect x="{x}" y="356" width="180" height="86" rx="14" fill="#ffffff" stroke="{N[200]}"/>'
        b += f'<rect x="{x+2}" y="358" width="176" height="82" rx="12" fill="none" stroke="#fafafa"/>'
        b += f'<circle cx="{x+22}" cy="384" r="5" fill="{col}"/>'
        b += txt(x + 38, 389, f"0{i+1}", 13, 500, N[500], "ui-monospace,monospace")
        b += txt(x + 20, 422, name, 20, 600, N[900], ls="-.015em")
        if i < 4:
            b += (f'<path d="M{x+186},399 L{x+206},399" stroke="{N[300]}" stroke-width="2"/>'
                  f'<path d="M{x+200},394 L{x+206},399 L{x+200},404" fill="none" stroke="{N[300]}" stroke-width="2"/>')
    b += txt(72, 526, "The backoff curve is a policy. Write it down or the queue writes it for you.",
             21, 400, N[700])
    b += txt(72, 578, "yourhandle.example", 15, 500, N[500], "ui-monospace,monospace", ls=".08em")
    b += f'<rect width="{Ws}" height="{Hs}" fill="{N[50]}" filter="url(#grain)" opacity=".5"/>'
    return sv(b, d, w=Ws, h=Hs, label="A social card with a headline and a five-stage retry sequence")


DEMOS = [
    (23, "editorial-illustrated", "Editorial Illustrated", editorial,
     "Hand-drawn shapes on warm paper — the family that performs on social.",
     "<strong>Irregular outline, perfect intent.</strong> Each shape is a closed path with varied control "
     "points and a second offset stroke at lower opacity, so the edge has the weight variation of a real "
     "pen. Warm paper, muted earth-plus-jewel palette, serif type, and one sentence of copy.",
     "The looseness has to be the only loose thing. Irregular strokes plus irregular spacing reads as "
     "careless rather than crafted."),
    (24, "visual-essay", "Visual Essay", essay,
     "Numbered steps, one rule, and a margin note that carries the argument.",
     "<strong>The annotation is the content.</strong> A numbered sequence down a hairline rule, then one "
     "dashed leader out to a margin note naming where the system actually breaks. The diagram states, "
     "the margin argues.",
     "One margin note. Two is a second diagram, three is an essay you have not written yet."),
    (25, "disciplined-sketch", "Disciplined Sketch", sketch,
     "Hand-drawn feel, machine consistency — sketch mode done properly.",
     "<strong>Double-stroke plus hachure.</strong> Every shape drawn twice with a small random jitter, the "
     "second pass thinner and lighter, and filled with diagonal hachure at low opacity. Alignment "
     "underneath stays exact.",
     "Sketch signals 'not final'. That is the point, and it is also why it must never be the register for "
     "a signed-off deliverable."),
    (26, "isometric-dimensional", "Isometric Dimensional", isometric,
     "Extruded blocks at 30°, with three-tone faces and ground shadows.",
     "<strong>Three-tone face shading.</strong> Top face lightest, right mid, left darkest — that single "
     "rule is what makes an extrusion read as a solid rather than three flat polygons. One soft ground "
     "shadow per block anchors it.",
     "Isometric gets hard to read as architectures get complex, and it cannot be scanned linearly. "
     "Overview only."),
    (27, "dark-glass", "Dark Glass", darkglass,
     "The near-black product-marketing register — highest expensive-signal per pixel.",
     "<strong>Depth from borders, not from background shifts.</strong> Near-black ground, hairline borders "
     "at 8–16% white, one radial wash behind the single focal node, a 24px grid at 2.5% opacity, mono "
     "labels at tight tracking, and grain over everything.",
     "Everything here rides on one accent. The moment a second saturated colour appears, the register "
     "collapses into a generic dark theme."),
    (28, "node-ui", "Node UI Canvas", nodeui,
     "It looks like a running application, which implies the system is real.",
     "<strong>Card, header, ports, pills.</strong> Nodes are cards with a tinted header strip and a "
     "key/value body; port handles are small circles on the edge; bezier connectors leave the ports; a "
     "dot grid and a minimap complete the illusion of a live canvas.",
     "Borrowed product chrome sets an expectation. A minimap on a static PNG is a small lie — keep it "
     "only where the interactivity is real or the diagram is obviously a still."),
    (29, "constellation", "Constellation", constellation,
     "Density as shading — for graphs too big to draw as boxes.",
     "<strong>Edges at 10% opacity.</strong> Node radius encodes centrality, colour encodes cluster rather "
     "than category, and edges are so faint that overlapping them produces the shading. Labels appear "
     "only for hubs.",
     "This is a picture of shape, not of detail. Never ask a reader to trace a specific path through it — "
     "pair it with a table."),
    (30, "swiss-typographic", "Swiss Typographic", swiss,
     "No boxes at all. Rules, numerals and type do the structural work.",
     "<strong>Tabular numerals and hairline rules.</strong> Numbered sections, one accent, flush-left "
     "everything, and metrics set in tabular figures so the columns align. It reads expensive because it "
     "reads like a printed annual report.",
     "Only works when the content is genuinely tabular or sequential. Forcing a branching system into "
     "this format loses the branches."),
    (31, "motion-filmstrip", "Motion Filmstrip", filmstrip,
     "A six-second loop, drawn as its key frames.",
     "<strong>Sequence without motion.</strong> Five frames on a timeline, each showing one more stage "
     "lit. You get the narrative of an animation in a form that prints, survives screenshots, and needs no "
     "reduced-motion fallback.",
     "For a feed, an actual loop will outperform this. Use the filmstrip for the documentation and the "
     "loop for the post — they are different artefacts."),
    (32, "fix-stroke", "Fix 1 · Stroke Discipline", fix_stroke,
     "Never pure black. The single fastest upgrade available.",
     "<strong>Derive the stroke from the fill.</strong> Four treatments of the same card: #000, neutral at "
     "70%, a stroke tinted from the fill's hue, and that plus a near-white inner ring.",
     "On non-neutral grounds, tint the border toward the same hue rather than introducing a new one."),
    (33, "fix-type", "Fix 2 · Type Hierarchy", fix_type,
     "Three weights, four sizes, and tabular numerals for anything numeric.",
     "<strong>Tabular figures are not optional.</strong> The scale runs display / title / body / label with "
     "tracking tightening as size grows. The bottom rows show why proportional numerals cannot be used "
     "for metrics: the columns do not line up.",
     "Four sizes is a ceiling, not a target. Most diagrams need three."),
    (34, "fix-elevation", "Fix 3 · Elevation Stack", fix_elev,
     "One shadow looks cheap. Four layers, each with a job, looks built.",
     "<strong>Border, ambient, distance, inner ring.</strong> Built up one layer at a time so you can see "
     "each contribution: a 1px spread makes the edge, a 2px blur is ambient light, an 8px blur handles "
     "distance, and a near-white inner ring makes the card glow from within.",
     "Elevation should clarify layering, not create a floating-card look. Do not nest elevated surfaces "
     "without a reason."),
    (35, "fix-radius", "Fix 4 · Radius Scale", fix_radius,
     "Concentric corners, or the whole thing looks assembled by accident.",
     "<strong>Child radius ≤ parent, curves parallel.</strong> Left: 20 → 12 → 8, every curve concentric. "
     "Right: 4 → 18 → 2, the corners fighting each other. Same layout, same colours.",
     "This is the tell most people feel but cannot name. Fixing it costs nothing."),
    (36, "fix-terminators", "Fix 5 · Terminators", fix_terminators,
     "The filled triangle is the giveaway.",
     "<strong>Six ways to end a line.</strong> Open chevron, dot-origin, tapered stroke, bracket, and "
     "socket — each changes what the connection means, not just how it looks. A dot at the source and "
     "nothing at the target reads very differently from an arrow.",
     "Whatever you choose, use one terminator vocabulary per diagram and legend it."),
    (37, "fix-grid", "Fix 6 · Spacing Grid", fix_grid,
     "Everything on 8px, then broken by two where the eye disagrees.",
     "<strong>Optical adjustment is the second half of the rule.</strong> The grid gets you consistency; "
     "the manual nudge gets you correctness. Circles, triangles and anything with a visual centre "
     "different from its bounding box will need it.",
     "Do not skip the grid because of the exceptions. Exceptions are only legible against a system."),
    (38, "fix-ground", "Fix 7 · Treated Ground", fix_ground,
     "Untreated white is the loudest signal of a default export.",
     "<strong>Four grounds, same node.</strong> Plain white, a 16px dot grid, a radial wash, and grain. "
     "All four are equally legible; only the first looks unconsidered.",
     "Keep grid and wash under about 10% opacity, and check text contrast against the treated ground "
     "rather than against the base colour."),
    (39, "fix-icons", "Fix 8 · Icon System", fix_icons,
     "One grid, one stroke weight, one joint style.",
     "<strong>Six icons on a 24px box at 1.8px.</strong> Below, the same shapes at 1px, 2.6px and 1.8px — "
     "the mixed-pack look that undoes an otherwise careful diagram.",
     "Vendor logos are the hard case: they arrive at different weights and cannot be restyled. Put them "
     "in a neutral container so the container carries the consistency."),
    (40, "fix-palette", "Fix 9 · Palette Ramp", fix_palette,
     "A warm neutral ramp plus two restrained accents.",
     "<strong>The neutrals carry a tint.</strong> Every step here holds a trace of the accent hue, which is "
     "what makes a palette feel authored rather than assembled. Saturated primaries are shown beside it "
     "for contrast.",
     "Two accents is the ceiling. A third is almost always a category that should have been a shape."),
    (41, "before-after", "Before / After", beforeafter,
     "The same three-service diagram, with and without the nine fixes.",
     "<strong>Nothing changed but the art direction.</strong> Same nodes, same edges, same information. "
     "Left has pure black strokes, saturated primaries, mixed radii, one type weight, default arrowheads "
     "and untreated white. Right fixes exactly those six.",
     "The gap is entirely craft, not effort. Every fix on the right is a token value, which is why this "
     "belongs in a theme file rather than in a designer's hands each time."),
    (42, "editorial-isometric", "Editorial Isometric", edit_iso,
     "Warm paper and hand-set serif over a strict 30° projection.",
     "<strong>Two families that usually repel.</strong> Isometric normally goes with cool, technical, "
     "saturated palettes. Recolouring the faces into a warm editorial ramp and adding grain lets the "
     "precision and the warmth coexist.",
     "The face-shading rule still has to hold. Warm palettes make the three tones closer in value, so "
     "check the top/left/right steps stay distinguishable."),
    (43, "dark-node-ui", "Dark Node UI", dark_node,
     "Linear's restraint with React Flow's node grammar.",
     "<strong>Where the two families overlap.</strong> Near-black ground, hairline borders, one indigo "
     "accent and tight mono tracking from the first; card headers, key/value bodies and port handles from "
     "the second. They share a grammar, so the combination is clean.",
     "Dark plus hairline borders is fragile in print and on projectors. Keep a light variant of any theme "
     "built on this."),
    (44, "social-card", "Social Card", social,
     "1200×630 — the format the whole exercise is aimed at.",
     "<strong>Headline first, diagram second.</strong> The claim carries the post; the five-stage sequence "
     "proves it. Oversized tight-tracked type, one accent rule, a shadow stack on the cards, grain over "
     "everything, and a handle in the corner.",
     "At feed size the diagram is decoration — the sentence does the work. If the headline does not land "
     "on its own, no amount of art direction rescues it."),
]


def main() -> int:
    OUT.mkdir(exist_ok=True)
    for c in (N[900], N[700], N[500], A1, A2):
        r = contrast_ratio(c, N[50])
        assert r >= 4.5, f"{c} {r:.2f}"
    for n, slug, title, fn, note, tech, cav in DEMOS:
        (OUT / f"{n}-{slug}.html").write_text(shell(n, title, note, tech, fn(), cav), encoding="utf-8")
        print(f"  {n}-{slug}")
    print(f"\n{len(DEMOS)} art-directed demos -> {OUT.name}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
