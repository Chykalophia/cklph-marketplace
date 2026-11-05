---
name: experiment-design
description: >
  Plan, size and read out A/B or multivariate tests with real statistics. Use when planning or sizing
  a test, reading one out, or deciding whether a change can be tested at all, before any conversion
  recommendation is called proven.
license: MIT
metadata:
  author: Chykalophia
---

# Experiment Design & Readout

**Trigger phrases:** "how long should this test run", "sample size", "MDE", "is this test significant", "read out this test", "did the variant win", "SRM", "test plan", "pre-register", "we don't have enough traffic to test", "log this test", "what's our win rate".

Plan tests that can actually detect something, read them out honestly, and keep a log so the program gets smarter. Calculations run in the scripts, never in your head.

## What the evidence says (set expectations with this)
- **Most ideas fail.** Roughly 1 in 3 experiments wins at Microsoft, 10–20% at Bing, Google, Netflix and Booking.com, 8% at Airbnb Search; 12% in Optimizely's 127k-experiment dataset. Details and sources in `references/base-rates.md`.
- **Real effects are small.** Median lift across 1,001 tests was close to zero (directional, Georgiev 2022); 90% of Qubit's 6,700 ecommerce tests moved revenue by less than 1.2%.
- **Many "wins" are false or inflated.** At typical success rates a quarter or more of significant results are false positives, and underpowered winners overstate their effect.
- **Tests break.** About 6% of Microsoft tests have a sample ratio mismatch (SRM), which invalidates them.

So: a recommendation is a hypothesis until a sound test confirms it. A monitored rollout gives directional evidence, not confirmation.

## Workflow
1. **Pre-register** with `templates/preregistration.md`: hypothesis tied to evidence, one primary metric, guardrails, MDE, duration, stop rule. Write it before launch.
2. **Size it** with `scripts/power.py`.
   - `size` mode: visitors and days for a target MDE.
   - `mde` mode: what the available traffic can detect in a fixed window.
   - If the detectable MDE is above ~10% relative, or the run is over ~8 weeks, follow `references/low-traffic.md` instead of launching a test that will end inconclusive.
3. **Run it** for whole weeks, at least 14 days. Do not stop early on significance unless the design is sequential (`references/test-design.md`).
4. **Read it out** with `scripts/readout.py`, passing the planned relative MDE (`--mde`), the run length (`--days`), the guardrails (`--guardrail`), and the configured split with `--weights` when arms are not equal (it runs the SRM check, intervals, guardrails, Twyman flag, exaggeration estimate and the decision rule). Present it with `report-information-design/references/experiment-readout.md`.
5. **Log it** with `scripts/test_log.py add`, win or lose. Use `summary` and `prior` to rank the next round by the client's own lever win rates.

## Scripts (Python 3 standard library, no installs)
| Script | Use |
|---|---|
| `scripts/power.py` | Sample size, duration, detectable MDE; conversion or continuous metrics; multiple variants; CUPED |
| `scripts/srm_check.py` | Chi-square sample ratio mismatch check for any number of arms |
| `scripts/readout.py` | Effect + CI, SRM, guardrail non-inferiority, Twyman flag, winner's-curse estimate, decision |
| `scripts/test_log.py` | Per-client CSV test log, win rates by lever/page, shrunk priors for prioritisation |

Run from the skill folder, e.g. `python3 ${CLAUDE_PLUGIN_ROOT}/skills/experiment-design/scripts/power.py size --baseline 0.025 --mde 0.1 --daily-visitors 4000`.

## Reference map
- `references/base-rates.md` — win rates, effect sizes, false discovery: the numbers to set client expectations, with sources.
- `references/test-design.md` — metrics (primary, guardrail, quality), peeking and sequential tests, multiple variants, CUPED, A/A tests, SRM causes.
- `references/low-traffic.md` — what to do when the store cannot power a test.
- `templates/preregistration.md` — the plan to fill in before launch.

## Engagement context
Read `./cro-engagement.md` first (created by `getting-started`). Use its daily eligible visitors per template, testing tool, and test-log path. If no log exists, offer `test_log.py init`.

## Related skills
`ecommerce-cro-audit` produces the hypotheses; `voc-research` supplies the evidence behind them; `report-information-design` formats the readout; `conversion-copywriting` writes variants.

## Guardrails
- Never call a test a win without the SRM check passing.
- Report intervals, not just point estimates; never promise the observed lift will hold after launch.
- Never let an LLM (including you) "predict" the winner in place of a test. LLMs pick winning headlines barely above chance (Ye et al., Marketing Science 2025).
- A flat test is a result. Log it.
