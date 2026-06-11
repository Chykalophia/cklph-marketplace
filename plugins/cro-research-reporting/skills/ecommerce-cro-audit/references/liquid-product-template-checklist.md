# Shopify Liquid: Clean, Conversion-Optimized Product Template — Build Checklist

Current as of Shopify Dawn v15.4.1 (Dec 2025) and shopify.dev best-practice docs. Use when building or consolidating a Shopify PDP in Liquid.

## Tooling (get this right first)
- `Shopify/theme-check` is **ARCHIVED (Jul 2024)** — do not cite it as current. The linter/formatter/LSP now lives in **`Shopify/theme-tools`**, run via **`shopify theme check`** (Shopify CLI), the online Code Editor, and the VS Code extension. Gate CI with `--fail-level`. Format with `@shopify/prettier-plugin-liquid`.
- Theme Store performance gate: **min average Lighthouse 60** (mobile) across home/product/collection.

## Architecture (Online Store 2.0)
- JSON templates + a `main-product` section with an ordered `block_order`; merchants add/remove/reorder **blocks** in the editor. You cannot add/remove static sections from Liquid templates — only JSON.
- Build PDP info as **blocks**, not hardcoded, so merchants reorder. Include a `"type": "@app"` block (render via `{% content_for 'blocks' %}` or Dawn's `{% when '@app' %}{% render block %}`) so review/upsell/subscription apps drop in.
- Consolidate: one canonical product template driven by metafields/variants beats many near-duplicate templates.

## Conversion-priority block order (Dawn's default is already sound)
vendor → title → caption(subtitle metafield) → **rating** → price (+ BNPL) → variant_picker → quantity → **buy_buttons (ATC)** → short value/highlights → collapsible rows (Fit, Materials, Shipping) → value/story → reviews → cross-sell. Keep the ATC above the fold; never bury it under empty tabs/filler.

## Dynamic data via metafields/metaobjects (fixes "empty tabs")
- Drive per-product Size & Fit, Materials, Care, Dimensions from **metafields surfaced as dynamic sources** in collapsible-row blocks (Dawn ships these rows ready).
- For structured lists (e.g., materials), use a **metaobject** + `list.metaobject_reference`. Respect limits: ≤100 dynamic sources/template, ≤50/setting. Use correct setting↔metafield pairings.

## Variant / configurator UX (modern architecture)
- Render **one selector per option** from `product.options_with_values` (not one giant variant `<select>`).
- Support both deep-link formats: legacy `?variant=[id]` and newer `?option_values=[id1],[id2]`. `product.selected_variant` can be **null** if the combo has no variant — handle it.
- On every change, update **media + price + availability/inventory + selector state + URL**. Sync gallery to the variant's `featured_media`.
- Use swatches via `value.swatch.color.rgb` / `value.swatch.image`. Mark unavailable options with visually-hidden "sold out or unavailable" text.
- Combined listings: `product.variants` caps at **250**; combined listings reach ~2,000 via child products; sibling swap uses `product_option_value.product_url`.

## Performance
- Render images with the `image_tag` filter (auto `srcset`) + explicit `width`/`height` (prevents CLS). LCP/hero image: eager + `fetchpriority="high"`; everything else `loading="lazy"`. Never lazy-load the LCP image.
- WebP/AVIF: served automatically by the Shopify CDN via `image_url` — just request appropriate `width:`.
- JS budget ≤16KB minified per asset; IIFE-wrap injected scripts; `defer`/`async` all scripts; no React/Vue/jQuery in themes. ≤2 preload hints/template (reserve for above-the-fold CSS or the LCP image). `{% stylesheet %}` CSS is subset per render tree — favor modular bundled assets over one global stylesheet.
- Liquid is NOT rendered inside `{% javascript %}`/`{% stylesheet %}` — pass data via `data-*` attributes; one of each tag per file.

## Accessibility (load-bearing on PDPs)
- `role="status"` + `aria-live` on price, inventory, and SKU containers (announce variant changes).
- Real `<input type="radio">`/`<select>` with `<label>`/`<legend>` for options; sale price marked up with visually-hidden context; ATC is a `<button>`; targets ≥44×44; contrast 4.5:1 body / 3:1 large; alt on every image (`alt=""` for decorative); modals get `role="dialog"` + focus trap + Esc.

## Sticky add-to-cart
- Desktop: CSS `position: sticky` info column (Dawn's `enable_sticky_info` → `product__column-sticky`), zero JS.
- Mobile: a separate bottom sticky ATC bar revealed on scroll past the inline ATC (intersection-observer; keep within the JS budget). Dawn does not ship this by default — it's the single highest-impact mobile PDP pattern to add.

## Ship checklist
`shopify theme check` clean · Prettier-formatted · Lighthouse CI ≥60 (aim 90+) · images have width/height + correct lazy/eager · variant change updates media/price/availability/URL · metafield-driven tabs populated · app blocks supported · mobile sticky ATC present · a11y checks pass.

Sources: github.com/Shopify/dawn, github.com/Shopify/theme-tools, shopify.dev best-practices (performance, accessibility, sections/blocks, variants), dynamic-sources & combined-listings docs.
