---
name: translate
description: Run the end-to-end Figma-to-Elementor translation of a specific frame into a page or template, step by step with verification gates. Use once connected and scoped, to actually build a design into Elementor and iterate it to a pixel match.
---

# translate — design frame → Elementor, verified

Execute the build as a gated loop. Don't generate the whole page and hope — build the section, write
it, **look at it**, fix, move on. Invoke the focused skills by name at each step (see `start-here`).
`cwp`, `el-tools.py` and `shot` come from cklph-wp, cklph-elementor and cklph-visual-qa. This plugin's
`${CLAUDE_PLUGIN_ROOT}` points here, not at them, so they must be on PATH (this plugin's README,
"Scripts on PATH").

## Steps

1. **Scope the frame.** Get the design: `figma-read` (`get_metadata` → screenshot → `get_design_context`),
   noting which children are visible vs `hidden`. Extract tokens (`figma-tokens`) and check the Kit for
   matching globals (`elementor-templates`). One frame at a time.

2. **Learn the target.** `cwp meta-read` the live target + 1–2 sibling pages; `el-tools.py tree` /
   `widgets` them. Decide which existing widgets to reuse (Pro WooCommerce widgets, the theme's
   custom widgets) and which globals to reference. Mirror the site, don't invent.

3. **Safe copy.** Duplicate the target template to a **draft with no display conditions**
   (`elementor-templates`). All building happens here — the live site is untouched until it matches.
   Plan how you'll see it: `shot` is logged out and can't load a draft. On **staging**, with the user's
   go-ahead, publish the copy scoped to one throwaway test page/product ("Seeing the safe copy" in
   `elementor-templates`). Without a staging site, stop and ask how the user wants to preview.

4. **Generate / patch.** Build `_elementor_data` for the section, reusing the existing structure where
   possible (patch the read-back JSON rather than authoring from scratch). Bind colors/type to Kit
   globals via `__globals__`. Apply gaps/alignment/responsive via the **html-widget `<style>`** channel
   (`elementor-styling`). `el-tools.py validate`, then `cwp meta-write`, then `cwp wp elementor flush-css`.

5. **Verify (gate).** `visual-verify`: screenshot the test URL from step 3 (cache-busted) against the
   Figma frame, crop the section, compare concretely (presence/order → alignment → spacing → type → color → radius → icons). Fix the
   deltas and re-capture. **Do not advance while a delta remains.** For a hard match, run the
   `visual-reviewer` agent.

6. **Responsive (gate).** Repeat verify at tablet (~800) and mobile (~500, Chrome's floor) and any
   open/closed nav states. Apply `elementor-responsive` fixes (stacking, `min-width:0`, gallery, nav
   collapse). Re-verify each breakpoint.

7. **Ship.** Once every breakpoint matches, move the real display condition onto the new template
   (or write the layout onto the live one), then **regenerate the conditions cache** (the
   `elementor-templates` "Display conditions + cache" command) so the new routing takes effect.
   Confirm on the real front-end URL, cache-busted, with the `data-elementor-id` check from
   `elementor-templates`. Only then delete the test page/product.

## Guardrails
- **A live template controls every matching page** — never edit it blind; use the safe copy, confirm,
  then swap. Writes to shared/staging hosts may need explicit user authorization.
- **Functional widgets are decisions** (e.g. a working WooCommerce add-to-cart vs a styled link) —
  surface the choice, don't silently pick.
- **Don't redefine the Kit.** If the brand system is already there, reference it; honor "don't break
  what's built."
- **Pixels over numbers, every pass.** The data being right is necessary, not sufficient.
