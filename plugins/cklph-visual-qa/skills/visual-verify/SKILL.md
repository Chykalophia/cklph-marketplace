---
name: visual-verify
description: Verify a rendered web page actually matches a design or intent by screenshotting it and comparing visually, not by reading numbers. Use after any UI/styling change, when matching a design pixel-for-pixel, or whenever "it should look like X" needs proof. Iterate until the pixels match.
---

# visual-verify — trust pixels, not the data

A value that's "correct" in code can still render wrong — cache, an override, the wrong CSS channel, a
responsive trap. The only proof is **looking at the rendered page next to the design**. Screenshot,
compare, fix, repeat. Use `scripts/shot` (headless Chrome + ImageMagick).

## The loop

```bash
shot 'https://site/page?v=1' /tmp/now.png 1440x2600        # capture (always cache-bust the URL)
shot crop /tmp/now.png /tmp/region.png 1500x900+1360+800   # zoom the area you changed
# Read /tmp/region.png AND the Figma screenshot, compare side by side, list the deltas, fix, re-capture.
```

Compare the **specific things**: spacing, alignment (do edges line up?), color, font weight/size,
border radius, icon presence, element order. Don't declare "done" from the data — declare it from a
screenshot that matches.

## Headless Chrome clamps to ~500px — the phantom-overflow trap

Chrome won't size its window below ~500px. A `375` capture **renders at 500px** and the screenshot
shows only the **left 375px** — text looks cut off but isn't. Before chasing mobile "overflow":

```bash
shot probe 'https://site/page?v=1' 375     # prints the JS overflow probe to inject
```

Inject that `<script>` (via your styling channel), capture the top of the page, and read the banner:
`VW=500 overflow=0` means **no overflow** — it was the clamp. Verify mobile at **500px** (Chrome's
floor); a fluid `%`/flex layout that's clean at 500 scales fine to 375 on a real device.

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
  NOT match until the screenshot proves otherwise.
