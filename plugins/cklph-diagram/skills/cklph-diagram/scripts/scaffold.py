#!/usr/bin/env python3
"""Build a diagram's page from its source -- everything except the drawing.

    python3 scripts/scaffold.py <slug>.json              # writes <slug>.html (+ <slug>-dark.html …)
    python3 scripts/scaffold.py <slug>.json --motion     # in-page step animation (template-motion)

From the source (references/diagram-source.md) it writes, for every mode in
``brand.modes``: the brand's tokens and font link, ``data-cklph-*`` attributes,
title / eyebrow / h1, the SVG element (viewBox, data-render-width, min-width,
title, desc, arrow markers, background), the prose alternative from ``alt``, and
the embedded source. It never draws: nodes, edges and labels are yours, between

    <!-- cklph:draw:start -->  …  <!-- cklph:draw:end -->

Re-run it after editing the source and it rebuilds everything around those
markers while keeping what you drew, copied into every mode's file. A page that
already exists without the markers is refused rather than overwritten.

No renderer program: this writes the shell, Claude draws the diagram.
"""

from __future__ import annotations

import html as H
import importlib.util
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import diagram_source  # noqa: E402

_spec = importlib.util.spec_from_file_location("brand_tokens", HERE / "brand-tokens.py")
brand_tokens = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(brand_tokens)

DRAW_START = "<!-- cklph:draw:start -->"
DRAW_END = "<!-- cklph:draw:end -->"
DRAW_PLACEHOLDER = """
        <!-- Draw here, from the source and nothing else (diagram-source.md §3):
             arrows first, then labels, then nodes. Each node a <g data-node="id">
             whose first child is its box; each edge a <path data-edge="id">.
             Stepped elements (source "step") carry data-motion-item data-step="N". -->
"""
MOTION_TEMPLATE = HERE.parent / "assets" / "template-motion.html"

CSS = """* {{ box-sizing: border-box; }}
body {{
  margin: 0; padding: 48px 32px;
  background: var(--paper); color: var(--ink);
  font-family: var(--font-sans); line-height: 1.5;
}}
.wrap {{ max-width: {wrap}px; margin: 0 auto; }}
.eyebrow {{
  font-family: var(--font-mono); font-size: 12px; font-weight: 500;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted);
  margin: 0 0 8px;
}}
h1 {{ font-family: var(--font-display); font-size: 28px; font-weight: 400; margin: 0 0 24px; }}
/* The SVG holds its rendered width (inline min-width == data-render-width) so
   the 12px floor survives a phone; this container scrolls instead of the page. */
.diagram-container {{ width: 100%; overflow-x: auto; }}
svg {{ width: 100%; height: auto; display: block; }}
@media print {{ .diagram-container {{ overflow-x: visible; }} svg {{ min-width: 0 !important; }} }}
.diagram-alt {{ margin-top: 32px; border-top: 1px solid var(--rule); padding-top: 16px; font-size: 16px; }}
.diagram-alt summary {{
  font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--muted); cursor: pointer;
}}
.diagram-alt ol {{ padding-left: 20px; }}
.diagram-alt li {{ margin-bottom: 8px; }}"""


def esc(s: object) -> str:
    return H.escape(str(s), quote=True)


def file_for(src_path: Path, mode: str, primary: str) -> Path:
    """<slug>.html for the first mode, <slug>-<mode>.html for the others."""
    stem = src_path.with_suffix("")
    return stem.with_suffix(".html") if mode == primary else stem.with_name(f"{stem.name}-{mode}.html")


def defs(slug: str) -> str:
    # markerUnits="userSpaceOnUse": the arrowhead keeps its 8x6 size whatever
    # the stroke width, so a 2px accent line doesn't get a doubled head.
    head = 'markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto" markerUnits="userSpaceOnUse"'
    return (f'  <defs>\n'
            f'    <marker id="{slug}-arrow" {head}><polygon points="0 0, 8 3, 0 6" fill="var(--muted)"/></marker>\n'
            f'    <marker id="{slug}-arrow-accent" {head}><polygon points="0 0, 8 3, 0 6" fill="var(--accent)"/></marker>\n'
            f'    <marker id="{slug}-arrow-link" {head}><polygon points="0 0, 8 3, 0 6" fill="var(--link)"/></marker>\n'
            f'  </defs>')


def svg_element(src: dict, body: str) -> str:
    slug, c, m = src["id"], src["canvas"], src["meta"]
    rw = c.get("render_width", c["width"])
    return (f'<svg viewBox="0 0 {c["width"]} {c["height"]}" data-render-width="{rw}" style="min-width: {rw}px"'
            f' role="img" aria-labelledby="{slug}-title {slug}-desc" xmlns="http://www.w3.org/2000/svg">\n'
            f'  <title id="{slug}-title">{esc(m["title"])}</title>\n'
            f'  <desc id="{slug}-desc">{esc(m["desc"])}</desc>\n'
            f'{defs(slug)}\n'
            f'  <rect width="100%" height="100%" fill="var(--paper)"/>\n'
            f'  {DRAW_START}{body}{DRAW_END}\n'
            f'</svg>')


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


def tokens_for(src: dict, mode: str) -> tuple[str, str]:
    """(css block, font <link>) for the source's brand in ``mode``; refuses a stub."""
    brand = brand_tokens.load(brand_tokens.resolve_slug(src["brand"]["slug"]))
    problems = brand_tokens.validate(brand, mode)
    if problems:
        raise SystemExit(f"REFUSED — brand {src['brand']['slug']!r} cannot render in {mode}:\n  - "
                         + "\n  - ".join(problems))
    return brand_tokens.to_css(brand, mode), brand.get("font_link") or ""


def page(src: dict, mode: str, body: str) -> str:
    """The minimal static page: diagram, title and prose alternative, embeddable as-is."""
    css, link = tokens_for(src, mode)
    m, c = src["meta"], src["canvas"]
    wrap = max(784, c.get("render_width", c["width"]))
    eyebrow = f'<p class="eyebrow">{esc(m["eyebrow"])}</p>\n' if m.get("eyebrow") else ""
    return f"""<!DOCTYPE html>
<html lang="en" data-cklph-brand="{esc(src['brand']['slug'])}" data-cklph-mode="{mode}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(m['title'])}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
{link}
<style>
{css}
{CSS.format(wrap=wrap)}
</style>
</head>
<body>
<div class="wrap">
{eyebrow}<h1>{esc(m['title'])}</h1>
<div class="diagram-container">
{svg_element(src, body)}
</div>
<details class="diagram-alt">
<summary>Text description of this diagram</summary>
<div id="{src['id']}-alt">
{alt_html(src)}
</div>
</details>
</div>
{diagram_source.embed_block(src)}
</body>
</html>
"""


def motion_page(src: dict, mode: str, body: str) -> str:
    """In-page step animation: template-motion's canonical controller, our shell."""
    t = MOTION_TEMPLATE.read_text(encoding="utf-8")
    css, link = tokens_for(src, mode)
    m = src["meta"]
    steps = sorted({int(i["step"]) for k in ("nodes", "edges") for i in src.get(k, [])
                    if isinstance(i, dict) and isinstance(i.get("step"), int)})
    if not steps:
        raise SystemExit("REFUSED — --motion needs at least one node or edge with a \"step\" in the source")

    def sub(pattern: str, repl: str, text: str, flags: int = re.S) -> str:
        new, n = re.subn(pattern, lambda _m: repl, text, count=1, flags=flags)
        if n != 1:
            raise SystemExit(f"template-motion.html changed shape; cannot find {pattern[:40]!r}")
        return new

    t = sub(r'<html lang="en"[^>]*>', f'<html lang="en" data-cklph-brand="{esc(src["brand"]["slug"])}"'
            f' data-cklph-mode="{mode}">', t)
    t = sub(r"<title>.*?</title>", f"<title>{esc(m['title'])}</title>", t)
    t = sub(r'  <link href="https://fonts\.googleapis\.com[^\n]*\n', f"  {link}\n" if link else "", t)
    t = sub(r"/\* cklph:tokens:start \*/.*?/\* cklph:tokens:end \*/",
            "/* cklph:tokens:start */\n" + css + "\n    /* cklph:tokens:end */", t)
    t = sub(r"<main data-motion-root[^>]*>",
            f'<main data-motion-root data-motion-mode="step" data-step-count="{max(steps)}"'
            f' data-step-current="{max(steps)}" data-frame="static" data-static-frame="complete">', t)
    t = sub(r'<p class="eyebrow">.*?</p>\s*<h1>.*?</h1>',
            f'<p class="eyebrow">{esc(m.get("eyebrow", ""))}</p>\n    <h1>{esc(m["title"])}</h1>', t)
    t = sub(r"<svg .*?</svg>", svg_element(src, body), t)
    t = sub(r'<div id="[^"]*-alt">.*?</div>', f'<div id="{src["id"]}-alt">\n{alt_html(src)}\n      </div>', t)
    t = re.sub(r"\s*<!-- Replace template-motion in IDs and prose when copying this file. -->", "", t)
    t = re.sub(r"\s*<!-- Required prose alternative.*?-->", "", t, flags=re.S)
    t = re.sub(r"\s*<!-- Embed this diagram's source here.*?-->", "", t, flags=re.S)
    i = t.rindex("</body>")
    return t[:i] + diagram_source.embed_block(src) + "\n" + t[i:]


def drawn_body(path: Path) -> str | None:
    if not path.exists():
        return None
    text = path.read_text(encoding="utf-8")
    if DRAW_START not in text or DRAW_END not in text:
        raise SystemExit(f"REFUSED — {path.name} exists but has no {DRAW_START} … {DRAW_END} markers; "
                         "it was not made by scaffold.py. Move it aside, or add the markers around its "
                         "drawing, then rerun.")
    return text.split(DRAW_START, 1)[1].split(DRAW_END, 1)[0]


def main(argv: list[str]) -> int:
    args = [a for a in argv if not a.startswith("--")]
    motion = "--motion" in argv
    if len(args) != 1:
        print(__doc__)
        return 2
    src_path = Path(args[0])
    src = json.loads(src_path.read_text(encoding="utf-8"))
    rep = diagram_source.validate(src)
    if rep.errors:
        for f in rep.errors:
            print(f.line())
        print("fix the source first: scaffold builds only from a valid source")
        return 1
    modes = src["brand"]["modes"]
    targets = {mode: file_for(src_path, mode, modes[0]) for mode in modes}
    body = None
    for path in targets.values():
        found = drawn_body(path)
        if found is not None and found.strip() and DRAW_PLACEHOLDER.strip() not in found:
            body = found
            break
        if found is not None and body is None:
            body = found
    body = body if body is not None else DRAW_PLACEHOLDER
    for mode, path in targets.items():
        path.write_text((motion_page if motion else page)(src, mode, body), encoding="utf-8")
        state = "kept your drawing" if DRAW_PLACEHOLDER.strip() not in body else "ready to draw"
        print(f"wrote {path.name} ({mode}, {state})")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
