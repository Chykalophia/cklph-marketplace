#!/usr/bin/env python3
"""Measure a diagram in a real headless Chrome. Standard library only.

The static linters reason about attributes; this measures what a reader gets.
At a desktop width (1440) and a phone width (375) it checks:

  rendered-size   every SVG <text> at or above the 12px floor *as rendered*
                  (computed font-size x the SVG's on-screen scale), so a diagram
                  that shrinks to fit a phone fails instead of passing on paper
  text-spill      a node's text stays inside its node box
  text-overlap    no two <text> boxes overlap
  label-on-node   a label outside any node never sits on a node box (§6 rule 6)
  text-clipped    no <text> falls outside the SVG viewport
  page-overflow   the page never scrolls sideways (a wide diagram scrolls in its
                  own container instead)

Chrome is found via $CHROME, the macOS app path, or google-chrome / chromium on
PATH. When it cannot be found, the result is "skipped" -- never "passed".

    python3 scripts/browser_check.py diagram.html [--json]
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

WIDTHS = (1440, 375)
FLOOR_PX = 12.0
OVERLAP_PX2 = 2.0   # text boxes may touch; sharing more than 2px² of area is a collision
SPILL_PX = 0.5

PROBE = r"""
<script data-cklph-probe>
(async () => {
  await document.fonts.ready;
  await new Promise(r => setTimeout(r, 50));
  const box = el => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; };
  const svg = document.querySelector('svg');
  const out = { innerWidth, scrollWidth: document.documentElement.scrollWidth, texts: [], nodes: {}, svg: null };
  if (svg) {
    out.svg = box(svg);
    const vb = svg.viewBox.baseVal;
    const scale = svg.getBoundingClientRect().width / ((vb && vb.width) || svg.getBoundingClientRect().width);
    for (const g of svg.querySelectorAll('[data-node]')) {
      const r = g.querySelector('rect, polygon');
      if (r) out.nodes[g.getAttribute('data-node')] = box(r);
    }
    for (const t of svg.querySelectorAll('text')) {
      if (!t.textContent.trim()) continue;
      const g = t.closest('[data-node]');
      out.texts.push({
        s: t.textContent.trim().replace(/\s+/g, ' ').slice(0, 40),
        box: box(t),
        px: parseFloat(getComputedStyle(t).fontSize) * scale,
        node: g ? g.getAttribute('data-node') : null,
      });
    }
  }
  const pre = document.createElement('pre');
  pre.id = 'cklph-probe-out';
  pre.textContent = JSON.stringify(out);
  document.body.appendChild(pre);
})();
</script>
"""


def find_chrome() -> str | None:
    for c in (os.environ.get("CHROME"),
              "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
              "/Applications/Chromium.app/Contents/MacOS/Chromium"):
        if c and Path(c).exists():
            return c
    for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"):
        found = shutil.which(name)
        if found:
            return found
    return None


ATTEMPTS, TIMEOUT_S = 2, 45


def measure(chrome: str, html: str, width: int) -> dict:
    """One probe run at ``width``. Headless Chrome occasionally hangs on launch, so
    a timeout is retried once; a second failure raises RuntimeError, which check()
    reports as a failed gate -- never as a crash and never as a pass."""
    body_close = html.rfind("</body>")
    page = html[:body_close] + PROBE + html[body_close:] if body_close != -1 else html + PROBE
    last = ""
    for _attempt in range(ATTEMPTS):
        with tempfile.TemporaryDirectory() as tmp:
            f = Path(tmp) / "probe.html"
            f.write_text(page, encoding="utf-8")
            try:
                run = subprocess.run(
                    [chrome, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
                     "--hide-scrollbars", "--force-device-scale-factor=1",
                     f"--window-size={width},900", "--virtual-time-budget=5000", "--dump-dom", f.as_uri()],
                    capture_output=True, text=True, timeout=TIMEOUT_S,
                )
            except subprocess.TimeoutExpired:
                last = f"Chrome did not finish within {TIMEOUT_S}s"
                continue
        m = re.search(r'<pre id="cklph-probe-out">(.*?)</pre>', run.stdout, re.S)
        if m:
            raw = m.group(1).replace("&quot;", '"').replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
            return json.loads(raw)
        last = f"probe produced no result: {run.stderr.strip()[:200]}"
    raise RuntimeError(f"at {width}px after {ATTEMPTS} attempts: {last}")


def _overlap(a, b) -> float:
    w = min(a[2], b[2]) - max(a[0], b[0])
    h = min(a[3], b[3]) - max(a[1], b[1])
    return w * h if w > 0 and h > 0 else 0.0


def findings_for(m: dict, width: int, markers: frozenset = frozenset()) -> list[dict]:
    out: list[dict] = []

    def add(code, subject, message, fix=""):
        out.append({"gate": "browser", "code": code, "subject": f"{subject} @{width}px",
                    "message": message, "fix": fix, "severity": "error"})

    if m["scrollWidth"] > m["innerWidth"] + 1:
        add("page-overflow", "page", f"scrolls sideways ({m['scrollWidth']}px content in {m['innerWidth']}px)",
            "wrap the <svg> in a .diagram-container with overflow-x: auto (see the templates)")
    if m["svg"] is None:
        add("no-svg", "page", "no <svg> rendered")
        return out
    sv = m["svg"]
    texts = m["texts"]
    small = [t for t in texts if t["px"] < FLOOR_PX - 0.05]
    if small:
        worst = min(small, key=lambda t: t["px"])
        add("rendered-size", f"{len(small)} text(s)",
            f"render below {FLOOR_PX:g}px; smallest {worst['s']!r} at {worst['px']:.1f}px (A5)",
            "give the svg min-width equal to its viewBox width inside a scrolling container, "
            "rather than letting it shrink to the screen")
    for t in texts:
        if t["node"] in markers:
            pass  # a marker's labels sit beside it by design (kind: "marker" in the source)
        elif t["node"] and t["node"] in m["nodes"]:
            n, b = m["nodes"][t["node"]], t["box"]
            spill = max(n[0] - b[0], b[2] - n[2], n[1] - b[1], b[3] - n[3])
            if spill > SPILL_PX:
                add("text-spill", f"node {t['node']}", f"text {t['s']!r} runs {spill:.1f}px outside its box",
                    "shorten the text, or widen the node in the source (stay on the 4px grid)")
        elif not t["node"]:
            for nid, n in m["nodes"].items():
                if _overlap(t["box"], n) > OVERLAP_PX2:
                    add("label-on-node", f"label {t['s']!r}", f"sits on node {nid} (§6 rule 6)",
                        "move the label to a free segment of its connector")
                    break
        b = t["box"]
        if b[0] < sv[0] - SPILL_PX or b[2] > sv[2] + SPILL_PX or b[1] < sv[1] - SPILL_PX or b[3] > sv[3] + SPILL_PX:
            add("text-clipped", f"text {t['s']!r}", "falls outside the SVG viewport", "grow the canvas or move it in")
    for i, a in enumerate(texts):
        for b in texts[i + 1:]:
            area = _overlap(a["box"], b["box"])
            if area > OVERLAP_PX2:
                add("text-overlap", f"{a['s']!r} / {b['s']!r}", f"overlap by {area:.0f}px²",
                    "move one of them; keep 4px or more between text boxes")
    return out


def check(path: Path) -> dict:
    chrome = find_chrome()
    if not chrome:
        return {"status": "skipped", "reason": "no Chrome/Chromium found (set $CHROME)", "findings": []}
    html = path.read_text(encoding="utf-8")
    markers: frozenset = frozenset()
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import diagram_source
        src = diagram_source.embedded(html)
        if isinstance(src, dict):
            markers = frozenset(n.get("id") for n in src.get("nodes", [])
                                if isinstance(n, dict) and n.get("kind") == "marker")
    except (ImportError, ValueError):
        pass
    findings: list[dict] = []
    for w in WIDTHS:
        try:
            findings += findings_for(measure(chrome, html, w), w, markers)
        except RuntimeError as exc:
            findings.append({"gate": "browser", "code": "probe-failed", "subject": f"page @{w}px",
                             "message": str(exc), "fix": "rerun; if it persists, check Chrome starts headless",
                             "severity": "error"})
    return {"status": "failed" if findings else "passed", "widths": list(WIDTHS), "findings": findings}


def main(argv: list[str]) -> int:
    as_json = "--json" in argv
    paths = [Path(a) for a in argv if a != "--json"]
    if not paths:
        print(__doc__)
        return 2
    worst = 0
    for p in paths:
        res = check(p)
        if as_json:
            print(json.dumps({"file": str(p), **res}))
        else:
            print(f"{res['status'].upper():8} {p}" + (f"  ({res.get('reason')})" if res.get("reason") else ""))
            for f in res["findings"][:12]:
                print(f"  FAIL [browser:{f['code']}] {f['subject']}: {f['message']}")
        worst = max(worst, {"passed": 0, "skipped": 3, "failed": 1}[res["status"]])
    return worst


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
