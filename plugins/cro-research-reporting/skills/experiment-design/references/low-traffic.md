# When the Store Cannot Power a Test

Run `python3 ${CLAUDE_PLUGIN_ROOT}/skills/experiment-design/scripts/power.py mde --baseline <conversion rate> --daily-visitors N --max-days 28` first (for revenue per visitor use `--mean <m> --sd <s>` instead of `--baseline`). If the smallest detectable lift is above ~10% relative, a standard A/B test will usually end inconclusive, because most real effects are a few percent or less (see `base-rates.md`). Options, in order of preference:

1. **Test closer to the traffic.** Use a higher-volume metric that the change plausibly moves (add-to-cart rate instead of orders; checkout start instead of purchase) and a higher-traffic page or template. Say clearly that the downstream effect is assumed, not measured.
2. **Make the change bigger.** Bundle several changes that address the same evidence-backed problem into one variant, accepting that you will not know which part worked. A redesigned buy box tests better than a moved button.
3. **Reduce variance.** Turn on CUPED if the tool has it; trigger the analysis on visitors whose eligibility is decided before exposure and cannot be changed by the variant; use a longer pre-period.
4. **Accept a lower bar knowingly.** e.g. 80% confidence with a pre-registered one-sided test, for reversible low-risk changes. Write the higher false-positive risk into the readout.
5. **Ship as an informed bet, then monitor.** For changes backed by strong evidence (Baymard guideline violation, a usability test where most users failed, a top survey objection): ship, annotate the date, and compare weekly step-conversion for 4+ weeks against the prior period and the same period last year. This is evidence of direction, not proof; label it that way.
6. **Do qualitative validation instead.** A 5-user test before and after the change catches usability failures without any traffic requirement (Nielsen, https://nngroup.com/articles/why-you-only-need-to-test-with-5-users/).

What not to do:
- Do not switch to a Bayesian calculator expecting it to need less data. It reports the same evidence differently.
- Do not peek and stop at the first green number.
- Do not run a test you already know cannot detect a plausible effect "just to see".
