#!/usr/bin/env python3
"""Export a diagram as deliverables: SVG, PNG, and -- when it has steps -- GIF/MP4.

    python3 scripts/export.py <slug>.html                    # <slug>.svg + <slug>.png (2x)
    python3 scripts/export.py <slug>.html --png --scale 3    # just a 3x PNG
    python3 scripts/export.py <slug>.html --gif --mp4        # step animation
    python3 scripts/export.py <slug>.html --all              # everything that applies
    python3 scripts/export.py <slug>.html --png --transparent  # no paper behind the diagram

Where each one goes:

  .svg  docs, slides, websites -- scales cleanly, carries the brand's fonts and tokens
  .png  email, chat, anything that won't take SVG -- the diagram only, on its paper
  .gif  email and chat when it should move: loops, plays everywhere, no controls
  .mp4  slides and docs that embed video -- smoother and far smaller than the GIF

Animation comes from the source's ``step`` fields, drawn as ``data-step="N"``:
frame N shows every element with step ≤ N (unstepped elements always show), the
frames cross-fade, and the last frame holds. A diagram with no steps has nothing
to animate, and --gif/--mp4 say so rather than producing a still.

Needs Chrome (PNG, frames) and ffmpeg (GIF, MP4). Everything else is stdlib.
"""

from __future__ import annotations

import re
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import browser_check  # noqa: E402
import export_svg  # noqa: E402

HOLD_S = 1.0       # each step holds this long
FADE_S = 0.35      # cross-fade between steps
FINAL_HOLD_S = 2.5  # the complete diagram holds longer before the loop restarts
FPS = 30
GIF_WIDTH_CAP = 1200  # px: email clients choke on very large GIFs


def standalone_svg(html_path: Path) -> str:
    return export_svg.export_svg_document(html_path.read_text(encoding="utf-8"), html_path)


def view_box(svg: str) -> tuple[int, int]:
    m = re.search(r'viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"', svg)
    if not m:
        raise SystemExit("the diagram's <svg> has no viewBox")
    return int(float(m.group(1))), int(float(m.group(2)))


def png_size(path: Path) -> tuple[int, int]:
    with path.open("rb") as f:
        head = f.read(24)
    if head[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError(f"{path.name} is not a PNG")
    return struct.unpack(">II", head[16:24])


def render_png(svg: str, out: Path, scale: float, extra_css: str = "") -> Path:
    """Rasterize a standalone SVG at its own size × scale, in headless Chrome."""
    chrome = browser_check.find_chrome()
    if not chrome:
        raise SystemExit("PNG export needs Chrome (set $CHROME)")
    w, h = view_box(svg)
    sized = re.sub(r"<svg\b", f'<svg width="{w}" height="{h}"', svg.split("?>", 1)[-1], count=1)
    page = (f"<!DOCTYPE html><html><head><meta charset='utf-8'><style>"
            f"html,body{{margin:0;padding:0;background:transparent}} svg{{display:block}} {extra_css}"
            f"</style></head><body>{sized}</body></html>")
    with tempfile.TemporaryDirectory() as tmp:
        f = Path(tmp) / "frame.html"
        f.write_text(page, encoding="utf-8")
        for _attempt in range(2):
            try:
                subprocess.run([chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                                "--default-background-color=00000000", f"--force-device-scale-factor={scale}",
                                f"--window-size={w},{h}", "--virtual-time-budget=5000",
                                f"--screenshot={out}", f.as_uri()],
                               capture_output=True, timeout=45)
                if out.exists():
                    break
            except subprocess.TimeoutExpired:
                continue
    if not out.exists():
        raise SystemExit(f"Chrome did not produce {out.name}")
    got = png_size(out)
    want = (round(w * scale), round(h * scale))
    if got != want:
        raise SystemExit(f"{out.name} is {got[0]}x{got[1]}, expected {want[0]}x{want[1]} — "
                         "Chrome clamped the window; export at a larger --scale or a larger canvas")
    return out


def steps_in(svg: str) -> list[int]:
    return sorted({int(s) for s in re.findall(r'data-step="(\d+)"', svg)})


def step_css(k: int) -> str:
    # data-motion-decorative overlays (tokens, path draws) never appear in exports
    return ("[data-motion-decorative]{display:none!important}"
            "[data-step]{opacity:0!important;transition:none!important;animation:none!important}"
            + "".join(f'[data-step="{j}"]{{opacity:1!important}}' for j in range(1, k + 1)))


def ffmpeg() -> str:
    path = shutil.which("ffmpeg")
    if not path:
        raise SystemExit("GIF/MP4 export needs ffmpeg on PATH")
    return path


def animate(svg: str, stem: Path, scale: float, gif: bool, mp4: bool) -> list[Path]:
    steps = steps_in(svg)
    if not steps:
        raise SystemExit("nothing to animate: no element carries data-step. Give nodes/edges a "
                         "\"step\" in the source, draw them with data-step, then export again.")
    ff = ffmpeg()
    out: list[Path] = []
    with tempfile.TemporaryDirectory() as tmp:
        frames = [render_png(svg, Path(tmp) / f"step-{k}.png", scale, step_css(k)) for k in steps]
        durations = [HOLD_S + FADE_S] * (len(frames) - 1) + [FINAL_HOLD_S]
        inputs = []
        for f, d in zip(frames, durations):
            inputs += ["-loop", "1", "-t", f"{d:.3f}", "-i", str(f)]
        # chain cross-fades: [0][1]xfade → v1, [v1][2]xfade → v2 …
        chain, last, offset = [], "0:v", 0.0
        for i in range(1, len(frames)):
            offset += durations[i - 1] - FADE_S
            label = f"v{i}"
            chain.append(f"[{last}][{i}:v]xfade=transition=fade:duration={FADE_S}:offset={offset:.3f}[{label}]")
            last = label
        fc = ";".join(chain) if chain else "[0:v]null[v0]"
        final = last if chain else "v0"
        video = Path(tmp) / "anim.mp4"
        subprocess.run([ff, "-y", "-loglevel", "error", *inputs, "-filter_complex",
                        f"{fc};[{final}]fps={FPS},scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p[out]",
                        "-map", "[out]", "-c:v", "libx264", "-preset", "slow", "-crf", "20",
                        "-movflags", "+faststart", str(video)], check=True)
        if mp4:
            dest = stem.with_suffix(".mp4")
            shutil.copy(video, dest)
            out.append(dest)
        if gif:
            dest = stem.with_suffix(".gif")
            w = min(GIF_WIDTH_CAP, png_size(frames[0])[0])
            subprocess.run([ff, "-y", "-loglevel", "error", "-i", str(video), "-filter_complex",
                            f"fps=15,scale={w}:-1:flags=lanczos,split[a][b];"
                            "[a]palettegen=max_colors=128:stats_mode=diff[p];"
                            "[b][p]paletteuse=dither=bayer:bayer_scale=4", "-loop", "0", str(dest)],
                           check=True)
            out.append(dest)
    return out


def main(argv: list[str]) -> int:
    paths = [Path(a) for a in argv if not a.startswith("--") and not re.fullmatch(r"[\d.]+", a)]
    if len(paths) != 1:
        print(__doc__)
        return 2
    html_path = paths[0]
    scale = 2.0
    if "--scale" in argv:
        scale = float(argv[argv.index("--scale") + 1])
        if not 1 <= scale <= 4:
            raise SystemExit("--scale is 1 to 4 (export.md § Sizing the export)")
    flags = {f for f in ("--svg", "--png", "--gif", "--mp4") if f in argv}
    if "--all" in argv:
        flags = {"--svg", "--png", "--gif", "--mp4"}
    if not flags:
        flags = {"--svg", "--png"}
    svg = standalone_svg(html_path)
    stem = html_path.with_suffix("")
    written: list[Path] = []
    if "--svg" in flags:
        p = stem.with_suffix(".svg")
        p.write_text(svg, encoding="utf-8")
        written.append(p)
    if "--png" in flags:
        # --transparent drops the full-canvas paper rect, for slides and docs with
        # their own background. The default keeps it: email clients paint
        # transparency unpredictably, some of them black.
        bg = 'svg>rect[width="100%"][height="100%"]{display:none}' if "--transparent" in argv else ""
        written.append(render_png(svg, stem.with_suffix(".png"), scale, bg))
    if flags & {"--gif", "--mp4"}:
        if steps_in(svg) or "--all" not in argv:
            written += animate(svg, stem, scale if scale <= 2 else 2, "--gif" in flags, "--mp4" in flags)
        else:
            print("no steps in this diagram: skipped GIF/MP4")
    for p in written:
        size = p.stat().st_size
        dims = "x".join(map(str, png_size(p))) if p.suffix == ".png" else ""
        print(f"wrote {p.name}  {size / 1024:.0f} KB {dims}".rstrip())
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
