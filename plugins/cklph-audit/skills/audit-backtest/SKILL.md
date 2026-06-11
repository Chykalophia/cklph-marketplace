---
name: audit-backtest
description: Validate a lens against ground truth — run it over fixtures/<lens>/ and/or a historical git commit, compute precision/recall, and gate the lens (recall ≥ 0.8, precision ≥ 0.7 after verify) before it ships.
---

# audit-backtest

No lens ships on vibes. This skill measures a lens against **labeled ground truth** two ways and reports precision/recall vs the SPEC §10 gate. It is the validation harness behind `/cklph-audit:backtest <lens> [ref]`.

## Inputs

- `<lens>` — one of `security | correctness | architecture`.
- `[ref]` — optional git ref (commit/tag/branch) to backtest against a known historical state.

## Mode 1 — Golden fixtures (per-lens precision/recall gate)

The default mode. Ground truth lives with the plugin under `fixtures/<lens>/`:

- `fixtures/<lens>/should-flag/` — planted issues the lens **MUST** catch → drives **recall**.
- `fixtures/<lens>/should-not-flag/` — clean look-alikes it **MUST NOT** flag → drives **precision**.

Procedure:

1. Run the lens (reviewer → verifier, same pipeline as `:run`) over each fixture file.
2. Score against the labels:
   - **true positive** = a `should-flag/` issue was confirmed.
   - **false negative** = a `should-flag/` issue was missed → hurts recall.
   - **false positive** = a `should-not-flag/` look-alike was flagged (and survived verify) → hurts precision.
3. Compute **recall** = TP / (TP + FN) and **precision** = TP / (TP + FP) **after verify**.
4. **Gate:** a lens is *not enabled* until it clears the suggested thresholds — **recall ≥ 0.8, precision ≥ 0.7 after verify**. A lens that can't clear the gate gets its tool / prompt / verifier fixed before it ships — it does not ship degraded.

Fixtures grow every time a real false-positive or false-negative is found in the wild, so the gate **ratchets up** over time.

## Mode 2 — Backtest against a known commit (`[ref]` supplied)

Real ground truth from git history. Check out (or read at) `[ref]`, run the lens, and compare to that commit's known findings:

- **security** → pre-CASA-remediation MailPrism must re-surface the CASA headline findings (users-table self-escalation, QStash dev bypass, cron fail-open, GDPR ciphertext export) at **< ~20% false-positive after verify**.
- **architecture** → run on the commit *before* a known de-dup refactor; it should flag what the refactor later removed.
- **correctness** → run on the commit a known bugfix later patched; it should flag the bug.

## Output

A short report: per-mode **recall**, **precision (after verify)**, the confusion-matrix counts, each false-positive / false-negative by `file:line` (so fixtures can be added), and an explicit **PASS / FAIL vs the gate**. Read-only — writes nothing to the target repo.
