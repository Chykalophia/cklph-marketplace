# Checkout, Cart, Mobile & Accessibility

Extends the five-gate model past the PDP. The gate model's "De-risk" and "Act" gates live here at the cart/checkout, on mobile, and for assistive-tech users.

## Checkout & cart (Baymard)
- **Average cart abandonment is 70.22%** (Baymard, 50-study average). https://baymard.com/lists/cart-abandonment-rate
- **Reasons users abandon (2025, excluding "just browsing"):** extra costs too high **39%** · delivery too slow **21%** · don't trust site with card **19%** · forced account creation **19%** · checkout too long/complicated **18%** · unsatisfactory returns policy **15%** · errors/crashes **15%** · couldn't see total up-front **14%** · too few payment methods **10%**. [primary]
- **Form length:** ideal checkout ≈ **12–14 form elements (7–8 fields)**; the average US checkout shows **23.48 elements (14.88 fields)** by default — most can cut 20–60%. [primary]
- **Prize:** an ideal checkout = ~**35.26% average uplift** for large sites; the average site has ~**39** checkout improvement areas. [primary]
- **Guest checkout** must be the prominent default; mark **both required and optional** fields (when only optional were marked, 32% of users failed a required field). [primary]
- **GoodUI checkout patterns to test** (names + directions; cite by name, exact % is paywalled): multi-step checkout (#9, publicly +5.25%), de-emphasize/hide the coupon field (#1), visible payment options (#138), confirmed-selection states (#124), single- vs double-column fields (#123). https://www.goodui.org/patterns/screen/checkout/
- **Surface total cost (incl. shipping/duties) on the PDP/cart**, not just at the final step — the #1 abandonment driver.

## Mobile (the biggest structural leak for most stores)
- Desktop converts ~**3.9%** vs mobile ~**1.8–2.85%**; mobile is ~**77% of traffic but ~55–58% of sales**; mobile cart abandonment **85.65%** vs desktop **69.32%**. [directional, aggregators 2025]
- Levers: thumb-zone primary CTAs, sticky bottom add-to-cart, numeric keypad for card/phone fields, pinch/tap gallery (40% of sites fail mobile gestures — Baymard), no hover-dependent UI, compress steps.

## Accessibility as CRO (and as legal exposure)
- **European Accessibility Act enforced June 28, 2025** across the EU; requires **WCAG 2.1 AA** and applies to any business selling to EU consumers (non-EU stores included). Existing services have until June 2030 but should publish an accessibility statement now. [directional-legal]
- US **ADA web-accessibility lawsuits ~5,100+ in 2025, ~70% targeting ecommerce**, disproportionately retailers under $25M. [directional]
- Every defect is both legal risk and a conversion blocker: label every form field, keyboard-navigable flows, visible focus states, 4.5:1 text contrast, alt text on product imagery, `aria-live`/`role="status"` on price and inventory so variant changes are announced, accessible modals (focus trap + Esc), 44×44px touch targets. Treat accessibility as reinforcement of the De-risk and Act gates.

## Search, navigation & merchandising
- On-site search users convert **2–5× non-searchers** (vertical-dependent) — audit relevance, synonyms, typo tolerance, and zero-results handling. [directional/primary mix; NN/g faceted-search report is primary]
- Personalization drives **5–15% revenue lift** (McKinsey); product recommendations ≈ **26–31% of ecommerce revenue** from a small share of traffic. Map recs to Desire + AOV, search relevance to Comprehend + Act.

## Email/retention as a conversion lever (pairs with OOS capture)
- Abandonment isn't only a page fix; a triggered flow recaptures a measurable slice. Klaviyo 2025 abandoned-cart benchmarks: ~50% open, ~6% click, **~3.3% conversion**; **3-email flows vastly outperform single sends**. Build the set: welcome, browse-abandon, cart/checkout-abandon, post-purchase, win-back, back-in-stock. [directional, Klaviyo]

## Canonical external sources for this domain
Baymard (9-theme taxonomy: Homepage/Category, On-Site Search, Product List, Product Page, Cart & Checkout, Accounts, Accessibility, Mobile Web, Mobile App), Nielsen Norman Group (1,073 ecommerce guidelines; 108 product-page guidelines), GoodUI (141 patterns from 625 A/B tests), CXL/Speero. GitHub is weak for CRO checklists — weight these.
