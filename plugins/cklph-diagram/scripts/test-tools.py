#!/usr/bin/env python3
"""Outcome tests for the authoring tools: scaffold, layout, export, and the
source features they rely on (decision nodes, steps).

Each case asserts what the tool produced or refused, not that a code path ran.

    python3 scripts/test-tools.py            # needs Chrome and ffmpeg
    python3 scripts/test-tools.py --static   # skip the Chrome/ffmpeg cases
"""

from __future__ import annotations

import copy
import importlib.util
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "skills/cklph-diagram/scripts"
sys.path.insert(0, str(SCRIPTS))
import diagram_source as ds  # noqa: E402
import layout  # noqa: E402
import scaffold  # noqa: E402

_spec = importlib.util.spec_from_file_location("build_examples", ROOT / "scripts/build-examples.py")
bx = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bx)

STATIC = "--static" in sys.argv
failures: list[str] = []


def case(name: str, ok: bool, detail: str = "") -> None:
    print(f"{'ok  ' if ok else 'FAIL'} {name}" + ("" if ok else f"  → {detail}"))
    if not ok:
        failures.append(name)


def run(*args: str, cwd: Path | None = None) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, *args], capture_output=True, text=True, cwd=cwd,
                          env={"PYTHONDONTWRITEBYTECODE": "1", "PATH": "/usr/bin:/bin:/opt/homebrew/bin:/usr/local/bin"})


def fixture(mode_list=("light",)) -> dict:
    src = bx.SOURCES["architecture"]("_default", mode_list[0])
    src["brand"]["modes"] = list(mode_list)
    return src


def drawn(src: dict) -> str:
    return bx.draw(src)


# --------------------------------------------------------------------------- #
def test_scaffold(tmp: Path) -> None:
    src = fixture(("light", "dark"))
    p = tmp / f"{src['id']}.json"
    p.write_text(json.dumps(src), encoding="utf-8")
    r = run(str(SCRIPTS / "scaffold.py"), str(p))
    light, dark = tmp / f"{src['id']}.html", tmp / f"{src['id']}-dark.html"
    case("scaffold writes one page per mode", r.returncode == 0 and light.exists() and dark.exists(), r.stdout + r.stderr)
    page = light.read_text()
    case("scaffold leaves an empty drawing area between markers",
         scaffold.DRAW_START in page and scaffold.DRAW_PLACEHOLDER.strip() in page)
    case("scaffold embeds the source", ds.embedded(page) == src)
    case("scaffold sets brand and mode", 'data-cklph-mode="dark"' in dark.read_text()
         and 'data-cklph-brand="_default"' in page)

    # draw into the light page, re-run: the drawing survives and reaches the dark page
    body = drawn(src)
    a, rest = page.split(scaffold.DRAW_START, 1)
    _, z = rest.split(scaffold.DRAW_END, 1)
    light.write_text(a + scaffold.DRAW_START + body + scaffold.DRAW_END + z, encoding="utf-8")
    src["meta"]["title"] = "Lead intake pipeline v2"
    p.write_text(json.dumps(src), encoding="utf-8")
    r = run(str(SCRIPTS / "scaffold.py"), str(p))
    lt, dk = light.read_text(), dark.read_text()
    case("re-scaffold keeps the drawing", body in lt, r.stdout)
    case("re-scaffold copies the drawing into every mode", body in dk)
    case("re-scaffold picks up source edits", "Lead intake pipeline v2" in lt and ds.embedded(lt) == src)
    rep = ds.match(src, lt)
    case("a scaffolded, drawn page matches its source", not rep.errors, [f.line() for f in rep.errors][:2])

    foreign = tmp / "foreign.json"
    foreign.write_text(json.dumps({**src, "id": "foreign"}), encoding="utf-8")
    (tmp / "foreign.html").write_text("<html><body>hand-made, no markers</body></html>", encoding="utf-8")
    r = run(str(SCRIPTS / "scaffold.py"), str(foreign))
    case("scaffold refuses to overwrite a page without markers",
         r.returncode != 0 and "hand-made" in (tmp / "foreign.html").read_text(), r.stdout)

    bad = copy.deepcopy(src)
    bad["nodes"][0]["x"] = 3  # off-canvas? no: overlap with nothing; make it invalid instead
    bad["edges"][0]["points"] = [[0, 0], [5, 9]]
    bp = tmp / "bad.json"
    bp.write_text(json.dumps({**bad, "id": "bad"}), encoding="utf-8")
    r = run(str(SCRIPTS / "scaffold.py"), str(bp))
    case("scaffold refuses an invalid source", r.returncode != 0 and not (tmp / "bad.html").exists(), r.stdout)

    r = run(str(SCRIPTS / "scaffold.py"), str(p), "--motion")
    case("--motion refuses a source with no steps", r.returncode != 0 and "step" in (r.stdout + r.stderr))


def test_motion(tmp: Path) -> None:
    src = fixture()
    for k, n in enumerate(src["nodes"], start=1):
        n["step"] = min(k, 5)
    p = tmp / "motion.json"
    src["id"] = "motion"
    p.write_text(json.dumps(src), encoding="utf-8")
    r = run(str(SCRIPTS / "scaffold.py"), str(p), "--motion")
    page = (tmp / "motion.html").read_text() if (tmp / "motion.html").exists() else ""
    case("--motion builds on the canonical motion controller",
         r.returncode == 0 and "data-motion-root" in page and 'data-step-count="5"' in page, r.stdout + r.stderr)
    empty = run(str(SCRIPTS / "self_check.py"), str(tmp / "motion.html"))
    case("an undrawn motion page fails the self-check (no steps drawn yet)", empty.returncode != 0)
    body = drawn(src)
    for n in src["nodes"]:
        body = body.replace(f'<g data-node="{n["id"]}">',
                            f'<g data-node="{n["id"]}" data-motion-item data-step="{n["step"]}"'
                            f' aria-label="Step {n["step"]}: {n["label"]}">', 1)
    a, rest = page.split(scaffold.DRAW_START, 1)
    _, z = rest.split(scaffold.DRAW_END, 1)
    (tmp / "motion.html").write_text(a + scaffold.DRAW_START + body + scaffold.DRAW_END + z, encoding="utf-8")
    sc = run(str(SCRIPTS / "self_check.py"), str(tmp / "motion.html"))
    case("a drawn --motion page passes the self-check", sc.returncode == 0, sc.stdout[-400:])


def test_layout() -> None:
    src = fixture()
    at = {"intake": [0, 0], "queue": [1, 0], "worker": [2, 0], "crm": [3, 0], "notify": [2, 1]}
    src["layout"] = {"origin": [32, 112], "cell": [136, 88], "gap": [56, 96]}
    for n in src["nodes"]:
        for k in "xywh":
            n.pop(k)
        n["at"] = at[n["id"]]
    for e in src["edges"]:
        e.pop("points")
        e.pop("label_at", None)
    want = {n["id"]: (n["x"], n["y"]) for n in fixture()["nodes"]}
    layout.place(src)
    got = {n["id"]: (n["x"], n["y"]) for n in src["nodes"]}
    case("place puts nodes where the hand layout had them", got == want, f"{got} vs {want}")
    notes = layout.route(src)
    rep = ds.validate(src)
    case("route gives every edge clear points", all(e.get("points") for e in src["edges"]) and not rep.errors,
         [f.line() for f in rep.errors][:3] + notes)
    straight = next(e for e in src["edges"] if e["id"] == "intake-queue")
    case("route keeps aligned neighbours straight", len(straight["points"]) == 2, straight["points"])
    case("route places labels clear of nodes", not [f for f in rep.findings if f.code.startswith("label")],
         [f.line() for f in rep.findings])

    # a node walled in on every side by others: no simple route exists
    boxed = fixture()
    boxed["nodes"] = [{"id": i, "label": i, "x": x, "y": y, "w": 60, "h": 60}
                      for i, x, y in [("a", 32, 32), ("b", 352, 352), ("w1", 132, 32), ("w2", 32, 132),
                                      ("w3", 252, 352), ("w4", 352, 252), ("w5", 132, 132), ("w6", 252, 252)]]
    boxed["edges"] = [{"id": "a-b", "from": "a", "to": "b"}]
    boxed["canvas"] = {"width": 480, "height": 480, "render_width": 480}
    notes = layout.route(boxed)
    case("route reports an edge it cannot route, and leaves it alone",
         not boxed["edges"][0].get("points") and any("by hand" in n for n in notes), notes)


def test_decision_and_steps() -> None:
    src = fixture()
    src["nodes"].append({"id": "ok", "kind": "decision", "label": "Valid?", "sublabel": "schema",
                         "x": 608, "y": 296, "w": 136, "h": 88})
    codes = {f.code for f in ds.validate(src).errors}
    case("a decision node refuses a sublabel", "decision-text" in codes, codes)
    src["nodes"][-1].pop("sublabel")
    src["nodes"][-1]["label"] = "Has every required field?"
    codes = {f.code for f in ds.validate(src).errors}
    case("a decision label must fit the diamond", "text-fit" in codes, codes)

    src = fixture()
    page = bx.render(src, "light")  # the proof generator draws boxes; the diamond is drawn here
    src["nodes"].append({"id": "ok", "kind": "decision", "label": "Valid?", "x": 608, "y": 296, "w": 136, "h": 88})
    html = page.replace(
        "</svg>", '<g data-node="ok"><polygon points="676,296 744,340 676,384 608,340"/>'
        '<text x="676" y="344">Valid?</text></g>\n</svg>', 1)
    rep = ds.match(src, html)
    case("a drawn diamond matches its decision node", not rep.errors, [f.line() for f in rep.errors])

    src = fixture()
    src["nodes"][0]["step"] = 1
    html = bx.render(src, "light")
    codes = {f.code for f in ds.match(src, html).errors}
    case("a step in the source but not on the drawing fails match", "step" in codes, codes)
    html = html.replace('<g data-node="intake">', '<g data-node="intake" data-motion-item data-step="1">', 1)
    codes = {f.code for f in ds.match(src, html).errors}
    case("a drawn step matching the source passes", "step" not in codes, codes)


def test_export(tmp: Path) -> None:
    src = fixture()
    (tmp / f"{src['id']}.json").write_text(json.dumps(src), encoding="utf-8")
    html_path = tmp / f"{src['id']}.html"
    html_path.write_text(bx.render(src, "light"), encoding="utf-8")
    r = run(str(SCRIPTS / "export.py"), str(html_path))
    svg, png = html_path.with_suffix(".svg"), html_path.with_suffix(".png")
    case("export writes SVG and PNG by default", r.returncode == 0 and svg.exists() and png.exists(), r.stdout + r.stderr)
    import export
    if png.exists():
        case("the PNG is the canvas at 2x", export.png_size(png) == (784 * 2, 480 * 2), export.png_size(png))
    r = run(str(SCRIPTS / "export.py"), str(html_path), "--gif")
    case("--gif refuses a diagram with no steps", r.returncode != 0 and "nothing to animate" in (r.stdout + r.stderr))

    if not shutil.which("ffmpeg"):
        case("ffmpeg available for GIF/MP4", False, "install ffmpeg")
        return
    stepped = bx.render(src, "light")
    for k, nid in enumerate(["intake", "queue", "worker", "crm", "notify"], start=1):
        stepped = stepped.replace(f'<g data-node="{nid}">', f'<g data-node="{nid}" data-motion-item data-step="{min(k, 4)}">', 1)
    sp = tmp / "stepped.html"
    sp.write_text(stepped, encoding="utf-8")
    r = run(str(SCRIPTS / "export.py"), str(sp), "--gif", "--mp4")
    gif, mp4 = sp.with_suffix(".gif"), sp.with_suffix(".mp4")
    case("--gif --mp4 write both", r.returncode == 0 and gif.exists() and mp4.exists(), r.stdout + r.stderr)
    if mp4.exists():
        dur = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(mp4)],
                             capture_output=True, text=True).stdout.strip()
        want = 3 * (export.HOLD_S + export.FADE_S) + export.FINAL_HOLD_S - 3 * export.FADE_S
        case("the MP4 runs one hold per step plus the final hold", abs(float(dur or 0) - want) < 0.3, f"{dur}s vs {want}s")
    if gif.exists():
        frames = len(re.findall(rb"\x21\xf9\x04", gif.read_bytes()))
        case("the GIF animates (many frames)", frames > 10, frames)


def main() -> int:
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        test_scaffold(tmp)
        test_motion(tmp)
        test_layout()
        test_decision_and_steps()
        if not STATIC:
            test_export(tmp)
    print(f"\n{'all cases pass' if not failures else f'{len(failures)} case(s) failed'}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
