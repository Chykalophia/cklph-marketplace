#!/usr/bin/env python3
"""Turn grid intent into coordinates, so a source isn't hand-computed pixel by pixel.

    python3 scripts/layout.py place <slug>.json [--write]   # nodes at grid cells, lanes as bands
    python3 scripts/layout.py route <slug>.json [--write]   # orthogonal points for edges that have none
    python3 scripts/layout.py all   <slug>.json [--write]   # place, then route

Without --write it prints what it would change. It only ever writes coordinates
into the source -- the source stays the single truth, and diagram_source.py still
judges the result. Anything you set by hand is kept: a node with no "at" keeps
its x/y, an edge that already has "points" keeps them (pass --reroute to replace).

Grid intent, in the source:

    "layout": { "origin": [128, 64], "cell": [140, 88], "gap": [56, 32] },
    node:   "at": [col, row]            (numbers; 0.5 steps allowed)
            "span": [cols, rows]        (optional, default [1, 1])
    group:  "lane": row                 (a full-width band around that row; swimlanes)

Routing is deliberately simple: a straight line, one elbow (L) or two (Z),
whichever clears every other node with the fewest bends. Lines sharing one side
of a box are fanned out along it and ordered by where each one goes. When no
simple route is clear, the edge is left without points and reported -- route it
by hand, then let the validator check it.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import diagram_source as ds  # noqa: E402

GRID = 4
ARROW = 8          # an arrowhead's length: routes stop this far short of the target box
GUTTER = 16        # attach points keep this far from a box corner
LANE_INSET = 32    # lanes run from x=32 to canvas width - 32
LABEL_OFFSET = 16  # label_at sits this far from its segment (8px gap below a 16px mask)


def snap(v: float) -> int:
    return int(round(v / GRID) * GRID)


# --------------------------------------------------------------------------- #
# place
# --------------------------------------------------------------------------- #

def place(src: dict) -> list[str]:
    lay = src.get("layout")
    if not isinstance(lay, dict):
        return ["no \"layout\" block: nothing to place"]
    (ox, oy), (cw, ch), (gx, gy) = lay["origin"], lay["cell"], lay["gap"]
    notes = []
    for n in src.get("nodes", []):
        if "at" not in n:
            continue
        col, row = n["at"]
        cols, rows = n.get("span", [1, 1])
        new = {"x": snap(ox + col * (cw + gx)), "y": snap(oy + row * (ch + gy)),
               "w": snap(cw * cols + gx * (cols - 1)), "h": snap(ch * rows + gy * (rows - 1))}
        if any(n.get(k) != v for k, v in new.items()):
            notes.append(f"node {n['id']}: {tuple(n.get(k) for k in 'xywh')} → {tuple(new.values())}")
            n.update(new)
    width = src["canvas"]["width"]
    for g in src.get("groups", []):
        if "lane" not in g:
            continue
        row = g["lane"]
        new = {"x": LANE_INSET, "y": snap(oy + row * (ch + gy) - gy / 2),
               "w": width - 2 * LANE_INSET, "h": snap(ch + gy)}
        if any(g.get(k) != v for k, v in new.items()):
            notes.append(f"lane {g['id']}: → {tuple(new.values())}")
            g.update(new)
    return notes


# --------------------------------------------------------------------------- #
# route
# --------------------------------------------------------------------------- #

SIDES = {"right": (1, 0), "left": (-1, 0), "bottom": (0, 1), "top": (0, -1)}


def box(n: dict) -> tuple[float, float, float, float]:
    return float(n["x"]), float(n["y"]), float(n["w"]), float(n["h"])


def side_point(b, side: str, offset: float | None = None) -> tuple[float, float]:
    """A point on ``side`` of box b, ``offset`` along it (default: the middle)."""
    x, y, w, h = b
    if side in ("left", "right"):
        py = y + (h / 2 if offset is None else offset)
        return (x + w if side == "right" else x), py
    px = x + (w / 2 if offset is None else offset)
    return px, (y + h if side == "bottom" else y)


def candidate_sides(a, b) -> list[tuple[str, str]]:
    """(exit side of a, entry side of b) pairs worth trying, best first."""
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    right, left = bx >= ax + aw, bx + bw <= ax
    below, above = by >= ay + ah, by + bh <= ay
    out = []
    if right and not (below or above):
        out.append(("right", "left"))
    if left and not (below or above):
        out.append(("left", "right"))
    if below and not (right or left):
        out.append(("bottom", "top"))
    if above and not (right or left):
        out.append(("top", "bottom"))
    h_exit = "right" if right else "left" if left else None
    v_exit = "bottom" if below else "top" if above else None
    if h_exit and v_exit:
        flip = {"bottom": "top", "top": "bottom", "right": "left", "left": "right"}
        out += [(h_exit, flip[v_exit]), (v_exit, flip[h_exit]), (h_exit, flip[h_exit]), (v_exit, flip[v_exit])]
    return out or [("right", "left"), ("bottom", "top")]


def build(start, s_side: str, end_on_box, e_side: str) -> list[tuple[float, float]]:
    """Orthogonal polyline from ``start`` (leaving s_side) to just short of ``end_on_box``."""
    dx, dy = SIDES[e_side]
    # travel into the target is opposite to its side's outward normal
    end = (end_on_box[0] + dx * ARROW, end_on_box[1] + dy * ARROW)
    s_h, e_h = s_side in ("left", "right"), e_side in ("left", "right")
    sx, sy = start
    ex, ey = end
    if s_h and e_h:
        if sy == ey:
            return [start, end]
        xm = snap((sx + ex) / 2)
        return [start, (xm, sy), (xm, ey), end]
    if not s_h and not e_h:
        if sx == ex:
            return [start, end]
        ym = snap((sy + ey) / 2)
        return [start, (sx, ym), (ex, ym), end]
    if s_h and not e_h:
        return [start, (ex, sy), end]
    return [start, (sx, ey), end]


def clear(points, boxes: dict, ends: set) -> bool:
    segs = ds._segments([list(p) for p in points])
    if any(a[0] != b[0] and a[1] != b[1] for a, b in segs):
        return False
    if any(abs(a[0] - b[0]) + abs(a[1] - b[1]) < ds.SEGMENT_MIN for a, b in segs):
        return False
    return not any(ds._seg_hits_rect(a, b, r) for nid, r in boxes.items() if nid not in ends for a, b in segs)


def label_at(points, label: str) -> list[int]:
    segs = ds._segments([list(p) for p in points])
    # The last segment stops ARROW short of its box; centre a label on the visible
    # gap, which runs right up to the box edge.
    (la, lb) = segs[-1]
    ext = (lb[0] + ARROW * ((lb[0] > la[0]) - (lb[0] < la[0])), lb[1] + ARROW * ((lb[1] > la[1]) - (lb[1] < la[1])))
    segs = segs[:-1] + [(la, ext)]
    a, b = max(segs, key=lambda s: abs(s[0][0] - s[1][0]) + abs(s[0][1] - s[1][1]))
    if a[1] == b[1]:  # horizontal: above the line
        return [round((a[0] + b[0]) / 2), round(a[1] - LABEL_OFFSET)]
    mw = ds.label_mask_width(label)
    return [round(a[0] + mw / 2 + 8), round((a[1] + b[1]) / 2)]


def route(src: dict, reroute: bool = False) -> list[str]:
    nodes = {n["id"]: n for n in src.get("nodes", []) if all(k in n for k in "xywh")}
    boxes = {nid: box(n) for nid, n in nodes.items()}
    todo = [e for e in src.get("edges", []) if reroute or not e.get("points")]
    notes = []

    # pass 1: choose sides per edge, by the first candidate whose centred route is clear
    chosen = {}
    for e in todo:
        a, b = boxes.get(e["from"]), boxes.get(e["to"])
        if a is None or b is None:
            notes.append(f"edge {e['id']}: from/to is not a placed node; route it by hand")
            continue
        for s_side, e_side in candidate_sides(a, b):
            pts = build(side_point(a, s_side), s_side, side_point(b, e_side), e_side)
            if clear(pts, boxes, {e["from"], e["to"]}):
                chosen[e["id"]] = (s_side, e_side)
                break
        else:
            notes.append(f"edge {e['id']}: no clear straight/L/Z route; route it by hand")

    # pass 2: fan endpoints that share a side, ordered by where each line goes
    users: dict[tuple[str, str], list[tuple[float, str, str]]] = {}
    for e in todo:
        if e["id"] not in chosen:
            continue
        s_side, e_side = chosen[e["id"]]
        for node_id, side, far_id in ((e["from"], s_side, e["to"]), (e["to"], e_side, e["from"])):
            fx, fy, fw, fh = boxes[far_id]
            far = fy + fh / 2 if side in ("left", "right") else fx + fw / 2
            users.setdefault((node_id, side), []).append((far, e["id"], "from" if node_id == e["from"] else "to"))
    offsets: dict[tuple[str, str], float] = {}
    for (node_id, side), lst in users.items():
        x, y, w, h = boxes[node_id]
        length = h if side in ("left", "right") else w
        lst.sort()
        n = len(lst)
        for k, (_far, eid, which) in enumerate(lst, start=1):
            off = length / 2 if n == 1 else GUTTER + (length - 2 * GUTTER) * (k - 1) / (n - 1)
            # endpoints follow the box (a 140px box centres on 70), not the 4px grid;
            # only computed corners (the Z midpoints) snap to it
            offsets[(eid, which)] = round(off)

    for e in todo:
        if e["id"] not in chosen:
            continue
        s_side, e_side = chosen[e["id"]]
        a, b = boxes[e["from"]], boxes[e["to"]]
        start = side_point(a, s_side, offsets[(e["id"], "from")])
        target = side_point(b, e_side, offsets[(e["id"], "to")])
        pts = build(start, s_side, target, e_side)
        if not clear(pts, boxes, {e["from"], e["to"]}):  # fanning moved it into something
            pts = build(side_point(a, s_side), s_side, side_point(b, e_side), e_side)
        e["points"] = [[round(px), round(py)] for px, py in pts]
        if e.get("label") and (reroute or not e.get("label_at")):
            e["label_at"] = label_at(e["points"], e["label"])
        notes.append(f"edge {e['id']}: {s_side} → {e_side}, {len(pts) - 2} bend(s)")
    return notes


def main(argv: list[str]) -> int:
    args = [a for a in argv if not a.startswith("--")]
    if len(args) != 2 or args[0] not in ("place", "route", "all"):
        print(__doc__)
        return 2
    path = Path(args[1])
    src = json.loads(path.read_text(encoding="utf-8"))
    notes = []
    if args[0] in ("place", "all"):
        notes += place(src)
    if args[0] in ("route", "all"):
        notes += route(src, reroute="--reroute" in argv)
    for n in notes:
        print(n)
    if "--write" in argv:
        path.write_text(json.dumps(src, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        rep = ds.validate(src)
        print(f"wrote {path.name}; source check: {len(rep.errors)} error(s), "
              f"{len(rep.findings) - len(rep.errors)} warning(s)")
        for f in rep.findings:
            print(f.line())
        return 1 if rep.errors else 0
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
