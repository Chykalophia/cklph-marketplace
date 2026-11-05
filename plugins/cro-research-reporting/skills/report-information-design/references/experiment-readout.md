# Experiment Readout Template

One page per test. Generate the numbers with `python3 ${CLAUDE_PLUGIN_ROOT}/skills/experiment-design/scripts/readout.py`; never compute them by hand. Same structure for wins, losses and flat results, so the test log stays comparable.

## Structure
1. **Headline decision** — SHIP / DO NOT SHIP / INCONCLUSIVE / DO NOT READ (SRM), in one line, with the primary metric's interval: "Inconclusive: add-to-cart changed +7.3% (95% CI −0.6% to +16.0%)."
2. **What we tested and why** — the pre-registered hypothesis, the evidence behind it, lever, page, segment, dates, split.
3. **Trust checks** — SRM pass/fail with p-value; for fixed-horizon tests, days run (whole weeks, ≥14); for sequential tests, the pre-registered stopping rule and run length; any tracking incidents; A/A status of the tool.
4. **Primary metric** — control vs variant, relative lift, interval, p-value or the tool's sequential statistic. Show the interval as a label | track | value row (render rule 1), never as text inside a bar.
5. **Guardrails** — each with its margin and non-inferior / not shown safe.
6. **Reading the result** —
   - Winner's curse: "If the true effect equals the planned MDE, significant results at this power overstate it about Nx on average (readout.py); plan on a smaller lift after launch."
   - Twyman's law: if the lift is above ~10%, list what was checked before trusting it.
   - Segments: only pre-registered ones; label any other cut as exploratory.
7. **Decision and next step** — ship / iterate / abandon the lever, and the follow-up hypothesis.
8. **Learning** — one or two sentences a future reader can reuse, then the `test_log.py add` id.

## Language rules
- Say "the interval runs from X to Y", not "we're 95% sure it's X".
- Never say "proved" for a single test. "Supports" or "consistent with" is accurate.
- Flat is not failure: "The change did not detectably move ATC; the interval shows which effects are still plausible (here −X% to +Y%)." Only claim an effect is below N% if the interval's upper end is below N%.
- Don't headline the point estimate of a winner without its interval.
