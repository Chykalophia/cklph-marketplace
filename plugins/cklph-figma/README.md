# cklph-figma

Read designs from the **Figma MCP** into code context — structure, visuals, exact specs, and tokens.
The design-source layer for any Figma-to-code work; framework-agnostic.

## What this is

A disciplined way to consume Figma via its MCP: cheap overview first, exact specs only for the frame
you're building, tokens distilled into a reusable map, and the habit of **reading numbers but
verifying pixels**.

## What's inside (v0.3.0)

| Skill | Trigger |
|---|---|
| `figma-read` | A figma.com URL is shared, or "implement/translate/match this design". `get_metadata`/`screenshot`/`design_context`/`variable_defs`, asset download. |
| `figma-tokens` | After reading a frame, before styling — extract brand colors/type/spacing and bind to the target's existing design system. |
| `figma-write-check` | Before the first edit to a Figma file, when an edit fails, or when Figma seems read-only. Confirms the edit-capable connector is loaded, the account's seat, file access and a create-and-remove write probe, then verifies every write. |
| `design-md` | "Write a DESIGN.md", "design tokens file", "document this client's design system", "contrast check the tokens". Extracts tokens from the real source into the client repo's DESIGN.md (Google's format), one file per theme, lints it with the pinned `@google/design.md`, runs our contrast check, and diffs against the live CSS. |

The Figma skills are MCP-driven. Reading needs the Figma MCP server connected (authenticate via `/mcp`); writing needs Figma's hosted connector (`use_figma`), which `figma-write-check` checks for.

## Script

`scripts/contrast.mjs` is the plugin's first script. It checks WCAG contrast for text and UI color
pairs, from a JSON list or a DESIGN.md's `components`. It composites alpha over the real canvas and
uses 4.5:1 for normal text and 3:1 for large text and UI edges, which the Google linter does not.
Node 22, no dependencies. `node scripts/contrast.mjs --help` prints usage. Tests:
`node --test plugins/cklph-figma/tests/*.test.mjs`, run in CI.

## Composes with

- **cklph-visual-qa** — verify the rendered result against the Figma screenshot.
- **cklph-elementor** — bind tokens to the Elementor Kit's globals.
- **cklph-figma-to-wp** — the orchestrator that runs the full design→build→verify loop.
