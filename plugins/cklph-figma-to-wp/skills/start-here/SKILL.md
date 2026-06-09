---
name: start-here
description: Entry point for translating a Figma design into a WordPress/Elementor page or template. Use at the start of any "build this Figma design in WP/Elementor" task to set up the pipeline and route to the right plugin for each step.
---

# start-here — the Figma → WP/Elementor pipeline

Translating a design into Elementor is a **loop**, not a one-shot generate. Set up the connection,
learn the site, build on a safe copy, and **verify against the pixels every pass**. This plugin is thin
glue — each step lives in a focused plugin; invoke those skills by name.

## The pipeline

1. **Connect + profile** — wire up wp-cli over SSH (one kept-open connection) and load/refresh the
   site's knowledge base. → `wp-connect`, `site-profile` (cklph-wp).
2. **Read the design** — structure, specs, tokens; skip hidden alternates. → `figma-read`, `figma-tokens` (cklph-figma).
3. **Learn the site** — `tree` two or three existing pages; read the Kit; record findings in the
   profile. Write code for the *installed* versions. → `elementor-data`, `elementor-templates`
   (cklph-elementor); `tokenize` (this plugin); `version-docs` (cklph-wp).
4. **Build on a safe copy** — duplicate the target template to an inert draft; generate/patch
   `_elementor_data`; write; `flush-css`. → `elementor-data`, `elementor-styling`, `elementor-templates`.
5. **Verify visually** — screenshot vs the Figma frame; fix; repeat. → `visual-verify`, `visual-reviewer` (cklph-visual-qa).
6. **Go responsive** — re-verify tablet/mobile (and open/closed states for nav). → `elementor-responsive`.
7. **Ship** — move the display condition / publish once it matches. → `elementor-templates`.

## The two rules that matter most
- **Reuse over invention.** Read the existing pages and the Kit first; mirror their conventions and
  reference their globals. Generic markup reads as AI-generated; native widgets + design tokens read as
  designed. → `tokenize`.
- **Trust pixels, not numbers.** Matching the spec values is not matching the design. End every pass
  with a screenshot comparison, per breakpoint. → `visual-verify`.

## Drive it
Run the loop directly, or use `translate` (this plugin) for the step-by-step orchestration. For a
high-stakes match, hand the verify step to the `visual-reviewer` agent for an adversarial pass.

If a plugin in the chain isn't installed, install it (`cklph-wp`, `cklph-elementor`, `cklph-figma`,
`cklph-visual-qa`) — the pipeline assumes all four.
