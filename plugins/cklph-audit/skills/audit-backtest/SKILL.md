---
name: audit-backtest
description: Validate a lens against ground truth — run it over fixtures/LENS/ and/or a historical git commit, compute precision/recall, and gate the lens (recall ≥ 0.8, precision ≥ 0.7 after verify) before it ships.
---

# audit-backtest

No lens ships on vibes. This skill measures a lens against **labeled ground truth** two ways and reports precision/recall vs the SPEC §10 gate. It is the validation harness behind `/cklph-audit:backtest <lens> [ref]`.

## Inputs

- `<lens>` — one of `security | correctness | architecture | docs-drift | agent-config | ambiguity` (or any lens with a `fixtures/<lens>/` folder).
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

**docs-drift note:** this lens's fixtures are markdown (`*.example.md`), and its tool takes an explicit repo root. Run `${CLAUDE_PLUGIN_ROOT}/tools/docsdrift.sh <lens-fixture-dir> <fixture-file>` with repo-root = `fixtures/docs-drift` — the parent of `should-flag/` and `should-not-flag/`, which is the root mapping the fixtures' references assume.

**ambiguity note:** each case dir (`fixtures/ambiguity/should-flag/<case>/`, `fixtures/ambiguity/should-not-flag/<case>/`) is a mini repo root: the doc plus the schema or consumer it is checked against. Run `${CLAUDE_PLUGIN_ROOT}/tools/ambiguity.sh <mode> <case-dir>` for each mode the case lists. Labels live in `fixtures/ambiguity/labels.json` (`toolExpect` for the tool, `expect` for the LLM gate), never in the fixture files. The precision gate for this lens is **0.8**, not 0.7, on purpose: it is the noisiest class, and a false "this reads two ways" costs an owner a rewrite of a clear doc. Prose/contract cases are gated; code cases are measured and reported. The LLM gate runs through `workflows/audit.workflow.js` itself (never a hand replica of the review prompt), one case at a time, with per-case args:

```js
{ path: 'tmp/ambiguity-gate/case-<NN>',
  lenses: ['ambiguity'], mode: 'full',
  config: {
    maxConcurrentAgents: 3,
    ambiguity: { code: <true for C1-C3 and N9, else false>,
                 prose: { groups: { fixture: ['**/*.example.md'] }, exclude: [] } },
    units: { autoInfer: false, list: <code cases: [{ key: 'case', globs: ['tmp/ambiguity-gate/case-<NN>/**/*.example.ts', 'tmp/ambiguity-gate/case-<NN>/**/*.example.js'] }]; else []> },
    recon: { enabled: false }, map: { enabled: false }, variant: { enabled: false },
    selfReview: { enabled: false }, riskRouting: { enabled: false },
    verify: { voters: 3 } } }
```

**Neutral copies, never the fixture path.** The case path (`should-flag/…`, `should-not-flag/…`) reaches the review prompt and every verifier payload, so it would hand the panel the verdict. **Run every gate case, and the GB-1/GB-2 LLM runs, in a throwaway gate tree**, never the working checkout: `git worktree add <scratch>/gate <branch tip>` once the change is committed (else a `cp -R` of the working tree), then delete in it every path in `GATE_TREE_DELETE` (`tests/lib/gate-tree.mjs`, the one list the leak test enforces): the fixtures and `labels.json`, the fixtures README, the SPEC, the proof doc, `tests/`, this skill, `skills/agent-config-lens/` and `plugins/cklph-os/`. `rg` and Grep skip the git-ignored `tmp/`, so in the working checkout a sentence search from the repo root lands on the labelled original. If the plugin under test loads from another path (a marketplace cache), that copy lacks `fixtures/ambiguity/` too. Run the workflow with the gate tree as its working directory. Before each run, copy the case dir from the main checkout to the gate tree's git-ignored `tmp/ambiguity-gate/case-<NN>/`, where `<NN>` is the case's position in ONE shuffled numbering over every gate run (cases and GB trees), drawn once by the gate runner and kept out of the run (never its F/N/C id, never `pre`/`post`), and set `path` (and, for code cases, the `units.list` globs `tmp/ambiguity-gate/case-<NN>/**/*.example.ts` / `*.example.js`) to that copy. `labels.json` and the ordinal map stay in the main checkout, outside the gate tree; score against them only after the run. Remove the gate tree afterwards. `exclude: []` keeps the run identical to the fixture-path form (the copy has no `fixtures/` segment).

Fixtures grow every time a real false-positive or false-negative is found in the wild, so the gate **ratchets up** over time.

## Mode 2 — Backtest against a known commit (`[ref]` supplied)

Real ground truth from git history. Check out (or read at) `[ref]`, run the lens, and compare to that commit's known findings:

- **security** → a known pre-remediation commit of a production app must re-surface that remediation's headline findings at **< ~20% false-positive after verify**.
- **architecture** → run on the commit *before* a known de-dup refactor; it should flag what the refactor later removed.
- **correctness** → run on the commit a known bugfix later patched; it should flag the bug.
- **ambiguity GB-1** (PR #22, this repo) → the pre-fix `2602aff` must flag `skills/agent-config-lens/checklist.md:13` (the mcp-review row whose default is the value `info`, which the REVIEW_SCHEMA enum rejects); the fixed `55868e5` must not. Manual, not CI: CI's checkout is depth 1, so the commits are absent (CI covers the verbatim row with a unit test). Tool level, from the repo root:

  ```
  T=$(mktemp -d); git archive 2602aff plugins/cklph-audit | tar -x -C "$T"
  ${CLAUDE_PLUGIN_ROOT}/tools/ambiguity.sh contract "$T/plugins/cklph-audit"
  ```
  PASS iff a `contract-mismatch` record for `skills/agent-config-lens/checklist.md` line 13 names the severity field and the value `info`, and the same command on `55868e5` does not return it. LLM level: in the Mode 1 gate tree, extract each commit under the git-ignored `tmp/` with the next two shuffled ordinals, `<A>` for `2602aff` and `<B>` for `55868e5` (never `pre`/`post`: the name would say which tree holds the bug) (`mkdir -p <gate>/tmp/ambiguity-gate/case-<A> && git archive 2602aff plugins/cklph-audit | tar -x -C <gate>/tmp/ambiguity-gate/case-<A>`), then one workflow run with `path: 'tmp/ambiguity-gate/case-<A>/plugins/cklph-audit'`, `lenses: ['ambiguity']` and the Mode 1 config **without** the `ambiguity` override (the default groups and excludes are under test). PASS iff a confirmed `ambiguity:contract-mismatch` at that row whose trace cites the load chain to the engine schema, nothing confirmed on `audit-report-format/SKILL.md` (`counts.info`, `unchecked`, `confirmed-exploitable`), and no contract-mismatch on that row in the same run on `55868e5` (`case-<B>`). Remove the gate tree afterwards.
- **ambiguity GB-2** (OOOhm SECURITY.md; needs a local OOOhm checkout, `<ooohm>` below) → `1ec208f` vs the fixed `cf98486`. Tool level:

  ```
  S=$(mktemp -d); git -C <ooohm> show 1ec208f:SECURITY.md > "$S/SECURITY.md"
  ${CLAUDE_PLUGIN_ROOT}/tools/ambiguity.sh prose "$S"
  ```
  PASS iff a `scope` record from the policy doc class has its line in 21-23 and a signal containing `access an admin already has`; on `cf98486` a scope site still exists (by design). LLM level: in the gate tree, write `1ec208f`'s version to `tmp/ambiguity-gate/case-<C>/SECURITY.md` and `cf98486`'s to `tmp/ambiguity-gate/case-<D>/SECURITY.md` (the next shuffled ordinals, never `pre`/`post`), one workflow run each with `path: 'tmp/ambiguity-gate/case-<C>'` (or `case-<D>`) and the default groups. PASS iff exactly one confirmed `ambiguity:scope-clause` at lines 21-23 on `1ec208f`, lines 9-11 and 15-16 clean, and none confirmed on `cf98486`. Never write into the OOOhm checkout. If those commits are gone, fall back to fixtures F2/N2.

## Output

A short report: per-mode **recall**, **precision (after verify)**, the confusion-matrix counts, each false-positive / false-negative by `file:line` (so fixtures can be added), and an explicit **PASS / FAIL vs the gate**. Read-only — writes nothing to the target repo.
