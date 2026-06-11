# Shopify-Specific Hooks

Concrete handles for auditing and improving a Shopify store. Names of apps are examples, not endorsements.

## Pulling first-party data (ShopifyQL via analytics)
If a Shopify analytics tool/MCP is connected, these queries establish the baseline:
- Funnel + CVR: `FROM sessions SHOW sessions, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout, conversion_rate SINCE -365d UNTIL today`
- Device split: `FROM sessions SHOW sessions, sessions_that_completed_checkout, conversion_rate GROUP BY session_device_type SINCE -90d UNTIL today`
- Traffic source: `FROM sessions SHOW sessions GROUP BY referrer_source SINCE -90d UNTIL today ORDER BY sessions DESC`
- Top products: `FROM sales SHOW gross_sales, net_sales, orders GROUP BY product_title SINCE -90d UNTIL today ORDER BY gross_sales DESC`
- AOV / returns: `FROM sales SHOW orders, gross_sales, discounts, returns, net_sales, total_sales, average_order_value SINCE -90d UNTIL today`
Run both 90-day and 365-day windows; a small store's 90-day data can be thin. Compute add-to-cart rate = cart-adds / sessions.

## Theme architecture (where PDP problems live)
- PDP is assembled in `templates/product*.json` (`main` section block order) + `sections/main-product*.liquid` + snippets (`product-form`, `product-images`, `variant-*`, `gallery`).
- **Watch for fragmentation:** many parallel product templates (`product.json`, `product.feature-line.json`, `product.legacy.json`, etc.) mean any fix must be applied in several places or it's inconsistent. Recommend consolidating to one metafield-driven template; build a reference PDP, validate, then roll out.
- **Common buried-ATC pattern:** the `buy_buttons` block sits below short description, tabs, and filler text lines in `block_order`. Reorder so title→rating→price→options→ATC lead.
- **Empty tabs:** `tab` blocks with `content:""` (e.g., "Size & Fit", "Shipping & Returns") are dead slots for the #1 objections — fill them (ideally from metafields, per-style).
- **Sticky ATC:** many themes use a desktop sticky info column (`product-single__sticky`) but no **mobile** sticky add-to-cart bar — add one.
- **Variant image sync:** ensure selecting a color swaps the hero image; if each color is a separate product URL, unify the front-end swatch component so it reads as one configurable product.

## Conversion app ecosystem (verify what's already installed before recommending new)
- **Reviews:** Judge.me, Okendo, Loox (photo/video-first), Yotpo, Stamped. (A store may already have one installed but empty/showing sample data — that's a *seeding* problem, not a tooling gap.)
- **Fit/sizing:** Kiwi Sizing (lightweight, fits small/mid stores), True Fit, Fit Analytics (enterprise).
- **Back-in-stock:** Appikon "Back in Stock", Notify Me, Klaviyo Back-in-Stock.
- **BNPL:** Shop Pay Installments (Affirm), Klarna, Afterpay.
- **AR/3D:** Fibbl, Shopify AR/3D models. Treat AR as a desire/engagement lever, not a fit solution; measure its own conversion impact before crediting it.
- **Speed:** audit theme JS/3rd-party tags; serve WebP/AVIF; lazy-load; the configurator must not wreck LCP/INP.

## Implementation order for a redesign
1. Analytics hygiene (clean segments) so tests are measurable.
2. Quick wins via theme settings/metafields (content, reorder, fill tabs, seed reviews).
3. Build a single reference `product` template; A/B test vs current.
4. Roll out; add structural pieces (configurator, fit finder, cross-sell).
