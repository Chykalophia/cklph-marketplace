# Test Design Rules

## Metrics: one primary, a few guardrails, always quality checks
- **Primary (success) metric:** one, chosen before launch, closest to value that the test can move. For PDP tests usually add-to-cart rate or revenue per visitor; for checkout tests, completed orders per visitor.
- **Guardrails:** metrics that must not get worse (revenue per visitor, return/refund rate, AOV, page speed). Each guardrail is a non-inferiority test with a stated margin.
- **Quality checks:** SRM and any pre-exposure imbalance. A failed quality check voids the result.
- **Decision rule (Spotify, 2024):** ship only if a success metric wins, every guardrail is shown non-inferior, nothing deteriorates and quality checks pass. Correct alpha for the number of success metrics; size for power across guardrails, since with 5 independent guardrails at 80% power each the chance all pass falls below 40%. https://engineering.atspotify.com/2024/3/risk-aware-product-decisions-in-a-b-tests-with-multiple-metrics
- Practical consequence: small stores rarely have power on guardrails. Pick one or two that matter and give them generous margins, or monitor them post-launch.

## Peeking and stopping
- Repeatedly checking a fixed-horizon test and stopping at the first significant result pushes the false-positive rate toward 100% given enough looks (Johari et al., "Always Valid Inference", https://arxiv.org/pdf/1512.04922v2). CXL's simulation: checking after every visitor, ~77% of zero-effect tests cross 90% confidence at some point.
- **Fixed-horizon:** commit to the sample size from `power.py`, run whole weeks (min 14 days), read once.
- **Sequential:** if the tool supports always-valid or group-sequential testing (Optimizely Stats Engine, Analytics-Toolkit AGILE, Statsig/Eppo sequential), you may monitor and stop early. Sequential designs needed ~26% less sample in Georgiev's 1,001-test data. Report the tool's adjusted intervals, not naive ones.
- Bayesian dashboards that show "probability to beat" are not immune to peeking when used with a stop-when-high rule.

## Multiple variants
- Each extra arm adds a comparison. `power.py --variants k` and `readout.py` apply Bonferroni. FDR on Optimizely data rose from 18% (one variant) to 41% (six).
- Optimizely reports 4-variant tests deliver more impact than plain A/B, so multi-arm is fine when traffic supports it.

## Variance reduction
- **CUPED** uses each user's pre-period behaviour to cut variance; ~50% at Bing, halving the traffic needed (Deng et al., WSDM 2013, https://exp-platform.com/cuped/). Use it whenever the tool supports it; pass `--cuped-r` to `power.py` (r = correlation between pre-period and in-test metric, often 0.3–0.7 for returning-visitor metrics, near 0 for new visitors).
- Trigger analysis: restrict the analysis to visitors who were eligible to see the change (e.g. reached the cart, for a cart test). This raises sensitivity without bias only when eligibility is decided before exposure and the variant cannot change who becomes eligible; otherwise analyse all randomized visitors.

## Trust checks
- **A/A tests:** run one when setting up a tool or changing tracking. One "significant" A/A result can happen by chance (at the alpha rate); repeated ones, an SRM, or a systematic gap on one metric mean the setup is broken.
- **SRM causes** (Fabijan et al. 2020): assignment bugs, redirects that drop users in one arm, bot filtering that hits arms unevenly, slower variant pages losing visitors before tracking fires, analytics joins. Run `srm_check.py` on every readout.
- **Twyman's law:** "any figure that looks interesting or different is usually wrong." Investigate lifts above ~10% before trusting them.
- **Novelty and carryover:** returning-visitor tests can show a novelty spike; compare week 1 with week 2+. Effects of previous tests can carry over for weeks.

## Hypothesis format
> Because we saw **[evidence: source + number]**, we believe **[change]** for **[audience/segment]** will move **[primary metric]** by at least **[MDE]**. Guardrails: **[list + margins]**. We will run **[N days / visitors]** and decide with the rule above.
