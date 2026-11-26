---
name: visual-verify
description: Verify a rendered web page actually matches a design or intent by screenshotting it and comparing visually, not by reading numbers. Use after any UI/styling change, when matching a design pixel-for-pixel, or whenever "it should look like X" needs proof. Iterate until the pixels match.
---

# visual-verify — trust pixels, not the data

A value that's "correct" in code can still render wrong — cache, an override, the wrong CSS channel, a
responsive trap. The only proof is **looking at the rendered page next to the design**. Screenshot,
compare, fix, repeat. Capture with this plugin's `shot` (headless Chrome + ImageMagick), called below
as `"${CLAUDE_PLUGIN_ROOT}/scripts/shot"`. It is logged out: give it a URL a visitor can load
(published, e.g. on staging), not a draft or `?preview=true`.

## The loop

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/shot" 'https://site/page?v=1' /tmp/now.png 1440x2600        # capture (always cache-bust the URL)
"${CLAUDE_PLUGIN_ROOT}/scripts/shot" crop /tmp/now.png /tmp/region.png 1500x900+1360+800   # zoom the area you changed
# Read /tmp/region.png AND the Figma screenshot, compare side by side, list the deltas, fix, re-capture.
```

Compare the **specific things**: spacing, alignment (do edges line up?), color, font weight/size,
border radius, icon presence, element order. Don't declare "done" from the data — declare it from a
screenshot that matches.

## Score it against the design

Eyeballing two images is where a model is weakest: it remembers the design and grades its memory.
Before you judge by eye, score the capture with impeccable's `comp-diff` (no AI model, under a
second):

```bash
export DO_NOT_TRACK=1 IMPECCABLE_NO_TELEMETRY=1
npx --yes impeccable@4.10.0 comp-diff --comp /tmp/figma-1440.png --build /tmp/now.png \
  --out-dir /tmp/diff --label hero --json > /tmp/diff.json
```

- `--comp` is the design export (cklph-figma's `figma-read`), `--build` the `shot` capture at the
  same width. It scales the build to the comp's width and compares from the top. For one section,
  crop both images to the same box first (`shot crop`).
- It scores structure, color, detail and section bands, overall and per horizontal band, and gives
  each a verdict: `match`, `drift`, `missing` or `contradicted`. `/tmp/diff` gets `side-by-side.png`,
  `heatmap.png` and a paired crop per band in `regions/`.
- Start from the worst band: open its crop pair, find the difference, fix, re-capture, re-score.
  The number tells you where to look, never that you're done. A `match` overall with one `missing`
  band is not a match.
- Freeze or skip moving parts. The chykalophia.com homepage captured twice in a row scored 94.6%
  (`match`), but one band read `drift` because a carousel had moved. A different page scored 41.9%
  (`contradicted`).
- Threshold: impeccable's own hero gate is 0.72, calibrated on AI-made comps, not client Figma files.
  Until we've scored a few real builds that a person signed off, report the score and the band
  verdicts and don't gate on a number. `--threshold 0.75` makes it exit 3 below the bar once we pick
  one.

## Check four widths, not two

Capture **1440** (desktop), **1920** (wide monitor), **768** (tablet, upright) and **500** (phone,
Chrome's floor). Desktop and phone alone miss the bugs that live in between. On chykalophia.com a
hero that was fine at 1440 and 390 scrolled 37px sideways at 768, and at 1920 the text sat 64px from
the screen edge with no capped container.

A screenshot can't show sideways scroll, because the window is the viewport. Inject the `shot probe`
script below at each width you capture and read `docW`: anything above `VW` means the page scrolls
sideways. A probe only covers the widths you ran it at, so report the others as unchecked.
`design-lint`'s `hallmark-lint` checks 320, 375, 414, 768, 1024, 1280, 1440 and 1920 without injecting anything. Other widths are still
unchecked.

## Headless Chrome clamps to ~500px — the phantom-overflow trap

Chrome won't size its window below ~500px. A `375` capture **renders at 500px** and the screenshot
shows only the **left 375px** — text looks cut off but isn't. Before chasing mobile "overflow":

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/shot" probe                                 # prints the JS overflow-probe <script> (no URL needed)
```

Inject that `<script>` (via your styling channel), capture the top of the page at 500px
(`"${CLAUDE_PLUGIN_ROOT}/scripts/shot" '<url>?v=2' /tmp/m.png 500x900`), and read the banner:
`VW=500 overflow=0` means **no overflow** past either edge — it was the clamp. Verify mobile at **500px** (Chrome's
floor). That says nothing about 375 or 320. `hallmark-lint` sets those widths through device
emulation, so run it for phone widths below 500, or report them as unchecked.

## Measure edges precisely with ImageMagick trim

To check alignment numerically, crop a thin strip and trim to find the first content pixel:

```bash
magick now.png -crop 1400x6+1330+1300 +repage -fuzz 12% -trim info:-   # the +X offset = left edge
```

Three elements with offsets `+42 / +63 / +2` are misaligned by ~10–20px CSS — fix, then re-measure.

## Discipline

- **Cache-bust every capture** (`?v=N`) — managed hosts front a CDN that lags writes.
- **Crop to the change** — full-page shots downscale away the detail you need; 2× scale + a tight crop
  shows real pixels.
- **One delta at a time** near the end — change, re-shoot, confirm; don't batch five tweaks then guess
  which broke it.
- For an independent, skeptical pass, dispatch the **visual-reviewer** agent — it assumes the page does
  NOT match until the screenshot proves otherwise. Give it the screenshots, the design export and the
  `comp-diff` report, never your own findings or the lint output (see its "Cold review" rules).
