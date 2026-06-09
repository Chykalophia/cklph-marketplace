---
name: elementor-responsive
description: Make Elementor layouts work across desktop, tablet, and mobile — stacking columns, flex shrink, the WooCommerce gallery, nav-menu collapse, and overlapping headers. Use when a page is broken or cramped at tablet/mobile widths, content overflows, or a header/footer doesn't adapt.
---

# elementor-responsive — breakpoints that actually work

Elementor breakpoints: **tablet ≤1024px**, **mobile ≤767px** (`viewport_md`). Drive responsive
overrides from the html-widget `<style>` (see `elementor-styling`) with `@media` queries; most fixes
are a few targeted rules.

## Stack multi-column to one column

A 2-column row with fixed `%` widths + `flex-wrap:nowrap` won't stack — force it:

```css
@media(max-width:1024px){
  .elementor-element-<row>{flex-direction:column!important;column-gap:0!important;row-gap:32px!important}
  .elementor-element-<colA>,.elementor-element-<colB>{width:100%!important;max-width:100%!important}
}
```

## `min-width:0` — the flex-overflow fix

Flex items default to `min-width:auto`, so a column **won't shrink below its content** — a wide child
(a gallery, a long word, a fixed-width image) blows the layout past the viewport and clips everything.
Add `min-width:0` to the flex columns so they shrink to the viewport. This is the #1 cause of "text is
cut off on mobile."

## WooCommerce product gallery (flexslider)

A custom "thumbnails on the side" flex layout breaks WooCommerce's flexslider at narrow widths (it
sets fixed pixel slide widths that don't shrink → horizontal overflow). On mobile, revert to the
default block layout with hard caps:

```css
@media(max-width:767px){
  .woocommerce-product-gallery{display:block!important;overflow:hidden!important}
  .woocommerce-product-gallery .flex-viewport,.woocommerce-product-gallery ul.slides,
  .woocommerce-product-gallery ul.slides>li,.woocommerce-product-gallery img{max-width:100%!important;width:100%!important;height:auto!important}
  .flex-control-thumbs{display:flex!important;flex-wrap:wrap!important;gap:12px!important} /* thumbs in a row below */
}
```

## Nav-menu collapse (headers vs footers)

The Elementor nav-menu **`dropdown`** setting decides when it becomes a hamburger:
- **Header menu → `dropdown:'tablet'`** (collapse ≤1024).
- **Footer menu → `dropdown:'none'`** (NEVER collapse — footer links must stay as columns). A footer
  menu with no `dropdown` set defaults to collapsing → two stray hamburgers in the footer.

Full-width mobile dropdown: `@media(max-width:1024px){.elementor-nav-menu--dropdown{position:fixed;left:0;width:100vw;top:<header-h>px;background:#fff}}`.
**Do not** use the widget's `full_width:'stretch'` setting — it makes the dropdown items vanish.

## Overlapping (transparent / sticky) header

If the page has a large top padding (e.g. 210px) it's clearing an **overlapping** header. When you
reduce that padding for mobile, reduce it only enough to clear the *collapsed* header height (~90–120px)
— too little and the content slides under the logo. Hide the header's CTA button on mobile-closed if
the design shows just logo+hamburger; clone it into the open dropdown if the design wants it there.

## Always confirm at real widths
Use `cklph-visual-qa` — and note headless Chrome clamps its window to ~500px min, so "375px" shots
render at 500px and only show the left 375px (looks like overflow but isn't). Verify with the overflow
JS-probe, not the eye, before chasing a phantom.
