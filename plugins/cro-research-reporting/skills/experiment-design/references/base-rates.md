# Base Rates: How Often Tests Win, and by How Much

Use these to set expectations with clients and to sanity-check "impact" claims in audits. Re-verify yearly. Tier labels follow `deep-research-synthesis/references/source-tiering.md`: quote Tier 1 figures as stated, and use Tier 2 figures for direction and rough size only (marked "directional" below).

## Win rates
| Context | Share of experiments that win | Source |
|---|---|---|
| Microsoft (all) | ~33% positive, ~33% flat, ~33% negative | Kohavi & Thomke, HBR 2017 [Tier 1] https://web-docs.stern.nyu.edu/executive/The%20Surprising%20Power%20of%20Online%20Experiments.pdf |
| Bing, Google (overall) | 10–20% | same |
| Booking.com, Google Ads, Netflix | ~10% (a later, narrower estimate for Google Ads than the HBR range above) | Kohavi, Deng & Vermeer, "A/B Testing Intuition Busters", KDD 2022 [Tier 1] https://exp-platform.com/abtestingintuitionbusters/ |
| Airbnb Search | ~8% | same |
| Optimizely customers (127k+ experiments) | ~12% win on primary metric; healthy programs roughly 35–40% conclusive (directional) | Optimizely [Tier 2, vendor] https://www.optimizely.com/insights/top-10-takeaways-from-the-experimentation-playbook/ |
| Analytics-Toolkit users (1,001 tests) | about a third significant positive (directional) | Georgiev 2022 [Tier 2] https://blog.analytics-toolkit.com/2022/what-can-be-learned-from-1001-a-b-tests/ |

## Effect sizes
- Median lift across 1,001 tests: **close to zero (~0.1%)**, mean ~2%. Significant winners: median ~7–8%. Median MDE at 90% power ~6%; median run ~30 days, ~60k users. (Georgiev 2022, directional.)
- Qubit, 6,700 ecommerce experiments: **90% of effects under 1.2%** of revenue. Best categories by revenue per visitor: scarcity +2.9%, social proof +2.3%, urgency +1.5%, abandonment recovery +1.1%. Cosmetic: colour 0.0%, buttons −0.2%, CTA text −0.3% (24% chance positive). (Browne & Swarbrick Jones 2017 [Tier 1-] https://www.gwern.net/doc/economics/advertising/2017-browne.pdf)
- GoodUI's 115 public tests: most (~70%) underpowered; removing tests with imbalance or suspected peeking cut the average lift roughly threefold, from ~12% to ~4%. (Georgiev 2018 [Tier 2, directional] https://blog.analytics-toolkit.com/?p=937)
- Bing: every 100 ms of speed was worth 0.6% revenue; big positive effects are rare, so be suspicious of them. (Kohavi et al., "Seven Rules of Thumb", KDD 2014 [Tier 1] https://exp-platform.com/rules-of-thumb/)

## False positives and inflation
- At an 8% success rate with 80% power, ~26% of significant positive results are false; at 20% power, ~59%. (Intuition Busters; these count only positive results at a two-sided 5% threshold. Counting significance in either direction raises the share.)
- Optimizely data: ~70% of effects are true nulls; false discovery rate 18% with one variant, 41% with six; stopping one day late raised FDR from 17.5% to 21.8%. (Berman & Van den Bulte, Management Science 2021 [Tier 1] https://www.gwern.net/doc/statistics/decision/2021-berman.pdf)
- About 73% of experimenters stopped tests as soon as they crossed 90% confidence (working-paper estimate). (Berman et al. 2018 [working paper] https://papers.ssrn.com/abstract=3204791)
- Underpowered significant results exaggerate the effect (Type M error), e.g. 9.7x at 6% power. (Gelman & Carlin 2014 [Tier 1] https://sites.stat.columbia.edu/gelman/research/published/PPS551642_REV2.pdf)
- Day-1 results fall outside the final 95% interval 67% of the time. (Kohavi et al. KDD 2012 [Tier 1] https://exp-platform.com/puzzling-outcomes/)
- ~6% of Microsoft tests have SRM; ~10% of LinkedIn's "zoomed-in" tests. (Fabijan et al. 2020 [Tier 1] https://www.microsoft.com/en-us/research/articles/diagnosing-sample-ratio-mismatch-in-a-b-testing/)

## How to use this in deliverables
- Express audit impact as "likely / possible / speculative" with the evidence behind it, not as a promised % lift.
- When a client asks "how much will this lift conversion?", answer with the base rate and the test plan.
- When a test result is surprisingly large (>10% relative), run the Twyman's-law checks before celebrating.
