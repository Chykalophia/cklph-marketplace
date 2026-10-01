#!/usr/bin/env python3
"""Render the three proof diagrams for a given brand, source-first.

This is a **verification harness**, not the production path. Normal use of the
skill is Claude writing the diagram source (references/diagram-source.md) and
then drawing the SVG from it by hand. This script follows the same two steps
mechanically so the checks have fixtures that exercise the real contract:

  1. each builder returns a *source record* -- content and placement only;
  2. ``draw()`` turns that record into SVG, reading nothing else;
  3. the record is written as ``<file>.json`` beside the HTML and embedded in it.

It also answers the Phase 1 acceptance question: does the same diagram render
correctly in two different brands from the same directory, and pass the gates
in both?

    python scripts/build-examples.py --brand cklph --out out/
    python scripts/build-examples.py --brand _default --mode dark --out out/
"""

from __future__ import annotations

import argparse
import html
import importlib.util
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILL_SCRIPTS = ROOT / "skills/cklph-diagram/scripts"
sys.path.insert(0, str(SKILL_SCRIPTS))

_spec = importlib.util.spec_from_file_location("brand_tokens", SKILL_SCRIPTS / "brand-tokens.py")
brand_tokens = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(brand_tokens)

import diagram_source  # noqa: E402

GRID = 4
R = 8  # elbow radius
SKILL_VERSION = "3.2-cklph"


def snap(v: float) -> int:
    """Every coordinate lands on the 4px grid."""
    return int(round(v / GRID) * GRID)


def esc(s: str) -> str:
    return html.escape(s, quote=True)


# --------------------------------------------------------------------------- #
# Sources -- content and placement, nothing about drawing
# --------------------------------------------------------------------------- #

def base(name: str, brand_slug: str, mode: str, title: str, desc: str,
         width: int, height: int) -> dict:
    return {
        "format": diagram_source.FORMAT,
        "schema_version": diagram_source.SCHEMA_VERSION,
        "id": f"{name}-{brand_slug.strip('_')}-{mode}",
        "type": name,
        "meta": {
            "title": title,
            "desc": desc,
            "eyebrow": name.upper(),
            "created": date.today().isoformat(),
            "skill_version": SKILL_VERSION,
        },
        "brand": {"slug": brand_slug, "modes": [mode]},
        "canvas": {"width": width, "height": height, "render_width": 784, "preset": "doc-inline"},
    }


def architecture_source(brand_slug: str, mode: str) -> dict:
    src = base("architecture", brand_slug, mode, "Lead intake pipeline",
               "Form submissions enter through an edge intake worker, queue, and are processed"
               " by a worker that writes to the CRM and triggers notifications asynchronously.",
               784, 480)
    w, h, gap, y = 136, 88, 56, 112
    xs = [32 + i * (w + gap) for i in range(4)]
    notify_x, notify_y = xs[2], y + h + 96
    specs = [
        ("intake", "Intake", "edge worker", "EDGE", "backend", {"cat": "cat-1", "rx": 0}),
        ("queue", "Queue", "durable, 7d", "QUEUE", "store", {"cat": "cat-3", "rx": 12}),
        ("worker", "Worker", "retry x3", "PROC", "focal", {"cat": "cat-2", "rx": 8}),
        ("crm", "CRM", "system of record", "STORE", "store", {"cat": "cat-1", "rx": 0}),
    ]
    src["nodes"] = [
        {"id": i, "label": l, "sublabel": s, "tag": t, "role": role, "cue": cue,
         "x": xs[k], "y": y, "w": w, "h": h}
        for k, (i, l, s, t, role, cue) in enumerate(specs)
    ] + [{"id": "notify", "label": "Notify", "sublabel": "best effort", "tag": "SIDE",
          "role": "optional", "cue": {"cat": "cat-4", "rx": 8, "dash": "4,3"},
          "x": notify_x, "y": notify_y, "w": w, "h": h}]

    mid = y + h // 2
    edges = []
    for k, (label, a, b) in enumerate([("POST", "intake", "queue"), ("PULL", "queue", "worker"),
                                       ("WRITE", "worker", "crm")]):
        x1, x2 = xs[k] + w, xs[k + 1]
        edges.append({"id": f"{a}-{b}", "from": a, "to": b, "label": label,
                      "points": [[x1, mid], [x2 - 8, mid]], "label_at": [(x1 + x2) // 2, mid - 24]})
    cx = xs[2] + w // 2
    edges.append({"id": "worker-notify", "from": "worker", "to": "notify", "style": "accent",
                  "points": [[cx, y + h], [cx, notify_y - 8]]})
    ex = xs[3] + w // 2
    edges.append({"id": "crm-notify", "from": "crm", "to": "notify", "dash": "4,3",
                  "points": [[ex, y + h], [ex, notify_y + 44], [notify_x + w + 8, notify_y + 44]]})
    src["edges"] = edges
    src["legend"] = [
        {"label": "Square = pipeline", "cue": {"cat": "cat-1", "rx": 0}},
        {"label": "Round = buffer", "cue": {"cat": "cat-3", "rx": 10}},
        {"label": "Dashed = off-path", "cue": {"cat": "cat-4", "rx": 0, "dash": "4,3"}},
    ]
    src["alt"] = {
        "summary": "How a submitted lead form travels from the public edge to the CRM, and what happens off to the side.",
        "reading_order": "Left to right, starting at Intake.",
        "items": [
            "Intake (edge worker): receives the form POST and validates it.",
            "Queue (durable, 7 day retention): buffers work so a slow CRM never drops a lead.",
            "Worker (retries three times): the focal node; this is where the retry logic lives and where failures surface.",
            "CRM: the system of record. Terminal.",
            "Notify (async, best effort): fires Slack and email. Deliberately off the critical path.",
        ],
        "connections": "Intake → Queue (POST). Queue → Worker (PULL). Worker → CRM (WRITE). "
                       "Worker → Notify (synchronous trigger, highlighted). "
                       "CRM → Notify (dashed: asynchronous, may lag or fail without blocking).",
        "highlighted": "Worker is the focal node: every retry and every failure mode in this pipeline is its responsibility.",
    }
    return src


def quadrant_source(brand_slug: str, mode: str) -> dict:
    src = base("quadrant", brand_slug, mode, "Service line positioning",
               "Four service lines plotted by margin against delivery repeatability, showing that"
               " platform builds carry the highest margin but the lowest repeatability.",
               560, 512)
    x0, y0, size = 96, 72, 320
    items = [
        ("retainer-seo", "Retainer SEO", 0.72, 0.30, {"cat": "cat-1", "rx": 0}),
        ("brand-sprint", "Brand sprint", 0.30, 0.24, {"cat": "cat-2", "rx": 5}),
        ("platform-build", "Platform build", 0.80, 0.78, {"cat": "cat-3", "rx": 10}),
        ("one-off-audit", "One-off audit", 0.22, 0.66, {"cat": "cat-4", "rx": 0, "dash": "3,2"}),
    ]
    src["nodes"] = []
    for nid, label, fx, fy, cue in items:
        cx, cy = snap(x0 + fx * size), snap(y0 + fy * size)
        src["nodes"].append({"id": nid, "kind": "marker", "label": label, "cue": cue,
                             "x": cx - 10, "y": cy - 10, "w": 20, "h": 20})
    src["data"] = {
        "plot": {"x": x0, "y": y0, "size": size},
        "x_axis": {"low": "ONE-OFF", "high": "REPEATABLE"},
        "y_axis": {"low": "LOW MARGIN", "high": "HIGH MARGIN"},
        "values": {nid: {"repeatability": fx, "margin_rank": fy} for nid, _l, fx, fy, _c in items},
    }
    src["legend"] = [{"label": "Shape = service line."}, {"label": "Position = margin x repeatability."}]
    src["alt"] = {
        "summary": "Four Chykalophia service lines plotted by margin (vertical) against how repeatable delivery is (horizontal).",
        "reading_order": "Top-right quadrant first (high margin, repeatable), then clockwise.",
        "items": [
            "Retainer SEO: high margin, repeatable. The quadrant you want more of.",
            "Brand sprint: high margin, one-off. Good money, no compounding.",
            "Platform build: low margin, repeatable. Volume work; margin is the problem, not demand.",
            "One-off audit: low margin, one-off. The quadrant to price out of or productise.",
        ],
        "highlighted": "Position carries the meaning. Marker shape repeats the service-line identity so the chart survives greyscale printing.",
    }
    return src


def timeline_source(brand_slug: str, mode: str) -> dict:
    src = base("timeline", brand_slug, mode, "Engagement phases",
               "A four-phase engagement running from a two-week discovery through an eight-week"
               " build and a one-week launch into an ongoing retainer.",
               784, 256)
    y, x0, step = 120, 88, 176
    events = [
        ("discovery", "Q1", "Discovery", "2 weeks", {"cat": "cat-1", "rx": 0}, None),
        ("build", "Q2", "Build", "8 weeks", {"cat": "cat-2", "rx": 5}, None),
        ("launch", "Q3", "Launch", "1 week", {"cat": "cat-3", "rx": 10}, "focal"),
        ("retainer", "Q4", "Retainer", "ongoing", {"cat": "cat-4", "rx": 0, "dash": "4,3"}, None),
    ]
    src["nodes"] = [
        {"id": nid, "kind": "marker", "tag": tag, "label": label, "sublabel": dur, "cue": cue,
         "x": x0 + i * step - 10, "y": y - 10, "w": 20, "h": 20, **({"role": role} if role else {})}
        for i, (nid, tag, label, dur, cue, role) in enumerate(events)
    ]
    src["data"] = {"axis": {"y": y, "x1": x0, "x2": x0 + 3 * step + 24}}
    src["legend"] = [{"label": "Dashed marker = open-ended. Accent = the phase with the hard external date."}]
    src["alt"] = {
        "summary": "The four phases of a standard engagement and how long each runs.",
        "reading_order": "Left to right, Q1 through Q4.",
        "items": [
            "Discovery (Q1, two weeks): scoping and access.",
            "Build (Q2, eight weeks): the bulk of delivery.",
            "Launch (Q3, one week): highlighted, because it is the only phase with a hard external date.",
            "Retainer (Q4, ongoing): dashed marker, open-ended, no fixed end.",
        ],
    }
    return src


SOURCES = {
    "architecture": architecture_source,
    "quadrant": quadrant_source,
    "timeline": timeline_source,
}


# --------------------------------------------------------------------------- #
# Drawing -- reads only the source record
# --------------------------------------------------------------------------- #

def route(points: list) -> str:
    """Orthogonal polyline with each corner rounded at radius R."""
    pts = [tuple(p) for p in points]
    d = [f"M {pts[0][0]} {pts[0][1]}"]
    for i in range(1, len(pts) - 1):
        (ax, ay), (bx, by), (cx, cy) = pts[i - 1], pts[i], pts[i + 1]
        sx1 = (bx > ax) - (bx < ax); sy1 = (by > ay) - (by < ay)
        sx2 = (cx > bx) - (cx < bx); sy2 = (cy > by) - (cy < by)
        d.append(f"L {bx - sx1 * R} {by - sy1 * R} Q {bx} {by} {bx + sx2 * R} {by + sy2 * R}")
    d.append(f"L {pts[-1][0]} {pts[-1][1]}")
    return " ".join(d)


def stroke_of(n: dict) -> str:
    return "var(--accent)" if n.get("role") == "focal" else f"var(--{n.get('cue', {}).get('cat', 'ink')})"


def dash_attr(cue: dict | None) -> str:
    return f' stroke-dasharray="{cue["dash"]}"' if cue and cue.get("dash") else ""


def draw_box_node(n: dict) -> str:
    x, y, w, h = n["x"], n["y"], n["w"], n["h"]
    cue = n.get("cue", {})
    focal = n.get("role") == "focal"
    fill = "var(--accent-tint)" if focal else "var(--paper-2)"
    cx = x + w // 2
    return f"""  <g data-node="{n['id']}">
    <rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{cue.get('rx', 0)}" fill="var(--paper)"/>
    <rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{cue.get('rx', 0)}" fill="{fill}"
          stroke="{stroke_of(n)}" stroke-width="{2 if focal else 1.2}"{dash_attr(cue)}/>
    <text x="{x + 12}" y="{y + 24}" fill="var(--muted)" font-size="12"
          font-family="var(--font-mono)" letter-spacing="0.08em">{esc(n['tag'])}</text>
    <text x="{cx}" y="{y + 48}" fill="var(--ink)" font-size="16" font-weight="600"
          font-family="var(--font-sans)" text-anchor="middle">{esc(n['label'])}</text>
    <text x="{cx}" y="{y + 68}" fill="var(--muted)" font-size="12"
          font-family="var(--font-mono)" text-anchor="middle">{esc(n['sublabel'])}</text>
  </g>"""


def draw_marker(n: dict, labels: list[tuple[int, int, str, str]]) -> str:
    cue = n.get("cue", {})
    marker = (f'<rect x="{n["x"]}" y="{n["y"]}" width="{n["w"]}" height="{n["h"]}" rx="{cue.get("rx", 0)}"'
              f' fill="var(--paper)" stroke="{stroke_of(n)}" stroke-width="2"{dash_attr(cue)}/>')
    texts = "".join(
        f'<text x="{x}" y="{y}" fill="var(--{"ink" if size == "16" or weight else "muted"})"'
        f' font-size="{size}"{" font-weight=\"600\"" if weight else ""}'
        f' font-family="var(--font-{"sans" if weight else "mono"})" text-anchor="middle">{esc(t)}</text>'
        for x, y, t, size, weight in labels
    )
    return f'  <g data-node="{n["id"]}">{marker}{texts}</g>'


def draw_edges(src: dict, slug: str) -> list[str]:
    out = ['  <g fill="none" stroke-width="1.2">']
    labels = []
    for e in src.get("edges", []):
        accent = e.get("style") == "accent"
        stroke = "var(--accent)" if accent else ("var(--link)" if e.get("style") == "link" else "var(--muted)")
        marker = f"{slug}-arrow-accent" if accent else f"{slug}-arrow"
        dash = f' stroke-dasharray="{e["dash"]}"' if e.get("dash") else ""
        out.append(f'    <path data-edge="{e["id"]}" d="{route(e["points"])}" stroke="{stroke}"{dash}'
                   f' marker-end="url(#{marker})"/>')
        if e.get("label") and e.get("label_at"):
            lx, ly = e["label_at"]
            mw = 48
            labels.append(
                f'    <rect x="{lx - mw // 2}" y="{ly - 8}" width="{mw}" height="16" rx="2" fill="var(--paper)"/>\n'
                f'    <text x="{lx}" y="{ly + 4}" fill="var(--muted)" font-size="12" font-family="var(--font-mono)"'
                f' text-anchor="middle" letter-spacing="0.06em">{esc(e["label"])}</text>'
            )
    return out + labels + ["  </g>"]


def draw_legend(src: dict, x: int, y: int, x2: int, step: int = 192) -> list[str]:
    out = [f'  <line x1="{x}" y1="{y - 16}" x2="{x2}" y2="{y - 16}" stroke="var(--rule)" stroke-width="1"/>']
    lx = x
    for i, item in enumerate(src.get("legend", [])):
        cue = item.get("cue")
        if cue:
            out.append(f'  <rect x="{lx}" y="{y}" width="16" height="16" rx="{cue.get("rx", 0)}" fill="none"'
                       f' stroke="var(--{cue["cat"]})" stroke-width="1.2"{dash_attr(cue)}/>'
                       f'<text x="{lx + 28}" y="{y + 15}" fill="var(--muted)" font-size="12"'
                       f' font-family="var(--font-mono)">{esc(item["label"])}</text>')
            lx += step
        else:
            out.append(f'  <text x="{x}" y="{y + 4 + 20 * i}" fill="var(--muted)" font-size="12"'
                       f' font-family="var(--font-mono)">{esc(item["label"])}</text>')
    return out


def draw(src: dict) -> str:
    """The SVG for a source record. Reads nothing but ``src``."""
    slug, c, m = src["id"], src["canvas"], src["meta"]
    lines = [
        f'<svg viewBox="0 0 {c["width"]} {c["height"]}" data-render-width="{c["render_width"]}"'
        f' style="min-width: {c["render_width"]}px" role="img"',
        f'     aria-labelledby="{slug}-title {slug}-desc"',
        '     xmlns="http://www.w3.org/2000/svg">',
        f'  <title id="{slug}-title">{esc(m["title"])}</title>',
        f'  <desc id="{slug}-desc">{esc(m["desc"])}</desc>',
        f"""  <defs>
    <marker id="{slug}-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="var(--muted)"/>
    </marker>
    <marker id="{slug}-arrow-accent" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="var(--accent)"/>
    </marker>
  </defs>""",
        '  <rect width="100%" height="100%" fill="var(--paper)"/>',
    ]
    kind = src["type"]
    if kind == "architecture":
        lines += draw_edges(src, slug)
        lines += [draw_box_node(n) for n in src["nodes"]]
        lines += draw_legend(src, 32, 432, 744)
    elif kind == "quadrant":
        d = src["data"]
        x0, y0, size = d["plot"]["x"], d["plot"]["y"], d["plot"]["size"]
        mid_x, mid_y = x0 + size // 2, y0 + size // 2
        lines += [
            f'  <rect x="{x0}" y="{y0}" width="{size}" height="{size}" fill="var(--paper-2)"'
            f' stroke="var(--rule-solid)" stroke-width="1"/>',
            f'  <line x1="{mid_x}" y1="{y0}" x2="{mid_x}" y2="{y0 + size}" stroke="var(--rule-solid)" stroke-width="1"/>',
            f'  <line x1="{x0}" y1="{mid_y}" x2="{x0 + size}" y2="{mid_y}" stroke="var(--rule-solid)" stroke-width="1"/>',
            f'  <text x="{mid_x}" y="{y0 - 16}" fill="var(--muted)" font-size="12" font-family="var(--font-mono)"'
            f' text-anchor="middle" letter-spacing="0.16em">{esc(d["y_axis"]["high"])}</text>',
            f'  <text x="{mid_x}" y="{y0 + size + 28}" fill="var(--muted)" font-size="12"'
            f' font-family="var(--font-mono)" text-anchor="middle" letter-spacing="0.16em">{esc(d["y_axis"]["low"])}</text>',
            f'  <text x="{x0 - 16}" y="{mid_y}" fill="var(--muted)" font-size="12" font-family="var(--font-mono)"'
            f' text-anchor="end">{esc(d["x_axis"]["low"])}</text>',
            f'  <text x="{x0 + size + 16}" y="{mid_y}" fill="var(--muted)" font-size="12"'
            f' font-family="var(--font-mono)">{esc(d["x_axis"]["high"])}</text>',
        ]
        for n in src["nodes"]:
            cx, cy = n["x"] + 10, n["y"] + 10
            lines.append(draw_marker(n, [(cx, cy + 34, n["label"], "12", True)]))
        lines += draw_legend(src, 96, y0 + size + 64, 464)
    elif kind == "timeline":
        ax = src["data"]["axis"]
        lines.append(f'  <line x1="{ax["x1"]}" y1="{ax["y"]}" x2="{ax["x2"]}" y2="{ax["y"]}"'
                     f' stroke="var(--rule-solid)" stroke-width="1.2"/>')
        for n in src["nodes"]:
            cx, cy = n["x"] + 10, n["y"] + 10
            lines.append(draw_marker(n, [(cx, cy - 32, n["tag"], "12", False),
                                         (cx, cy + 40, n["label"], "16", True),
                                         (cx, cy + 60, n["sublabel"], "12", False)]))
        lines += draw_legend(src, 88, 224, 712)
    else:
        raise ValueError(f"no proof drawing for {kind}")
    lines.append("</svg>")
    return "\n".join(lines)


def alt_html(src: dict) -> str:
    a = src["alt"]
    parts = [f"<p><strong>What it shows.</strong> {esc(a['summary'])}</p>",
             f"<p><strong>Reading order.</strong> {esc(a['reading_order'])}</p>",
             "<ol>" + "".join(f"<li>{esc(i)}</li>" for i in a["items"]) + "</ol>"]
    if a.get("connections"):
        parts.append(f"<p><strong>Connections.</strong> {esc(a['connections'])}</p>")
    if a.get("highlighted"):
        parts.append(f"<p><strong>Highlighted.</strong> {esc(a['highlighted'])}</p>")
    return "\n".join(parts)


def shell(src: dict, label: str, css_vars: str, svg: str, fonts: str) -> str:
    slug, mode = src["id"], src["brand"]["modes"][0]
    eyebrow = f"{esc(label.upper())} &middot; {esc(src['meta']['eyebrow'])}"
    title = esc(src["meta"]["title"])
    return f"""<!DOCTYPE html>
<html lang="en" data-cklph-brand="{esc(src['brand']['slug'])}" data-cklph-mode="{mode}">
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
/* The SVG holds its rendered width (its inline min-width == data-render-width)
   so the 12px floor survives a phone; the container scrolls instead of the page. */
.diagram-container {{ width: 100%; overflow-x: auto; }}
svg {{ width: 100%; height: auto; display: block; }}
@media print {{ .diagram-container {{ overflow-x: visible; }} svg {{ min-width: 0 !important; }} }}
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
<div class="diagram-container">
{svg}
</div>
<details class="diagram-alt">
<summary>Text description of this diagram</summary>
<div id="{slug}-alt">
{alt_html(src)}
</div>
</details>
<footer>{eyebrow} &middot; drawn from {slug}.json</footer>
</div>
{diagram_source.embed_block(src)}
</body>
</html>
"""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--brand", required=True)
    ap.add_argument("--mode", default="light", choices=["light", "dark"])
    ap.add_argument("--out", type=Path, default=ROOT / "out")
    ap.add_argument("--types", nargs="*", default=list(SOURCES))
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

    css = brand_tokens.to_css(brand, args.mode)
    args.out.mkdir(parents=True, exist_ok=True)
    for name in args.types:
        src = SOURCES[name](slug, args.mode)
        rep = diagram_source.validate(src)
        if rep.errors:
            for f in rep.errors:
                print(f.line(), file=sys.stderr)
            return 1
        page = shell(src, brand["label"], css, draw(src), brand["font_link"])
        (args.out / f"{src['id']}.json").write_text(json.dumps(src, indent=2, ensure_ascii=False) + "\n",
                                                   encoding="utf-8")
        path = args.out / f"{src['id']}.html"
        path.write_text(page, encoding="utf-8")
        print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
