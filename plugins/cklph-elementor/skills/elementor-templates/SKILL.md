---
name: elementor-templates
description: Work with Elementor theme-builder templates and the global Kit — single-product/header/footer templates, display conditions, safe-copy editing, template preview, and reusing global colors and typography. Use when editing a header/footer/single template, when a template change doesn't appear, or when matching brand colors and type.
---

# elementor-templates — theme builder + the Kit

Theme-builder templates (header, footer, single-product, archive…) are `elementor_library` posts with
a `_elementor_template_type` and **display conditions** that bind them to locations. The Kit holds the
site's global colors and typography. Edit templates on a **safe copy**, and **reuse the Kit** rather
than hardcoding brand values.

## Find what actually renders (not what has the condition)

The template with a condition is **not always the one rendering** — confirm against the page HTML:

```bash
curl -s '<any-page>?v=1' | grep -oE 'data-elementor-type="(header|footer)"[^>]*data-elementor-id="[0-9]+"'
```

Edit the id that appears there. (Real case: `471` had the `include/general` condition but `469` rendered.)

## Display conditions + cache

Conditions live in `_elementor_conditions` (e.g. `["include/product"]`, `["include/general"]`). After
changing them, **rebuild the cache** or nothing takes effect:

```bash
cwp eval '\ElementorPro\Modules\ThemeBuilder\Module::instance()->get_conditions_manager()->get_cache()->regenerate();'
```
A template only applies when `post_status=publish`. Set a preview target so the editor renders real
data: `_elementor_page_settings = {"preview_type":"single-product","preview_id":<id>}`.

## Safe-copy editing (don't edit a live template blind)

Duplicate to a **draft with no conditions**, build/verify there, then publish + move the condition.
(`cwp` is cklph-wp's script, on PATH per the cklph-wp README. It quotes each argument for the remote
shell, so the title below arrives intact.)

```bash
ID=$(cwp wp post create --post_type=elementor_library --post_status=draft --post_title='Single (draft)' --porcelain)
cwp wp post meta update $ID _elementor_template_type product
cwp meta-read 218 _elementor_data base.json && cwp meta-write $ID _elementor_data base.json
# (deliberately DO NOT copy _elementor_conditions — keeps the draft inert)
```

**Seeing the safe copy.** An inert draft renders on no public URL, and screenshot tools (`shot` in
cklph-visual-qa) are logged out, so they can't load a draft or `?preview=true`. To screenshot it, on a
**staging** site and with the user's go-ahead (it is a publish):

1. Create a throwaway, **published** test target the template can apply to: a test page, or for a
   single-product template one test product.
2. Publish the copy with a display condition that includes **only that one test object**. Copy the
   exact condition string format from an existing `_elementor_conditions` value on the site
   (`cwp wp post meta get <id> _elementor_conditions --format=json`) rather than guessing it.
3. Regenerate the conditions cache (above). Confirm the test URL renders the copy with the
   `data-elementor-id` check above (a specific condition should outrank the live template's broad one),
   then screenshot that URL, cache-busted.
4. When it matches, ship it (move the real condition), then delete the test object.

Never do this on production: a published condition is live for every visitor of the test URL.

## The Kit — reuse, don't redefine

```bash
KIT=$(cwp wp option get elementor_active_kit)
cwp wp post meta get $KIT _elementor_page_settings --format=json   # system_/custom_ colors + typography
```

Read the `custom_colors` (`{_id, color}`) and `custom_typography` (`{_id, title, font...}`) ids and
**reference them** from widgets via `__globals__`:
`"__globals__": {"title_color": "globals/colors?id=56d158b", "typography_typography": "globals/typography?id=f08aae5"}`.
If the brand system is already in the Kit (it usually is), **do not touch the Kit** — referencing keeps
every page consistent and honors "don't break existing." Add only *custom* globals if something's missing.

## Header/footer responsive nuances
Live in `elementor-responsive` — nav-menu `dropdown` (collapse for headers, never for footers),
transparent/overlapping headers needing page top-padding, and per-breakpoint stacking.
