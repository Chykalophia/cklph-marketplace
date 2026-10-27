# cklph-figma-to-wp

The **orchestrator** for translating a Figma design into a WordPress/Elementor page or template.
Thin glue over the focused plugins — it sequences them into a gated, verify-every-pass loop.

## What this is

The pipeline distilled from real client builds (single-product template, header, footer — Figma →
Elementor, pixel-matched across desktop/tablet/mobile). It does not re-implement the layers; it
**routes** to them and enforces the two rules that make the difference: reuse over invention, and
trust pixels over numbers.

## What's inside

| Skill | Trigger |
|---|---|
| `start-here` | Start of any "build this Figma design in WP/Elementor" task — sets up the pipeline + routing. |
| `translate` | Once connected/scoped — run the end-to-end frame→Elementor build with verification gates. |
| `tokenize` | During a build — bind to Kit globals, mirror existing conventions, promote repeats into reusable pieces. |

## Requires (the layers it glues)

- **cklph-wp** — wp-cli over SSH + the `cwp` wrapper.
- **cklph-elementor** — `_elementor_data` model, styling, templates, responsive + `el-tools.py`.
- **cklph-figma** — read the design + tokens.
- **cklph-visual-qa** — screenshot-compare loop + the `visual-reviewer` agent.

Install all four; the pipeline assumes them. Each is also useful standalone — pick the subset you need.

### Scripts on PATH

This plugin ships no scripts; its skills call the other plugins' scripts by bare name: `cwp`
(cklph-wp), `el-tools.py` (cklph-elementor) and `shot` (cklph-visual-qa). Put each plugin's
`scripts/` directory on PATH once, as each of those READMEs describes, or call the scripts by full path:

```bash
export PATH="<cklph-wp dir>/scripts:<cklph-elementor dir>/scripts:<cklph-visual-qa dir>/scripts:$PATH"
```

## The loop

connect → read design → learn the site → build on a safe copy → **verify vs pixels** → responsive →
ship. Never advance a gate while a delta remains.
