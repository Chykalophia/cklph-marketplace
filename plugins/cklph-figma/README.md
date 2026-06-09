# cklph-figma

Read designs from the **Figma MCP** into code context — structure, visuals, exact specs, and tokens.
The design-source layer for any Figma-to-code work; framework-agnostic.

## What this is

A disciplined way to consume Figma via its MCP: cheap overview first, exact specs only for the frame
you're building, tokens distilled into a reusable map, and the habit of **reading numbers but
verifying pixels**.

## What's inside (v0.1.0)

| Skill | Trigger |
|---|---|
| `figma-read` | A figma.com URL is shared, or "implement/translate/match this design". `get_metadata`/`screenshot`/`design_context`/`variable_defs`, asset download. |
| `figma-tokens` | After reading a frame, before styling — extract brand colors/type/spacing and bind to the target's existing design system. |

No scripts — it's MCP-driven. Requires the Figma MCP server connected (authenticate via `/mcp`).

## Composes with

- **cklph-visual-qa** — verify the rendered result against the Figma screenshot.
- **cklph-elementor** — bind tokens to the Elementor Kit's globals.
- **cklph-figma-to-wp** — the orchestrator that runs the full design→build→verify loop.
