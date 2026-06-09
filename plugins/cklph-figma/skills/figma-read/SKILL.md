---
name: figma-read
description: Read a Figma design into code context — structure, visuals, exact specs, and asset images — via the Figma MCP. Use whenever the user shares a figma.com URL or asks to implement, translate, or match a design, before generating any markup or styles.
---

# figma-read — pull a design from Figma

Use the Figma MCP tools deliberately: a cheap **overview** first, then **exact specs** only for the
frame you're building. Always work from a **node-specific URL** (`?node-id=…`).

## Parse the URL

`figma.com/design/:fileKey/:name?node-id=12449-20837` → `fileKey=:fileKey`, `nodeId=12449:20837`
(convert the `-` to `:`). No `node-id`? Ask for a node-specific link — don't guess `0:1`.

## Which tool, in what order

1. **`get_metadata`** — cheap XML of the node tree (ids, names, sizes, `hidden="true"`). Use it to
   see structure and **which children are actually visible** (designers park hidden alternates in the
   same frame — don't build the hidden ones). Drill into child node-ids from here.
2. **`get_screenshot`** — the visual. Returns a short-lived **URL + curl command** (cheap); download
   and Read it. Only set `enableBase64Response` if you can't fetch URLs. Use `maxDimension` for detail,
   `contentsOnly` to isolate an icon.
3. **`get_design_context`** — the precise spec: reference code + tokens + asset download URLs. Set
   `excludeScreenshot:true` once you've already seen the visual (saves context). This is where exact
   colors, font sizes, line-heights, paddings, and gaps come from — read these, don't eyeball them.
4. **`get_variable_defs`** — the bound design tokens for a node (`Colors/Brand/…`, `Font/Size/…`,
   `Spacing/…`). The fastest path to the **token map** — see `figma-tokens`.

## Assets (icons, images)

`get_design_context` and `get_screenshot` return Figma asset URLs (valid ~7 days). Download with
`curl -o icon.png "<url>"`. For a clean single icon, `get_screenshot` the icon node with
`contentsOnly:true` rather than stitching the sub-vectors from design context.

## Discipline

- **Read the numbers, then verify the pixels.** The spec gives you values; a screenshot-compare
  confirms the result (see `cklph-visual-qa`). Matching the data ≠ matching the design.
- **One frame at a time.** Get the spec for the frame you're implementing now, not the whole file.
- **Skip hidden nodes.** `hidden="true"` in metadata = not part of this view.
- For multi-state components (navbar default/open, responsive variants), each state is its own
  node-id — pull them all before implementing the responsive behavior.
