#!/usr/bin/env python3
"""The diagram source: the JSON record every diagram is drawn from.

The source is the single place where a diagram's content *and* placement live:
nodes, edges, groups, labels, coordinates, sizes, brand, canvas, chart data and
the prose alternative. Claude decides the layout once, writes it here, then
draws the SVG by following it -- and on every later edit reads it back instead
of re-deriving the layout. See ``references/diagram-source.md``.

This module answers three questions, each as a list of findings:

  validate(source)        is the record well-formed and is its geometry sound?
  embedded(html)          what source does the HTML carry?
  match(source, html)     does the drawing say what the record says?
  diff(old, new)          what changed between two versions, by id?

    python3 scripts/diagram_source.py <slug>.json [<slug>.html]
    python3 scripts/diagram_source.py diff old/<slug>.json new/<slug>.json
    python3 scripts/diagram_source.py embed <slug>.json <slug>.html   # (re)embed in place

No third-party dependencies.
"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path

FORMAT = "cklph-diagram-source"
SCHEMA_VERSION = 1
SOURCE_SCRIPT_ID = "cklph-diagram-source"

SKILL_DIR = Path(__file__).resolve().parent.parent
TYPES = sorted(p.stem[len("type-"):] for p in (SKILL_DIR / "references").glob("type-*.md"))

SLUG_RE = re.compile(r"[a-z0-9][a-z0-9-]{0,63}")
ID_RE = re.compile(r"[A-Za-z][A-Za-z0-9_-]{0,63}")
ROLES = {"focal", "backend", "store", "external", "input", "optional", "security"}
KINDS = {"box", "marker", "decision"}
MAX_STEPS = 8          # animation.md: at most 8 semantic steps
EDGE_STYLES = {"default", "accent", "link"}
MODES = {"light", "dark"}

TOP_KEYS = {
    "format": True, "schema_version": True, "id": True, "type": True, "pattern": False,
    "meta": True, "brand": True, "canvas": True, "nodes": True, "edges": False,
    "groups": False, "legend": False, "annotations": False, "data": False,
    "alt": True, "notes": False, "layout": False,
}
NODE_KEYS = {"id", "kind", "label", "sublabel", "tag", "role", "cue", "x", "y", "w", "h", "step", "at", "span"}
EDGE_KEYS = {"id", "from", "to", "label", "style", "dash", "points", "label_at", "step"}
GROUP_KEYS = {"id", "label", "contains", "x", "y", "w", "h", "dash", "lane"}

POS_TOLERANCE = 1.0      # px: a drawn node rect may differ from the record by this much
ENDPOINT_TOLERANCE = 2.0  # px: a drawn path's first/last point vs the record
NODE_INSET = 2.0          # px: an edge may graze a box edge, not enter it
COLLINEAR_MIN = 8.0       # px: shared run of two different edges that counts as stacking


@dataclass
class Finding:
    gate: str
    code: str
    subject: str
    message: str
    fix: str = ""
    severity: str = "error"  # error | warn

    def line(self) -> str:
        tag = "FAIL" if self.severity == "error" else "warn"
        text = f"{tag} [{self.gate}:{self.code}] {self.subject}: {self.message}"
        return text + (f"\n       fix: {self.fix}" if self.fix else "")


@dataclass
class Report:
    findings: list[Finding] = field(default_factory=list)

    def err(self, gate, code, subject, message, fix=""):
        self.findings.append(Finding(gate, code, subject, message, fix, "error"))

    def warn(self, gate, code, subject, message, fix=""):
        self.findings.append(Finding(gate, code, subject, message, fix, "warn"))

    @property
    def errors(self) -> list[Finding]:
        return [f for f in self.findings if f.severity == "error"]


# --------------------------------------------------------------------------- #
# validate
# --------------------------------------------------------------------------- #

def _num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _rect(item: dict) -> tuple[float, float, float, float] | None:
    if all(_num(item.get(k)) for k in ("x", "y", "w", "h")):
        return float(item["x"]), float(item["y"]), float(item["w"]), float(item["h"])
    return None


def _check_box(rep: Report, kind: str, item: dict, canvas: tuple[float, float]) -> None:
    sid = item.get("id", "?")
    r = _rect(item)
    if r is None:
        rep.err("source", "geometry", f"{kind} {sid}", "x, y, w, h must all be numbers",
                "set them, or give it \"at\" / \"lane\" and run `python3 scripts/layout.py place <slug>.json --write`")
        return
    x, y, w, h = r
    if w <= 0 or h <= 0:
        rep.err("source", "geometry", f"{kind} {sid}", f"non-positive size {w}x{h}")
    if x < 0 or y < 0 or x + w > canvas[0] or y + h > canvas[1]:
        rep.err("source", "off-canvas", f"{kind} {sid}",
                f"box {x:g},{y:g} {w:g}x{h:g} leaves the {canvas[0]:g}x{canvas[1]:g} canvas",
                "move it inside, or grow canvas.width/height (multiples of 4)")
    # Chart markers sit where the data puts them (layout-budget.md exempts
    # data-derived positions); only structural boxes owe the 4px grid.
    if item.get("kind", "box") != "marker" and any(v % 4 for v in (x, y, w, h)):
        rep.warn("source", "off-grid", f"{kind} {sid}",
                 f"box {x:g},{y:g} {w:g}x{h:g} is off the 4px grid (layout-budget.md)")


def validate(src: object, check_brand: bool = True) -> Report:
    rep = Report()
    if not isinstance(src, dict):
        rep.err("source", "shape", "source", "top level must be a JSON object")
        return rep

    for key, required in TOP_KEYS.items():
        if required and key not in src:
            rep.err("source", "missing", key, "required field is missing")
    for key in src:
        if key not in TOP_KEYS:
            rep.err("source", "unknown-field", key,
                    "unknown top-level field (put free text in 'notes', chart values in 'data')")
    if src.get("format") != FORMAT:
        rep.err("source", "format", "format", f"must be {FORMAT!r}")
    if src.get("schema_version") != SCHEMA_VERSION:
        rep.err("source", "version", "schema_version",
                f"is {src.get('schema_version')!r}; this skill reads version {SCHEMA_VERSION}")
    if not (isinstance(src.get("id"), str) and SLUG_RE.fullmatch(src["id"])):
        rep.err("source", "id", "id", "must be a lowercase slug, [a-z0-9-], max 64")
    if src.get("type") not in TYPES:
        rep.err("source", "type", "type", f"{src.get('type')!r} is not one of the visual types: {', '.join(TYPES)}")

    meta = src.get("meta") if isinstance(src.get("meta"), dict) else {}
    title, desc = meta.get("title"), meta.get("desc")
    if not (isinstance(title, str) and 0 < len(title) <= 60):
        rep.err("source", "meta", "meta.title", "required, 60 characters or fewer (accessible SVG contract)")
    if not (isinstance(desc, str) and desc.strip()):
        rep.err("source", "meta", "meta.desc", "required: one sentence about the content")

    brand = src.get("brand") if isinstance(src.get("brand"), dict) else {}
    slug, modes = brand.get("slug"), brand.get("modes")
    if not isinstance(slug, str):
        rep.err("source", "brand", "brand.slug", "required")
    if not (isinstance(modes, list) and modes and set(modes) <= MODES):
        rep.err("source", "brand", "brand.modes", "required: a non-empty list of 'light' / 'dark'")
    elif check_brand and isinstance(slug, str):
        problem = _brand_problem(slug, modes)
        if problem:
            rep.err("source", "brand", f"brand {slug}", problem,
                    "resolve the brand per SKILL.md §0; a stub brand cannot render")

    canvas = src.get("canvas") if isinstance(src.get("canvas"), dict) else {}
    cw, ch = canvas.get("width"), canvas.get("height")
    if not (isinstance(cw, int) and isinstance(ch, int) and cw > 0 and ch > 0):
        rep.err("source", "canvas", "canvas", "width and height are required positive integers")
        cw, ch = 10**6, 10**6
    elif cw % 4 or ch % 4:
        rep.warn("source", "off-grid", "canvas", f"{cw}x{ch} is not a multiple of 4")
    rw = canvas.get("render_width", cw)
    if not (isinstance(rw, int) and rw > 0):
        rep.err("source", "canvas", "canvas.render_width", "must be a positive integer")

    ids: dict[str, str] = {}

    def claim(kind: str, item_id: object) -> bool:
        if not (isinstance(item_id, str) and ID_RE.fullmatch(item_id)):
            rep.err("source", "id", f"{kind} {item_id!r}", "ids must match [A-Za-z][A-Za-z0-9_-]*")
            return False
        if item_id in ids:
            rep.err("source", "duplicate-id", item_id, f"used by a {ids[item_id]} and a {kind}")
            return False
        ids[item_id] = kind
        return True

    nodes = src.get("nodes") if isinstance(src.get("nodes"), list) else []
    if not isinstance(src.get("nodes"), list):
        rep.err("source", "shape", "nodes", "must be a list")
    for n in nodes:
        if not isinstance(n, dict):
            rep.err("source", "shape", "nodes[]", "each node must be an object")
            continue
        claim("node", n.get("id"))
        for k in n:
            if k not in NODE_KEYS:
                rep.err("source", "unknown-field", f"node {n.get('id')}", f"unknown field {k!r}")
        if not (isinstance(n.get("label"), str) and n["label"].strip()):
            rep.err("source", "label", f"node {n.get('id')}", "label is required")
        if n.get("kind", "box") not in KINDS:
            rep.err("source", "kind", f"node {n.get('id')}", f"kind must be one of {sorted(KINDS)}")
        if "role" in n and n["role"] not in ROLES:
            rep.err("source", "role", f"node {n.get('id')}", f"role must be one of {sorted(ROLES)}")
        _check_box(rep, "node", n, (cw, ch))

    groups = src.get("groups", []) if isinstance(src.get("groups", []), list) else []
    for g in groups:
        if not isinstance(g, dict):
            continue
        claim("group", g.get("id"))
        for k in g:
            if k not in GROUP_KEYS:
                rep.err("source", "unknown-field", f"group {g.get('id')}", f"unknown field {k!r}")
        _check_box(rep, "group", g, (cw, ch))

    node_ids = {n["id"] for n in nodes if isinstance(n, dict) and isinstance(n.get("id"), str)}
    group_ids = {g["id"] for g in groups if isinstance(g, dict) and isinstance(g.get("id"), str)}
    for g in groups:
        if isinstance(g, dict):
            for member in g.get("contains", []):
                if member not in node_ids | group_ids:
                    rep.err("source", "dangling", f"group {g.get('id')}", f"contains unknown id {member!r}")

    edges = src.get("edges", []) if isinstance(src.get("edges", []), list) else []
    for e in edges:
        if not isinstance(e, dict):
            continue
        eid = e.get("id")
        claim("edge", eid)
        for k in e:
            if k not in EDGE_KEYS:
                rep.err("source", "unknown-field", f"edge {eid}", f"unknown field {k!r}")
        for end in ("from", "to"):
            if e.get(end) not in node_ids | group_ids:
                rep.err("source", "dangling", f"edge {eid}", f"{end} {e.get(end)!r} is not a node or group id")
        if e.get("style", "default") not in EDGE_STYLES:
            rep.err("source", "style", f"edge {eid}", f"style must be one of {sorted(EDGE_STYLES)}")
        label = e.get("label")
        if isinstance(label, str) and len(label) > 14:
            rep.warn("source", "label", f"edge {eid}", f"arrow label {label!r} is over 14 characters (§6 rule 2)")
        pts = e.get("points")
        if not (isinstance(pts, list) and len(pts) >= 2
                and all(isinstance(p, list) and len(p) == 2 and all(_num(c) for c in p) for p in pts)):
            rep.err("source", "points", f"edge {eid}",
                    "points is required: the drawn route as [[x,y], ...], first and last point included",
                    "run `python3 scripts/layout.py route <slug>.json --write`, or write them by hand")

    alt = src.get("alt") if isinstance(src.get("alt"), dict) else None
    if alt is None or not all(isinstance(alt.get(k), str) and alt[k].strip() for k in ("summary", "reading_order")) \
            or not (isinstance(alt.get("items"), list) and alt["items"]):
        rep.err("source", "alt", "alt", "summary, reading_order and a non-empty items list are required (A4)")

    steps: dict[int, list[str]] = {}
    for kind_name, coll in (("node", nodes), ("edge", edges)):
        for item in coll:
            if not isinstance(item, dict) or "step" not in item:
                continue
            st = item["step"]
            if not (isinstance(st, int) and not isinstance(st, bool) and 1 <= st <= MAX_STEPS):
                rep.err("source", "step", f"{kind_name} {item.get('id')}",
                        f"step must be an integer 1–{MAX_STEPS} (animation.md)")
                continue
            if kind_name == "node":
                steps.setdefault(st, []).append(str(item.get("id")))
    if steps:
        missing = [k for k in range(1, max(steps) + 1) if k not in steps]
        if missing:
            rep.warn("source", "step-gap", "steps", f"no node enters at step(s) {missing}; steps should be contiguous")
        for st, ids in sorted(steps.items()):
            if len(ids) > 2:
                rep.warn("source", "step-crowded", f"step {st}",
                         f"{len(ids)} nodes enter at once ({', '.join(ids)}); animation.md allows two")
    _geometry(rep, nodes, edges)
    _layout(rep, nodes, edges)
    return rep


def _brand_problem(slug: str, modes: list[str]) -> str:
    """Load the brand through brand-tokens.py so the refusal path is the same one."""
    import importlib.util
    path = Path(__file__).resolve().parent / "brand-tokens.py"
    spec = importlib.util.spec_from_file_location("brand_tokens", path)
    bt = importlib.util.module_from_spec(spec)
    sys.path.insert(0, str(path.parent))
    spec.loader.exec_module(bt)
    try:
        brand = bt.load(bt.resolve_slug(slug))
    except bt.BrandError as exc:
        return str(exc).splitlines()[0]
    problems = [p for mode in modes for p in bt.validate(brand, mode)]
    return problems[0].splitlines()[0] if problems else ""


def _segments(points: list) -> list[tuple[tuple[float, float], tuple[float, float]]]:
    pts = [(float(p[0]), float(p[1])) for p in points]
    return [(a, b) for a, b in zip(pts, pts[1:]) if a != b]


def _seg_hits_rect(a, b, r) -> bool:
    """Axis-aligned segment a-b entering rect r (inset), for orthogonal routes."""
    x, y, w, h = r
    x0, y0, x1, y1 = x + NODE_INSET, y + NODE_INSET, x + w - NODE_INSET, y + h - NODE_INSET
    if a[1] == b[1]:  # horizontal
        lo, hi = sorted((a[0], b[0]))
        return y0 < a[1] < y1 and lo < x1 and hi > x0
    if a[0] == b[0]:  # vertical
        lo, hi = sorted((a[1], b[1]))
        return x0 < a[0] < x1 and lo < y1 and hi > y0
    return False


def _geometry(rep: Report, nodes: list, edges: list) -> None:
    boxes = {n["id"]: _rect(n) for n in nodes if isinstance(n, dict) and _rect(n) and isinstance(n.get("id"), str)}
    # Node overlap: two boxes sharing area means one hides the other.
    items = list(boxes.items())
    for i, (ia, ra) in enumerate(items):
        for ib, rb in items[i + 1:]:
            ox = min(ra[0] + ra[2], rb[0] + rb[2]) - max(ra[0], rb[0])
            oy = min(ra[1] + ra[3], rb[1] + rb[3]) - max(ra[1], rb[1])
            if ox > 0 and oy > 0:
                rep.err("source", "node-overlap", f"{ia} / {ib}", f"boxes overlap by {ox:g}x{oy:g}px",
                        "move one of them; nodes never share area")

    segs: dict[str, list] = {}
    for e in edges:
        if not isinstance(e, dict) or not isinstance(e.get("points"), list):
            continue
        try:
            s = _segments(e["points"])
        except (TypeError, ValueError, IndexError):
            continue
        eid = str(e.get("id"))
        segs[eid] = s
        for a, b in s:
            if a[0] != b[0] and a[1] != b[1]:
                rep.err("source", "diagonal", f"edge {eid}",
                        f"segment {a}→{b} is diagonal (§6 rule 1)",
                        "replace it with an orthogonal elbow: add a corner point")
                break
        ends = {e.get("from"), e.get("to")}
        for nid, r in boxes.items():
            if nid in ends:
                continue
            if any(_seg_hits_rect(a, b, r) for a, b in s):
                rep.err("source", "edge-through-node", f"edge {eid}",
                        f"passes through node {nid} at {r[0]:g},{r[1]:g} {r[2]:g}x{r[3]:g} (§6 rule 5)",
                        f"reroute around {nid}: add corner points that clear its box by 12px or more")
                break

    keys = list(segs)
    for i, ea in enumerate(keys):
        for eb in keys[i + 1:]:
            crossed = stacked = False
            for a1, a2 in segs[ea]:
                for b1, b2 in segs[eb]:
                    if _proper_cross(a1, a2, b1, b2):
                        crossed = True
                    if _collinear_overlap(a1, a2, b1, b2) >= COLLINEAR_MIN:
                        stacked = True
            if stacked:
                rep.err("source", "stacked-edges", f"{ea} / {eb}",
                        f"run on top of each other for {COLLINEAR_MIN:g}px or more (§6 rule 3)",
                        "offset one route by 12px or more")
            elif crossed:
                rep.warn("source", "crossing", f"{ea} / {eb}",
                         "the routes cross (C4)", "reroute, or draw a bridge/hop where unavoidable")


# --------------------------------------------------------------------------- #
# layout rules (adapted from Archify's authoring contract; layout-budget.md)
# --------------------------------------------------------------------------- #

# Advance per character, in em. Measured averages, deliberately on the wide side:
# an estimate that under-counts lets a label spill, one that over-counts only
# costs a few px of padding. The browser gate measures the real thing later.
ADVANCE = {"sans": 0.60, "sans-600": 0.64, "mono": 0.62}
NODE_PAD = 8           # px of clear space each side of node text (layout-budget.md minimum)
LABEL_PAD = 4          # px each side of an arrow label inside its mask
LABEL_H = 16           # mask height for 12px label text
LABEL_GAP = (6, 16)    # visible gap between a label mask and its own stroke (§6 rule 2)
ATTACH_MIN, ATTACH_OK = 8, 12   # px between attach points on one box side (§6 rule 4)
SEGMENT_MIN = 16       # px: a rounded corner (R=8) and an arrowhead each need 8
DETOUR_FACTOR, DETOUR_SLACK = 2.5, 200
MAX_BENDS = 3

# (field, font size px, face, tracking em) for a box node's three text lines,
# matching primitives-core.md § Node box.
NODE_TEXT = (("label", 16, "sans-600", 0.0), ("sublabel", 12, "mono", 0.0), ("tag", 12, "mono", 0.08))


def _wide(ch: str) -> bool:
    import unicodedata
    return unicodedata.east_asian_width(ch) in ("W", "F")


def text_width(text: str, size: float, face: str = "sans", tracking: float = 0.0) -> float:
    """Estimated rendered width in px. Per character, never per script:
    a wide/full-width character costs 1em, anything else its face's advance,
    nonspacing marks nothing (style-guide.md § Non-Latin labels)."""
    import unicodedata
    em = 0.0
    for ch in text:
        if unicodedata.combining(ch):
            continue
        em += 1.0 if _wide(ch) else ADVANCE[face]
        em += tracking
    return em * size


def _ceil4(v: float) -> int:
    return int(-(-v // 4) * 4)


def label_mask_width(label: str) -> int:
    """Width of an arrow label's mask: 12px mono, 0.06em tracking, padded, on the
    4px grid. The drawing and the checker both use this, so they cannot disagree."""
    return _ceil4(text_width(label, 12, "mono", 0.06) + 2 * LABEL_PAD)


def _side(point, r, tol: float = 10.0) -> str | None:
    """Which side of box r an endpoint attaches to (arrowheads stop up to 8px short)."""
    x, y, w, h = r
    px, py = point
    if y - 1 <= py <= y + h + 1:
        if abs(px - x) <= tol:
            return "left"
        if abs(px - (x + w)) <= tol:
            return "right"
    if x - 1 <= px <= x + w + 1:
        if abs(py - y) <= tol:
            return "top"
        if abs(py - (y + h)) <= tol:
            return "bottom"
    return None


def _rect_gap(rect, a, b) -> float:
    """Shortest distance from an axis-aligned rect to segment a-b (0 if they touch)."""
    x0, y0, x1, y1 = rect
    if a[1] == b[1]:
        lo, hi = sorted((a[0], b[0]))
        dx = max(x0 - hi, lo - x1, 0.0)
        dy = max(y0 - a[1], a[1] - y1, 0.0)
    else:
        lo, hi = sorted((a[1], b[1]))
        dx = max(x0 - a[0], a[0] - x1, 0.0)
        dy = max(y0 - hi, lo - y1, 0.0)
    return (dx * dx + dy * dy) ** 0.5


def _layout(rep: Report, nodes: list, edges: list) -> None:
    boxes = {n["id"]: n for n in nodes if isinstance(n, dict) and _rect(n) and isinstance(n.get("id"), str)}

    # 1. text fit -- box nodes only; a marker's labels sit beside it by design
    for nid, n in boxes.items():
        if n.get("kind", "box") == "marker":
            continue
        if n.get("kind") == "decision":
            # A diamond holds one centred line: its width at the label's half-height
            # band is about 70% of the box. Tag and sublabel have nowhere to go.
            for extra in ("sublabel", "tag"):
                if n.get(extra):
                    rep.err("source", "decision-text", f"node {nid}",
                            f"a decision diamond carries its label only; drop the {extra}",
                            "put the detail on the outgoing edges' labels instead")
            need = text_width(str(n.get("label", "")), 16, "sans-600")
            room = n["w"] * 0.7 - 2 * NODE_PAD
            if need > room:
                rep.err("source", "text-fit", f"node {nid}",
                        f"label {n.get('label')!r} needs ~{need:.0f}px; a {n['w']:g}px diamond leaves {room:.0f}px",
                        f"shorten it, or widen the diamond to w={_ceil4((need + 2 * NODE_PAD) / 0.7)}")
            continue
        room = n["w"] - 2 * NODE_PAD
        for field_name, size, face, tracking in NODE_TEXT:
            text = n.get(field_name)
            if not isinstance(text, str) or not text:
                continue
            need = text_width(text, size, face, tracking)
            if need > room:
                rep.err("source", "text-fit", f"node {nid}",
                        f"{field_name} {text!r} needs ~{need:.0f}px at {size}px; the box leaves {room:g}px",
                        f"shorten it, or widen the box to w={_ceil4(need + 2 * NODE_PAD)} "
                        f"(never shrink the type below 12px)")

    for e in edges:
        if not isinstance(e, dict) or not isinstance(e.get("points"), list):
            continue
        eid = str(e.get("id"))
        try:
            segs = _segments(e["points"])
            pts = [(float(p[0]), float(p[1])) for p in e["points"]]
        except (TypeError, ValueError, IndexError):
            continue
        if not segs:
            continue

        # 2. route floors
        for a, b in segs:
            length = abs(a[0] - b[0]) + abs(a[1] - b[1])
            if length < SEGMENT_MIN:
                rep.err("source", "short-segment", f"edge {eid}",
                        f"segment {a}→{b} is {length:g}px; every segment needs {SEGMENT_MIN}px "
                        f"(an 8px corner radius and an 8px arrowhead)",
                        "move a node to lengthen it, or drop the corner")
        route_len = sum(abs(a[0] - b[0]) + abs(a[1] - b[1]) for a, b in segs)
        direct = abs(pts[0][0] - pts[-1][0]) + abs(pts[0][1] - pts[-1][1])
        if route_len > DETOUR_FACTOR * direct + DETOUR_SLACK:
            rep.warn("source", "detour", f"edge {eid}",
                     f"route is {route_len:.0f}px for a {direct:.0f}px separation",
                     "move its endpoints closer, or reroute more directly")
        if len(segs) - 1 > MAX_BENDS:
            rep.warn("source", "bends", f"edge {eid}", f"{len(segs) - 1} bends (more than {MAX_BENDS})",
                     "one crossing costs about as much as three bends; a simpler route usually reads better")

        # 3. label placement, measured from the label's own text
        label, at = e.get("label"), e.get("label_at")
        if isinstance(label, str) and label and isinstance(at, list) and len(at) == 2 and all(_num(c) for c in at):
            mw = label_mask_width(label)
            mask = (at[0] - mw / 2, at[1] - LABEL_H / 2, at[0] + mw / 2, at[1] + LABEL_H / 2)
            for nid, n in boxes.items():
                x, y, w, h = _rect(n)
                if mask[0] < x + w and mask[2] > x and mask[1] < y + h and mask[3] > y:
                    rep.err("source", "label-on-node", f"edge {eid}",
                            f"label {label!r} (mask ~{mw}x{LABEL_H} at {at[0]:g},{at[1]:g}) sits on node {nid} (§6 rule 6)",
                            "move label_at onto a stretch of the route that runs through open canvas")
                    break
            gap = min(_rect_gap(mask, a, b) for a, b in segs)
            if gap < 2:
                rep.err("source", "label-on-line", f"edge {eid}",
                        f"label {label!r} mask touches its own line (§6 rule 2)",
                        f"move label_at {LABEL_GAP[0]}–{LABEL_GAP[1]}px clear of the stroke")
            elif not (LABEL_GAP[0] <= gap <= LABEL_GAP[1]):
                rep.warn("source", "label-gap", f"edge {eid}",
                         f"label {label!r} is {gap:.0f}px from its line; keep {LABEL_GAP[0]}–{LABEL_GAP[1]}px")

    # 4. attach points: spacing, and order matching where each line goes
    sides: dict[tuple[str, str], list[tuple[float, float, str]]] = {}
    for e in edges:
        if not isinstance(e, dict) or not isinstance(e.get("points"), list) or len(e["points"]) < 2:
            continue
        try:
            pts = [(float(p[0]), float(p[1])) for p in e["points"]]
        except (TypeError, ValueError, IndexError):
            continue
        for end, point, far in (("from", pts[0], pts[-1]), ("to", pts[-1], pts[0])):
            nid = e.get(end)
            if nid not in boxes:
                continue
            side = _side(point, _rect(boxes[nid]))
            if side is None:
                continue
            horizontal_side = side in ("top", "bottom")
            pos = point[0] if horizontal_side else point[1]
            far_pos = far[0] if horizontal_side else far[1]
            sides.setdefault((nid, side), []).append((pos, far_pos, str(e.get("id"))))
    for (nid, side), entries in sides.items():
        if len(entries) < 2:
            continue
        entries.sort()
        for (p1, _f1, e1), (p2, _f2, e2) in zip(entries, entries[1:]):
            d = p2 - p1
            if d < ATTACH_MIN:
                rep.err("source", "attach-collision", f"node {nid} {side}",
                        f"edges {e1} and {e2} attach {d:g}px apart (§6 rule 4)",
                        f"fan them out: N points on a side of length L sit at L·k/(N+1), {ATTACH_OK}px or more apart")
            elif d < ATTACH_OK:
                rep.warn("source", "attach-spacing", f"node {nid} {side}",
                         f"edges {e1} and {e2} attach {d:g}px apart; aim for {ATTACH_OK}px or more")
        fars = [f for _p, f, _e in entries]
        if fars != sorted(fars):
            rep.warn("source", "attach-order", f"node {nid} {side}",
                     "lines leave this side in a different order from where they go, so they cross near the node",
                     "order the attach points along the side by the far endpoint's position")


def _proper_cross(a1, a2, b1, b2) -> bool:
    """Orthogonal segments crossing in their interiors (touching ends don't count)."""
    ah, bh = a1[1] == a2[1], b1[1] == b2[1]
    if ah == bh:
        return False
    h1, h2, v1, v2 = (a1, a2, b1, b2) if ah else (b1, b2, a1, a2)
    xlo, xhi = sorted((h1[0], h2[0]))
    ylo, yhi = sorted((v1[1], v2[1]))
    return xlo < v1[0] < xhi and ylo < h1[1] < yhi


def _collinear_overlap(a1, a2, b1, b2) -> float:
    if a1[1] == a2[1] == b1[1] == b2[1]:
        lo = max(min(a1[0], a2[0]), min(b1[0], b2[0]))
        hi = min(max(a1[0], a2[0]), max(b1[0], b2[0]))
        return max(0.0, hi - lo)
    if a1[0] == a2[0] == b1[0] == b2[0]:
        lo = max(min(a1[1], a2[1]), min(b1[1], b2[1]))
        hi = min(max(a1[1], a2[1]), max(b1[1], b2[1]))
        return max(0.0, hi - lo)
    return 0.0


# --------------------------------------------------------------------------- #
# the HTML side
# --------------------------------------------------------------------------- #

class _Svg(HTMLParser):
    """Collect what match() compares: the root attributes, nodes, edges, texts."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.html_attrs: dict[str, str] = {}
        self.svg_attrs: dict[str, str] | None = None
        self.svg_count = 0
        self.title = self.desc = ""
        self.nodes: dict[str, dict] = {}
        self.edges: dict[str, str] = {}
        self.edge_steps: dict[str, str | None] = {}
        self.texts: list[str] = []
        self.source_json: list[str] | None = None
        self._depth = 0
        self._node_stack: list[tuple[str, int]] = []
        self._cap: str | None = None
        self._in_source = False

    def handle_starttag(self, tag, attrs):
        a = {k: (v or "") for k, v in attrs}
        if tag == "html":
            self.html_attrs = a
        if tag == "script" and a.get("id") == SOURCE_SCRIPT_ID:
            self._in_source = True
            self.source_json = []
        if tag == "svg" and self._depth == 0:
            self.svg_count += 1
            if self.svg_count == 1:
                self.svg_attrs = a
                self._depth = 1
            return
        if not self._depth:
            return
        self._depth += 1
        if "data-node" in a:
            nid = a["data-node"]
            self.nodes[nid] = {"rect": None, "texts": [], "step": a.get("data-step")}
            self._node_stack.append((nid, self._depth))
        if tag in ("rect", "polygon") and self._node_stack:
            node = self.nodes[self._node_stack[-1][0]]
            if node["rect"] is None:
                try:
                    if tag == "rect":
                        node["rect"] = tuple(float(a[k]) for k in ("x", "y", "width", "height"))
                    else:  # a decision diamond: compare its bounding box
                        nums = [float(v) for v in re.findall(r"-?\d+(?:\.\d+)?", a.get("points", ""))]
                        xs, ys = nums[0::2], nums[1::2]
                        node["rect"] = (min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys))
                except (KeyError, ValueError):
                    pass
        if "data-edge" in a:
            self.edges[a["data-edge"]] = a.get("d", "")
            self.edge_steps[a["data-edge"]] = a.get("data-step")
        if tag in ("title", "desc", "text"):
            self._cap = tag
            if tag == "text":
                self.texts.append("")
                if self._node_stack:
                    self.nodes[self._node_stack[-1][0]]["texts"].append(len(self.texts) - 1)

    def handle_endtag(self, tag):
        if tag == "script" and self._in_source:
            self._in_source = False
        if not self._depth:
            return
        if self._node_stack and self._node_stack[-1][1] == self._depth:
            self._node_stack.pop()
        if tag in ("title", "desc", "text"):
            self._cap = None
        self._depth -= 1

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if self._depth:
            self.handle_endtag(tag)

    def handle_data(self, data):
        if self._in_source and self.source_json is not None:
            self.source_json.append(data)
            return
        if self._cap == "title" and self._depth == 2:
            self.title += data
        elif self._cap == "desc" and self._depth == 2:
            self.desc += data
        elif self._cap == "text":
            self.texts[-1] += data


def parse_html(html: str) -> _Svg:
    p = _Svg()
    p.feed(html)
    p.close()
    return p


def embedded(html: str) -> object | None:
    p = parse_html(html)
    if p.source_json is None:
        return None
    return json.loads("".join(p.source_json))


def embed_block(source: dict) -> str:
    """The <script> block to paste before </body>. '<' is escaped so the JSON
    cannot close the element early; the parsed value is unchanged."""
    text = json.dumps(source, indent=2, ensure_ascii=False).replace("<", "\\u003c")
    return f'<script type="application/json" id="{SOURCE_SCRIPT_ID}">\n{text}\n</script>'


_CMD_RE = re.compile(r"([MmLlHhVvQqCcSsTtAaZz])|(-?\d*\.?\d+(?:e[-+]?\d+)?)")


def path_ends(d: str) -> tuple[tuple[float, float], tuple[float, float]] | None:
    """First and last point of an SVG path (absolute or relative M/L/H/V/Q/C/S/T/Z)."""
    tokens = _CMD_RE.findall(d)
    cmd, nums, out = None, [], []
    arity = {"M": 2, "L": 2, "T": 2, "H": 1, "V": 1, "Q": 4, "S": 4, "C": 6, "A": 7, "Z": 0}
    x = y = sx = sy = 0.0
    start = None

    def flush():
        nonlocal x, y, sx, sy, start, cmd
        if cmd is None:
            return
        u, rel = cmd.upper(), cmd.islower()
        n = arity[u]
        if u == "Z":
            x, y = sx, sy
            out.append((x, y))
            return
        i = 0
        while i + n <= len(nums) and n:
            v = nums[i:i + n]
            if u == "H":
                x = x + v[0] if rel else v[0]
            elif u == "V":
                y = y + v[0] if rel else v[0]
            else:
                px, py = v[-2], v[-1]
                x, y = (x + px, y + py) if rel else (px, py)
            if u == "M" and start is None:
                start, sx, sy = (x, y), x, y
            elif u == "M":
                sx, sy = x, y
            out.append((x, y))
            i += n
            if u == "M":
                cmd = "l" if rel else "L"
                u, n = "L", 2

    for c, num in tokens:
        if c:
            flush()
            cmd, nums = c, []
            if c in "Zz":
                flush()
                cmd = None
        else:
            nums.append(float(num))
    flush()
    if start is None or not out:
        return None
    return start, out[-1]


def match(src: dict, html: str) -> Report:
    """Does the drawing say what the record says? Ids, labels, positions, routes."""
    rep = Report()
    p = parse_html(html)
    if p.svg_attrs is None:
        rep.err("match", "no-svg", "html", "no <svg> found")
        return rep

    brand = src.get("brand", {})
    if p.html_attrs.get("data-cklph-brand") != brand.get("slug"):
        rep.err("match", "brand", "<html data-cklph-brand>",
                f"is {p.html_attrs.get('data-cklph-brand')!r}, source says {brand.get('slug')!r}",
                f'set <html data-cklph-brand="{brand.get("slug")}" data-cklph-mode="…">')
    mode = p.html_attrs.get("data-cklph-mode")
    if mode not in brand.get("modes", []):
        rep.err("match", "mode", "<html data-cklph-mode>",
                f"is {mode!r}, not one of the source's modes {brand.get('modes')}")

    canvas = src.get("canvas", {})
    want_vb = f"0 0 {canvas.get('width')} {canvas.get('height')}"
    got_vb = " ".join(p.svg_attrs.get("viewbox", "").replace(",", " ").split())
    if got_vb != want_vb:
        rep.err("match", "viewbox", "<svg viewBox>", f"is {got_vb!r}, source canvas is {want_vb!r}")
    rw = str(canvas.get("render_width", canvas.get("width")))
    if p.svg_attrs.get("data-render-width") != rw:
        rep.err("match", "render-width", "<svg data-render-width>",
                f"is {p.svg_attrs.get('data-render-width')!r}, source says {rw}")

    meta = src.get("meta", {})
    if p.title.strip() != str(meta.get("title", "")).strip():
        rep.err("match", "title", "<title>", f"{p.title.strip()!r} ≠ meta.title {meta.get('title')!r}")
    if " ".join(p.desc.split()) != " ".join(str(meta.get("desc", "")).split()):
        rep.err("match", "desc", "<desc>", "differs from meta.desc", "copy meta.desc into <desc> verbatim")

    texts = [" ".join(t.split()) for t in p.texts]
    for n in src.get("nodes", []):
        nid = n.get("id")
        drawn = p.nodes.get(nid)
        if drawn is None:
            rep.err("match", "missing-node", f"node {nid}", "is in the source but not drawn",
                    f'wrap it in <g data-node="{nid}">')
            continue
        own = [texts[i] for i in drawn["texts"]]
        for k in ("label", "sublabel", "tag"):
            if n.get(k) and " ".join(str(n[k]).split()) not in own:
                rep.err("match", "label", f"node {nid}", f"{k} {n[k]!r} is not among its drawn texts {own}",
                        "edit the source first, then redraw — never the SVG alone")
        want_step = str(n["step"]) if "step" in n else None
        if drawn.get("step") != want_step:
            rep.err("match", "step", f"node {nid}",
                    f"drawn data-step={drawn.get('step')!r}, source step={want_step!r}",
                    "put data-motion-item data-step on the node's <g> exactly as the source says")
        r = _rect(n)
        if r and drawn["rect"]:
            dx = max(abs(a - b) for a, b in zip(r, drawn["rect"]))
            if dx > POS_TOLERANCE:
                rep.err("match", "moved", f"node {nid}",
                        f"drawn at {drawn['rect']} but the source says {r}",
                        "redraw from the source, or update the source if the move was intended")
        elif r:
            rep.err("match", "no-rect", f"node {nid}", "its <g> has no <rect> to compare")
    src_nodes = {n.get("id") for n in src.get("nodes", [])}
    for extra in sorted(set(p.nodes) - src_nodes):
        rep.err("match", "extra-node", f"node {extra}", "is drawn but not in the source",
                "add it to the source, or remove it from the drawing")

    all_texts = set(texts)
    for e in src.get("edges", []):
        eid = e.get("id")
        if eid not in p.edges:
            rep.err("match", "missing-edge", f"edge {eid}", "is in the source but not drawn",
                    f'put data-edge="{eid}" on its <path>')
            continue
        want_step = str(e["step"]) if "step" in e else None
        if p.edge_steps.get(eid) != want_step:
            rep.err("match", "step", f"edge {eid}",
                    f"drawn data-step={p.edge_steps.get(eid)!r}, source step={want_step!r}")
        ends = path_ends(p.edges[eid])
        pts = e.get("points") or []
        if ends and len(pts) >= 2:
            for which, got, want in (("start", ends[0], pts[0]), ("end", ends[1], pts[-1])):
                if max(abs(got[0] - want[0]), abs(got[1] - want[1])) > ENDPOINT_TOLERANCE:
                    rep.err("match", "rerouted", f"edge {eid}",
                            f"drawn {which} {got} ≠ source {tuple(want)}")
        if e.get("label") and " ".join(e["label"].split()) not in all_texts:
            rep.err("match", "label", f"edge {eid}", f"label {e['label']!r} is not drawn")
    src_edges = {e.get("id") for e in src.get("edges", [])}
    for extra in sorted(set(p.edges) - src_edges):
        rep.err("match", "extra-edge", f"edge {extra}", "is drawn but not in the source")
    return rep


GEOMETRY_KEYS = {"x", "y", "w", "h", "points", "label_at"}


def diff(old: dict, new: dict) -> dict:
    """Added / removed / changed / moved, matched by id across nodes, edges, groups.

    Refuses (raises ValueError) when the two share no id at all: then it is a
    different diagram, not a new version of this one, and a diff would only
    report "everything removed, everything added".
    """
    out = {"added": [], "removed": [], "changed": [], "moved": []}
    shared_any = False
    for coll in ("nodes", "edges", "groups"):
        a = {i["id"]: i for i in old.get(coll, []) if isinstance(i, dict) and "id" in i}
        b = {i["id"]: i for i in new.get(coll, []) if isinstance(i, dict) and "id" in i}
        kind = coll[:-1]
        shared_any |= bool(a.keys() & b.keys())
        out["added"] += [f"{kind} {i}" for i in sorted(b.keys() - a.keys())]
        out["removed"] += [f"{kind} {i}" for i in sorted(a.keys() - b.keys())]
        for i in sorted(a.keys() & b.keys()):
            keys = (a[i].keys() | b[i].keys())
            meaning = sorted(k for k in keys - GEOMETRY_KEYS if a[i].get(k) != b[i].get(k))
            if meaning:
                out["changed"].append(f"{kind} {i}: " + ", ".join(
                    f"{k} {a[i].get(k)!r} → {b[i].get(k)!r}" for k in meaning))
            elif any(a[i].get(k) != b[i].get(k) for k in GEOMETRY_KEYS & keys):
                out["moved"].append(f"{kind} {i}")
    if not shared_any and (old.get("nodes") or new.get("nodes")):
        raise ValueError("the two sources share no node, edge or group id: this is a new diagram, "
                         "not a new version of the old one")
    return out


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    if argv[0] == "embed":
        src_path, html_path = Path(argv[1]), Path(argv[2])
        src = json.loads(src_path.read_text(encoding="utf-8"))
        page = html_path.read_text(encoding="utf-8")
        block = embed_block(src)
        pattern = re.compile(r'<script type="application/json" id="%s">.*?</script>' % SOURCE_SCRIPT_ID, re.S)
        if pattern.search(page):
            page = pattern.sub(lambda _m: block, page, count=1)
        elif "</body>" in page:
            i = page.rindex("</body>")
            page = page[:i] + block + "\n" + page[i:]
        else:
            print(f"{html_path}: no </body> to embed before")
            return 2
        html_path.write_text(page, encoding="utf-8")
        print(f"embedded {src_path.name} into {html_path.name}")
        return 0
    if argv[0] == "diff":
        old, new = (json.loads(Path(p).read_text(encoding="utf-8")) for p in argv[1:3])
        try:
            d = diff(old, new)
        except ValueError as exc:
            print(f"REFUSED — {exc}")
            return 2
        for k, items in d.items():
            for item in items:
                print(f"{k:8} {item}")
        print("no changes" if not any(d.values()) else
              ", ".join(f"{len(v)} {k}" for k, v in d.items() if v))
        return 0
    src = json.loads(Path(argv[0]).read_text(encoding="utf-8"))
    rep = validate(src)
    if len(argv) > 1:
        rep.findings += match(src, Path(argv[1]).read_text(encoding="utf-8")).findings
    for f in rep.findings:
        print(f.line())
    print(f"{len(rep.errors)} error(s), {len(rep.findings) - len(rep.errors)} warning(s)")
    return 1 if rep.errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
