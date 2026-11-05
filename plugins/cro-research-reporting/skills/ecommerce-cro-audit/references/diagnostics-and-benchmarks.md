# Diagnostics & Benchmarks

## Benchmarks are context, not the diagnosis
Compare the store with its own history (same template, device and source, prior period and last year) before any industry figure. Shopify itself calls a universal conversion benchmark "a fallacy" because rates swing with traffic source, price and how sessions are counted (https://shopify.in/ie/blog/ecommerce-conversion-rate). Use the table below only to say whether a number is wildly off, never to size an opportunity.

As of 2024–2026; platform/vendor figures are directional. Re-verify yearly.

| Metric | Benchmark | Source |
|---|---|---|
| All-industry conversion | ~2.5% | Statista / Smart Insights |
| Fashion/apparel (Shopify) | ~1.9% (top 20% > 4.3%) | Shopify, 2026 |
| Footwear | ~2.2% (capped by fit uncertainty) | Centra, 2024 |
| Luxury / high-AOV | **~0.8–1.5%** (lowest-converting tier) | Statista (luxury 0.9%), 2024 |
| Shopify store average (Littledata) | ~1.4% (top 20% > ~3.3%) | Shopify blog citing Littledata |
| Cart abandonment | **70.22%** avg | Baymard (50 studies, 2026 page) |
| Checkout completion lift from better design | up to ~35% | Baymard |

- **#1 checkout-abandonment cause for years: extra costs (shipping/tax/fees), ~40% of abandoners excluding "just browsing"** (Baymard, 2026 page). Surface total cost on the PDP, not at checkout.
- Implication: for a premium store, don't judge a ~1% conversion rate as broken. Track **add-to-cart rate** and **revenue per visitor** against the store's own history as the real scorecard (luxury wins on AOV, not volume). There is no reliable public add-to-cart "norm"; vendor figures range widely by category and definition.

## Traffic-quality caveat (read before reacting to a CVR)
A conversion rate is a fraction — a polluted denominator makes it lie. Before concluding "the page is broken," check the traffic shape:
- **Red flags:** 80%+ "direct", desktop-dominant in a mobile-first category, a device segment converting ~0 over thousands of sessions, near-zero email traffic. These suggest bot/junk/"dark" traffic inflating sessions.
- **The robust signal:** the **add-to-cart rate** (and absolute count of cart-adds) is far harder to explain away than the headline CVR. If ATC is low on every clean segment (e.g. returning visitors, email traffic) and stable across windows, treat it as a conversion problem to investigate. It does not by itself prove the page is the cause (product fit, price and availability also suppress cart adds), so corroborate with the checklist, VoC or a test before calling it a page problem.
- **Action:** recommend analytics hygiene (bot filtering, clean GA4/Shopify segments) as a precondition — you can't trust an A/B test on a polluted denominator.

## The five-gate lens
A diagnostic lens (this toolkit's own model, not a measured framework) for sorting evidence: a high-consideration purchase clears five gates roughly in order. Use it to organise checklist results and VoC themes; map each gate to the Conversion.com levers in brackets so hypotheses line up with the test log.

1. **Comprehend** [Comprehension] — "What is this?" Product type, the novel mechanic, why it's special, visible in one glance. (Killed by jargon, punny/symbol-stuffed titles, unclear category.)
2. **Desire** [Motivation] — "I want that." Lead with beauty/identity/emotion; show the differentiator in motion. (Killed by thin imagery, telling-not-showing.)
3. **Trust** [Trust] — "Is this real/good?" Reviews, ratings, UGC, press. (Killed by zero reviews — fatal at high price/novelty.)
4. **De-risk** [Cost / Trust] — "What if it doesn't fit/work?" Fit confidence, returns clarity, guarantee, financing. (Killed by empty fit content, sold-out sizes with no capture, buried guarantee.)
5. **Act** [Usability] — "Buy it, now, easily." Visible friction-free ATC, sane number of decisions, sticky CTA. (Killed by buried ATC, choice overload, no mobile sticky bar.)

## Why several weak gates compound (an illustration, not a measurement)
Funnel steps multiply: if a page lost 60% of visitors at each of five stages, only ~1% (0.4⁵) would get through. The gates are not measured individually, so treat this as a way to explain why several weak points can combine into a very low rate, not as a calculation. It does not follow that one fix can't matter; single changes sometimes have large effects (Kohavi et al., "Seven Rules of Thumb", KDD 2014). Let the step-conversion data and customer evidence say which gate is weakest.

## Locate the leak (step conversion)
Decompose the funnel into step rates, not just the end-to-end CVR:
- Session → Add-to-cart
- Add-to-cart → Reached checkout
- Reached checkout → Completed
The worst step is where to focus. A healthy ATC→checkout but catastrophic Session→ATC = a product-page problem (this skill). A healthy Session→ATC but poor checkout completion = a cart/checkout problem (different scope).

## Prioritisation and sequencing
Prioritise hypotheses by evidence strength, reach and effort (see the skill's bucket rules), not by guessed impact. For the roadmap view, sequence:
- **Phase 1 — Quick wins** (low effort; evidence strength per item from its hypothesis card): usually content + config on existing infrastructure (seed reviews, add images/video, fill fit content, reorder buy box, sticky ATC, back-in-stock, surface guarantee/BNPL, naming fix).
- **Phase 2 — Structural** (medium effort): analytics hygiene first, guided configurator, reviews lifecycle + UGC, fit finder, collection overhaul.
- **Phase 3 — Advanced** (higher effort): template consolidation, compatibility-aware cross-sell + bundles, live preview/AR.
Show the matrix (evidence strength × effort) as a **quadrant grid**, not absolute-positioned labels (see the `report-information-design` skill for the robust component).
