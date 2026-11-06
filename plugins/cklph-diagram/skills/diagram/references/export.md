# Export to PNG / SVG

Convert a diagram HTML file into deliverables next to it: `.svg` and `.png` for every diagram, `.gif` and `.mp4` when it has steps (SKILL.md §12).

## Trigger

Every diagram is exported as part of finishing it (SKILL.md §10 step 7): SVG and
PNG always, GIF and MP4 when it has steps. Also load this file when:

- The user invokes `/cklph-diagram:export-diagram <html-file>` (the plugin's slash command — defined in `commands/export-diagram.md` at the repo root).
- The user asks in natural language to export, save, rasterize, convert, or download a diagram in `.svg` or `.png` form. Typical phrasings:
  - "export this as PNG"
  - "save as SVG"
  - "give me a PNG of that diagram"
  - "rasterize it"
  - "convert to png and svg"
  - "make it a GIF for the email" / "animated version for the deck"

The slash command is a thin wrapper that delegates here — both paths run the same procedure below.

## Scope

Both formats are **diagram-only** — just the `<svg>` node. Editorial wrappers (header, summary cards, footer in `-full` variants) are intentionally dropped: the export deliverable is the diagram itself, suitable for Figma, slides, social cards, or blog images.

The SVG-only export keeps the source `<title>` and `<desc>` with the diagram. Their per-diagram and per-variant prefixed IDs keep accessible names unique when several figures share a page.

Inlining several exported SVGs in one host document also requires namespaced `<defs>` IDs (markers, patterns, gradients, filters, clip paths, masks, symbols). The export procedure prefixes those IDs with the source file slug and rewrites matching `url(#…)` / `href="#…"` references, so a light figure next to its `-dark` twin does not silently share arrowheads. The accessible-name guarantee alone is not enough.

If the user explicitly asks for "a screenshot of the whole page including the cards", that's a different request — fall back to a normal full-page screenshot via the user's OS or browser.

## SVG export procedure

**Prefer the packaged helper.** From this skill's directory run:

```
python3 scripts/export_svg.py <html-file> [<out.svg>]
```

That script is the source of truth for the transform below (CSS carry-forward, defs ID namespacing, rgba normalization, and the class-without-style gate). Reimplement only when the helper is unavailable; keep the behaviour identical.

### Manual algorithm (what the helper does)

1. Read the source HTML file.
2. Extract the **first** `<svg ...>...</svg>` block. Use a multiline regex anchored on `<svg` and `</svg>`. Most generated diagrams have only one SVG; if there are multiple, the first is the diagram (gallery files are an exception — see *Edge cases*).
3. Make it standalone:
   - Ensure the opening tag has `xmlns="http://www.w3.org/2000/svg"`. Add it if missing.
   - Ensure a `viewBox` is present. The skill's templates always include one; warn the user if absent rather than guessing.
   - Preserve `role="img"`, `aria-labelledby`, and the first-child `<title>` / `<desc>` exactly as authored.
   - Rewrite HTML-only attribute syntax as XML: a valueless attribute (`<g data-motion-item>`) becomes `data-motion-item=""`, and an unquoted value gets double quotes. Comments and CDATA sections stay as written.
   - Set `id="<slug>-root"` on the opening `<svg>` tag, where `<slug>` is the source basename without extension (e.g. `example-loop.html` → `example-loop`). This ID scopes carried CSS so several inlined figures do not leak rules into each other.
4. **Carry page CSS into the SVG.** Class-styled diagrams (the loop family, process, medallion, data-flow, and others) declare fills and type in the page `<style>` block — `.station`, `.hub`, `.node-name`, and so on. Extracting the bare `<svg>` without those rules yields black boxes. Copy the page's diagram rules into a `<style>` inside `<defs>`, then:
   - Strip CSS comments first, so a comment in front of a rule does not become part of its selector.
   - Re-scope `:root { … }` custom properties onto `#<slug>-root` so the figure keeps its own tokens.
   - Start selectors that begin at the `<svg>` element at the root instead: `svg .zone` becomes `#<slug>-root .zone` and `svg text` becomes `#<slug>-root text`. The exported root element is the `<svg>` itself, so `#<slug>-root svg .zone` would match nothing.
   - Prefix every other kept selector with `#<slug>-root ` (e.g. `.station` → `#example-loop-root .station`).
   - **Drop** page chrome: `*`, `html`, `body`, `main`, `h1`/`h2`/`h3`, `p`, `.frame`, `.eyebrow`, `.summary`, `.card(s)`, `.footer`, `.header`, and the bare `svg { min-width: … }` layout rule. Only the bare `svg` selector is layout; `svg .zone` and `svg text` are diagram rules (see above). Those must not follow a fragment.
   - Carry `color` and `font-family` from the dropped `body` rule onto `#<slug>-root`. SVG content inherits both: `stroke="currentColor"` reads `color`, and text without its own font rule reads `font-family`.
   - **XML-escape** the carried CSS text (`&` → `&amp;`, `<` → `&lt;`) before inserting it into the SVG. Rule bodies can contain XML-sensitive characters (e.g. `content: "R&D"`); a bare `&` makes the standalone file fail to parse.
5. Inject Google Fonts `@import` so the SVG renders with correct typography in a browser. **XML-escape the `&` separators as `&amp;`** — a standalone `.svg` is parsed as strict XML, where a bare `&` starts an entity reference and makes the whole file fail to parse. (Don't copy the raw URL from the HTML `<link href>`; that ampersand form is only valid in HTML.) Merge into the same `<defs>` `<style>` as the carried rules (don't add a second `<defs>`):
     ```svg
     <defs>
       <style>@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&amp;family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500;600&amp;family=Noto+Serif:ital@0;1&amp;family=Noto+Sans+KR:wght@400;500;600&amp;family=Noto+Serif+KR:wght@400&amp;family=Noto+Sans+TC:wght@400;500;600&amp;family=Noto+Serif+TC:wght@400&amp;display=swap');
       /* …scoped diagram rules… */
       </style>
       <!-- existing markers / patterns stay here -->
     </defs>
     ```
6. **Namespace `<defs>` IDs.** Prefix every referenceable defs ID — on `marker`, `pattern`, `linearGradient`, `radialGradient`, `filter`, `clipPath`, `mask`, and `symbol` — with `<slug>-`, and rewrite matching `url(#…)` and `href="#…"` / `xlink:href="#…"` references. Rewrite **longest-id-first** so `arrow-accent` is not clipped by a shorter `arrow` rule. Example: `id="arrow"` in `example-loop.html` becomes `id="example-loop-arrow"` with `marker-end="url(#example-loop-arrow)"`.
7. Normalize colors for strict SVG 1.1 consumers. This design system's tokens are authored as `rgba(...)` (see `style-guide.md`) and render correctly wherever colors are read as CSS — browsers, Figma, Illustrator. PowerPoint's SVG importer does not: it treats `rgba(...)` and `transparent` as unrecognized and paints them **opaque black**, turning a barely-there tint into a solid block that swallows the label inside it. The transform is lossless (every replacement renders identically to the original in a browser), so apply it to presentation attributes before writing the file:

   ```python
   import re

   svg = re.sub(
       r'(fill|stroke)="rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d*\.?\d+)\s*\)"',
       lambda m: '{0}="#{1:02x}{2:02x}{3:02x}" {0}-opacity="{4}"'.format(
           m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4)), m.group(5)
       ),
       svg,
   )
   svg = re.sub(r'(fill|stroke)="transparent"', r'\1="none"', svg)
   ```

   The `\s*` around each channel tolerates a spaced `rgba(45, 49, 66, 0.03)` as well as the compact `rgba(45,49,66,0.03)` the templates normally use; `\d*\.?\d+` accepts an alpha value with or without a leading zero (both `0.03` and `.03` appear in shipped tokens). Matching is scoped to the `fill="..."` / `stroke="..."` presentation attribute. Class-styled diagrams may still carry `rgba(...)` inside the embedded `<style>` block via custom properties (e.g. `--accent-tint`); that form is correct in browsers and in Figma/Illustrator, and is out of scope for this presentation-attribute pass. (A brand's onboarded palette in `style-guide.md` could in principle add a third notation such as `hsl()`; none exists in any shipped token today, so this pass doesn't handle it — extend the regex if one is ever introduced.)
8. **Gate:** if the exported SVG still contains `class=` but no diagram CSS rules, stop and fix the CSS carry step — that fragment will render as black boxes. A fonts-only `<style>` (Google Fonts `@import` with no rules) does **not** satisfy the gate.
9. Prepend `<?xml version="1.0" encoding="UTF-8"?>\n` so the file is well-formed XML.
10. Write to `<basename>.svg` next to the source (e.g. `example-architecture.html` → `example-architecture.svg`). Honour an explicit output path if the user provides one.

### Caveat to surface to the user

Tools that don't fetch remote fonts at import time (offline Illustrator, some Figma import paths, older SVG viewers) will substitute typography. The SVG renders correctly in any modern browser. For pixel-perfect portability, recommend the PNG export.

## PNG, GIF and MP4 — `scripts/export.py`

```bash
python3 scripts/export.py <slug>.html                       # <slug>.svg + <slug>.png at 2x
python3 scripts/export.py <slug>.html --png --scale 3       # just a 3x PNG (1–4, fractions allowed)
python3 scripts/export.py <slug>.html --png --transparent   # no paper behind the diagram
python3 scripts/export.py <slug>.html --gif --mp4           # step animation
python3 scripts/export.py <slug>.html --all                 # everything that applies
```

It needs headless Chrome (PNG and frames) and ffmpeg (GIF, MP4); both are
detected, and a missing one stops the export with a message rather than a
partial result. Nothing is installed automatically.

**PNG.** The standalone SVG (the same one `--svg` writes, carrying the brand's
tokens and fonts) is rendered in Chrome at exactly its viewBox size × `--scale`,
and the result is checked for that pixel size. The diagram only — no page title,
no prose alternative. The brand's `paper` fills the background by default,
because email clients paint transparency unpredictably (some of them black);
`--transparent` drops it for slides and docs with their own background.

**GIF and MP4.** Animation comes from the source's `step` fields, drawn as
`data-step="N"` (diagram-source.md §3). Frame N shows every element with
step ≤ N; elements without a step always show; `data-motion-decorative` overlays
never appear. Frames cross-fade (0.35s), each holds 1s, the complete diagram holds
2.5s, then the GIF loops. The MP4 is H.264 and suits slides and video embeds; the
GIF is for email and chat, capped at 1200px wide. A diagram with no steps has
nothing to animate, and `--gif`/`--mp4` say so rather than producing a still.

### Output naming

`<slug>.html` → `<slug>.svg`, `.png`, `.gif`, `.mp4`, written next to the source.

## Sizing the export

The PNG's pixel dimensions are the SVG's `viewBox` × `device_scale_factor`. So the size decision was already made when the diagram was drawn — see [`output-spec.md` §2](output-spec.md) for the presets. Export only picks the multiplier.

| Destination | Scale | Result from a 1280×720 `viewBox` |
|---|---|---|
| Docs, README, wiki | 2 | 2560×1440 |
| Slide deck (projected) | 2 | 2560×1440 |
| Print / PDF handout | 3 | 3840×2160 |
| Inline thumbnail, email | 1 | 1280×720 |

### Hitting an exact pixel size

When the user needs specific dimensions (an OG card at exactly 1200×630, a slide image at 1920×1080), compute the scale factor instead of guessing — `--scale` accepts fractional values:

```
scale = target_width / viewBox_width
```

A 960-wide `viewBox` at a 1200px target is `scale=1.25`. Two rules:

- **Never scale below 1** to hit a small target — that soft-focuses the type. Redraw at a smaller preset instead.
- **Never scale past 4** — beyond that you're upscaling a layout that was designed for a smaller canvas; redraw at `slide-16x9` or a print preset.

If the target aspect ratio doesn't match the `viewBox` aspect ratio, say so and offer to redraw at the matching preset. Padding or cropping a finished diagram to fit a frame is not an export operation — it breaks the 40px safe margin.

## Edge cases

- **Source is `assets/index.html`** (the gallery, multiple SVGs in one file): refuse the export and ask the user which specific diagram file they meant. Don't guess.
- **No `<svg>` block found**: the source isn't a diagram file. Tell the user; don't write anything.
- **Surrounding HTML matters to the user**: they want cards/header in the image. Tell them this skill exports diagrams only, and recommend a browser-based full-page screenshot (or a separate PDF print).
- **Source is missing fonts at runtime**: Chrome will substitute, and the PNG will look off. Check that the source HTML has the `<link href="...fonts.googleapis.com...">` tag in `<head>`. If absent, the file isn't from a current template — fix the source rather than working around it in export.

## What this command never does

- Modifies the source HTML.
- Adds export buttons or `<script>` tags. Static diagrams remain script-free; an already motion-enabled source may retain the scoped controller from [`animation.md`](animation.md), but export never injects another controller.
- Auto-emits `.svg` or `.png` alongside HTML generation. Manual on every call.
- Embeds an HTML wrapper (cards, headers) into the SVG via `foreignObject`. Too fragile across renderers.
