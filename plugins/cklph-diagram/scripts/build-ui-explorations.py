#!/usr/bin/env python3
"""Explorations 11-21: modern UI material applied to diagrams.

Where 1-10 changed *geometry*, this set changes *material* — elevation, blur,
opacity falloff, gradient strokes, and connector vocabulary — on subject matter
that actually needs it: networks, topologies and system graphs.

  11  material-elevation   Material 3 tonal surfaces + a real elevation scale
  12  tailwind-console     ring borders, shadow-sm, badges, slate scale
  13  liquid-glass         translucency over a barrier layer that protects text
  14  practical-scifi      restrained HUD: brackets, ticks, hairlines, no glow soup
  15  network-topology     real networking grammar: LAG, VLAN, standby, link speed
  16  signal-bundles       gradient strokes + opacity falloff; width = bandwidth
  17  depth-of-field       literal blur on background tiers, sharp focal tier
  18  neubrutalist         hard offset shadows, no blur, chunky high-contrast
  19  aurora-mesh          mesh gradient ground with barrier layers under text
  20  wireframe-iso        hairline isometric wireframe with vertex dots
  21  COMPONENT SPECIMEN   every node style, connector, arrowhead, elevation,
                           junction and badge on one sheet, to mix and match

The accessibility line holds throughout, and where a technique fights it the
file says so. Two rules do real work here:

  * Translucent and gradient surfaces get a **barrier layer** — a solid
    low-opacity fill beneath the text — because contrast has to be measured
    against what is actually behind the glyphs.
  * Shadows never carry meaning, only separation. Shadow-as-affordance lands
    around 1.1:1 in practice, far under the 3:1 non-text components need.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "skills/cklph-diagram/scripts"))
from colorlib import contrast_ratio  # noqa: E402

OUT = ROOT / "gallery/ui"
G, SURF, INK, SOFT = "#faf8f4", "#ffffff", "#191621", "#57505f"
ACC, BLUE, GREEN, GOLD, PLUM = "#b4245f", "#1f5f8b", "#046a52", "#8a5a12", "#5b3a7e"


def shell(n, title, note, tech, svg, caveat=""):
    cav = f'<p class="cav"><strong>Watch out:</strong> {caveat}</p>' if caveat else ""
    return f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>{title}</title>
<style>
 body{{margin:0;padding:52px 40px;background:{G};color:{INK};
  font-family:'Inter',system-ui,sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased}}
 main{{max-width:940px;margin:0 auto}}
 .tag{{font-family:ui-monospace,monospace;font-size:13px;letter-spacing:.14em;
  text-transform:uppercase;color:{SOFT};margin:0 0 6px}}
 h1{{font-size:32px;font-weight:650;letter-spacing:-.02em;margin:0 0 10px}}
 .note{{color:{SOFT};font-size:17px;max-width:64ch;margin:0 0 6px}}
 .tech{{font-size:15px;max-width:66ch;margin:0 0 28px;padding:10px 14px;
  border-left:3px solid {ACC};background:rgba(180,36,95,.05)}}
 .cav{{font-size:15px;color:{SOFT};max-width:66ch;margin:22px 0 0;padding:10px 14px;
  border-left:3px solid {GOLD};background:rgba(138,90,18,.06)}}
 svg{{width:100%;height:auto;display:block}}
 .alt{{margin-top:26px;padding-top:18px;border-top:1px solid #ded6cc}}
 .alt h2{{font-family:ui-monospace,monospace;font-size:13px;font-weight:500;letter-spacing:.14em;
  text-transform:uppercase;color:{SOFT};margin:0 0 8px}}
 .alt p{{color:{SOFT};font-size:15px;max-width:70ch;margin:0}}
 @media (prefers-reduced-motion:reduce){{*{{animation:none!important;transition:none!important}}}}
 @media (prefers-contrast:more){{body{{background:#fff;color:#000}}.note,.alt p,.tag,.cav{{color:#000}}}}
</style></head><body><main>
<p class="tag">demo {n} of 21</p><h1>{title}</h1>
<p class="note">{note}</p><p class="tech">{tech}</p>
{svg}
{cav}
<div class="alt"><h2>Described in words</h2><p>{note}</p></div>
</main></body></html>"""


def wrap(body, defs="", h=430, w=900, bg=G, label=""):
    return (f'<svg viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg" role="img" '
            f'aria-labelledby="t d"><title id="t">{label}</title><desc id="d">{label}</desc>'
            f'<defs>{defs}</defs><rect width="{w}" height="{h}" fill="{bg}"/>{body}</svg>')


def blur_shadow(x, y, w, h, r, dy, blur, op):
    """Explicit blurred rect rather than feDropShadow — renders identically
    everywhere, including exporters that quietly drop the filter primitive."""
    return (f'<rect x="{x}" y="{y+dy}" width="{w}" height="{h}" rx="{r}" fill="#1c1620" '
            f'opacity="{op}" filter="url(#sh{blur})"/>')


BLURDEFS = "".join(
    f'<filter id="sh{b}" x="-40%" y="-40%" width="180%" height="180%">'
    f'<feGaussianBlur stdDeviation="{b}"/></filter>' for b in (2, 4, 8, 14))


# ---------------------------------------------------------------- 11
def material():
    d = BLURDEFS
    body = ""
    # Material 3: elevation is a tonal surface + a shadow, not just a shadow.
    tiers = [(60, "Level 0", "#f3eef4", 0, 0, 0), (250, "Level 1", "#efe8f2", 2, 1, .13),
             (440, "Level 3", "#eae0ef", 4, 3, .16), (630, "Level 5", "#e4d8ec", 8, 6, .19)]
    for x, lab, fill, blur, dy, op in tiers:
        if blur:
            body += blur_shadow(x, 70, 210, 96, 16, dy, blur, op)
        body += (f'<rect x="{x}" y="70" width="210" height="96" rx="16" fill="{fill}"/>'
                 f'<text x="{x+20}" y="106" font-size="17" font-weight="650" fill="{INK}">{lab}</text>'
                 f'<text x="{x+20}" y="130" font-size="13" font-family="ui-monospace,monospace" '
                 f'fill="{SOFT}">tonal + shadow</text>'
                 f'<rect x="{x+20}" y="142" width="{34+blur*4}" height="6" rx="3" fill="{PLUM}"/>')
    # applied: a small service graph using the same elevation language
    nodes = [(120, 250, "Gateway", "edge", 8, 6, .18, "#e4d8ec"),
             (380, 240, "Auth", "internal", 4, 3, .15, "#eae0ef"),
             (380, 330, "Orders", "internal", 4, 3, .15, "#eae0ef"),
             (650, 285, "Postgres", "data", 2, 1, .12, "#efe8f2")]
    for x, y, n, kind, blur, dy, op, fill in nodes:
        body += blur_shadow(x, y, 170, 68, 14, dy, blur, op)
        body += (f'<rect x="{x}" y="{y}" width="170" height="68" rx="14" fill="{fill}"/>'
                 f'<text x="{x+18}" y="{y+30}" font-size="16" font-weight="650" fill="{INK}">{n}</text>'
                 f'<rect x="{x+18}" y="{y+40}" width="{len(kind)*7+16}" height="20" rx="10" '
                 f'fill="{PLUM}" opacity=".14"/>'
                 f'<text x="{x+26}" y="{y+54}" font-size="12" font-family="ui-monospace,monospace" '
                 f'fill="{PLUM}">{kind}</text>')
    for x1, y1, x2, y2 in ((290, 284, 380, 274), (290, 284, 380, 364), (550, 274, 650, 319),
                           (550, 364, 650, 319)):
        body += (f'<path d="M{x1},{y1} C{(x1+x2)/2},{y1} {(x1+x2)/2},{y2} {x2},{y2}" fill="none" '
                 f'stroke="{PLUM}" stroke-width="2" opacity=".55"/>')
    body += (f'<text x="60" y="405" font-size="13" fill="{SOFT}">Elevation rises toward the edge '
             f'of the system — the most exposed surface sits highest.</text>')
    return wrap(body, d, 430, label="Service graph using a Material elevation scale")


# ---------------------------------------------------------------- 12
def tailwind():
    d = BLURDEFS
    sl = {"50": "#f8fafc", "200": "#e2e8f0", "400": "#94a3b8", "700": "#334155", "900": "#0f172a"}
    body = f'<rect width="900" height="430" fill="{sl["50"]}"/>'
    cards = [(60, 70, "api-gateway", "edge", GREEN, "healthy"),
             (340, 70, "auth-service", "internal", GREEN, "healthy"),
             (620, 70, "billing-svc", "internal", GOLD, "degraded"),
             (60, 250, "worker-pool", "async", GREEN, "healthy"),
             (340, 250, "redis", "cache", GREEN, "healthy"),
             (620, 250, "postgres-primary", "data", ACC, "failover")]
    for x, y, name, tag, col, status in cards:
        body += blur_shadow(x, y, 220, 108, 10, 1, 2, .10)
        body += (f'<rect x="{x}" y="{y}" width="220" height="108" rx="10" fill="#ffffff" '
                 f'stroke="{sl["200"]}" stroke-width="1"/>'
                 # the "ring" — a second inset hairline, very Tailwind
                 f'<rect x="{x+.5}" y="{y+.5}" width="219" height="107" rx="10" fill="none" '
                 f'stroke="{sl["900"]}" stroke-width="1" opacity=".06"/>'
                 f'<text x="{x+18}" y="{y+34}" font-size="16" font-weight="650" '
                 f'font-family="ui-monospace,monospace" fill="{sl["900"]}">{name}</text>'
                 f'<rect x="{x+18}" y="{y+48}" width="{len(tag)*7+18}" height="21" rx="10.5" '
                 f'fill="{sl["200"]}"/>'
                 f'<text x="{x+27}" y="{y+63}" font-size="12" font-family="ui-monospace,monospace" '
                 f'fill="{sl["700"]}">{tag}</text>'
                 f'<circle cx="{x+26}" cy="{y+88}" r="5" fill="{col}"/>'
                 f'<circle cx="{x+26}" cy="{y+88}" r="9" fill="{col}" opacity=".22"/>'
                 f'<text x="{x+40}" y="{y+93}" font-size="13" fill="{sl["700"]}">{status}</text>')
    for a, b in (((280, 124), (340, 124)), ((560, 124), (620, 124)),
                 ((280, 304), (340, 304)), ((560, 304), (620, 304)),
                 ((170, 178), (170, 250)), ((450, 178), (450, 250))):
        body += (f'<line x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}" stroke="{sl["400"]}" '
                 f'stroke-width="1.5"/>')
    body += (f'<text x="60" y="400" font-size="13" fill="{sl["700"]}">Status uses a dot, a halo '
             f'and a word — never colour alone.</text>')
    return wrap(body, d, 430, bg=sl["50"], label="Service health board in a Tailwind/shadcn register")


# ---------------------------------------------------------------- 13
def glass():
    d = (BLURDEFS +
         '<linearGradient id="gbg" x1="0" y1="0" x2="1" y2="1">'
         '<stop offset="0" stop-color="#2b3f6b"/><stop offset="0.5" stop-color="#6b3f6e"/>'
         '<stop offset="1" stop-color="#26566b"/></linearGradient>'
         '<linearGradient id="spec" x1="0" y1="0" x2="0" y2="1">'
         '<stop offset="0" stop-color="#ffffff" stop-opacity=".55"/>'
         '<stop offset="1" stop-color="#ffffff" stop-opacity=".08"/></linearGradient>')
    body = ('<rect width="900" height="430" fill="url(#gbg)"/>'
            '<circle cx="180" cy="120" r="150" fill="#ff9a6b" opacity=".38" filter="url(#sh14)"/>'
            '<circle cx="720" cy="330" r="170" fill="#5be0c4" opacity=".30" filter="url(#sh14)"/>')
    panels = [(60, 80, "Edge", ["cdn", "waf"]), (340, 80, "Core", ["api", "auth"]),
              (620, 80, "Data", ["primary", "replica"])]
    for x, y, name, items in panels:
        # specular hairline + BARRIER LAYER: a solid dark fill under the glass so
        # text contrast is measured against something known, not against whatever
        # gradient happens to sit behind it.
        body += (f'<rect x="{x}" y="{y}" width="220" height="250" rx="20" fill="#101828" opacity=".55"/>'
                 f'<rect x="{x}" y="{y}" width="220" height="250" rx="20" fill="#ffffff" opacity=".07"/>'
                 f'<rect x="{x}" y="{y}" width="220" height="250" rx="20" fill="none" '
                 f'stroke="url(#spec)" stroke-width="1.4"/>'
                 f'<text x="{x+22}" y="{y+42}" font-size="19" font-weight="650" fill="#ffffff">{name}</text>')
        for i, it in enumerate(items):
            yy = y + 72 + i * 62
            body += (f'<rect x="{x+18}" y="{yy}" width="184" height="48" rx="12" fill="#0b1220" opacity=".62"/>'
                     f'<rect x="{x+18}" y="{yy}" width="184" height="48" rx="12" fill="none" '
                     f'stroke="#ffffff" stroke-opacity=".22"/>'
                     f'<text x="{x+34}" y="{yy+30}" font-size="15" font-family="ui-monospace,monospace" '
                     f'fill="#e8edf5">{it}</text>')
        body += (f'<text x="{x+22}" y="{y+228}" font-size="13" fill="#c7d2e4">'
                 f'{len(items)} services</text>')
    for x1, x2 in ((280, 340), (560, 620)):
        body += (f'<line x1="{x1}" y1="205" x2="{x2}" y2="205" stroke="#ffffff" stroke-opacity=".5" '
                 f'stroke-width="2.5" stroke-linecap="round"/>')
    body += ('<text x="60" y="376" font-size="13" fill="#dbe4f0">Every text block sits on a solid '
             'barrier layer, so contrast is measured against a known fill.</text>')
    return wrap(body, d, 430, bg="#22304d", label="Three tier zones as frosted glass panels")


# ---------------------------------------------------------------- 14
def scifi():
    bg, line, hot, dim = "#0b1015", "#5fd4c4", "#f0a852", "#4d6068"
    d = BLURDEFS
    body = f'<rect width="900" height="430" fill="{bg}"/>'
    for i in range(0, 901, 60):
        body += f'<line x1="{i}" y1="0" x2="{i}" y2="430" stroke="#111a20" stroke-width="1"/>'
    def bracket(x, y, w, h, col):
        s = 16
        return "".join(
            f'<path d="{p}" fill="none" stroke="{col}" stroke-width="1.8"/>' for p in (
                f"M{x},{y+s} V{y} H{x+s}", f"M{x+w-s},{y} H{x+w} V{y+s}",
                f"M{x+w},{y+h-s} V{y+h} H{x+w-s}", f"M{x+s},{y+h} H{x} V{y+h-s}"))
    panels = [(60, 80, "NODE-01", "ingress", "NOMINAL", line),
              (350, 80, "NODE-02", "compute", "NOMINAL", line),
              (640, 80, "NODE-03", "storage", "DEGRADED", hot)]
    for x, y, name, role, st, col in panels:
        body += f'<rect x="{x}" y="{y}" width="200" height="120" fill="#0f1a20" opacity=".9"/>'
        body += bracket(x, y, 200, 120, col)
        body += (f'<text x="{x+16}" y="{y+34}" font-size="16" font-weight="650" '
                 f'font-family="ui-monospace,monospace" fill="#dff0ee" letter-spacing=".08em">{name}</text>'
                 f'<text x="{x+16}" y="{y+56}" font-size="12.5" font-family="ui-monospace,monospace" '
                 f'fill="{dim}" letter-spacing=".14em">{role.upper()}</text>'
                 f'<rect x="{x+16}" y="{y+72}" width="168" height="1" fill="{col}" opacity=".45"/>'
                 f'<text x="{x+16}" y="{y+98}" font-size="13" font-family="ui-monospace,monospace" '
                 f'fill="{col}" letter-spacing=".1em">{st}</text>')
        # tick scale — the detail that reads "instrument" rather than "toy"
        for k in range(13):
            hgt = 8 if k % 4 == 0 else 4
            body += (f'<line x1="{x+16+k*14}" y1="{y+112}" x2="{x+16+k*14}" y2="{y+112-hgt}" '
                     f'stroke="{dim}" stroke-width="1"/>')
    for x1, x2, col, dash in ((260, 350, line, ""), (550, 640, hot, ' stroke-dasharray="8,5"')):
        body += (f'<line x1="{x1}" y1="140" x2="{x2}" y2="140" stroke="{col}" stroke-width="2"{dash}/>'
                 f'<polygon points="{x2-9},135 {x2},140 {x2-9},145" fill="{col}"/>')
    body += (f'<rect x="60" y="252" width="780" height="104" fill="#0f1a20" opacity=".85"/>'
             + bracket(60, 252, 780, 104, dim))
    import random
    random.seed(11)
    pts = []
    for k in range(78):
        pts.append((78 + k * 9.5, 330 - abs((k % 26) - 13) * 3.2 - random.uniform(0, 12)))
    body += ('<path d="M' + " L".join(f"{a:.0f},{b:.0f}" for a, b in pts) +
             f'" fill="none" stroke="{line}" stroke-width="1.8"/>')
    body += (f'<text x="76" y="278" font-size="12.5" font-family="ui-monospace,monospace" '
             f'fill="{dim}" letter-spacing=".14em">THROUGHPUT · 24H</text>'
             f'<text x="76" y="380" font-size="13" fill="{dim}">Corner brackets and tick scales do '
             f'the sci-fi work. No glow, no scanlines, no chrome for its own sake.</text>')
    return wrap(body, d, 430, bg=bg, label="Ops console in a restrained sci-fi HUD register")


# ---------------------------------------------------------------- 15
def topology():
    d = BLURDEFS
    body = ""
    def dev(x, y, w, h, name, sub, col, glyph):
        s = blur_shadow(x, y, w, h, 10, 2, 4, .12)
        return (s + f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{SURF}" '
                f'stroke="{col}" stroke-width="1.8"/>'
                f'<rect x="{x}" y="{y}" width="{w}" height="5" rx="2.5" fill="{col}"/>'
                f'<text x="{x+14}" y="{y+32}" font-size="15" font-weight="650" fill="{INK}">{glyph} {name}</text>'
                f'<text x="{x+14}" y="{y+52}" font-size="12.5" font-family="ui-monospace,monospace" '
                f'fill="{SOFT}">{sub}</text>')
    body += dev(360, 40, 190, 66, "edge-fw", "HA pair · 10G", ACC, "▣")
    body += dev(150, 165, 190, 66, "core-sw-a", "LAG 2×10G", BLUE, "▤")
    body += dev(570, 165, 190, 66, "core-sw-b", "LAG 2×10G", BLUE, "▤")
    body += dev(60, 300, 170, 62, "vlan 10", "servers /24", GREEN, "▥")
    body += dev(260, 300, 170, 62, "vlan 20", "storage /24", GREEN, "▥")
    body += dev(480, 300, 170, 62, "vlan 30", "clients /24", GREEN, "▥")
    body += dev(680, 300, 170, 62, "vlan 99", "mgmt /28", GOLD, "▥")
    # LAG bundle drawn as two parallel strokes — the standard way to say "bundle"
    for (x1, y1, x2, y2) in ((455, 106, 245, 165), (455, 106, 665, 165)):
        for off in (-3, 3):
            body += (f'<path d="M{x1+off},{y1} C{x1+off},{(y1+y2)/2} {x2+off},{(y1+y2)/2} {x2+off},{y2}" '
                     f'fill="none" stroke="{BLUE}" stroke-width="2"/>')
    # inter-switch standby link: dashed = not carrying traffic right now
    body += (f'<path d="M340,198 H570" stroke="{SOFT}" stroke-width="2" stroke-dasharray="9,6" fill="none"/>'
             f'<rect x="404" y="186" width="102" height="22" rx="4" fill="{G}"/>'
             f'<text x="455" y="202" font-size="12" text-anchor="middle" '
             f'font-family="ui-monospace,monospace" fill="{SOFT}">standby · 10G</text>')
    for (x1, x2) in ((245, 145), (245, 345), (665, 565), (665, 765)):
        body += (f'<path d="M{x1},231 C{x1},270 {x2},262 {x2},300" fill="none" stroke="{GREEN}" '
                 f'stroke-width="1.8"/>')
    body += (f'<line x1="60" y1="392" x2="850" y2="392" stroke="#ded6cc"/>'
             f'<line x1="60" y1="412" x2="96" y2="412" stroke="{BLUE}" stroke-width="2"/>'
             f'<line x1="60" y1="416" x2="96" y2="416" stroke="{BLUE}" stroke-width="2"/>'
             f'<text x="106" y="417" font-size="13" fill="{SOFT}">LAG bundle (2 members)</text>'
             f'<line x1="300" y1="414" x2="340" y2="414" stroke="{SOFT}" stroke-width="2" stroke-dasharray="9,6"/>'
             f'<text x="350" y="417" font-size="13" fill="{SOFT}">standby / no active traffic</text>'
             f'<line x1="600" y1="414" x2="640" y2="414" stroke="{GREEN}" stroke-width="1.8"/>'
             f'<text x="650" y="417" font-size="13" fill="{SOFT}">access · tagged VLAN</text>')
    return wrap(body, d, 440, label="Network topology with LAG bundles, standby link and VLANs")


# ---------------------------------------------------------------- 16
def bundles():
    d = ('<linearGradient id="g1" x1="0" y1="0" x2="1" y2="0">'
         f'<stop offset="0" stop-color="{BLUE}" stop-opacity=".95"/>'
         f'<stop offset="1" stop-color="{GREEN}" stop-opacity=".35"/></linearGradient>'
         '<linearGradient id="g2" x1="0" y1="0" x2="1" y2="0">'
         f'<stop offset="0" stop-color="{ACC}" stop-opacity=".95"/>'
         f'<stop offset="1" stop-color="{PLUM}" stop-opacity=".35"/></linearGradient>'
         '<linearGradient id="g3" x1="0" y1="0" x2="1" y2="0">'
         f'<stop offset="0" stop-color="{GOLD}" stop-opacity=".9"/>'
         f'<stop offset="1" stop-color="{GOLD}" stop-opacity=".2"/></linearGradient>' + BLURDEFS)
    body = ""
    flows = [(110, 300, 14, "url(#g1)", "10 Gbps", 0), (170, 230, 9, "url(#g2)", "4 Gbps", 1),
             (230, 160, 5, "url(#g3)", "1.2 Gbps", 2)]
    for y1, y2, wdt, grad, lab, i in flows:
        dpath = f"M180,{y1} C420,{y1} 480,{y2} 720,{y2}"
        # feathered under-stroke: same path, wider, low opacity -> soft edge
        body += f'<path d="{dpath}" fill="none" stroke="{grad}" stroke-width="{wdt+10}" opacity=".16"/>'
        body += f'<path d="{dpath}" fill="none" stroke="{grad}" stroke-width="{wdt}"/>'
        ly = y2
        body += (f'<rect x="596" y="{ly-13}" width="96" height="26" rx="13" fill="{G}" opacity=".96"/>'
                 f'<text x="644" y="{ly+5}" font-size="13" text-anchor="middle" '
                 f'font-family="ui-monospace,monospace" fill="{INK}">{lab}</text>')
    for x, ys, lab in ((110, [(160, "uplink-c"), (230, "uplink-b"), (300, "uplink-a")], "SOURCE"),
                       (790, [(160, "peer-3"), (230, "peer-2"), (300, "peer-1")], "PEER")):
        for y, n in ys:
            body += (f'<rect x="{x-52}" y="{y-20}" width="{104 if x<400 else 110}" height="40" rx="8" '
                     f'fill="{SURF}" stroke="#ded6cc"/>'
                     f'<text x="{x}" y="{y+5}" font-size="13.5" text-anchor="middle" '
                     f'font-family="ui-monospace,monospace" fill="{INK}">{n}</text>')
        body += (f'<text x="{x}" y="98" font-size="12" text-anchor="middle" letter-spacing=".14em" '
                 f'font-family="ui-monospace,monospace" fill="{SOFT}">{lab}</text>')
    body += (f'<text x="60" y="376" font-size="13" fill="{SOFT}">Stroke width is bandwidth; the '
             f'gradient fades toward the destination so direction is readable without an arrowhead.</text>')
    return wrap(body, d, 400, label="Peering bandwidth as gradient-faded bundles, width equals capacity")


# ---------------------------------------------------------------- 17
def dof():
    d = ('<filter id="far"><feGaussianBlur stdDeviation="3.2"/></filter>'
         '<filter id="mid"><feGaussianBlur stdDeviation="1.3"/></filter>' + BLURDEFS)
    body = ""
    def tier(y, names, col, filt, op, scale):
        out = ""
        for i, n in enumerate(names):
            x = 90 + i * 200
            g = f' filter="url(#{filt})"' if filt else ""
            out += (f'<g{g} opacity="{op}"><rect x="{x}" y="{y}" width="164" height="{62*scale:.0f}" '
                    f'rx="12" fill="{SURF}" stroke="{col}" stroke-width="1.6"/>'
                    f'<text x="{x+16}" y="{y+28*scale:.0f}" font-size="{15*scale:.0f}" '
                    f'font-weight="600" fill="{INK}">{n}</text></g>')
        return out
    body += tier(60, ["region-eu", "region-us", "region-ap", "region-sa"], "#b9b2ab", "far", .38, .85)
    body += tier(170, ["cluster-a", "cluster-b", "cluster-c", "cluster-d"], "#8fa8bd", "mid", .72, 1)
    body += tier(290, ["pod-1", "pod-2", "pod-3", "pod-4"], ACC, "", 1, 1.15)
    for lab, y, note in (("BACKGROUND", 46, "regions — context only"),
                         ("MIDGROUND", 156, "clusters — supporting"),
                         ("FOCUS", 276, "pods — what this diagram is about")):
        body += (f'<text x="60" y="{y}" font-size="11.5" font-family="ui-monospace,monospace" '
                 f'letter-spacing=".14em" fill="{SOFT}">{lab}</text>')
    body += (f'<text x="60" y="410" font-size="13" fill="{SOFT}">Blur is the hierarchy. The focal '
             f'tier is the only sharp thing, so attention lands before anything is read.</text>')
    return wrap(body, d, 430, label="Three tiers where background blur establishes focus")


# ---------------------------------------------------------------- 18
def neubrutal():
    body = ""
    def hard(x, y, w, h, fill, col, name, sub):
        return (f'<rect x="{x+8}" y="{y+8}" width="{w}" height="{h}" fill="{INK}"/>'
                f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" stroke="{INK}" stroke-width="3"/>'
                f'<text x="{x+18}" y="{y+36}" font-size="19" font-weight="750" fill="{INK}">{name}</text>'
                f'<text x="{x+18}" y="{y+60}" font-size="13.5" font-family="ui-monospace,monospace" '
                f'fill="{INK}">{sub}</text>')
    body += hard(60, 70, 230, 96, "#ffd6e7", INK, "INGRESS", "nginx · 2 replicas")
    body += hard(350, 70, 230, 96, "#d6ecff", INK, "QUEUE", "rabbit · 12k/s")
    body += hard(640, 70, 200, 96, "#d9f5e4", INK, "SINK", "s3 · versioned")
    body += hard(60, 240, 230, 96, "#fff0c9", INK, "RETRY", "backoff 3×")
    body += hard(350, 240, 230, 96, "#ece0ff", INK, "DLQ", "manual review")
    for x1, y1, x2, y2 in ((290, 118, 350, 118), (580, 118, 640, 118),
                           (465, 166, 465, 240), (175, 166, 175, 240), (290, 288, 350, 288)):
        body += (f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{INK}" stroke-width="4"/>')
        if x1 != x2:
            body += f'<polygon points="{x2-12},{y2-7} {x2},{y2} {x2-12},{y2+7}" fill="{INK}"/>'
        else:
            body += f'<polygon points="{x2-7},{y2-12} {x2},{y2} {x2+7},{y2-12}" fill="{INK}"/>'
    body += (f'<rect x="640" y="240" width="200" height="96" fill="none" stroke="{INK}" '
             f'stroke-width="3" stroke-dasharray="10,7"/>'
             f'<text x="658" y="276" font-size="19" font-weight="750" fill="{INK}">PLANNED</text>'
             f'<text x="658" y="300" font-size="13.5" font-family="ui-monospace,monospace" '
             f'fill="{INK}">replay service</text>')
    body += (f'<text x="60" y="384" font-size="13" fill="{SOFT}">Offset shadow is hard-edged — a '
             f'solid rect, not a blur. It survives any export, at any scale.</text>')
    return wrap(body, "", 410, label="Pipeline in a neubrutalist register with hard offset shadows")


# ---------------------------------------------------------------- 19
def aurora():
    d = (BLURDEFS +
         '<radialGradient id="a1" cx=".2" cy=".2"><stop offset="0" stop-color="#ffb37a"/>'
         '<stop offset="1" stop-color="#ffb37a" stop-opacity="0"/></radialGradient>'
         '<radialGradient id="a2" cx=".8" cy=".3"><stop offset="0" stop-color="#7ac6ff"/>'
         '<stop offset="1" stop-color="#7ac6ff" stop-opacity="0"/></radialGradient>'
         '<radialGradient id="a3" cx=".5" cy=".9"><stop offset="0" stop-color="#b28cff"/>'
         '<stop offset="1" stop-color="#b28cff" stop-opacity="0"/></radialGradient>')
    body = ('<rect width="900" height="430" fill="#fbf7f4"/>'
            '<rect width="900" height="430" fill="url(#a1)" opacity=".55"/>'
            '<rect width="900" height="430" fill="url(#a2)" opacity=".5"/>'
            '<rect width="900" height="430" fill="url(#a3)" opacity=".45"/>')
    items = [(70, 90, "Collect", "events in"), (330, 90, "Reduce", "aggregate"),
             (590, 90, "Serve", "query api"),
             (200, 250, "Store", "columnar"), (460, 250, "Alert", "thresholds")]
    for x, y, n, s in items:
        # barrier layer: near-opaque card so text never sits on raw gradient
        body += blur_shadow(x, y, 220, 96, 18, 4, 8, .13)
        body += (f'<rect x="{x}" y="{y}" width="220" height="96" rx="18" fill="#ffffff" opacity=".93"/>'
                 f'<rect x="{x}" y="{y}" width="220" height="96" rx="18" fill="none" '
                 f'stroke="#ffffff" stroke-opacity=".9" stroke-width="1.4"/>'
                 f'<text x="{x+22}" y="{y+40}" font-size="19" font-weight="650" fill="{INK}">{n}</text>'
                 f'<text x="{x+22}" y="{y+66}" font-size="13.5" font-family="ui-monospace,monospace" '
                 f'fill="{SOFT}">{s}</text>')
    for x1, y1, x2, y2 in ((290, 138, 330, 138), (550, 138, 590, 138),
                           (180, 186, 260, 250), (440, 186, 520, 250)):
        body += (f'<path d="M{x1},{y1} C{(x1+x2)/2},{y1} {(x1+x2)/2},{y2} {x2},{y2}" fill="none" '
                 f'stroke="{INK}" stroke-opacity=".38" stroke-width="2"/>')
    body += (f'<text x="70" y="392" font-size="13" fill="{INK}" opacity=".8">Cards sit at 93% opacity '
             f'over the mesh — enough atmosphere to feel current, enough opacity to stay legible.</text>')
    return wrap(body, d, 430, bg="#fbf7f4", label="Data pipeline over an aurora mesh gradient")


# ---------------------------------------------------------------- 20
def wireframe():
    body = ""
    ink, hair = "#1d2733", "#8fa3b8"
    def box(cx, cy, w, dpt, hgt, col, label):
        # iso wireframe cuboid — hairlines + vertex dots only
        tp = [(cx, cy - dpt / 2), (cx + w / 2, cy), (cx, cy + dpt / 2), (cx - w / 2, cy)]
        out = ""
        pts = " ".join(f"{x:.0f},{y:.0f}" for x, y in tp)
        out += f'<polygon points="{pts}" fill="{col}" fill-opacity=".10" stroke="{col}" stroke-width="1.3"/>'
        for (x, y) in (tp[1], tp[2], tp[3]):
            out += f'<line x1="{x:.0f}" y1="{y:.0f}" x2="{x:.0f}" y2="{y+hgt:.0f}" stroke="{col}" stroke-width="1.1"/>'
        out += (f'<path d="M{tp[3][0]:.0f},{tp[3][1]+hgt:.0f} L{tp[2][0]:.0f},{tp[2][1]+hgt:.0f} '
                f'L{tp[1][0]:.0f},{tp[1][1]+hgt:.0f}" fill="none" stroke="{col}" stroke-width="1.1"/>')
        for (x, y) in tp:
            out += f'<circle cx="{x:.0f}" cy="{y:.0f}" r="2.6" fill="{col}"/>'
        out += (f'<text x="{cx}" y="{cy+4}" font-size="14" font-weight="600" text-anchor="middle" '
                f'fill="{ink}">{label}</text>')
        return out
    body += box(230, 120, 260, 110, 54, BLUE, "web tier")
    body += box(600, 150, 240, 100, 54, PLUM, "app tier")
    body += box(400, 278, 300, 116, 58, GREEN, "data tier")
    for x1, y1, x2, y2 in ((330, 140, 500, 168), (600, 220, 460, 258), (240, 190, 340, 250)):
        body += (f'<path d="M{x1},{y1} L{x2},{y2}" stroke="{hair}" stroke-width="1.4" '
                 f'stroke-dasharray="5,4"/>'
                 f'<circle cx="{x2}" cy="{y2}" r="3" fill="{hair}"/>')
    body += (f'<text x="60" y="424" font-size="13" fill="{SOFT}">Hairlines and vertex dots only — '
             f'10% fills keep the volumes readable without hiding what is behind them.</text>')
    return wrap(body, "", 444, label="Three infrastructure tiers as isometric wireframe volumes")


# ---------------------------------------------------------------- 21  SPECIMEN
def specimen():
    d = (BLURDEFS +
         '<linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">'
         f'<stop offset="0" stop-color="{BLUE}"/><stop offset="1" stop-color="{BLUE}" stop-opacity=".15"/>'
         '</linearGradient>'
         '<marker id="mt" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">'
         f'<polygon points="0 0, 10 4, 0 8" fill="{INK}"/></marker>'
         '<marker id="mo" markerWidth="11" markerHeight="9" refX="10" refY="4.5" orient="auto">'
         f'<path d="M0,0 L10,4.5 L0,9" fill="none" stroke="{INK}" stroke-width="1.6"/></marker>'
         '<marker id="mc" markerWidth="10" markerHeight="10" refX="5" refY="5">'
         f'<circle cx="5" cy="5" r="4" fill="none" stroke="{INK}" stroke-width="1.6"/></marker>'
         '<marker id="md" markerWidth="12" markerHeight="10" refX="11" refY="5" orient="auto">'
         f'<polygon points="0 5, 6 0, 12 5, 6 10" fill="none" stroke="{INK}" stroke-width="1.5"/></marker>'
         '<marker id="mb" markerWidth="6" markerHeight="12" refX="3" refY="6" orient="auto">'
         f'<rect x="1" y="0" width="2.5" height="12" fill="{INK}"/></marker>'
         '<marker id="mcf" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto">'
         f'<path d="M12,6 L0,0 M12,6 L0,6 M12,6 L0,12" stroke="{INK}" stroke-width="1.4" fill="none"/></marker>')

    body = ""
    def head(y, t):
        return (f'<text x="40" y="{y}" font-size="12" font-family="ui-monospace,monospace" '
                f'letter-spacing=".16em" fill="{SOFT}">{t}</text>'
                f'<line x1="40" y1="{y+10}" x2="1020" y2="{y+10}" stroke="#ded6cc"/>')
    def cap(x, y, t):
        return (f'<text x="{x}" y="{y}" font-size="11.5" font-family="ui-monospace,monospace" '
                f'fill="{SOFT}">{t}</text>')

    # ---- node styles
    body += head(38, "NODE STYLES")
    ns = [
        ("flat", lambda x, y: f'<rect x="{x}" y="{y}" width="120" height="56" rx="8" fill="#eef2f7"/>'),
        ("outlined", lambda x, y: f'<rect x="{x}" y="{y}" width="120" height="56" rx="8" fill="none" stroke="{BLUE}" stroke-width="1.8"/>'),
        ("elevated", lambda x, y: blur_shadow(x, y, 120, 56, 8, 3, 4, .16) + f'<rect x="{x}" y="{y}" width="120" height="56" rx="8" fill="#fff"/>'),
        ("tonal", lambda x, y: f'<rect x="{x}" y="{y}" width="120" height="56" rx="14" fill="{PLUM}" opacity=".14"/>'),
        ("ring", lambda x, y: f'<rect x="{x}" y="{y}" width="120" height="56" rx="8" fill="#fff" stroke="#e2e8f0"/><rect x="{x+3}" y="{y+3}" width="114" height="50" rx="6" fill="none" stroke="{BLUE}" stroke-opacity=".35" stroke-width="1.4"/>'),
        ("hard shadow", lambda x, y: f'<rect x="{x+6}" y="{y+6}" width="120" height="56" fill="{INK}"/><rect x="{x}" y="{y}" width="120" height="56" fill="#ffd6e7" stroke="{INK}" stroke-width="2.5"/>'),
        ("status strip", lambda x, y: f'<rect x="{x}" y="{y}" width="120" height="56" rx="8" fill="#fff" stroke="#ded6cc"/><rect x="{x}" y="{y}" width="120" height="4" rx="2" fill="{GREEN}"/>'),
        ("bracket", lambda x, y: "".join(f'<path d="{p}" fill="none" stroke="{GREEN}" stroke-width="1.8"/>' for p in (f"M{x},{y+14} V{y} H{x+14}", f"M{x+106},{y} H{x+120} V{y+14}", f"M{x+120},{y+42} V{y+56} H{x+106}", f"M{x+14},{y+56} H{x} V{y+42}"))),
        ("glass", lambda x, y: f'<rect x="{x}" y="{y}" width="120" height="56" rx="12" fill="{PLUM}" opacity=".55"/><rect x="{x}" y="{y}" width="120" height="56" rx="12" fill="#fff" opacity=".18"/><rect x="{x}" y="{y}" width="120" height="56" rx="12" fill="none" stroke="#fff" stroke-opacity=".6"/>'),
        ("pill", lambda x, y: f'<rect x="{x}" y="{y+8}" width="120" height="40" rx="20" fill="#fff" stroke="{GOLD}" stroke-width="1.8"/>'),
    ]
    for i, (name, fn) in enumerate(ns):
        x, y = 40 + (i % 5) * 200, 66 + (i // 5) * 96
        body += fn(x, y) + cap(x, y + 72, name)

    # ---- connectors
    body += head(288, "CONNECTOR TYPES")
    cn = [
        ("straight", f'<line x1="0" y1="20" x2="140" y2="20" stroke="{INK}" stroke-width="2" marker-end="url(#mt)"/>'),
        ("elbow", f'<path d="M0,4 H70 V36 H140" fill="none" stroke="{INK}" stroke-width="2" marker-end="url(#mt)"/>'),
        ("rounded elbow", f'<path d="M0,4 H62 Q70,4 70,12 V28 Q70,36 78,36 H140" fill="none" stroke="{INK}" stroke-width="2" marker-end="url(#mt)"/>'),
        ("bezier", f'<path d="M0,4 C70,4 70,36 140,36" fill="none" stroke="{INK}" stroke-width="2" marker-end="url(#mt)"/>'),
        ("tapered", f'<path d="M0,17 Q70,20 140,20 Q70,24 0,23 Z" fill="{BLUE}"/>'),
        ("gradient fade", f'<line x1="0" y1="20" x2="140" y2="20" stroke="url(#fade)" stroke-width="6" stroke-linecap="round"/>'),
        ("feathered", f'<line x1="0" y1="20" x2="140" y2="20" stroke="{GREEN}" stroke-width="14" opacity=".16"/><line x1="0" y1="20" x2="140" y2="20" stroke="{GREEN}" stroke-width="4"/>'),
        ("bundle", "".join(f'<path d="M0,{8+k*6} C60,{8+k*6} 80,20 140,20" fill="none" stroke="{PLUM}" stroke-width="1.6"/>' for k in range(4))),
        ("double", f'<line x1="0" y1="16" x2="140" y2="16" stroke="{INK}" stroke-width="1.6"/><line x1="0" y1="24" x2="140" y2="24" stroke="{INK}" stroke-width="1.6"/>'),
        ("dashed", f'<line x1="0" y1="20" x2="140" y2="20" stroke="{INK}" stroke-width="2" stroke-dasharray="9,6" marker-end="url(#mt)"/>'),
        ("dotted", f'<line x1="0" y1="20" x2="140" y2="20" stroke="{INK}" stroke-width="2.4" stroke-dasharray="1,7" stroke-linecap="round"/>'),
        ("line-jump", f'<path d="M0,20 H52 A9,9 0 0 1 70,20 H140" fill="none" stroke="{INK}" stroke-width="2"/><line x1="61" y1="0" x2="61" y2="40" stroke="{SOFT}" stroke-width="1.6"/>'),
    ]
    for i, (name, mk) in enumerate(cn):
        x, y = 40 + (i % 4) * 250, 316 + (i // 4) * 84
        body += f'<g transform="translate({x},{y})">{mk}</g>' + cap(x, y + 60, name)

    # ---- endpoints
    body += head(576, "ENDPOINTS / ARROWHEADS")
    eps = [("filled", "mt"), ("open chevron", "mo"), ("circle", "mc"),
           ("diamond", "md"), ("bar", "mb"), ("crow's foot", "mcf")]
    for i, (name, m) in enumerate(eps):
        x, y = 40 + i * 168, 620
        body += (f'<line x1="{x}" y1="{y}" x2="{x+96}" y2="{y}" stroke="{INK}" stroke-width="2" '
                 f'marker-end="url(#{m})"/>' + cap(x, y + 26, name))

    # ---- elevation + junctions + badges
    body += head(680, "ELEVATION SCALE · JUNCTIONS · STATUS")
    for i, (blur, dy, op) in enumerate([(0, 0, 0), (2, 1, .12), (4, 3, .15), (8, 5, .18), (14, 8, .2)]):
        x, y = 40 + i * 116, 710
        if blur:
            body += blur_shadow(x, y, 92, 52, 10, dy, blur, op)
        body += (f'<rect x="{x}" y="{y}" width="92" height="52" rx="10" fill="#fff" stroke="#ede6dc"/>'
                 + cap(x, y + 68, f"elev {i}"))
    jx = 640
    for name, mk in (("via", f'<circle cx="0" cy="0" r="9" fill="{G}" stroke="{BLUE}" stroke-width="2.5"/><circle cx="0" cy="0" r="3" fill="{INK}"/>'),
                     ("T-junction", f'<line x1="-22" y1="0" x2="22" y2="0" stroke="{INK}" stroke-width="2"/><line x1="0" y1="0" x2="0" y2="22" stroke="{INK}" stroke-width="2"/><circle cx="0" cy="0" r="4" fill="{INK}"/>'),
                     ("interchange", f'<circle cx="0" cy="0" r="11" fill="#fff" stroke="{INK}" stroke-width="3"/><circle cx="0" cy="0" r="4" fill="{INK}"/>')):
        body += f'<g transform="translate({jx},{736})">{mk}</g>' + cap(jx - 30, 778, name)
        jx += 120
    for i, (lab, col) in enumerate([("healthy", GREEN), ("degraded", GOLD), ("failing", ACC)]):
        x = 40 + i * 150
        body += (f'<rect x="{x}" y="{800}" width="{len(lab)*7.4+40:.0f}" height="26" rx="13" '
                 f'fill="{col}" opacity=".13"/>'
                 f'<circle cx="{x+18}" cy="{813}" r="5" fill="{col}"/>'
                 f'<text x="{x+30}" y="{818}" font-size="13" fill="{INK}">{lab}</text>')
    body += cap(520, 818, "status chips — dot + word, never colour alone")
    return wrap(body, d, 850, w=1060, label="Specimen sheet of node styles, connectors, endpoints, elevation and status chips")


DEMOS = [
    (11, "material-elevation", "Material Elevation", material,
     "A service graph where height above the page means exposure.",
     "<strong>Elevation as a scale, not an effect.</strong> Material 3 pairs a tonal surface shift "
     "with the shadow, so depth survives greyscale — the tint moves even when the shadow cannot be "
     "seen. Shadows here are explicit blurred rects rather than <code>feDropShadow</code>, which "
     "some exporters silently drop.",
     "Elevation must map to something real. If height means nothing, flatten it — a five-step "
     "scale used decoratively is five steps of noise."),
    (12, "tailwind-console", "Tailwind Console", tailwind,
     "A service health board in the slate-and-ring register.",
     "<strong>Borders doing two jobs.</strong> A hairline plus an inset low-opacity ring gives an "
     "edge that reads crisp on white without going heavy. Status is a dot, a halo and a word.",
     "This look is everywhere right now, which cuts both ways — instantly legible to developers, "
     "and instantly generic to everyone else."),
    (13, "liquid-glass", "Liquid Glass", glass,
     "Tier zones as frosted panels over a colour field.",
     "<strong>Barrier layers.</strong> Each panel is a solid dark fill at 55%, then a white sheen at "
     "7%, then a specular hairline. Text contrast is measured against the barrier, not the gradient "
     "— which is the difference between glass that works and glass that fails an audit.",
     "Glass fails hard over a busy background: detail behind the panel makes text unreadable no "
     "matter how strong the blur. Only use it over fields you control."),
    (14, "practical-scifi", "Practical Sci-Fi", scifi,
     "An ops console that reads as an instrument, not a film prop.",
     "<strong>Restraint is the trick.</strong> Corner brackets, tick scales, mono type at wide "
     "tracking, one accent for alarm. No glow, no scanlines, no chrome. The sci-fi signal comes "
     "from precision, not from effects.",
     "Dark plus thin cyan hairlines is a real sensory-load risk over long sessions, and hairlines "
     "vanish in print. Ship a light variant alongside."),
    (15, "network-topology", "Network Topology", topology,
     "Actual networking grammar — bundles, standby paths, VLANs.",
     "<strong>Line style carries protocol meaning.</strong> Two parallel strokes is a LAG bundle. "
     "Dashed is standby, carrying no traffic. A coloured header strip types the device. None of "
     "this needs a key for a network engineer, and all of it is in the legend anyway.",
     "Borrowed conventions only help people who know them. Keep the legend even when the audience "
     "'should' know — the cost is one strip, the failure is silent."),
    (16, "signal-bundles", "Signal Bundles", bundles,
     "Peering capacity where the line itself is the number.",
     "<strong>Gradient direction replaces the arrowhead.</strong> Each band fades toward its "
     "destination, so flow direction is legible with no marker at all. A wide low-opacity "
     "under-stroke feathers the edge so bundles can overlap without mud.",
     "Fading strokes lose contrast at the tail by definition. Never let a label sit on the faded "
     "end, and keep the solid portion above 3:1."),
    (17, "depth-of-field", "Depth of Field", dof,
     "Three tiers where only the one that matters is in focus.",
     "<strong>Blur as hierarchy.</strong> Background tiers are genuinely blurred and slightly "
     "reduced in opacity; the focal tier is sharp and scaled up. Attention lands before a single "
     "word is read.",
     "Blurred text is unreadable text. Only ever blur what is genuinely context — and give the "
     "same content in the prose alternative, where nothing is out of focus."),
    (18, "neubrutalist", "Neubrutalist", neubrutal,
     "A pipeline with hard offset shadows and no softness anywhere.",
     "<strong>The shadow is a rectangle.</strong> A solid offset shape, not a blur — it survives "
     "any export, scales cleanly, and costs nothing to render. Planned work is a dashed outline "
     "with no shadow, so 'not built yet' is visible at a glance.",
     "High-saturation fills at large area can be fatiguing. Keep the fills pale and let the black "
     "borders carry the weight, as they do here."),
    (19, "aurora-mesh", "Aurora Mesh", aurora,
     "A pipeline floating over a soft mesh gradient.",
     "<strong>Atmosphere with a floor under it.</strong> Three radial gradients build the field; "
     "every card sits at 93% white so text never touches raw gradient. The gradient is mood, the "
     "card is the contract.",
     "Mesh gradients date fast and add nothing semantically. Good for a cover or a title slide, "
     "poor for a diagram someone must study."),
    (20, "wireframe-iso", "Isometric Wireframe", wireframe,
     "Infrastructure tiers as transparent volumes.",
     "<strong>Ten-percent fills.</strong> Hairline edges with vertex dots and a barely-there fill, "
     "so volumes read as solid without hiding what sits behind them. Dashed leaders connect tiers "
     "without implying data flow.",
     "Hairlines under 1px disappear on projectors and in print. Set a 1.1px floor and test at the "
     "size it will actually be shown."),
    (21, "component-specimen", "Component Specimen", specimen,
     "Every part, on one sheet, to mix and match.",
     "<strong>Components, not themes.</strong> Ten node styles, twelve connector types, six "
     "endpoints, a five-step elevation scale, three junction markers and status chips. Pick a node "
     "style from one row and a connector from another — the point is that these compose, so a "
     "house look can be assembled rather than chosen off a shelf.",
     "Mixing without a rule produces mush. Choose one node style, at most two connector types, and "
     "one elevation step per diagram, then hold them for the whole set."),
]


def main() -> int:
    OUT.mkdir(exist_ok=True)
    for k in (INK, SOFT, ACC, BLUE, GREEN, GOLD, PLUM):
        assert contrast_ratio(k, G) >= 4.5, k
    for n, slug, title, fn, note, tech, caveat in DEMOS:
        (OUT / f"{n}-{slug}.html").write_text(
            shell(n, title, note, tech, fn(), caveat), encoding="utf-8")
        print(f"  {n}-{slug}")
    print(f"\n{len(DEMOS)} demos -> {OUT.name}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
