# Diagram source — the JSON every diagram is drawn from

Every diagram starts as a **source**: one JSON file that records what the diagram
says *and* where everything goes — nodes, edges, groups, labels, coordinates,
sizes, brand, canvas, chart data, and the prose alternative. You decide the
layout once, write it here, then draw the SVG by following it.

The source is the single source of truth. The HTML is drawn from it and carries
an embedded copy; nothing else is authoritative.

- **New diagram:** write the source, then draw from it.
- **Edit:** change the source first, then redraw the parts that changed. Never
  edit the SVG alone — `check.py` fails a drawing that disagrees with its source.
- **Reuse** (new size, other type, a later update): read the source instead of
  re-deriving the layout from the SVG. To change brand or dark/light, swap the
  token block and `data-cklph-*`; the geometry does not change.

There is no renderer program. You are the renderer; the source is your
instructions. That is what makes a redraw repeatable instead of a re-think.

---

## 1. Where files go

A location the user names always wins. Otherwise:

| Where the request came from | Folder |
|---|---|
| Inside a project (a repo or client folder the work is about) | `<project>/diagrams/<type>-<slug>-<YYYYMMDD-HHMMSS>/` |
| No real project — a home directory, this skill's own repo, Desktop, claude.ai | `~/Documents/cklph-diagrams/<type>-<slug>-<YYYYMMDD-HHMMSS>/`, **and** publish the HTML as a Claude artifact where the app supports artifacts |
| No filesystem at all (claude.ai) | A Claude artifact only; offer the source JSON in the reply so it can be saved |

The timestamp is local time, chosen once when the request starts. Inside it:

```
<slug>.json          the source
<slug>.html          drawn from it (first mode in brand.modes)
<slug>-dark.html     only if brand.modes includes "dark" as well
<slug>.svg, .png     exported for every diagram (export.py)
<slug>.gif, .mp4     exported when the diagram has steps
```

Repairs during the same request reuse the folder. A later request — including an
update to this diagram — gets a **new** folder seeded with a copy of the source,
so every earlier version stays intact. Never overwrite a delivered folder.

---

## 2. Format (schema_version 1)

Unknown fields are errors, not ignored. Free text goes in `notes`; chart values
go in `data`.

```json
{
  "format": "cklph-diagram-source",
  "schema_version": 1,
  "id": "lead-intake",
  "type": "architecture",
  "pattern": null,
  "meta": {
    "title": "Lead intake pipeline",
    "desc": "Form submissions enter through an edge worker, queue, and are processed by a worker that writes to the CRM.",
    "eyebrow": "ARCHITECTURE",
    "created": "2026-10-01",
    "skill_version": "3.5-cklph"
  },
  "brand": { "slug": "cklph", "modes": ["light", "dark"] },
  "canvas": { "width": 784, "height": 480, "render_width": 784, "preset": "doc-inline" },
  "nodes": [
    { "id": "intake", "label": "Intake", "sublabel": "edge worker", "tag": "EDGE",
      "role": "backend", "cue": { "cat": "cat-1", "rx": 0 },
      "x": 32, "y": 112, "w": 136, "h": 88 },
    { "id": "worker", "label": "Worker", "sublabel": "retry x3", "tag": "PROC",
      "role": "focal", "cue": { "cat": "cat-2", "rx": 8 },
      "x": 416, "y": 112, "w": 136, "h": 88 }
  ],
  "edges": [
    { "id": "intake-worker", "from": "intake", "to": "worker", "label": "POST",
      "style": "default", "points": [[168, 156], [408, 156]], "label_at": [288, 132] }
  ],
  "groups": [],
  "legend": [ { "label": "Square = pipeline", "cue": { "cat": "cat-1", "rx": 0 } } ],
  "data": {},
  "alt": {
    "summary": "Same content as meta.desc, said for a reader.",
    "reading_order": "Left to right, starting at Intake.",
    "items": ["Intake (edge worker): receives the form POST.", "Worker: the focal node."],
    "connections": "Intake → Worker (POST).",
    "highlighted": "Worker is focal: the retry logic lives there."
  },
  "notes": "Optional free text for the next person to edit this."
}
```

| Field | Rule |
|---|---|
| `id` | Lowercase slug. Also the file stem and the `<title>`/`<desc>` id prefix. |
| `type` | One of the visual types (a `type-*.md` file name). |
| `pattern` | The semantic pattern from `semantic-patterns.md`, or `null`. |
| `meta.title` / `meta.desc` | Copied verbatim into `<title>` / `<desc>`. Title ≤ 60 characters. |
| `brand.slug` / `brand.modes` | Resolved per SKILL.md §0 before writing. A stub brand fails validation. |
| `canvas` | `width`/`height` become the viewBox (multiples of 4). `render_width` is the width the SVG holds on screen — the `min-width` that keeps the 12px floor true on a phone. |
| node `id` | `[A-Za-z][A-Za-z0-9_-]*`, unique across nodes, edges and groups. **Stable across edits** — renaming an id is a delete plus an add. |
| node `kind` | `box` (default), `marker` (a chart point or timeline event whose labels sit beside it), or `decision` (a diamond; label only, sized to fit ~70% of its width). |
| node `at` / `span` | Grid intent for `layout.py place`: `[col, row]` (0.5 steps allowed) and `[cols, rows]`. It writes `x y w h`. |
| node / edge `step` | 1–8: when it appears in an animation. Contiguous from 1, at most two nodes per step (animation.md). |
| node `role` | Treatment from SKILL.md §5: `focal`, `backend`, `store`, `external`, `input`, `optional`, `security`. |
| node `cue` | The non-colour cue that travels with a colour (A1): `cat`, `rx`, `dash`. |
| node `x y w h` | The box exactly as drawn. Structural boxes sit on the 4px grid; markers are exempt. |
| edge `points` | The drawn route as orthogonal corner points, first and last included. Rounded corners are drawing detail; the corners here are what is checked. |
| edge `label_at` | Centre of the label's mask. Keep labels ≤ 14 characters. The mask is `label_mask_width(label)` × 16px; draw it at exactly that size. |
| edge `style` / `dash` | `default`, `accent`, `link`; dash e.g. `"4,3"`. |
| `data` | Charts: the values and scale the positions come from (bars, totals, axes). The numbers here and the geometry must agree. |
| `layout` | `{"origin": [x, y], "cell": [w, h], "gap": [gx, gy]}`: the grid `at` and group `lane` are measured on. |
| group `lane` | A row index: `layout.py place` makes the group a full-width band around that row (swimlanes). |
| `alt` | The prose alternative (A4), rendered into `<details class="diagram-alt">`. |

---

## 3. Drawing conventions the checker relies on

- `<html data-cklph-brand="<brand.slug>" data-cklph-mode="light|dark">`
- `<svg viewBox="0 0 W H" data-render-width="R" style="min-width: Rpx">` inside a
  `.diagram-container` that scrolls (the templates already do this).
- Each node is `<g data-node="<id>">` whose **first** shape is its box at
  `x y w h` — a `<rect>`, or for `kind: "decision"` a `<polygon>` diamond whose
  bounding box is `x y w h` — and whose `<text>` children carry its text.
- Each edge is one `<path data-edge="<id>" d="…">` starting at `points[0]` and
  ending at `points[-1]`. Its label text appears as a `<text>` in the SVG.
- A node or edge with a `step` carries `data-motion-item data-step="N"` on its
  `<g>` / `<path>`, and so does that edge's label. `check.py` fails a mismatch;
  `export.py` builds the GIF/MP4 frames from these.
- The drawing sits between `<!-- cklph:draw:start -->` and
  `<!-- cklph:draw:end -->`. `scaffold.py` rebuilds everything outside them.
- The source is embedded before `</body>`:

  ```html
  <script type="application/json" id="cklph-diagram-source">{ …the source… }</script>
  ```

  Escape `<` as `\u003c` inside it. `python3 scripts/diagram_source.py` has an
  `embed_block()` helper; the embedded copy must equal the `.json` exactly.

Anything else in the SVG (axes, gridlines, legend, quadrant fills, annotations)
is drawn from `data` / `legend` and is not id-matched.

---

## 4. Check, then repair

```bash
python3 scripts/check.py diagrams/<folder>/<slug>.html      # every HTML you hand over
```

Gates, in order; the first failure stops the run: **source** (well-formed,
sound geometry, and the layout rules in `layout-budget.md`: text fit, label
placement, segment floors, attach points) → **embed** → **match** (drawing = source) → **a11y** →
**safety** → **browser** (real Chrome at 1440px and 375px: rendered text size,
text spilling out of boxes, overlapping text, labels on nodes, clipping,
sideways scroll). Each finding names what was measured and a fix.

**Repair rules:**

1. Fix in the **source** first, then redraw from it. A `match` failure means the
   drawing drifted: redraw from the source, or update the source if the change
   was intended.
2. Repair in gate order. A browser finding on a drawing that fails `match` is
   noise.
3. **At most two repair rounds.** If `check.py` still fails, stop and report the
   remaining findings verbatim with what you tried. Do not keep nudging
   coordinates blind.
4. **Report truthfully, and separately:** which gates passed, whether the browser
   gate ran or was skipped (never "passed" when skipped), and whether you
   actually looked at the result. "Checks passed" is not "I reviewed it".

---

## 5. Updating an existing diagram

1. Copy the old source into a new folder (§1) and edit it there.
2. Keep every surviving id; new things get new ids.
3. Redraw, run `check.py`, then summarise what changed:

   ```bash
   python3 scripts/diagram_source.py diff <old>/<slug>.json <new>/<slug>.json
   # added    node redis
   # removed  node notify
   # changed  node queue: label 'Queue' → 'Event queue'
   # moved    node crm
   ```

   If it refuses because the two share no id, it is a new diagram — say so
   rather than presenting it as an update.

An HTML that arrived without its `.json`: recover the source from its embedded
copy (`diagram_source.embedded(html)`), save it beside the HTML, and continue. A
diagram with no source at all (the inherited `assets/example-*.html`, anything
older than 3.1) has to have one written before it can be edited under this
contract.

---

## 6. Versioning

`schema_version` is an integer. Adding an optional field does not bump it;
renaming, removing, or changing the meaning of a field does. A migration writes a
new file and never rewrites the old one. `check.py` refuses a version it does not
read rather than guessing.
