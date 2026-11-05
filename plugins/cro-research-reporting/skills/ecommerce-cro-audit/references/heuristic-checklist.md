# Binary Heuristic Checklist

Why binary: open-ended AI page reviews are unreliable (GPT-4 suggestions were 19.9% accurate in Baymard's 2023 test; current AI UX tools 50–75%). AI reaches high accuracy when it only classifies what is on the page against a fixed rule and the rule comes from research (Baymard UX-Ray, 95%, self-reported; NN/g 2026). So: answer each item **Yes / No / Can't tell** from the rendered screenshots and `facts.json` produced by `scripts/capture_pages.py`. Never answer from HTML text alone.

A "No" is an **observation**, not a recommendation. It becomes a hypothesis only when paired with funnel data or customer evidence (see the SKILL workflow). Items marked ★ are backed by large-sample usability research strong enough to justify "Just do it" when the fix is cheap and reversible.

Answer format per item: `ID | Yes/No/Can't tell | where seen (screenshot + viewport) | note`.

## Product page (PDP)
| ID | Check (Yes = pass) | Lever | Basis |
|---|---|---|---|
| P1 | Product type and key benefit are clear from the H1/subtitle without reading the description | Comprehension | NN/g: users read ~20–28% of words |
| P2 ★ | Price is visible above the fold on mobile | Cost | Baymard PDP research |
| P3 ★ | Add-to-cart is visible above the fold on mobile, or a sticky ATC appears on scroll (`buy_button_above_fold` covers the first viewport only and the full screenshot is not scrolled, so confirm a sticky bar by scrolling the page or ask; otherwise answer Can't tell) | Usability | Baymard; GrowthRock sticky-ATC test (+7.9% orders, single test) |
| P4 | ATC button is visually the most prominent control in the buy box | Usability | Heuristic |
| P5 ★ | At least one product image shows the item in scale (worn/held/in room); several angles overall (heuristic, no proven minimum count) | Motivation | Baymard: 42% judge size from images; 28% of sites lack in-scale |
| P6 ★ | Images zoom on desktop and pinch/tap on mobile | Usability | Baymard: 25% / 40% of sites fail |
| P7 ★ | Selecting a variant updates the main image | Usability | Baymard: 54% of sites fail |
| P8 | Visual options (colour, material) use swatches, not dropdowns | Usability | Baymard / NN/g |
| P9 | A star rating and review count show near the title | Trust | Spiegel 2017: 5 reviews vs none lifts purchase likelihood ~270% |
| P10 | Reviews exist (n ≥ 5) and include rating distribution | Trust | Spiegel 2017 |
| P11 ★ | Apparel/footwear: size guide is linked at the size selector, with a fit statement | Usability | Baymard apparel guidelines |
| P12 | Out-of-stock variants offer back-in-stock capture | Motivation | Directional vendor data |
| P13 ★ | Shipping cost or free-shipping threshold is visible before cart | Cost | Baymard: extra costs are #1 abandonment reason (~40%) |
| P14 | Returns policy summary is visible near the ATC | Trust | Baymard: 15% abandon over returns policy |
| P15 | Tabs/accordions have content (none empty) | Comprehension | Heuristic |
| P16 | Key specs/benefits are scannable bullets, not only paragraphs | Comprehension | NN/g scanning research |
| P17 | Page has no horizontal scroll on mobile (`has_horizontal_scroll`) | Usability | Heuristic |
| P18 | LCP under 2.5 s on mobile (field data preferred; `lcp_ms` is lab only) | Usability | Google Core Web Vitals; Bing: 100 ms = 0.6% revenue |

## Cart and checkout
| ID | Check | Lever | Basis |
|---|---|---|---|
| C1 ★ | Guest checkout is offered and is at least as prominent as sign-in | Usability | Baymard: 18–19% abandon over forced accounts |
| C2 ★ | Order total including shipping and tax is visible in the cart | Cost | Baymard |
| C3 ★ | Checkout shows ≤ 8 form fields by default (count `form_fields_visible`) | Usability | Baymard: ideal 7–8 fields, US average 14.88 |
| C4 ★ | Both required and optional fields are marked | Usability | Baymard: 32% failed when only optional were marked |
| C5 | Coupon field is collapsed or de-emphasised | Cost | GoodUI pattern (directional) |
| C6 | Express wallets (Shop Pay, Apple Pay, PayPal) are offered | Usability | Baymard: 10% abandon over payment options |
| C7 | Trust/security cues sit next to the payment fields | Trust | Baymard: 19% distrust site with card |
| C8 | Delivery date or speed is stated before payment | Motivation | Baymard: 20% abandon over slow delivery |
| C9 | Inline validation with specific error messages | Usability | Baymard |

## Landing / lead-gen / SaaS (see `beyond-ecommerce.md`)
| ID | Check | Lever | Basis |
|---|---|---|---|
| L1 | Headline matches the ad/email/keyword that drove the visit | Comprehension | Message-match heuristic |
| L2 | One primary CTA, repeated; nav removed or minimal on paid landing pages | Usability | Heuristic |
| L3 | Form asks only what is needed now | Usability | Heuristic; test field removal |
| L4 | Named proof (logos, testimonials with names and numbers) above the fold | Trust | Heuristic |
| L5 | Pricing or "what happens next" stated near the CTA | Cost | Heuristic |

## Scoring rules
- Report pass counts per section, never a blended "CRO score".
- "Can't tell" is a valid answer; list what is needed to tell (a logged-in view, a sold-out variant, field data).
- Do not add open-ended "other issues" to the checklist output. Put anything else in a separate "Unverified observations" list, which is lower confidence by default.
- Re-verify the Baymard percentages yearly at https://baymard.com/lists/cart-abandonment-rate.
