# Diagnostics & Benchmarks

## Conversion benchmarks by tier (judge against the right one)
All figures 2024–2026; treat platform/vendor figures as directional.

| Metric | Benchmark | Source |
|---|---|---|
| All-industry conversion | ~2.5% | Statista / Smart Insights |
| Fashion/apparel (Shopify) | ~1.9% (top 20% > 4.3%) | Shopify, 2026 |
| Footwear | ~2.2% (capped by fit uncertainty) | Centra, 2024 |
| Luxury / high-AOV | **~0.8–1.5%** (lowest-converting tier) | Statista (luxury 0.9%), 2024 |
| Add-to-cart rate | ~7.5% of sessions | directional synthesis |
| Cart abandonment | **70.22%** avg | Baymard (50 studies) |
| Checkout completion lift from better design | up to ~35% | Baymard |

- **#1 checkout-abandonment cause for years: unexpected extra costs (shipping/tax/duties) — ~48%.** Surface total cost on the PDP, not at checkout. (Baymard.)
- Implication: for a premium store, set KPIs against luxury (~1%), and track **add-to-cart rate** and **revenue-per-visitor** as the real scorecard (luxury wins on AOV, not volume).

## Traffic-quality caveat (read before reacting to a CVR)
A conversion rate is a fraction — a polluted denominator makes it lie. Before concluding "the page is broken," check the traffic shape:
- **Red flags:** 80%+ "direct", desktop-dominant in a mobile-first category, a device segment converting ~0 over thousands of sessions, near-zero email traffic. These suggest bot/junk/"dark" traffic inflating sessions.
- **The robust signal:** the **add-to-cart rate** (and absolute count of cart-adds) is far harder to explain away than the headline CVR. If ATC is stable across windows and far below norm, the page problem is real even if the CVR overstates it.
- **Action:** recommend analytics hygiene (bot filtering, clean GA4/Shopify segments) as a precondition — you can't trust an A/B test on a polluted denominator.

## The five-gate diagnostic
A high-consideration purchase clears five gates **in order**. Score each; the failures explain the rate.

1. **Comprehend** — "What is this?" Product type, the novel mechanic, why it's special, visible in one glance. (Killed by jargon, punny/symbol-stuffed titles, unclear category.)
2. **Desire** — "I want that." Lead with beauty/identity/emotion; show the differentiator in motion. (Killed by thin imagery, telling-not-showing.)
3. **Trust** — "Is this real/good?" Reviews, ratings, UGC, press. (Killed by zero reviews — fatal at high price/novelty.)
4. **De-risk** — "What if it doesn't fit/work?" Fit confidence, returns clarity, guarantee, financing. (Killed by empty fit content, sold-out sizes with no capture, buried guarantee.)
5. **Act** — "Buy it, now, easily." Visible friction-free ATC, sane number of decisions, sticky CTA. (Killed by buried ATC, choice overload, no mobile sticky bar.)

## Why the rate goes near-zero (the math)
Conversion is **multiplicative** across gates. If a page clears only ~40% at each of five gates, through-rate ≈ 0.4⁵ ≈ **1%**. Being worse than 40% at several gates simultaneously produces sub-1% add-to-cart. **Therefore: fixing one gate rarely moves the needle — repair the chain.** This is also why "we tried a few best practices and nothing happened" is common; partial fixes don't multiply.

## Locate the leak (step conversion)
Decompose the funnel into step rates, not just the end-to-end CVR:
- Session → Add-to-cart
- Add-to-cart → Reached checkout
- Reached checkout → Completed
The worst step is where to focus. A healthy ATC→checkout but catastrophic Session→ATC = a product-page problem (this skill). A healthy Session→ATC but poor checkout completion = a cart/checkout problem (different scope).

## Impact / effort prioritization
Place every recommendation on a 2×2 (impact × effort) and sequence:
- **Phase 1 — Quick wins** (high impact, low effort): usually content + config on existing infrastructure (seed reviews, add images/video, fill fit content, reorder buy box, sticky ATC, back-in-stock, surface guarantee/BNPL, naming fix).
- **Phase 2 — Structural** (high impact, medium effort): analytics hygiene first, guided configurator, reviews lifecycle + UGC, fit finder, collection overhaul.
- **Phase 3 — Advanced** (high impact, higher effort): template consolidation, compatibility-aware cross-sell + bundles, live preview/AR.
Render the 2×2 as a **quadrant grid**, not absolute-positioned labels (see the `report-information-design` skill for the robust component).
