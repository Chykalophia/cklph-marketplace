# Experimentation Rigor

A recommendation isn't proven until a sound test confirms it. This is the discipline most CRO advice skips.

## Sizing & running a test
- **Set the MDE first.** The minimum detectable effect drives everything: a smaller MDE needs an exponentially larger sample and longer test. Running more tests at a sensible MDE beats a few tests chasing tiny lifts. Defaults: 80% power, 95% significance. Use a sample-size calculator (e.g., Optimizely's) before launching. [directional]
- **Minimum run time = 1–2 full business cycles (7–14 days)** regardless of significance, to cover day-of-week effects.
- **Low-traffic reality:** if a store can't reach the sample size in a reasonable window (common for premium/low-volume stores), prefer (a) bigger, bolder changes (larger MDE), (b) testing higher up the funnel where volume is larger, (c) qualitative + best-practice-led changes shipped as "informed bets," or (d) Bayesian methods that report probability-to-beat rather than a binary p-value.

## The peeking problem (and the fix)
- **Checking significance repeatedly inflates false positives.** Calculating significance after every visitor makes ~77% of zero-effect tests cross "90% confidence" at some point; peeking at 10% increments yields ~30% false positives under the null. Source: CXL/Speero simulation — https://cxl.com/blog/peeking-sequential-testing/ [primary-leaning].
- **Fix: sequential testing** (Evan Miller's, Georgi Georgiev's AGILE, or Bayesian) lets you legitimately monitor and stop early; ~34% shorter than fixed-horizon at zero effect for ~10% larger max sample. Under sequential designs, do not report the naive p-value/CI as-is.
- If you must use a fixed-horizon test, **commit to the sample size and don't look at significance until you reach it.**

## Prioritization frameworks (pick by maturity)
- **ICE** (Impact × Confidence × Ease, 1–10): fast, subjective; best for small teams building a testing habit.
- **PIE** (Potential × Importance × Ease): CRO-oriented, for existing pages.
- **PXL** (CXL): 10–12 **binary/objective** criteria (Is it above the fold? Does it add/remove an element? Is it backed by user testing / qual / heatmaps / analytics?). Removes scorer subjectivity so two people score alike — best for evidence-driven programs. https://cxl.com/blog/better-way-prioritize-ab-tests/
- **RICE** (Reach, Impact, Confidence, Effort): for cross-functional roadmaps.

## Where test ideas come from (ResearchXL inputs)
Don't test random ideas. Source hypotheses from: heuristic analysis, technical/QA, web analytics, mouse-tracking/heatmaps, qualitative surveys, and user testing. (PXL literally asks which of these back the hypothesis.) https://cxl.com/blog/how-to-come-up-with-more-winning-tests-using-data/

## Hypothesis template
> "Because we observed **[data/research]**, we believe **[change]** for **[audience]** will cause **[metric]** to **[direction]**. We'll know it worked when **[significance/sample reached]**."

## How to present test results honestly
- State the metric, the lift, the confidence/probability, the sample, and the run window.
- Distinguish primary metric from guardrail metrics (don't celebrate ATC lift that tanks revenue or returns).
- A flat or losing test is information, not failure — record the learning.

> Sourcing note: CRO experimentation knowledge lives in CXL/Speero, Optimizely/VWO docs, and books (Georgiev's "Statistical Methods in Online A/B Testing"), not GitHub. Weight those over repos.
