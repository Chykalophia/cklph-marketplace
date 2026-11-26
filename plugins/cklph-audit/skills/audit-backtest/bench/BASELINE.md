# Ablation baseline: cklph-audit on vs off

**No numbers are committed yet.** This file says how to produce them. When you run the full
ablation, paste the table below with the date, model and commit, and commit this file (never the
raw `results/*.jsonl`, which is gitignored).

## What it measures

The same headless `claude -p` security review runs over every benchmark case twice, with the same
model: once with this plugin loaded through `--plugin-dir` (**on**) and once without it (**off**).
Both runs pass `--setting-sources local --strict-mcp-config`, so no user-installed plugin (an
installed cklph-audit included) and no MCP server loads in either. The "on" run loads a copy of the
plugin with `fixtures/`, `tests/`, `skills/audit-backtest/`, `docs/`, the SPECs and the CHANGELOG
removed, so the verdicts are not on disk for it to find. Each case is one fixture file staged into
a fresh temp dir with its label header removed and a neutral name (`src/handler.ts`).

Per run it records: flagged or not, correct or not, turns, cost and tokens (from the CLI's
`--output-format json` result), duration, and the structured findings.

The table reports, per condition: recall on the vulnerable cases, the false-positive rate on the
safe lookalikes (`fixtures/safe-lookalikes.json`), the false-positive rate on every safe case,
precision, median turns and median cost, then the on-minus-off delta.

## How to run it

```bash
cd plugins/cklph-audit/skills/audit-backtest/bench
node ablate.mjs --model sonnet --limit 1        # one case, both conditions: check it works
node ablate.mjs --model sonnet                  # every case in the default lenses
node score.mjs results/ablation.jsonl           # re-score everything recorded so far
```

`--dry-run` prints the exact commands without running them. `--lenses`, `--case <id>` and
`--limit` narrow the set. If your shell wraps `claude` in a function that sets
`CLAUDE_CONFIG_DIR`, export it first or pass `--claude-bin`.

The full run is 45 cases times two conditions. Expect it to take a while and cost real money on a
large model.

## Read this before trusting a delta

Claude-BugHunter's eval found that on targets the model has memorized (OWASP Juice Shop), the
skills-on minus skills-off delta was zero or negative: both conditions solved everything, and the
skills only added turns and cost. A benchmark of famous bugs measures the base model, not the
plugin. These fixtures are written for this repo and are not public training data in this form,
and that is the point. Keep adding novel cases, especially ones built from real false positives
and misses found in the wild, and never copy a well-known vulnerable app into the set.

Two more limits:

- A vulnerable case counts as caught when the run reports any finding, not only the planted one.
  Read the `findings` in the JSONL before you claim recall on a specific class.
- The "on" run makes the plugin available; it does not force the full `/cklph-audit:run`
  pipeline. It measures what the lens skills add to an ordinary review prompt. The fixture gate in
  `skills/audit-backtest/SKILL.md` (Mode 1) is the measure of the full pipeline.

## Latest baseline

None yet.

| Condition | Recall | FP rate (lookalikes) | FP rate (all safe) | Precision | Median turns | Median $ | Errors |
|---|---:|---:|---:|---:|---:|---:|---:|
| on | | | | | | | |
| off | | | | | | | |
| **delta (on - off)** | | | | | | | |

The ablation design and the memorization warning are adapted from Claude-BugHunter's `eval/`
(elementalsouls/Claude-BugHunter, MIT); see the plugin's `NOTICE.md`.
