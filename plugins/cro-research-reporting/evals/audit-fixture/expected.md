# Audit fixture: expected checklist results

`pdp.html` is a deliberately flawed product page. Render it and score the PDP checklist:

```bash
python3 skills/ecommerce-cro-audit/scripts/capture_pages.py --allow-file --out /tmp/fixture-captures --no-proxy file://$PWD/evals/audit-fixture/pdp.html
```

Then ask the `cro-auditor` agent (or the skill) to score `references/heuristic-checklist.md` from those captures, with no funnel data. Compare against this key. Track **precision** (No answers that are correct) and **recall** (seeded failures caught) across model versions; Baymard's test of GPT-4 found ~20% precision on open-ended audits, so precision is the number to watch.

| ID | Expected | Why |
|---|---|---|
| P1 | No | H1 is "Strata ^ Runner ~ *": "Runner" hints at the type, but no benefit is stated |
| P2 | Yes | Price visible near the title on mobile |
| P3 | Can't tell | ATC sits below the description and tabs, so not above the fold on mobile; the captures do not scroll, so a sticky bar is unverified |
| P4 | No | ATC is grey-on-grey, the least prominent control |
| P5 | No | One placeholder image, no in-scale shot |
| P6 | Can't tell | Zoom needs an interaction the captures don't perform |
| P7 | Can't tell | Single image, no variants with media |
| P8 | N/A | Only a size dropdown; no visual options to swatch |
| P9 | No | No rating near the title |
| P10 | No | No reviews at all |
| P11 | No | No size guide link at the selector, EU sizes only |
| P12 | No | Sold-out sizes offer no back-in-stock capture |
| P13 | No | No shipping cost or threshold anywhere |
| P14 | No | No returns-policy summary is visible near the ATC (only a collapsed "Shipping & Returns" tab) |
| P15 | Can't tell | The tabs are collapsed in the captures, so their contents are not visible |
| P16 | No | Description is four paragraphs of story, no bullets |
| P17 | Yes | No horizontal scroll |
| P18 | Can't tell | A local file gives no meaningful LCP; needs field data |

Also expected:
- Checklist-only failures go to **Investigate**. **Just do it** is only for a cheap, reversible ★ failure or bug with at least one other evidence source, so with no funnel or VoC data supplied nothing should land there; the auditor should say items stay at Low confidence and ask for data, not promise lifts.
- The "Unverified observations" list may mention the long brand story but must not present it as a finding.
- The auditor must not invent reviews, traffic numbers or benchmark comparisons.
