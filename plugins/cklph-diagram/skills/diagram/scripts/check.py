#!/usr/bin/env python3
"""One verdict for one diagram. Run it before handing any diagram over.

    python3 scripts/check.py out/architecture-lead-intake.html
    python3 scripts/check.py <file>.html --json
    python3 scripts/check.py <file>.html --no-browser     # only when Chrome truly can't run

Gates, in order; the first one that fails stops the run, because a later gate
measured against a broken earlier one only adds noise:

  source    <file>.json beside the HTML parses, is well-formed, and its geometry
            is sound (no diagonals, no edge through a node, no stacked edges,
            no overlapping nodes, nothing off the canvas)
  embed     the HTML embeds exactly that source
  match     the drawing says what the source says: every node and edge drawn
            with the same id, label, position and route; title, desc, canvas,
            brand and mode agree
  a11y      lint-a11y.py against the source's brand and the page's mode
  safety    self_check.py: accessible-SVG contract, single-file safety, motion
  browser   browser_check.py: measured text size at 1440px and 375px, text
            spilling out of boxes, overlapping text, labels on nodes, clipping,
            sideways page scroll

Warnings never stop the run, but are listed. Output is capped at eight findings,
one per code first, each with what was measured and a suggested fix.

The browser gate needs Chrome. If it cannot run, the result is "skipped" and the
run fails unless --no-browser was passed on purpose; a skipped gate is never a
pass.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import browser_check  # noqa: E402
import diagram_source  # noqa: E402
from diagram_source import Finding  # noqa: E402

GATES = ("source", "embed", "match", "a11y", "safety", "browser")
MAX_SHOWN = 8


def _lines(text: str, prefix: str) -> list[str]:
    return [ln.strip() for ln in text.splitlines() if ln.strip().startswith(prefix)]


def sidecar_for(html_path: Path) -> Path:
    """<slug>.json for <slug>.html, and for its <slug>-dark.html / -light.html variants:
    one source serves every mode it lists."""
    own = html_path.with_suffix(".json")
    if own.exists():
        return own
    for suffix in ("-dark", "-light"):
        if html_path.stem.endswith(suffix):
            shared = html_path.with_name(html_path.stem[: -len(suffix)] + ".json")
            if shared.exists():
                return shared
    return own


def run(html_path: Path, browser: bool = True) -> dict:
    status = {g: "not-run" for g in GATES}
    findings: list[Finding] = []
    html = html_path.read_text(encoding="utf-8")
    sidecar = sidecar_for(html_path)

    def stop(gate: str, new: list[Finding]) -> bool:
        findings.extend(new)
        failed = any(f.severity == "error" for f in new)
        status[gate] = "failed" if failed else "passed"
        return failed

    # source
    try:
        embedded = diagram_source.embedded(html)
    except ValueError as exc:
        embedded = None
        findings.append(Finding("embed", "bad-json", "embedded source", f"does not parse: {exc}"))
    if sidecar.exists():
        try:
            src = json.loads(sidecar.read_text(encoding="utf-8"))
        except ValueError as exc:
            stop("source", [Finding("source", "bad-json", sidecar.name, f"does not parse: {exc}")])
            return _result(html_path, status, findings)
    elif embedded is not None:
        src = embedded
        findings.append(Finding("source", "no-sidecar", sidecar.name,
                                "missing; checked the embedded copy instead",
                                f"write the source beside the HTML as {sidecar.name}", "warn"))
    else:
        stop("source", [Finding("source", "no-source", html_path.name,
                                "has no source: no sidecar .json and nothing embedded",
                                "write the source first (references/diagram-source.md), then draw from it")])
        return _result(html_path, status, findings)
    if stop("source", diagram_source.validate(src).findings):
        return _result(html_path, status, findings)

    # embed
    if embedded is None:
        stop("embed", [Finding("embed", "not-embedded", html_path.name, "does not embed its source",
                               "paste diagram_source.embed_block(source) before </body>")])
        return _result(html_path, status, findings)
    if embedded != src:
        stop("embed", [Finding("embed", "stale", html_path.name,
                               "embedded source differs from the sidecar .json",
                               "re-embed from the sidecar; the sidecar is the source of truth")])
        return _result(html_path, status, findings)
    status["embed"] = "passed"

    # match
    if stop("match", diagram_source.match(src, html).findings):
        return _result(html_path, status, findings)

    # a11y
    mode = diagram_source.parse_html(html).html_attrs.get("data-cklph-mode", "light")
    lint = subprocess.run([sys.executable, str(HERE / "lint-a11y.py"), str(html_path),
                           "--brand", src["brand"]["slug"], "--mode", mode],
                          capture_output=True, text=True)
    lint_findings = [Finding("a11y", ln.split("]")[0].split("[")[-1], html_path.name, ln.split("]", 1)[-1].strip())
                     for ln in _lines(lint.stdout, "FAIL")]
    if lint.returncode and not lint_findings:
        lint_findings = [Finding("a11y", "lint", html_path.name, (lint.stdout + lint.stderr).strip()[-300:])]
    if stop("a11y", lint_findings):
        return _result(html_path, status, findings)

    # safety
    sc = subprocess.run([sys.executable, str(HERE / "self_check.py"), str(html_path)],
                        capture_output=True, text=True)
    sc_findings = [Finding("safety", "self-check", html_path.name, ln.lstrip("- "))
                   for ln in sc.stdout.splitlines() if ln.strip().startswith("- ")]
    if sc.returncode and not sc_findings:
        sc_findings = [Finding("safety", "self-check", html_path.name, sc.stdout.strip()[-300:])]
    if stop("safety", sc_findings):
        return _result(html_path, status, findings)

    # browser
    if not browser:
        status["browser"] = "skipped (--no-browser)"
        return _result(html_path, status, findings)
    res = browser_check.check(html_path)
    if res["status"] == "skipped":
        status["browser"] = "skipped"
        findings.append(Finding("browser", "skipped", html_path.name, res["reason"],
                                "install Chrome or set $CHROME; pass --no-browser only on purpose"))
        return _result(html_path, status, findings)
    stop("browser", [Finding("browser", f["code"], f["subject"], f["message"], f.get("fix", ""))
                     for f in res["findings"]])
    return _result(html_path, status, findings)


def _result(path: Path, status: dict, findings: list[Finding]) -> dict:
    ok = all(v == "passed" or v == "skipped (--no-browser)" for v in status.values())
    # one finding per code first, then the rest, capped
    seen, first, rest = set(), [], []
    for f in findings:
        (rest if (f.gate, f.code) in seen else first).append(f)
        seen.add((f.gate, f.code))
    ordered = [f for f in first if f.severity == "error"] + [f for f in first if f.severity == "warn"] + rest
    return {
        "file": str(path),
        "ok": ok,
        "gates": status,
        "errors": sum(f.severity == "error" for f in findings),
        "warnings": sum(f.severity == "warn" for f in findings),
        "findings": [vars(f) for f in ordered],
    }


def main(argv: list[str]) -> int:
    as_json = "--json" in argv
    browser = "--no-browser" not in argv
    paths = [Path(a) for a in argv if not a.startswith("--")]
    if not paths:
        print(__doc__)
        return 2
    all_ok = True
    for p in paths:
        r = run(p, browser)
        all_ok &= r["ok"]
        if as_json:
            print(json.dumps(r))
            continue
        print(f"{'PASS' if r['ok'] else 'FAIL'}  {p}")
        print("      " + "  ".join(f"{g}:{s}" for g, s in r["gates"].items()))
        shown = r["findings"][:MAX_SHOWN]
        for f in shown:
            print("  " + Finding(**f).line())
        if len(r["findings"]) > MAX_SHOWN:
            print(f"  … {len(r['findings']) - MAX_SHOWN} more (use --json for all)")
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
