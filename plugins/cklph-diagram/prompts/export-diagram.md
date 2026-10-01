---
description: Export a cklph-diagram HTML file to SVG, PNG, and (when it has steps) GIF / MP4
argument-hint: "<html-file> [--svg|--png|--gif|--mp4|--all] [--scale=N] [--transparent] [--registry]"
---

Export diagram HTML at `$1` as deliverables. Locate the installed `cklph-diagram` skill and read its `SKILL.md`. Then read `references/export.md` relative to its directory and run `scripts/export.py` from that directory with the requested flags. Treat that reference as source of truth. Do not assume the package lives under the current working directory. If `--registry` is present, also read `references/export-registry.md` and follow it to emit the metadata sidecar.

Full argument string: `$ARGUMENTS`

- No format flags: `.svg` and `.png` (2x). `--all`: also GIF + MP4 when the diagram has steps.
- `--scale=N` is 1 to 4. `--transparent` drops the paper background from the PNG.
- Chrome or ffmpeg missing: report export.py's message verbatim and stop; never install anything.
- `--gif`/`--mp4` on a diagram with no steps: say there is nothing to animate and offer to add steps to its source.
- `--registry` alone needs neither Chrome nor ffmpeg; refuse it when the source has no `data-block-id`.

Report every file path, its size, and the PNG's pixel dimensions.
