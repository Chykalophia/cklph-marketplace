# Elementor styling gotchas (verbatim, battle-tested)

Each of these silently swallowed a change until diagnosed. Diagnose with the DOM/CSS, not assumptions:
`curl '<url>?v=N'` the rendered HTML, and inspect the generated `…/uploads/elementor/css/post-<id>.css?cb=N`.

## custom_css emits for widgets, not containers
Per-element **Custom CSS** (Elementor Pro) renders into the post CSS for **widget** elements. For
**container** elements it does **not** reliably emit. Confirmed by grepping the generated CSS for the
element id + rule and finding it absent. → Use an **html-widget `<style>`** instead (always emits,
because it's literal page markup). Set the html widget `display:none`; its `<style>`/`<script>` still run.

## Flex gap is variable-driven
Container rule looks like:
```
.elementor-element-XXXX{--display:flex;--flex-direction:column; … }
```
and the gap resolves through `--row-gap` / `--column-gap` / `--gap`. So:
- `.elementor-element-XXXX{gap:12px!important}` may lose to the var-based shorthand.
- Set `--row-gap:12px!important;--column-gap:24px!important` (and `row-gap` as belt-and-suspenders).
- The **native gap control** on this Elementor version stores `flex_gap` as
  `{"column":"12","row":"12","unit":"px","isLinked":true}` — and the alignment keys are
  `flex_justify_content` / `flex_align_items` (the older `{unit,size}` `gap` value may be ignored).

## Loose spacing = inner margins, not the gap
Symptom: rows in a list sit ~50px apart though you set the container gap to 12px. Cause: each item's
inner `<p>` (text-editor) and/or `.elementor-widget-container` carry default margins that **add to**
the gap. Setting the gap higher makes it worse. Fix:
```
.elementor-element-<container> > .elementor-element{margin:0!important;padding-top:0!important;padding-bottom:0!important;min-height:0!important}
.elementor-element-<container> .elementor-widget-container{padding:0!important;margin:0!important}
.elementor-element-<container> .elementor-widget-text-editor p{margin:0!important}
```

## Horizontal alignment / nested-container padding
Nested containers inherit the **Kit default container padding** (Site Settings → Layout), invisible in
the element's own settings. Each nesting level indents content further, while a sibling **widget**
(e.g. an accordion) sits at the column edge → three different left edges. Measure them, then zero
horizontal padding across the subtree:
```
.elementor-element-<col> .e-con{padding-left:0!important;padding-right:0!important;margin-left:0!important;margin-right:0!important;--padding-left:0px!important;--padding-right:0px!important;width:100%!important;max-width:100%!important}
```
`.e-con` = Elementor container class; accordion items (`.elementor-accordion-item`) are **not** `.e-con`,
so their card border + inner padding are preserved.

## Reading control names from source
The fastest way to get an exact setting key (and its CSS selector) is the widget PHP:
```
ssh host "sed -n '190,345p' /www/wp-content/plugins/elementor-pro/modules/woocommerce/widgets/product-add-to-cart.php"
ssh host "grep -nE \"add_control\(|'name' =>\" .../widgets/<widget>.php"
```
Examples found this way: add-to-cart button is `button_bg_color` (+`button_text_color`,
`button_bg_color_hover`), layout is `layout: stacked` + `alignment: justify`; nav-menu collapse is
`dropdown: 'tablet'|'none'`; accordion toggle side is `icon_align: 'right'`, icons `icon_color`.

## Injecting working JS (e.g. a quantity stepper, a cloned CTA)
The html widget can also carry `<script>`. Use it to enhance widget markup Elementor can't
(e.g. add −/+ buttons to a WooCommerce quantity, or clone a header button into the mobile dropdown).
Guard with a `dataset` flag + a `setTimeout` fallback so it runs after the widget's own JS.

## Fixed-width vs max-content
`width:max-content`/`fit-content` is flaky inside Elementor flex holders (content overflowed the box).
Prefer an explicit `width:Npx` + `justify-content:space-between` for compact fixed-size controls.
