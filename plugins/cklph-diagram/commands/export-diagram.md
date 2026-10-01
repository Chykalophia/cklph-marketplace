---
description: Export a cklph-diagram HTML file to .svg, .png, and (when it has steps) .gif / .mp4
argument-hint: <html-file> [--svg|--png|--gif|--mp4|--all] [--scale=N] [--transparent] [--registry]
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
---

Export the diagram HTML at `$1` as deliverables by running the packaged helper
`skills/cklph-diagram/scripts/export.py` (installed: `<skill-dir>/scripts/export.py`).
[`skills/cklph-diagram/references/export.md`](../skills/cklph-diagram/references/export.md)
is the source of truth for what each format is for and the sizing rules — don't
reimplement the logic here.

Full argument string: `$ARGUMENTS`

## Defaults

- No format flags → `.svg` and `.png` (2x) next to the source.
- `--all` → SVG, PNG, and GIF + MP4 when the diagram has steps (it skips the
  animation, and says so, when it has none).
- `--registry` → also follow [`export-registry.md`](../skills/cklph-diagram/references/export-registry.md)
  to emit `<basename>.registry.json`. Given alone, it is the only output and needs
  neither Chrome nor ffmpeg.

## Flags

- `--svg`, `--png`, `--gif`, `--mp4`, `--all` — pick formats.
- `--scale=N` — PNG scale, 1 to 4 (fractions allowed for an exact pixel size). Default 2.
- `--transparent` — PNG without the brand's paper behind it (slides, docs with their own background).
- `--registry` — the metadata sidecar above.

## Required behaviour

1. **No source path** → ask which `.html` file. Don't guess.
2. **Source is `assets/index.html`** (the gallery) → refuse; ask which diagram.
3. **Source has no `<svg>`** → refuse; write nothing.
4. **Chrome or ffmpeg missing** → report `export.py`'s message verbatim and stop. Never install anything.
5. **`--gif`/`--mp4` on a diagram with no steps** → report that there is nothing to animate; offer to add `step`s to its source.
6. **`--registry` with no `data-block-id` attributes** → refuse; never emit an empty registry.

After exporting, report every file path, its size, and the PNG's pixel dimensions.
