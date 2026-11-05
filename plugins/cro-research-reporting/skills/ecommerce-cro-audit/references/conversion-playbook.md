# Conversion Playbook — the high-impact PDP/funnel levers

Each lever: what it is, what "good" looks like, and the evidence (with source + year). Treat vendor/case figures as **directional** (use the direction, not the exact number), and keep vendor magnitudes out of client-facing recommendations: median A/B lifts are near zero in large datasets (`experiment-design/references/base-rates.md`), so a quoted "+27%" reads as a promise.

## 1. Social proof & reviews — usually the #1 fix
- Reviews lift purchase likelihood **~270% (5 reviews vs none)**, and **~380% for higher-priced products** — the effect is *largest* for expensive, unfamiliar items. Source: Spiegel Research Center, Northwestern, 2017 (peer-reviewed). https://spiegel.medill.northwestern.edu/how-online-reviews-influence-sales/
- **~80%+ of shoppers** are less likely to buy a product with no reviews; 96% read more reviews for expensive items. Source: PowerReviews, 2023. https://www.powerreviews.com/power-of-reviews-2023/
- Don't chase 5.0 — purchase likelihood **peaks at 4.0–4.7** (a flawless score reads fake). Verified-buyer badges add ~15%. (Spiegel, 2017.)
- **What good looks like:** star rating beside the title (above the fold), review summary + histogram, photo/video reviews, Q&A, and a **fit sub-score** (runs small/true/large) for apparel/footwear (Baymard apparel guideline).
- **Bootstrapping from zero:** product seeding/sampling (~10–15 reviews in ~3 weeks), always-on post-purchase email+SMS (timed after delivery), photo/video incentives. FTC rule (eff. Oct 2024): you may incentivize *a* review, never a *positive* one; disclose incentives.

## 2. Imagery
- **56% of users explore images first** on a PDP; **42% try to judge size from images** and **28% of sites fail** to provide an in-scale shot, causing abandonment. Source: Baymard Institute. https://baymard.com/blog/in-scale-product-images
- 25% of sites lack sufficient zoom; 40% don't support mobile pinch/tap. (Baymard.)
- **What good looks like:** 8+ images across types — cut-out, on-model/worn, in-scale (shows true size/height), macro detail (materials/mechanism), lifestyle, plus **video of the differentiator** and ideally a 360 spin. Front-load worn + in-scale.

## 3. Fit & sizing confidence (footwear/apparel)
- **Fit is the #1 reason shoppers don't buy and the #1 return driver — 93% cite fit** for footwear returns; footwear returns ~18%. Source: Fittingbox, 2024. https://footwear.fittingbox.com/en/blog/metrics-that-matter-return-rate-benchmarks-for-footwear-e-commerce
- EU↔US sizing doesn't convert cleanly — give a cm-based guide + explicit conversion.
- **What good looks like:** "true to size" statement at the size selector, size guide, optional fit-finder, fit sub-score in reviews. Lifts conversion *and* cuts costly returns.

## 4. Variant / configurator UX (choice overload)
- Use **swatches for visual options**, not native dropdowns; **sync the gallery image to the selected variant** (54% of sites fail this — Baymard). Keep one product's variants on one listing (NN/g).
- For many options: **smart default** (land on a complete, in-stock, attractive config — never a zero-state), **progressive disclosure** / guided "build," and one-tap **presets** to defeat blank-canvas paralysis (Nike By You pattern).

## 5. Buy box order + sticky ATC
- Keep the add-to-cart findable without hunting, especially on mobile (checklist P3). Note that across 6,700 ecommerce tests, changes to CTA text and buttons averaged about zero effect (Qubit 2017), so treat buy-box *placement and completeness* as the lever, not button styling.
- Sticky/persistent add-to-cart: **+7.9% completed orders on desktop** (independent A/B, Growth Rock); mobile commonly **+12–25%** (directional). Especially valuable on long/configurator pages.
- **What good looks like (buy box order):** breadcrumb → title + rating → price + financing + value line → trust row → options (default set) → **prominent ATC** → reassurance microcopy → highlights. Don't bury the ATC below descriptions/tabs/filler.

## 6. Value & story in the buy decision
- Narrative raises willingness-to-pay (the "Significant Objects" experiment: ~2,700% value from story alone). Users read ~28% of words (NN/g) — lead with a 3–5 bullet "Highlights" block.
- **Price justification:** craftsmanship/provenance (e.g. "Made in Italy", if customers value it), founder/mission micro-story, and value framing. Cost-per-wear framing shifted preference toward higher-quality clothing in six preregistered experiments, especially when shoppers can compare CPW across options and the claim is certified (Eckmann & Reisch, *Psychology & Marketing*, 2026, https://researchportal.bath.ac.uk/en/publications/shifting-toward-quality-how-communicating-cost-per-wear-influence/). Whether CPW cheapens a luxury brand is untested; for luxury, test it rather than assume either way.

## 7. Trust signals + financing
- Surface guarantee, free returns, secure-checkout, and **BNPL** near the price. BNPL ~**+27% conversion / +21% AOV** (Klarna, directional) — high leverage at AOV $200+.
- Money-back-guarantee badges test ~+32% (Yieldify, directional). Make the strongest objection-killer prominent, not buried.

## 8. Out-of-stock capture
- ~70% who hit an out-of-stock product buy from a competitor; a back-in-stock "Notify me" recovers **15–25%** of stockout-lost revenue and builds a high-intent list that informs restocking. (Directional, vendor benchmarks.)
- Replace dead "Sold Out" with email/SMS capture.

## 9. Page speed / Core Web Vitals
- A 1s page converts ~**2.5× a 5s page**; ~0.3pp lost per added second (Portent, 2022). Mobile bounce **+32% as load goes 1s→3s** (Think with Google).
- Targets: **LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1.** Heavy imagery + JS configurators threaten LCP/INP — use WebP/AVIF, lazy-load below-fold media, defer non-critical JS. Measure field (CrUX) data, not just lab.

## Anti-patterns (don't)
- Fake urgency / "X viewing" counters — trust-destroying, especially for premium buyers.
- Scarcity messaging next to widespread stockouts — reads as "struggling," not "exclusive." Reframe to genuine exclusivity ("small-batch, made to order") and add back-in-stock capture.
- Sustainability/mission as the headline for a style-first audience — reinforcement, not lead.
- One-size benchmarks — always tier-match.
