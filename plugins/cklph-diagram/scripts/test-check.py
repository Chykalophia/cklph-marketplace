#!/usr/bin/env python3
"""Prove check.py has teeth: plant one defect per case, assert where it is caught.

Each case starts from a passing proof diagram built source-first by
build-examples.py, plants exactly one defect -- in the source and redrawn, or in
the HTML alone -- and asserts that check.py fails at the expected gate with the
expected code. A baseline case asserts the unmutated fixture passes, so a
checker that fails everything cannot look like a good one.

    python3 scripts/test-check.py            # all cases (needs Chrome)
    python3 scripts/test-check.py --static   # skip the browser cases
"""

from __future__ import annotations

import copy
import importlib.util
import json
import re
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "skills/cklph-diagram/scripts"))
import check  # noqa: E402
import diagram_source  # noqa: E402

_spec = importlib.util.spec_from_file_location("build_examples", ROOT / "scripts/build-examples.py")
bx = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bx)
bt = bx.brand_tokens
BRAND = "_default"  # committed, so CI has it
brand = bt.load(BRAND)
CSS = bt.to_css(brand, "light")


def build(src: dict) -> tuple[str, str]:
    """(sidecar json, html) drawn from ``src`` exactly as the harness does."""
    return json.dumps(src, indent=2), bx.shell(src, brand["label"], CSS, bx.draw(src), brand["font_link"])


def fixture() -> dict:
    return bx.SOURCES["architecture"](BRAND, "light")


def node(src, nid):
    return next(n for n in src["nodes"] if n["id"] == nid)


def edge(src, eid):
    return next(e for e in src["edges"] if e["id"] == eid)


# --- source mutations: change the record, redraw consistently -------------- #

def through_node(src):
    # intake → crm straight along the row passes through queue and worker
    src["edges"].append({"id": "intake-crm", "from": "intake", "to": "crm",
                         "points": [[100, 112 + 60], [608, 112 + 60]]})


def diagonal(src):
    edge(src, "worker-notify")["points"] = [[452, 200], [460, 288]]


def stacked(src):
    src["edges"].append({"id": "worker-notify-2", "from": "worker", "to": "notify",
                         "points": [[484, 200], [484, 288]]})


def stub_brand(src):
    src["brand"]["slug"] = "_example-stub"


def unknown_field(src):
    src["colour"] = "#ff0000"


def overlap_nodes(src):
    node(src, "notify")["y"] = 160


def spill(src):
    node(src, "queue")["sublabel"] = "durable, seven day retention window"


def label_on_node(src):
    edge(src, "intake-queue")["label_at"] = [100, 156]


def no_alt(src):
    src["alt"]["items"] = []


# --- HTML-only mutations: the drawing drifts from the record --------------- #

def relabel_svg(html):
    return html.replace(">Worker</text>", ">Processor</text>", 1)


def move_svg(html):
    return html.replace('<rect x="416" y="112"', '<rect x="420" y="112"', 2)


def drop_node_svg(html):
    return re.sub(r'  <g data-node="crm">.*?</g>\n', "", html, count=1, flags=re.S)


def extra_node_svg(html):
    return html.replace("</svg>", '  <g data-node="ghost"><rect x="600" y="300" width="80" height="40"/></g>\n</svg>', 1)


def unembed(html):
    return re.sub(r'<script type="application/json" id="cklph-diagram-source">.*?</script>\n', "", html, flags=re.S)


def stale_embed(html):
    return html.replace('"label": "Worker"', '"label": "Worker (old)"', 1)


def wrong_mode(html):
    return html.replace('data-cklph-mode="light"', 'data-cklph-mode="dark"', 1)


def shrink_on_phone(html):
    # the pre-fix behaviour: the svg scales down to a 375px screen
    return re.sub(r' style="min-width: \d+px"', "", html, count=1)


def page_overflow(html):
    return html.replace('<div class="diagram-container">', "<div>", 1).replace(
        "svg { width: 100%; height: auto; display: block; }",
        "svg { width: 784px; min-width: 784px; height: auto; display: block; }", 1)


CASES = [
    # name, source mutation, html mutation, expected gate, expected code, needs browser
    ("baseline passes", None, None, None, None, True),
    ("edge through a node", through_node, None, "source", "edge-through-node", False),
    ("diagonal segment", diagonal, None, "source", "diagonal", False),
    ("stacked edges", stacked, None, "source", "stacked-edges", False),
    ("stub brand", stub_brand, None, "source", "brand", False),
    ("unknown field", unknown_field, None, "source", "unknown-field", False),
    ("overlapping nodes", overlap_nodes, None, "source", "node-overlap", False),
    ("empty prose alternative", no_alt, None, "source", "alt", False),
    ("node relabelled in SVG only", None, relabel_svg, "match", "label", False),
    ("node moved in SVG only", None, move_svg, "match", "moved", False),
    ("node missing from SVG", None, drop_node_svg, "match", "missing-node", False),
    ("node drawn but not in source", None, extra_node_svg, "match", "extra-node", False),
    ("source not embedded", None, unembed, "embed", "not-embedded", False),
    ("embedded copy stale", None, stale_embed, "embed", "stale", False),
    ("mode not in source", None, wrong_mode, "match", "mode", False),
    ("text shrinks on a phone", None, shrink_on_phone, "browser", "rendered-size", True),
    ("page scrolls sideways", None, page_overflow, "browser", "page-overflow", True),
    ("text spills out of its box", spill, None, "browser", "text-spill", True),
    ("arrow label on a node", label_on_node, None, "browser", "label-on-node", True),
]


def main() -> int:
    static = "--static" in sys.argv
    failures = []
    with tempfile.TemporaryDirectory() as tmp:
        for name, smut, hmut, gate, code, needs_browser in CASES:
            if needs_browser and static:
                continue
            src = copy.deepcopy(fixture())
            if smut:
                smut(src)
            sidecar, page = build(src)
            if hmut:
                page = hmut(page)
            stem = Path(tmp) / re.sub(r"\W+", "-", name)
            stem.with_suffix(".json").write_text(sidecar, encoding="utf-8")
            stem.with_suffix(".html").write_text(page, encoding="utf-8")
            r = check.run(stem.with_suffix(".html"), browser=not static)
            errors = [(f["gate"], f["code"]) for f in r["findings"] if f["severity"] == "error"]
            if gate is None:
                ok = r["ok"]
                got = "pass" if ok else errors[:3]
            else:
                ok = (not r["ok"]) and (gate, code) in errors and r["gates"][gate] == "failed"
                got = errors[:3] or r["gates"]
            print(f"{'ok  ' if ok else 'FAIL'} {name}" + ("" if ok else f"  → want {gate}:{code}, got {got}"))
            if not ok:
                failures.append(name)
    print(f"\n{'all cases pass' if not failures else f'{len(failures)} case(s) failed'}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
