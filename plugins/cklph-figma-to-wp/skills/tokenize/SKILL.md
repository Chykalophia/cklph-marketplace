---
name: tokenize
description: Maximize reuse when building a design into WordPress/Elementor — bind to existing Kit globals, mirror existing-page widget conventions, and promote repeated sections into reusable templates. Use during a Figma-to-WP build to avoid one-off hardcoded values and duplicated layout.
---

# tokenize — reuse over invention

The difference between "looks AI-generated" and "looks designed" is reuse. Before generating, find
what already exists; while generating, bind to it; after, promote anything repeated into a reusable
piece. One source of truth per value, per pattern.

## 1. Bind values to the design system, not literals

- **Colors / typography** → reference the Elementor **Kit globals** by id (`__globals__`:
  `globals/colors?id=…`, `globals/typography?id=…`), not raw hex/px. Read the Kit first
  (`elementor-templates`); if a token is missing, add it to the Kit **once**, then reference it.
- **Spacing / radius / container width** → use the design's token steps consistently (8/12/16/24…),
  not eyeballed numbers (`figma-tokens`).

A hex pasted into 20 widgets drifts the day the brand color changes. A global referenced 20 times
updates everywhere, for free.

## 2. Mirror existing-page conventions

`el-tools.py tree` / `widgets` two or three existing pages before authoring. Match **their** choices:
which widget renders a button (theme widget vs Pro widget), how containers nest, which dynamic
WooCommerce/ACF widgets they use. **Patch the read-back JSON** of a comparable section rather than
writing a fresh tree — you inherit the conventions automatically.

## 3. Promote repeats into reusable pieces

If a section appears on multiple pages (a CTA band, a card grid, a newsletter block):
- Save it as an **Elementor template/global** and place/reference it, instead of pasting the JSON.
- For the html-widget `<style>` channel, factor shared rules so one edit propagates.

## 4. Keep the pipeline composable

These plugins mirror this principle — `cklph-wp` / `cklph-elementor` / `cklph-figma` / `cklph-visual-qa`
are each reusable on their own and bind together by name. Build site-specific glue (the `cwp`
connection alias, a project token map) **once per project**, in `./.cklph-wp` and a short notes file,
so the next page on the same site starts from reuse, not rediscovery.

## The test
Before writing a value or a layout block, ask: *does this already exist somewhere I can reference?*
If yes, reference it. If it's new but will recur, make it referenceable now. Only truly one-off values
get hardcoded.
