# AI Coding Protocol for Customer Feedback

The evidence-backed way to let an LLM code qualitative data without fooling yourself.

## Why a protocol
- Codebook-centred prompts with examples work best; expert-level agreement is not automatic (Xiao et al. 2023 reached kappa 0.38–0.61 against experts at 0.88–0.90, https://arxiv.org/pdf/2304.10548).
- Off-the-shelf models do well overall (kappa ~0.76) but fail on "other / no reason" categories, which skews counts (von der Heyde et al. 2025, https://arxiv.org/pdf/2506.14634).
- High run-to-run consistency does not mean the codes are right. Validate against a human.

## Steps
1. **Draft the codebook from data.** Have the model read a random 50–100 items and propose 8–15 codes. A human merges, renames and writes a one-line definition, an include rule, an exclude rule and two real examples per code. Use `codebook-template.md`.
2. **Code a validation sample.** Draw a fresh random 50–100 items. AI codes them with the codebook in the prompt (one item per line, return code ids only, allow multiple codes with `;`, an explicit `none` code for "no reason", and `skip` for blank or off-topic items). A human codes the same items blind. With under ~100 items in total, skip the separate sample: AI codes everything, a human reviews every code, and the themes are reported as exploratory.
3. **Measure agreement.** `python3 ${CLAUDE_PLUGIN_ROOT}/skills/voc-research/scripts/agreement.py sample.csv --a human --b ai` (with `;`-separated multi-codes it pools every item x code decision into the overall figure). Target kappa ≥ 0.7 overall and per code.
4. **Fix weak codes.** Tighten definitions, add counter-examples, merge codes humans also confuse. Re-run on a new sample (not the same one, or you overfit).
5. **Code the full set** in batches. Spot-check 20 random items per batch. Keep the model and prompt fixed across batches; if either changes, re-validate.
6. **Report** shares per code with n, plus 2–3 verbatim quotes each, and state the kappa achieved.

## Prompt skeleton
```
You are coding customer feedback for a CRO study. Use ONLY these codes:
<code id>: <definition>. Include: <rule>. Exclude: <rule>. Examples: "<ex1>", "<ex2>"
...
none: the customer says nothing held them back.
skip: blank, unreadable or off-topic.
For each line below return: <item id>,<code ids separated by ;>
Do not invent codes. If unsure between two codes, return both.
<items>
```

## Things AI should not decide
- Which themes matter commercially (that needs the funnel data and the client's goals).
- Severity of a usability problem seen in a test.
- Whether a quote is representative.
