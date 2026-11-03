# cklph-audit: v4 "ambiguity" lens spec

Delta spec on top of `SPEC.md` (v1), `SPEC-v2.md` (v2) and `SPEC-v3.md` (v3). It adds **ambiguity** as
a first-class, opt-in audit concern, with matching review-time checks in cklph-os. The v1 to v3 engine
(recon, rulebook closure, coverage matrix, evidence-arbitrated verify, Map, Variant, baseline,
backtest) stays intact. This spec adds one lens, one tool, one verifier proof contract, and fixes one
live instance of the bug class it targets (the stale lensHint list).

Target versions: **cklph-audit 1.3.0** (new opt-in lens, additive schema change) and **cklph-os
0.14.0** (review and spec gate wording). Backward compatible: a 1.2.x config runs unchanged, because
the lens is opt-in and every new config key has a safe default.

Everything an agent or skill restates from the engine (schema field names, enums, rule ids, job
labels) must match `workflows/audit.workflow.js` **literally**. The engine is the single source of
truth. That rule is the subject of this spec, so it applies doubly here.

Line anchors below are from branch `feat/cklph-audit-ambiguity-lens` at `e5d75b3`.

**Revision 1 (plan-check):** D4 gains a prefix form; inline contract forms need a vocabulary anchor
(D21); the documented-sentinel window is narrowed; the tool is split into modules (D23); the
`normative=N` denominator is defined exactly; AC-010 carries its full fixture text; low/medium
proof-contract drops are surfaced to the report (`proofContractDropped`); the dogfood check is a
committed test with a named owner; the LLM gate runs **before** the version bump and is a merge
precondition (D22).

**Revision 2 (plan-check):** fixtures F3/F5/F6 (and look-alikes N4/N7) live under `agents/` or
`skills/` so they classify as instruction docs (D26), and AC-041 asserts every expected rule is
allowed for its file's docClass; `docClass` is one exported function with an anchored regex (D26);
every contract dogfood check fails closed on the stderr summary (D27, §3.7); `main.mjs` loads the
mode module dynamically and is complete before prose/code land; `skills/compliance-lens/SKILL.md:12`
stops enumerating lenses (§7.4); the LLM gate runs through `audit.workflow.js` itself in the main
session, with a new `maxConcurrentAgents` cap (D24) and a tool root equal to the scope path (D25);
§11 picks one rule for no-consumer prose (drop it); the README roadmap line is `v4.3 (1.3.0)`; a
conditional tool-fix task owns fixture/tool divergences (§9.1).

---

## 0. Why, and the decisions that shaped this spec

### 0.1 The two motivating misses (both caught by CodeRabbit, neither by us)

1. **Instruction contradicts its own contract.** `skills/agent-config-lens/checklist.md:13` at
   `2602aff` (the parent of fix `55868e5`, PR #30; bug introduced in `777cac5`, merged as PR #22 at
   `338e00f`) put `info, needs-owner-input` in the `Default` column of the rule table. The reviewer
   reads that column as a severity. `REVIEW_SCHEMA.severity` (`audit.workflow.js:200` then, `:224`
   now) allows only `critical|high|medium|low`, so every `agentcfg:mcp-review` finding was invalid
   output and silently lost. The value `info` never sits next to the word "severity": the field has to
   be **inferred from the column's sibling cells**. A "value near a field name" detector misses it.
2. **Scope clause with no clear subject.** OOOhm `SECURITY.md` at `1ec208f`, lines 21-23: "Out of
   scope: ... and findings that need access an admin already has." A reporter cannot tell whether
   admin-only findings are excluded, or findings that *grant* admin access. Fixed in `cf98486`:
   "findings that only work for an attacker who is already an OOOhm admin. A way to become an admin,
   or to act as one, is in scope."

### 0.2 Gaps confirmed in the current plugin

- docs-drift checks only that quoted tokens resolve, and only over `rulesFrom` (`:83`, `:745`).
- agent-config's doc rules are security-only, and its globs (`:88-94`) list `**/skills/**/SKILL.md`,
  not siblings such as `checklist.md`. So even agent-config would not have read the PR #22 file.
- The verifier prompt (`:584-592`) is security-shaped ("attacker-controlled input → sink") and runs
  `stripComments` on every snippet. For an ambiguity finding, the comment or prose often *is* one of
  the readings or the disambiguator.
- **A live instance of the class ships today.** The rulebook prompt (`:662`) and
  `agents/audit-recon.md:22` list 6 lensHint values; `RULEBOOK_SCHEMA.lensHint` (`:157`) allows 16. Rules
  never receive `omission`, `sca`, `iac` and the other newer hints. This spec fixes it (§4.1).

### 0.3 Conflicts between the three designs, and who won

| # | Question | Decision | Why |
|---|---|---|---|
| D1 | Code ambiguity: unit-crossed job in this lens (recall design), fold into correctness (precision design), or opt-in job (integration design)? | **Opt-in code job in this lens, off by default** (`ambiguity.code: false`), held to the precision design's bar: a cited divergent pair or a reachable divergent value, or no finding. | Folding into correctness changes a *default* lens with no `fixtures/correctness/` gate to catch the noise. Both motivating examples are prose/contract. Opt-in keeps default runs unchanged while the tool's code mode (cheap, deterministic, tested) is still available. |
| D2 | `loose-match` | **Dropped.** | security-lens owns exploitable loose matching; non-exploitable is correctness. Keeping it double-reports. |
| D3 | `modal-mix` | **Dropped as a rule.** A modal *conflict on the same requirement* is `ambiguity:contradiction`. | A lone "should" is never a finding; the epistemic "may" was the dominant false positive in the prototype. |
| D4 | `dangling-reference` | **Dropped.** Future `docs-drift:anchor` kind (out of scope). | A broken anchor is drift, not two readings; docs-drift owns references. |
| D5 | Contract-mismatch bucket | **quick-win or targeted-fix, `source: tool`**, never default owner-decision. | One prescribed value that the schema provably rejects is a defect, not a question. All three designs that addressed it agree. |
| D6 | Contract allowed set | **Union of every same-named enum in the doc's package root**, plus enums in files the doc names by basename. A different field's enum never rescues a value; it is reported as `alsoValidFor`. | Union avoids the HEAD traps (two `confidence` enums at `:233` and `:420`). Package-root scoping stops cross-plugin `status`/`type` collisions. |
| D7 | Field binding | **Table-column inference** (≥3 lead tokens in one enum, ≥2 distinct, ≥half the column, unique best field) plus header and inline forms. | Only inference catches PR #22. Proven by the recall prototype at `338e00f`/`55868e5`. |
| D8 | Prose sites: emit every normative sentence? | **No.** Emit flagged kinds only; the normative count goes to stderr as the denominator; `AMBIGUITY_ALL_SITES=1` emits all. | Measured ≈250 normative sentences vs ≈24 flagged sites in cklph-audit skills+agents: 10x reviewer load for no recall. |
| D9 | Deterministic contradiction detection | **No.** `ambiguity:contradiction` is reasoning-only. | Prototype: 9 cross-file pairs in cklph-audit, all noise. |
| D10 | Prose job shape: one job or groups? | **Config-driven prose groups** (default `policy` + `instructions`), one job each, first matching group owns a file. | 154 `skills/**/*.md` files (7,587 lines) in this repo alone; one reviewer cannot judge that. |
| D11 | Verifier: prompt-only contract, or enforced in code? | **Enforced in code**: an ambiguity finding needs a voter divergence trace at **every** severity. Reuses `reachabilityTrace`; **no `VERDICT_SCHEMA` change**. | Ambiguity is the noisiest class; LLMs invent second readings easily. Code enforcement cannot be diluted by prompt drift. |
| D12 | `stripComments` for ambiguity | **Skipped** for ambiguity findings (all modes). | A comment that defines a unit or sentinel is the disambiguator. Deliberately the opposite of omission's "code, not comments" rule; stated in the lens and verifier text. |
| D13 | `confidence` on a proven ambiguity | **`confirmed`** (or `likely` before verify). Never `needs-owner-input`; the owner question lives in `remediationBucket: owner-decision`. | Confidence describes the proof; the bucket describes the remedy. |
| D14 | Fixture labels | **`fixtures/ambiguity/labels.json` sidecar**, not in-file headers. | For this lens the label *is* the answer (Reading A/B), and for unit cases a label comment is itself a disambiguator. |
| D15 | Precision gate | **0.8** for this lens (repo default suggestion is 0.7). Recall stays 0.8. | Noisiest class; documented as deliberate in the lens skill and backtest skill. |
| D16 | No node on PATH | `[]` + loud stderr, **no awk fallback**. | One implementation; the reviewer records `coverage.toolFailures` (`audit-reviewer.md:36`). |
| D17 | Tool CLI | `ambiguity.sh <mode> <root> [--exclude <glob>]... [glob...]`, one mode per call. | Explicit mode (recall design) plus excludes for group ownership (integration design). |
| D18 | cklph-os coupling | cklph-os never calls cklph-audit's tool; it gets checklist text plus a pointer to `/cklph-audit:run ambiguity`. No fourth review axis. | `${CLAUDE_PLUGIN_ROOT}` cannot point into another plugin; a fourth axis ripples into red-team, review, survey. |
| D19 | Edit `SPEC.md`/`SPEC-v2.md`/`SPEC-v3.md` lens lists? | **No.** They are dated design records. This file is the v4 record. | Rewriting them rewrites history. The registry test excludes `SPEC*.md`. |
| D20 | Overloaded-field type detector (number vs string enum) | **Dropped from v1.** `alsoValidFor` steers the reviewer to `ambiguity:overloaded-term`. | One record at HEAD, low value, extra code. |
| D21 | Inline contract forms (D3-D6) bind any same-named field in the package | **Vocabulary anchor required** (§3.5): an inline record for F is emitted only when the doc quotes ≥2 distinct allowed(F) values or names the basename of a file holding an enum for F. Table forms (D1, D2) are unchanged. | Plan-check prototype: at HEAD `skills/feed-refresh/SKILL.md:35` `source: "osv"` (a vuln-feed source, not REVIEW_SCHEMA `source`) would fire. That doc quotes only one `source` value (`"tool"`), so the anchor drops it. PR #22 is a table (D2) and is unaffected. |
| D22 | Ship 1.3.0 with the LLM gate pending, or gate first? | **Gate first.** The Mode 1 cases and the GB-1/GB-2 LLM passes run in their own wave, before the version bump, as a **main-session step through `audit.workflow.js` itself** (§10.1), not a hand-replicated sub-agent dispatch. The release task stops without any change if the proof doc does not show `GATE: PASS`. cklph-os and cklph-audit changes ship in **one PR**, merged only on `GATE: PASS`. | `fixtures/README.md` ("does not ship degraded"), audit-backtest ("No lens ships on vibes") and STANDARD.md's Prove stage forbid the alternative. The SECURITY.md catch is only proven by the LLM pass (the tool emits a site for both the buggy and the fixed clause). Running the real engine means the D11 arbiter (trace at every severity, `PROOF_CONTRACT_DROPPED`) is what gets measured. |
| D23 | One tool implementer, or several? | **Modules**: `tools/ambiguity/{main,common,contract,prose,code}.mjs` behind `tools/ambiguity.sh`. Mode modules are pure functions over `{file,text}` lists (§3.1), so contract and prose/code are built and tested by different tasks. `main.mjs` and `common.mjs` are finished with the contract mode and never edited by the prose/code task; `main.mjs` `import()`s only the module for the requested mode. | One task for three detector modes, two splitters and 14 ACs does not fit one focused context. Dynamic import means a half-edited `prose.mjs` cannot break a `contract` run. |
| D24 | The engine fans out with no concurrency limit; the user's machine allows at most 3 agents at once | **New optional `config.maxConcurrentAgents`** (default 0 = no cap, today's behaviour): every `agent(...)` call in the engine goes through one semaphore. The gate runs with `3`. | The only way to run the real engine (D22) without exceeding the cap: a single finding already has 3 voters, and findings verify in parallel. Default 0 keeps every existing run unchanged. |
| D25 | Tool root under `args.path` | The reviewer runs `ambiguity.sh` with **root = the scope path** (`.` when unscoped) and the **unscoped** group and exclude globs; the engine keeps the scoped globs for its own seed filtering. | A case dir (or an extracted git tree under `tmp/`) scanned from the repo root would hit the walk's fixture skip and the repo-wide schema set. Rooting at the scope path makes "every case dir is a mini repo root" true for the engine too, not just for direct tool runs. |
| D26 | docClass by substring (`/agents/`) or anchored regex? | **Anchored, one exported function** `docClass(file)` in `common.mjs` (§2.1). Instruction paths match `(^\|/)(agents\|skills\|commands)/\|(^\|/)\.(claude\|cursor/rules)/`. Fixtures whose rule needs the instruction class live under `agents/` or `skills/`. | Paths are root-relative, so `agents/x.md` has no leading `/`; a literal substring check silently demotes the plugin's own agents and skills to `reference`, and F3/F6 at the case root could never be flagged, capping recall at 4/6. |
| D27 | Dogfood and doc-task contract checks fail open on `[]` | **Fail closed**: one helper (`tests/lib/contract-check.mjs`, §3.7) parses the stderr summary and fails on a missing summary, `enums=0`, too few `docs=`, or any `NOTHING scanned` / `NOT run` / `helper failed` line. Every verify and the dogfood test use it. | The wrapper prints `[]` and exits 0 on every failure by design, so "no bad records" alone proves nothing (audit-reviewer.md: zero candidates means "not checked", never "clean"). |

---

## 1. Definition and taxonomy

**Ambiguity** = an artifact (code contract, doc, instruction, policy, spec, config) that a competent
member of its actual audience (reader, caller, operator, agent) can reasonably read two ways, where
the readings lead to **different outcomes** for a consumer we can name. Two readings with the same
outcome are not a finding. A reading only a hostile or careless reader would take is not a reading.

A **contract mismatch** is the degenerate case: there is one reading, and the receiving contract
rejects it. It is a defect, proven by a citation chain, not a question.

| Rule id | Job | Recall source | Finding when | Default severity | Default bucket |
|---|---|---|---|---|---|
| `ambiguity:contract-mismatch` | prose | tool (`contract`), deterministic | A doc prescribes value V for field F (table column inferred or titled F, `F: "V"`, "at F `V`", `` `V` F``, `F` one of `a`\|`b`), the doc is on a consumer's load path, and V is outside the allowed set for F (§3.5). Chain: doc:line → consumer:line that loads it → schema:line. | medium; high if what is lost is a security finding ≥ medium or a security gate | quick-win (doc edit to an allowed value); targeted-fix if the schema must change. `suggestedFix` names both options. |
| `ambiguity:scope-clause` | prose | tool (`prose`, kind `scope`) | An inclusion, exclusion or eligibility clause whose subject or scope admits two readings that put a case on opposite sides of the line. | low; medium when the wrong reading excludes a class of security reports (e.g. privilege escalation) or misstates a privacy or data obligation | quick-win when surrounding text shows the intended reading (rewrite to remove the other); else owner-decision |
| `ambiguity:vague-conditional` | prose | tool (`prose`, kind `vague-conditional`) | An instruction someone must branch on uses an undefined threshold ("ship it once coverage looks healthy", "when the cache is old", "as needed") and the readings produce different actions. | low; medium if it gates an irreversible or security-relevant action (merge, delete, publish, skip a check) | owner-decision; quick-win if a definition exists elsewhere in the repo (link it) |
| `ambiguity:unit` (prose) | prose | tool (`prose`, kind `unit`) | A quantity in an instruction, config or policy doc has no unit, and the consumer (cite the code or reader) would act on a different magnitude. | low; medium if the wrong reading is off by ≥10x on a limit, timeout, budget or money amount | quick-win when code fixes the unit (document it); owner-decision when nothing does |
| `ambiguity:contradiction` | prose | reasoning only | Two normative statements the same consumer reads prescribe incompatible values or behaviour, including a modal conflict on the same requirement (MUST in the agent def, "optional" in the skill it loads). | medium if one consumer loads both; low otherwise | targeted-fix when the repo states precedence (fix the lesser source); else owner-decision |
| `ambiguity:overloaded-term` | prose | reasoning; seeded by `alsoValidFor` | One term used with two incompatible meanings in the same instruction scope, and acting on the wrong one changes behaviour ("tighten the filter": drop more results vs demand more evidence per result). | low; medium if one reading hides findings or skips a control | owner-decision; quick-win when the tool shows the doc named the wrong field |
| `ambiguity:unit` (code) | code (opt-in) | tool (`code`, kind `unit`) | Producer and consumer assume different units (s/ms, bytes/KB, cents/dollars), both sites cited; or an unsuffixed knob whose cited consumer and documented/configured value disagree. | medium; high for money or auth/quota windows (needs trace) | targeted-fix |
| `ambiguity:falsy-default` | code (opt-in) | tool (`code`, kind `falsy-default`) | `x \|\| d` / `x or d` / `if (!x)` where a cited caller, test, schema or config passes or allows `0`, `''` or `false`. | medium | targeted-fix |
| `ambiguity:sentinel` | code (opt-in) | tool (`code`, kind `sentinel`) | One in-band value encodes two states, and a cited consumer branches wrongly for one of them. | medium; high if it fails open on authz or quota | targeted-fix |

**Never `critical`.** Rule ids not in this table are invalid for this lens. A finding with no named
consumer and divergent outcome is not a finding (§5).

---

## 2. Scope

### 2.1 In scope: doc classes and the rules that apply

The tool assigns each markdown file a `docClass` with **one function**, `docClass(file)` exported
from `tools/ambiguity/common.mjs` (§3.1); prose mode, the fixture test and nothing else call it. The
reviewer applies only the rules marked for that class. `file` is root-relative (no leading `/`).
Checked in this order, first match wins:

| docClass | Matches (regex on the root-relative path) | Rules |
|---|---|---|
| `policy` | basename matches `^(SECURITY\|CONTRIBUTING\|CODE_OF_CONDUCT\|PRIVACY\|TERMS\|SUPPORT\|GOVERNANCE\|DISCLOSURE\|VULNERABILITY)[\w.-]*\.mdx?$` (case-sensitive), checked first; **or**, only after the instruction check fails, the basename, in any case, is one of those words, optionally followed by one `-`/`_`/`.` and a policy-type suffix (`policy`, `notice`, `statement`, `policies`, `of-service`, `of-use`, `guidelines`), then `.md`/`.mdx` (`security.md`, `docs/Security.md`, `privacy-policy.md`, `privacy_notice.md`; not `security-review.md`) | scope-clause, contradiction, unit, vague-conditional (only where it sets a reader's obligation or right) |
| `instruction` | basename matches `^(CLAUDE\|AGENTS\|GEMINI\|SKILL)\.md$\|^copilot-instructions\.md$`, **or** the path matches `(^\|/)(agents\|skills\|commands)/\|(^\|/)\.(claude\|cursor/rules)/` | contract-mismatch, contradiction, vague-conditional, unit, overloaded-term, scope-clause |
| `reference` | any other markdown in a group | contract-mismatch, unit (config tables), contradiction |

So `agents/audit-reviewer.md` and `skills/agent-config-lens/checklist.md` (root = `plugins/cklph-audit`)
are `instruction`; `myagents/x.md` and `release.example.md` at a case root are `reference`;
`.claude/commands/security-review.md` is `instruction` and `docs/Security.md` is `policy` (§15 POLICY-CASE).
`common.mjs` also exports the matrix as data, `DOC_CLASS_RULES = { policy: [...], instruction: [...],
reference: [...] }` (rule ids as in §1, without the `ambiguity:` prefix), and `RULE_IDS` (the 8
distinct rule ids of the 9 §1 rows: `ambiguity:unit` is both a prose and a code row; §15 R-IDS). Code (opt-in): source files in units, rules falsy-default, sentinel, unit.

### 2.2 Never in scope

- `CHANGELOG*.md`, `HISTORY.md`, `LICENSE*`, `NOTICE*` (history quotes old values; legal reading is
  counsel's call). Generated and vendored docs.
- `fixtures/**` in an ordinary audit (ground truth, not findings). In a backtest the fixtures are the
  target and the root is the case dir.
- Text quoted as an anti-pattern ("Don't write:", "Bad:", a blockquote under it), fenced examples
  (except for contract-mismatch, where fenced `"F": "V"` still counts), sections marked
  `[INFORMATIONAL]` or `[REFERENCE]`.
- Spec docs (`SPEC*.md`, `specs/**`) are **not in the default groups**: in this repo they are dated
  records. A user adds a group to audit them. Spec ambiguity is caught at authoring time by the
  cklph-os spec gate (§11).
- HTML comments: skipped in policy and reference docs (readers never see them); read in instruction
  docs (agents do).
- Out of scope for 1.3.0: `loose-match`, `modal-mix`, `dangling-reference`/anchors (future
  `docs-drift:anchor`), deterministic contradiction detection, a type-based overloaded-field detector,
  any change to correctness-lens or security-lens, fixing the `omissions.sh` glob and truncation bugs
  (noted in §13, separate change), the missing `fixtures/correctness/` directory (docs-drift owns that
  finding, §10.4).

### 2.3 Composition with sibling lenses

- docs-drift owns paths, scripts and packages that do not resolve. agent-config owns what instruction
  docs make an agent *do* unsafely. ambiguity owns whether they can be read two ways or contradict
  their schema. Cite across; never double-report.
- security owns exploitable loose matching and auth sentinels that are already exploitable defects;
  if a code ambiguity finding is exploitable, use the security rule id instead.

---

## 3. Tool contract: `tools/ambiguity.sh` + `tools/ambiguity/*.mjs`

### 3.1 Files

- `tools/ambiguity.sh`: thin bash wrapper (~30 lines), executable. Validates the mode, checks root
  and node, runs `node <tools>/ambiguity/main.mjs <mode> <root> [args]`, keeps the exit-0 /
  loud-stderr contract. Not `node -e`: the extractor at `tests/tools.test.mjs:28-36` cuts a body at
  the first `'`. (The `.sh`-only syntax sweep at `tests/tools.test.mjs:27` and CI's
  `bash -n plugins/*/tools/*.sh` ignore the `ambiguity/` subdirectory, which is intended.)
- `tools/ambiguity/` (zero-dependency Node ≥18 ESM):

| Module | Owns | Exports (exact) |
|---|---|---|
| `main.mjs` | CLI parse, walk (§3.3), per-mode file selection (globs, `--exclude`, extensions, test-path skip and its `skippedTests` count, the CHANGELOG/LICENSE skips), dispatch by **dynamic `import()` of only the requested mode's module**, passing `{ allSites }` from `AMBIGUITY_ALL_SITES`, sort, cap, `JSON.stringify` to stdout, and **all three** stderr summary lines (§3.3), formatted from the returned `stats` | none (entry point) |
| `common.mjs` | `globMatch` (verbatim port of `audit.workflow.js:520-529`), `walk`, `isTestPath`, `PRIORITY`, `sortRecords`, `docClass`, `DOC_CLASS_RULES`, `RULE_IDS` (§2.1) | `globMatch(file, globs)`, `walk(root) → string[]` (root-relative, code-point sorted), `isTestPath(file)`, `PRIORITY`, `sortRecords(records)`, `docClass(file) → 'policy'\|'instruction'\|'reference'`, `DOC_CLASS_RULES`, `RULE_IDS` |
| `contract.mjs` | §3.5 | `scanContract({ schemaFiles, docFiles, packageMarkers }) → { records, stats: { enums, fields, docs } }` |
| `prose.mjs` | §3.4 | `scanProse(docFiles, { allSites }) → { records, stats: { files, sentences, normative } }` |
| `code.mjs` | §3.6 | `scanCode(srcFiles) → { records, stats: { files } }` |

`schemaFiles`, `docFiles`, `srcFiles` are arrays of `{ file, text }` (root-relative path, `\r`
stripped). `packageMarkers` is the list of root-relative paths of `.claude-plugin/plugin.json`,
`package.json`, `pyproject.toml`, `go.mod` found by the walk. Mode modules never touch the
filesystem, `process.env` or stdout; `main.mjs` reads `AMBIGUITY_*` env vars and passes options.
Until `prose.mjs`/`code.mjs` are implemented, they may exist only as stubs that write
`ambiguity.sh: <mode> mode not implemented, NOTHING scanned` to stderr through a returned
`stats.notImplemented: true` (main prints it) and return no records. A stub is never released.

`main.mjs` and `common.mjs` are written **complete** in the same change as the contract mode: the
prose and code summary lines, the `allSites` option and the `skippedTests` count all live there, so
replacing the prose/code stubs never requires editing them (D23). Implementing a mode = replacing
its module and adding its tests.

Test helpers (dev-only, not shipped behaviour, under `tests/lib/`, which `node --test
tests/*.test.mjs` does not pick up):
- `tests/lib/engine-source.mjs`: `parseProseDefault(src)` → `{ policy: [...], instructions: [...] }`
  and `parseExcludeDefault(src)` → `[...]`, reading the `AMBIGUITY_PROSE_DEFAULT` /
  `AMBIGUITY_EXCLUDE_DEFAULT` literals out of the engine source text (single-quoted strings, the
  exact shape in §4.2); `parseLensHints(src)` → the `LENS_HINTS` array. Each throws on a missing or
  unparseable literal (never returns an empty default).
- `tests/lib/contract-check.mjs`: §3.7.

### 3.2 CLI

```
ambiguity.sh <mode> <root> [--exclude <glob>]... [glob...]
  mode     = code | prose | contract
  code     globs filter source files (the unit's globs); none = default source extensions
  prose    globs filter markdown files; none = every *.md / *.mdx / *.mdc under root (§15 MDC)
  contract globs filter the DOCS; schemas are always collected from all of root
  --exclude (repeatable) drops matching root-relative paths (docs in contract mode)
env: AMBIGUITY_MAX (default 500)
     AMBIGUITY_ALL_SITES=1   prose: also emit a `normative` record for EVERY normative sentence (§3.4)
     AMBIGUITY_INCLUDE_TESTS=1  code: do not skip test paths
```

Glob matching: port `globMatch` from `audit.workflow.js:520-529` verbatim (`**/` matches zero or more
directories). Do **not** copy the bash `case` matching at `omissions.sh:96`, which does not match
`src/a.ts` against `src/**/*.ts`.

### 3.3 Output and determinism

- **One JSON array on stdout. Exit 0 always.** Output via `JSON.stringify` only.
- Every record: `{ file, line, kind, rule, signal }`. Paths root-relative. `\r` stripped (CRLF-safe).
- Sort by (kind priority, file, line, field, value). Priority: `contract-mismatch`, `scope`, `unit`,
  `vague-conditional`, `falsy-default`, `sentinel`, `normative`. Directory entries sorted by code
  point (`a < b`), never `localeCompare`.
- **Truncation is loud**: keep the top `AMBIGUITY_MAX` records by priority, and write
  `ambiguity.sh: <N> record(s), truncated to <MAX>` to stderr.
- **One stderr summary line, always**, machine-parseable (recon quotes it as the denominator):
  - `ambiguity.sh prose: files=F sentences=S normative=N emitted=E`
  - `ambiguity.sh code: files=F skippedTests=T emitted=E`
  - `ambiguity.sh contract: enums=K fields=[a,b,...] docs=D emitted=E`
  - zero enums: `ambiguity.sh contract: no schema enums found under <root>, contract check NOT run`

**Failure modes** (each prints `[]` on stdout, exits 0):

| Condition | stderr contains |
|---|---|
| unknown or missing mode | `unknown mode '<m>' (code\|prose\|contract), NOTHING scanned` |
| missing root | `root not found: <root>, NOTHING scanned` |
| no `node` on PATH | `node not found, NOTHING scanned` |
| helper exits non-zero or prints nothing | `helper failed (exit N), NOTHING scanned` |
| an unreadable or undecodable doc or source file | `skipped <path>: <reason>` (others still emitted; reason `not valid UTF-8` or `too large (N bytes > M)`, §15 CAP; a name with a control char is JSON-quoted, §15 NAMES) |
| contract: an oversized or unreadable schema candidate, or a glob-matched code/JSON doc (§15 DOC-CAP) (not a doc failure, but partial: the reviewer records `contract check partial: enums in <files> not harvested`) | `ambiguity.sh contract: N schema candidate(s) over the size cap not harvested: <files>` / `... unreadable, not harvested: <files>` (§15 SCHEMA-CAP) |
| prose/contract selects 0 readable docs (contract: with enums > 0) | `ambiguity.sh <mode>: 0 docs selected or readable, NOTHING scanned` (the summary line still follows; §15 EMPTY) |

**Walk:** prune `node_modules .git vendor` everywhere and `dist build .next coverage` unless the
dir's own parent is an instruction dir (`agents`, `skills`, `commands`, `.claude`, `.cursor/rules`)
that is not a package root, printing `ambiguity.sh: pruned <dir>/ (generated output)` for each of
the latter (§15 PRUNE). Skip `*.example.*` files whose
root-relative path contains a `fixtures/` segment (a backtest roots *at* the case dir, so it still
sees them). Skip `CHANGELOG*`, `HISTORY.md`, `LICENSE*`, `NOTICE*` in prose and contract modes.

### 3.4 `prose` mode

**Markdown to units:** skip YAML front matter; skip fenced blocks (close only on the same fence char
at ≥ the opening length); skip HTML comments in `policy` and `reference` docs (multi-line); ATX and
setext headings with a heading stack; each non-separator table row is one unit (cells joined by
` | `); a list item starts a unit and following non-blank lines that are not a new item, heading,
table or fence are **joined** to it; paragraphs are runs of non-blank lines; strip leading `>`. Keep
an offset→line map so each sentence reports its **own starting line**. Indented code blocks are not
detected in v1 (§13).

**Units to sentences:** mask code spans as placeholders; reduce `[t](u)` to `t`; protect
`e.g. i.e. etc. vs. cf. approx. incl. No. Fig.` and decimals; split on
`(?<=[.!?])["')\]]*\s+(?=[A-Z0-9"'*_(\[]|<placeholder>)`. Match markers against the masked text;
`signal` = the sentence with code spans restored, ≤240 chars.

**Record:** `{ file, line, kind, rule, docClass, heading, signal, terms: [matched markers] }`. One
record per kind a sentence hits. `docClass` comes from `common.docClass(file)` (§2.1), never a
local re-implementation.

**Kinds:**
- `scope` (rule `ambiguity:scope-clause`): any of
  - sentence matches `\b(out of scope|out-of-scope|in scope|in-scope|not in scope|excluded|exclusions?|not covered|does not (cover|apply)|do not (cover|apply)|applies only|only applies|not eligible|ineligible|qualif(y|ies) for)\b` (case-insensitive);
  - sentence sits under a heading matching `\b(scope|exclusions?|excluded|not covered|ineligible|eligib|qualifying)`;
  - **policy docs only:** sentence matches `\b(except( for| when| where| if)?|unless|excluding|other than|apart from)\b`. In instruction docs "unless" is ordinary grammar.
- `vague-conditional` (rule `ambiguity:vague-conditional`): sentence matches
  `\b(if|when|unless|where|once|until)\b` AND a vague term:
  `appropriate(ly)?|reasonabl[ey]|significant(ly)?|as needed|if necessary|where possible|when possible|as appropriate|sufficient(ly)?|timely|promptly|soon|quickly|recent(ly)?|stale|mostly|large|small|many|few|several|frequently|often|rarely|relevant|and/or|and so on|or similar|etc\.?`
- `unit` (rule `ambiguity:unit`): all hold: a quantity noun
  (`timeouts?|ttl|delay|interval|limits?|max(imum)?|min(imum)?|budget|size|retention|expir(y|es|ation)|duration|threshold|cap|retries|wait|within|after|every`)
  within 24 chars before a number; the number is not preceded by `[\w/.-]` (kills `HTTP/2`); the
  number is not 0; the next token after the number (skipping at most one `)`) is end of sentence,
  punctuation, or one of `and|or|to|before|after|by|for|then|is|are|was`. So "Retry after 30." flags;
  "within 3 business days", "timeout of 30 seconds", "(default 6) projects" do not.
  **Config-table rows** (this is the common real shape): a table row whose first cell, stripped of
  backticks and lowercased with `.`/`_`/`-` removed, passes the §3.6 unit-name test, and that has a
  cell that is a bare nonzero number (backticked or not), and no unit word
  (`ms|milliseconds?|seconds?|secs?|minutes?|mins?|hours?|days?|bytes?|kb|mb`) anywhere in the row,
  is a `unit` record at that row. So `| verify.maxWait | ... | 300 |` flags; `verify.voters` and
  `verify.maxWaitMs` do not.
- `normative` (rule `ambiguity:site`): a sentence is **normative** when it matches
  `\b(MUST( NOT)?|SHALL( NOT)?|SHOULD( NOT)?|REQUIRED|MAY)\b` or case-insensitive
  `\b(must( not)?|never|always|do not|don't|required)\b`.
  - **N (exact):** `normative=N` on stderr is the number of normative sentences across all scanned
    files, **whether or not another kind also fired on them**. It is printed on every prose run.
  - With `AMBIGUITY_ALL_SITES=1`, **every** normative sentence also gets a `normative` record, in
    addition to any other kind it hit. So the count of `normative` records in an all-sites run equals
    N from the default run, and the other kinds are identical in both runs. Without the env var, no
    `normative` records are emitted.

Headings are context (the heading stack), never units: no record ever has a heading line's number.
`sentences=S` counts every sentence the splitter produced.

The CodeRabbit sentence (OOOhm `1ec208f:SECURITY.md`) yields `scope` at line 21 (the sentence start,
inside the paragraph at 20-23), `docClass: policy`, `heading: Scope`. The **fixed** text still yields
a scope site: a clear clause is still a site by design. Tool-level precision is not asserted for
prose; the reviewer and verifier decide.

### 3.5 `contract` mode

**Collect schema enums** from `*.js *.mjs *.cjs *.ts *.tsx *.json` under root (minus pruned and test
paths, `*-lock.json` and `*.min.js`; §15 SCHEMA-CAP). Only string literals count; a field needs ≥2 values; each enum records `at: path:line`.
- H1 JSON-schema-like: `(['"]?)([A-Za-z_][\w-]*)\1\s*:\s*\{[^{}]*?\benum['"]?\s*:\s*\[([^\]]*)\]` (may
  cross newlines; one object level). Matches `audit.workflow.js:224,233,235,258` and JSON equivalents.
- H2 zod: `([A-Za-z_]\w*)\s*:\s*z\.enum\(\s*\[([^\]]*)\]`.
- H3 TS literal union: `([A-Za-z_]\w*)\??\s*:\s*('…'|"…")(\s*\|\s*('…'|"…"))+`, and
  `type\s+(\w+)\s*=` + a literal union (field = alias with first letter lowercased).
- H5 same-file const array: `enum: NAME` where `const NAME = [ 'a', 'b', ... ]` is in the same file
  (string literals only). Needed so the engine stays checkable after `LENS_HINTS` (§4.1).
- GENERIC field names never matched against docs: `type kind mode format name id version level lang language method`.

**Link a doc to its schemas.** Allowed(F) for a doc = **union** of every enum for F that (a) lives
under the doc's package root, or (b) lives in a file whose basename the doc mentions. Package root =
nearest ancestor (stopping at root) containing `.claude-plugin/plugin.json`, `package.json`,
`pyproject.toml` or `go.mod`; else root.

**Prescriptions.** Docs are `*.md`/`*.mdx`/`*.mdc` (§15 MDC) with HTML comments removed. Fenced blocks are scanned and
hits carry `inFence: true`. Code-file string text is scanned only with D6 and `|` separators.
- **D1 `table-header`**: a header cell (stripped of `` ` * _ ``) equals F case-insensitively.
- **D2 `table-inferred`** (catches PR #22): a column is assigned to F when ≥3 cells have a lead token
  in allowed(F) (lowercased), ≥2 of those distinct, those cells are ≥ half the cells that have a lead
  token, and F is the unique best field (a tie skips). Lead token: strip leading `` \s*_`"' ``, take
  `^[A-Za-z][\w-]*` only if followed by end, whitespace or one of `` , ; ( ) ` " ' * _ `` and **not**
  by `:`, `/` or `.` (so `CWE-89`, `supplychain:x`, `agentcfg:x` never read as values). Only the lead
  token is checked, so `info, needs-owner-input` yields exactly one record.
- **D3 `inline-assign`**: `["']?\bF\b["']?\s*[:=]\s*(["'\`]?)([A-Za-z][\w-]*)\1`, accepted only when
  the value is quoted, or inside a code span, or inside a fence.
- **D4 `inline-connector`**, two forms, both `via: inline-connector`:
  - post-field: `` \bF\b`?\s*(→|->|\bto\b|\bof\b|\bat\b|\bas\b|\bis\b|\bequals?\b)\s*[`"']([A-Za-z][\w-]*)[`"'] `` ("set severity to `info`", "severity is `info`");
  - prefix: `` \b(at|to|as|with)\s+`?F\b`?\s+[`"']([A-Za-z][\w-]*)[`"'] `` ("record these at severity `info`").

  Both case-insensitive. Prototyped in node: "Record these at severity `info`." matches the prefix
  form only; "severity from consequence of the wrong reading", "the value `info`, which the severity
  enum rejects" and "at severity medium" (unquoted) match neither.
- **D5 `inline-prefix`**: `` [`"']([a-z][\w-]*)[`"']\s+`?F\b `` ("`info` severity").
- **D6 `inline-list`**: `` \bF\b`?\s*(∈|\(|=|:|\bin\b|\bone of\b)\s*(V(\s*(\||/)\s*V)+) ``, V =
  `` [`"']?[a-z][\w-]*[`"']? ``; each element checked. Commas are not separators.

**Vocabulary anchor (D3-D6 only).** An inline record for F in a doc is emitted only when that doc
(HTML comments removed, fences included) either (a) contains ≥2 **distinct** members of allowed(F)
as backticked or quoted tokens (`` `v` ``, `"v"`, `'v'`, compared lowercased), or (b) mentions the
basename of a file that holds an enum for F. The anchor is per (doc, field). D1 and D2 never need
it: a header naming F, or ≥3 cells already in F's enum, is its own anchor.

**Emit** when the value, lowercased, is not in allowed(F), matches `^[a-z][a-z0-9-]+$`, is not in
SKIP (`see same varies depends context per as the a an any all very usually typically either both tbd n na by from set only one each no not never`)
and is not F. A doc naming only a **subset** of an enum is never reported.

**Self-reference rule (for every doc this change writes).** A doc that *talks about* the PR #22 bug
names the bad value without a binding form: write "the value `info`" or "`info`, which the severity
enum rejects", never "severity `info`", "at severity `info`", "`info` severity" or
`severity: info`. Every cell of a table column holding severities starts with an allowed severity
("never critical" goes in prose, not in a severity column). The dogfood check (AC-072) enforces this
on the default-group docs; `SPEC*.md` and `docs/**` are outside the default groups and are not
checked.

**Record:**
```json
{ "file": "...", "line": 13, "kind": "contract-mismatch", "rule": "ambiguity:contract-mismatch",
  "field": "severity", "value": "info", "allowed": ["critical","high","medium","low"],
  "alsoValidFor": [], "schema": "workflows/audit.workflow.js:200",
  "via": "table-header|table-inferred|inline-assign|inline-connector|inline-prefix|inline-list",
  "inFence": false, "signal": "..." }
```
`schema` = the first (sorted) enum location for F in the linked set. `alsoValidFor` = other fields in
the linked set whose enum contains the value, sorted, never including GENERIC field names; non-empty means the reviewer should consider
`ambiguity:overloaded-term` (the doc named the wrong field) instead.

**HEAD precision traps the tool must survive** (pinned by fixture N1 and the dogfood AC):
`skills/audit-report-format/SKILL.md:34` `counts: {..., info: 4}` (a counts key, no field binding);
`:79` "Statuses are exactly ... `unchecked`" (`Statuses` ≠ `\bstatus\b`); `:175`
`confirmed-exploitable` (allowed by the second `confidence` enum at `:420` via the union);
`skills/feed-refresh/SKILL.md:35` `` `{ source: "osv", ... }` `` (a vuln-feed source; the doc quotes
only one REVIEW_SCHEMA `source` value, `"tool"`, so the D21 anchor drops it).

### 3.6 `code` mode (consumed only when `ambiguity.code: true`)

**Files:** extensions as `omissions.sh:100`, plus `.yaml .yml .toml .env.example .env.sample`; never
`.env`. Test paths skipped unless `AMBIGUITY_INCLUDE_TESTS=1`:
`(^|/)(__tests__|tests?|spec|__mocks__)/`, `\.(test|spec)\.[cm]?[jt]sx?$`, `_test\.(go|py)$`,
`(^|/)test_[^/]*\.py$`. Also skip `*.min.js`, `*.d.ts`, lockfiles.

**Per line:** `code` (comments removed; JS-family `/*…*/` tracked across lines; `//` stripped unless
preceded by `:`; `#` comments only in py/sh/yaml/toml), `masked` (`code` with single-line string
literal contents blanked), `raw` (kept for the documented-sentinel and unit-comment exemptions).

**Record:** `{ file, line, kind, rule, signal: trimmed code ≤160, detail? }`.

- **`falsy-default`**: JS/TS on `masked`:
  `(?<![\w$.])([A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*|\[[^\]]+\])*)\s*\|\|=?\s*(-?[1-9]\d*(?:\.\d+)?|-?0\.\d*[1-9]\d*|true)\b`;
  Python `([A-Za-z_][\w.]*)\s+or\s+(-?[1-9]\d*(?:\.\d+)?|True)\b`; guard form
  `if\s*\(\s*!\s*([\w$.]*?(count|limit|max\w*|min\w*|timeout|ttl|retries|size|port|offset|page|index|threshold|delay|interval|amount|price|qty|quantity))\s*\)`
  (case-insensitive, `detail: 'guard'`). Never: `?? 3`; defaults `''`, `0`, `false`, `[]`, `{}`,
  `null`; string defaults (`|| 'anonymous'`).
- **`sentinel`**: on `masked`,
  `\b([\w$.]*?(limit|max\w*|timeout|ttl|retries|depth|budget|quota|size|expir\w*)\w*)\s*(?:===?|!==?|=|:)\s*(-1|Infinity|Number\.MAX_SAFE_INTEGER|9{4,})\b`;
  `= 0`/`: 0` only for names ending `timeout|ttl|limit|max\w*`. Skip lines with `indexOf(`,
  `findIndex(`, `lastIndexOf(`, `.search(`. Skip when the `raw` text of **line i itself or line i-1
  only** (never lines below, never two lines up) matches
  `/(-1|0|Infinity)\s*(=|means|:|→|->|is|for)\s*(no|unlimited|disabled|off|none|infinite|never|default)|\b(unlimited|no limit|disables?|infinite|never expires)\b/i`
  (a documented sentinel: a same-line or preceding-line comment IS the disambiguation). Prototyped on
  the AC-008 file: line 9 `const maxRetries = -1;` flags, line 10 (same-line comment) is exempt. The
  earlier ±2 window exempted line 9 because of line 10's comment.
- **`unit`**: identifier lowercased with `_`/`-` removed ENDS with one of
  `timeout|delay|interval|ttl|expiry|expires|expiresin|maxage|duration|wait|backoff|cooldown|retention|period|grace|debounce|throttle|staletime|cachetime|gctime|persist|maxlife|lifetime|maxsize|sizelimit|bodylimit|quota`
  (so `timeoutMs`, `ttlSeconds` pass naturally; `age`, `window` excluded). Assignment forms with a
  numeric literal or a product (`30 * 1000`): JS `const|let|var|static|readonly NAME = N` or object
  key `NAME: N` (skip the key when the text before it on the line has more `(` than `)`: a library
  call option such as `page.goto(url, { timeout: 30000 })`); Python `NAME = N` with the same skip;
  shell `NAME=N` and `${NAME:-N}`; YAML/TOML `^\s*NAME\s*[:=]\s*N\s*(#.*)?$`. Skip 0. Skip when a
  comment on the same `raw` line names a unit (`ms|milliseconds?|seconds?|secs?|minutes?|mins?|hours?|days?|bytes?|kb|mb`).
  `detail` = the name.

### 3.7 Fail-closed contract check (`tests/lib/contract-check.mjs`, D27)

One helper, used by every task verify that runs the contract mode over docs and by the committed
dogfood test. Nothing hand-rolls a `node -e` filter over the tool's stdout.

```
node plugins/cklph-audit/tests/lib/contract-check.mjs --root <dir> --min-docs <N>
     [--engine-globs] [--exclude <glob>]... [--tool <path>] [glob...]
```
Exports `runContractCheck({ root, minDocs, engineGlobs, excludes, globs, tool }) → { ok, problems:
string[], summary: { enums, fields, docs, emitted }, offenders: record[] }`; the CLI prints one line
per problem and exits 1 when `!ok`, else prints `contract-check OK: enums=K docs=D emitted=E` and
exits 0.

- Runs `<tool> contract <root> --exclude <each> <globs>` (default tool: the plugin's
  `tools/ambiguity.sh`). `--engine-globs` appends the `policy` and `instructions` globs parsed from
  `workflows/audit.workflow.js` by `engine-source.parseProseDefault` (never a hand copy).
- **Fails (problem recorded) when any of:** stdout is not a JSON array; no stderr line matches
  `^ambiguity\.sh contract: enums=(\d+) fields=\[([^\]]*)\] docs=(\d+) emitted=(\d+)$`; `enums` is 0;
  `docs` < `minDocs`; any stderr line contains `NOTHING scanned`, `NOT run` or `helper failed`; any
  record has `kind: 'contract-mismatch'` and an empty `alsoValidFor` (each printed as an offender:
  `file:line field=value via=...`).
- `docs=D` counts the doc files that survived the globs and excludes (§3.3).

Minimum doc counts used by the plan's verifies: agents + report task 8, config surface task 5, lens
skill task 3, dogfood ≥ 40 (44 default-group docs under `plugins/cklph-audit` at `e5d75b3`).

---

## 4. Engine wiring (`workflows/audit.workflow.js`)

### 4.1 One lens-hint list (fixes the live instance)

Above `RULEBOOK_SCHEMA` (~`:143`):
```js
const LENS_HINTS = ['security','correctness','architecture','docs-drift','sca','iac','container','k8s','supply-chain','compliance','concurrency','state-machine','economic','omission','agent-config','ambiguity','any']
```
`:157` becomes `lensHint: { type: 'string', enum: LENS_HINTS }`. The rulebook prompt at `:662` uses
`` `(${rulebookHints.join('|')})` ``, where `rulebookHints` is LENS_HINTS filtered to the pre-v4 base
hints plus the running review lenses (§15 HINTS). `agents/audit-recon.md:22` replaces its copied list with "exactly
one of the lensHint values listed in your dispatch prompt".

### 4.2 Config and globs (next to `:84-108`)

```js
const scopeGlobs = gs => scopePath ? gs.map(g => `${scopePath}/${g}`) : gs
const AMBIGUITY_PROSE_DEFAULT = {
  policy: ['**/SECURITY.md','**/CONTRIBUTING.md','**/CODE_OF_CONDUCT.md','**/PRIVACY*.md','**/SUPPORT.md','**/GOVERNANCE.md','README.md','**/security.md','**/contributing.md','**/code_of_conduct.md','**/privacy*.md','**/support.md','**/governance.md'],
  instructions: ['**/.claude/**/*.md','**/skills/**/*.md','**/agents/*.md','**/commands/*.md','**/.cursor/rules/**','**/.github/copilot-instructions.md','**/CLAUDE.md','**/AGENTS.md'],
}
const AMBIGUITY_EXCLUDE_DEFAULT = ['**/CHANGELOG*.md','**/HISTORY.md','**/LICENSE*','**/NOTICE*.md','**/fixtures/**','**/node_modules/**','**/vendor/**']
const ambCfg = config.ambiguity ?? {}
const ambCode = String(ambCfg.code ?? false).toLowerCase() === 'true'
// unscoped (tool-root-relative) groups; the engine scopes them for its own seed filtering
const ambGroupsRaw = Object.entries(ambCfg.prose?.groups ?? {
  ...AMBIGUITY_PROSE_DEFAULT,
  instructions: [...new Set([...AMBIGUITY_PROSE_DEFAULT.instructions, ...rulesFromList])],
}).filter(([, g]) => Array.isArray(g) && g.length)
const ambGroups = ambGroupsRaw.map(([k, g]) => [k, scopeGlobs(g)])
const ambExcludeRaw = ambCfg.prose?.exclude ?? AMBIGUITY_EXCLUDE_DEFAULT
const ambExclude = [...scopeGlobs(ambExcludeRaw), ...(config.ignore ?? [])]
// D25: the reviewer's tool root is the scope path; config.ignore is repo-relative, so only entries
// under the scope are passed to the tool (rebased); others cannot match inside it anyway.
const ambToolRoot = scopePath || '.'
const ambToolIgnore = (config.ignore ?? []).flatMap(g => !scopePath ? [g] : g.startsWith(scopePath + '/') ? [g.slice(scopePath.length + 1)] : [])
const ambAllProse = ambGroups.flatMap(([, g]) => g)
const isProseFile = f => /\.(md|mdx|markdown|rst|txt)$/i.test(f) || (ambAllProse.length > 0 && globMatch(f, ambAllProse))
```
- `**/skills/**/*.md`, never `SKILL.md` only: the PR #22 file is a SKILL.md sibling.
- `ambiguity.prose.groups` REPLACES the defaults; `ambiguity.prose.exclude` REPLACES the default
  excludes; `config.ignore` is always added. Same semantics as `agentConfig.globs`.
- `agentConfigGlobs` may be refactored onto `scopeGlobs` only if its plugin-dir special case
  (`:105`) stays agent-config-only and scenario C still passes.

### 4.3 Recon branch (`:672-677`)

Add an arm for `lens === 'ambiguity'`: recon the prose groups (with skips) using
`${CLAUDE_PLUGIN_ROOT}/tools/ambiguity.sh` `prose` and `contract`, with the same TOOL ROOT and
unscoped globs as the review prompt (§4.6, D25); one denominator per group from the
`normative=` and `emitted=` stderr counts, one for contract (`enums=`/`docs=`); every
contract-mismatch record is a seed. When `ambCode`, also `code` mode across the source tree; else
state "code is OUT of scope (ambiguity.code is off)".

### 4.4 Jobs (`:733-752`)

```js
const SPECIAL_LENS = new Set(['docs-drift', 'agent-config', 'compliance'])
const unitLenses = lenses.filter(l => !SPECIAL_LENS.has(l) && !(l === 'ambiguity' && !ambCode))
// after the docs-drift / agent-config pushes:
let ambProseJobs = 0
if (lenses.includes('ambiguity')) {
  const owned = [], ownedRaw = []                    // the first matching group owns a file
  for (const [i, [key, globs]] of ambGroups.entries()) {
    const raw = ambGroupsRaw[i][1]
    jobs.push({ unit: { key: `prose-${key}`, title: `Prose: ${key}`, globs, exclude: [...ambExclude, ...owned],
      toolGlobs: raw, toolExclude: [...ambExcludeRaw, ...ambToolIgnore, ...ownedRaw], prose: true, confidence: 1 }, lens: 'ambiguity' })
    owned.push(...globs); ownedRaw.push(...raw); ambProseJobs++
  }
  if (!ambProseJobs) log('ambiguity: no prose groups configured, prose NOT reviewed (flagged)')
}
```
- Job labels: `review:prose-<group>:ambiguity`. Unit ambiguity jobs (code on) are
  `review:<unitKey>:ambiguity`.
- Log line (`:751-752`) appends `+ N ambiguity prose job(s)`; the no-units degrade message mentions
  the prose jobs. Update the header comment (`:21-24`) and the comment at `:733-736`.
- Quick mode: prose jobs are pushed after unit sampling, so they are never sampled away.
- If any unit key starts with `prose-`, log a collision warning.

### 4.5 Seed filter (`:806-814`)

```js
const nf = s => s?.file?.replace(/^\.\//, '')
const keep = job.lens === 'agent-config' ? /* unchanged */
  : job.unit.prose ? s => { const f = nf(s); return !!f && globMatch(f, job.unit.globs) && !globMatch(f, job.unit.exclude) }
  : job.lens === 'ambiguity' ? s => { const f = nf(s); return !!f && inUnit(s) && !isProseFile(f) && !globMatch(f, ambExclude) }
  : inUnit
```

### 4.6 Review prompt (`:822`, block after the sca block ~`:832`)

- The unit line appends `` (skip: <exclude JSON>) `` when `job.unit.exclude` is set.
- For `job.lens === 'ambiguity'`:
  - prose job (D25: the tool runs from the scope root with the **unscoped** globs; the prompt spells
    out the literal commands so the reviewer never picks a root): "AMBIGUITY PROSE JOB: review ONLY
    the files matching the globs, skipping the skip list. TOOL ROOT: `<ambToolRoot>`. Run exactly
    `ambiguity.sh prose <ambToolRoot> --exclude <each toolExclude glob> <each toolGlobs glob>` and the
    same with `contract`; tool paths are relative to TOOL ROOT; schema enums come from all of TOOL
    ROOT."
  - code job: "AMBIGUITY CODE JOB: source files only; prose belongs to the prose jobs. Run
    `ambiguity.sh code <ambToolRoot> <the unit's globs with the scope prefix stripped>`. A finding needs a cited
    divergent pair or reachable value."
  - both: "Every finding sets `readings { a, b, consumer, divergence }`, each with file:line where one
    exists; consumer = the caller, parser, schema, agent, or named human-reader role whose outcome
    differs. No second reasonable reading, or no divergent outcome: not a finding. Never critical.
    Bucket: contract-mismatch → quick-win|targeted-fix (`source: tool`, `confidence: confirmed`);
    scope-clause/vague-conditional/overloaded-term/contradiction → quick-win when the repo shows the
    intended reading, else owner-decision. Never use confidence needs-owner-input for ambiguity."

### 4.7 `REVIEW_SCHEMA` (`:239`)

Add, optional:
```js
readings: { type: 'object', properties: { a: { type: 'string' }, b: { type: 'string' }, consumer: { type: 'string' }, divergence: { type: 'string' } } },   // ambiguity lens
```
No other schema changes. **`VERDICT_SCHEMA` is unchanged.**

### 4.8 Verifier (`verifyFindings`, `:565-631`)

```js
const ambig = lens === 'ambiguity' || /^ambiguity:/.test(String(f.rule ?? ''))
// prompt: ambig ? AMBIGUITY_PROOF_PROMPT (§5) : existing text, unchanged
// FINDING payload:
snippet: ambig ? f.snippet : stripComments(f.snippet),
...(ambig && f.readings ? { readings: f.readings } : {}),
// arbiter (:617):
const confirmed = pass && (!(isHighSev || ambig) || !!voterTrace)
if (ambig && pass && !voterTrace && !isHighSev) log(`verify:${f.id ?? f.file}: ambiguity held without a divergence trace, refuted by the proof contract`)
```
`heldUntraced` is unchanged (critical/high only), so a high ambiguity finding without a trace is
surfaced as held; a low/medium one is not confirmed. That is the deliberate precision-first choice,
but it is **not silent**: each such finding is pushed to a run-level
`proofContractDropped` list of `{ id, file, line, rule, severity }`, and the synth prompt receives it
as `PROOF_CONTRACT_DROPPED: <JSON>` (§4.10). The report shows the count and ids in the Coverage
summary; the findings themselves are not promoted.

### 4.9 Variant (`:1006`)

`const seeds = fresh.filter(f => ['critical','high'].includes(f.severity) && !isAmbiguityFinding(f, f.lens))`
(lens `ambiguity` OR rule `ambiguity:*`, the verifier's own predicate; §15 PRED).
The contract check already enumerates every mismatch repo-wide; variant-sweep hunts code siblings.

### 4.10 Synthesizer prompt (`:1285-1313`)

Add: "For `ambiguity:*` findings render Readings (A / B), Diverges for (consumer and both outcomes,
from `readings` and `reachabilityTrace`), and Proposed wording (old line, new line). Phrase each
owner-decision ambiguity in Owner decisions as an A-or-B question with one rewrite per reading, and
group those entries per document. In the Coverage summary, list `PROOF_CONTRACT_DROPPED` as
'Dropped by the ambiguity proof contract (held without a divergence trace): N' with their ids."
`readings` already reaches synth through `publicFresh` (`:1283`). Whenever the proof contract was in
play (the ambiguity lens ran, or any finding went through it), `PROOF_CONTRACT_DROPPED` is always
passed (`[]` when empty) so the synthesizer can state zero; other runs get neither the sentence nor
the block (§4.11, §15 SYNTH).

### 4.11 Constraints

`node --check` passes. No `Date.now()`, `Math.random()`, argless `new Date()`. Terse comment style and
`════` dividers. No other lens's prompt, verify path, voter count or job set changes.

### 4.12 Concurrency cap (D24, separate change from §4.1-4.10)

```js
// D24: optional cap on agents alive at once (0 = no cap, the default and today's behaviour).
const maxConcurrentAgents = Math.max(0, Number(config.maxConcurrentAgents ?? 0) || 0)
let agentsInFlight = 0
const agentWaiters = []
function callAgent(prompt, opts) {
  if (!maxConcurrentAgents) return agent(prompt, opts)
  // release() hands the slot straight to the next waiter (no decrement), so a new caller can never
  // slip in between a release and the waiter's start and push in-flight over the cap.
  const release = () => { const next = agentWaiters.shift(); if (next) next(); else agentsInFlight-- }
  const run = () => Promise.resolve().then(() => agent(prompt, opts)).finally(release)
  if (agentsInFlight < maxConcurrentAgents) { agentsInFlight++; return run() }
  return new Promise(res => agentWaiters.push(res)).then(run)
}
```
Every `agent(` call site in the engine (14 at `e5d75b3`) becomes `callAgent(`; no other change. The
global `agent` is never redeclared (the harness passes it as a function parameter). The engine never
calls an agent from inside another agent's thunk while holding a slot, so the semaphore cannot
deadlock. Documented as a commented line in `templates/audit.config.example.yaml`:
`# maxConcurrentAgents: 0   # cap on agents alive at once (0 = no cap); e.g. 3 on a laptop during work`.

---

## 5. Verifier proof contract

Engine prompt for ambiguity findings (replaces the security-shaped intro, §4.8):

> AMBIGUITY PROOF CONTRACT: this finding claims the text reads two ways (or, for
> ambiguity:contract-mismatch, prescribes a value its contract rejects). Default refuted:true. You are
> not asked which reading the author meant; you are asked whether the divergence is real. HOLD only if
> you independently establish, each with file:line: (1) reading A and reading B, both ones this
> artifact's actual audience would take without asking the author; (2) the consumer (an agent that
> loads the doc, a schema its output must match, the reporter a policy addresses, an operator, the
> code that reads a value); (3) different outcomes under A and B; (4) no disambiguator on the
> consumer's path (same paragraph, a definitions section, a doc the consumer is told to load, a
> pinning example, a schema/type/default, a test, an [INFORMATIONAL]/[REFERENCE] marker). Put
> "A → outcome | B → outcome @ consumer file:line or reader role" in reachabilityTrace; a hold without
> it is discarded. REFUTE with counterEvidence file:line when a disambiguator exists, when reading B
> needs a misparse or a hostile reader, when both readings give the same outcome, or when the text is
> non-normative (narrative, changelog, quoted anti-pattern, fenced example). Comments and prose ARE
> evidence here: read them. For contract-mismatch: hold only with the full chain doc:line prescribes V
> for F → consumer:line loads the doc → schema:line allowed set → V not in it → what is lost; refute if
> V binds to a different field that allows it, if any same-named enum in that package allows V, if the
> doc is not on that consumer's path, or if a mapping step converts V first. For code (unit /
> falsy-default / sentinel): the code is the arbiter; hold only with a producer and consumer (or a
> reachable caller value) that diverge; a unit comment does not refute a consumer that computes in the
> other unit, and no reachable divergent value does refute. Ambiguity is never critical.

`agents/audit-verifier.md` gains a section "Ambiguity findings: prove the divergence, never the
intent" carrying the same four-part contract, the by-class notes (prose: comments and footnotes can
disambiguate; HTML comments in policy/reference docs cannot, they are not rendered; contract chain;
code arbiter), and the statement that a named human-reader role with the doc's file:line is a valid
consumer (the SECURITY.md consumer is "a reporter deciding whether a privilege-escalation bug is in
scope").

---

## 6. Severity rubric and buckets

Severity comes from the **consequence of the wrong reading** for the named consumer, not from how
unclear the text is.

| Consequence of the wrong reading | Severity |
|---|---|
| Wording only; no consumer acts differently | not a finding |
| A consumer acts differently, low blast radius (cosmetic, easily noticed, reversible) | low |
| A finding, report, check or obligation is silently lost or misdirected; an action is wrong by ≥10x; a reporter withholds an in-scope report class | medium |
| A security finding ≥ medium or a security gate is lost; an irreversible or security action (merge, delete, publish, authz, quota) happens under the wrong reading; money is off | high (requires a divergence trace, like every high) |
| anything | never critical |

| Bucket | When |
|---|---|
| quick-win | one-line doc or code edit; intended reading is evident from the repo (contract value, scope rewrite, unit added where code fixes it) |
| targeted-fix | schema must change; precedence is stated so the lesser source is fixed; code producer/consumer unit split |
| owner-decision | only the owner knows the intended reading (threshold, scope intent, which meaning of a term). Rendered as an A-or-B question. "Keep as written" = baseline the fingerprint. |
| systemic-refactor | not used by this lens |

`normalizedSnippet`: prose = the sentence lowercased with whitespace collapsed; contract-mismatch =
`<field>=<value> vs <schemaFile>`. The baseline fingerprint then survives edits elsewhere in the doc.

---

## 7. Lens skill, agents, report

### 7.1 NEW `skills/ambiguity-lens/SKILL.md`

- Frontmatter `name: ambiguity-lens`; description is a trigger, under 300 chars, no `": "` (the
  pre-commit gate check in `plugins/cklph-os/hooks/pre-commit-gate.sh`): "Use when asked to audit
  policy docs (SECURITY.md, CONTRIBUTING), skills, agent instructions or doc tables that prescribe
  schema values for wording a reader can take two ways, or a documented value the schema rejects.
  Load it before reviewing those files."
- Body: the three layers (tool recall → reviewer judgment → default-refuted verifier); §2.1 docClass
  matrix; §2.2 exclusions; a "Never a finding" look-alike list (lone should/may; vague adjective in
  non-normative prose; a clause defined nearby; quoted anti-pattern or fenced example; a value bound to
  a different field that allows it, e.g. `counts.info`; a dimensionless count like `voters: 3`; a unit
  in the key or sentence; two readings with the same outcome); the §1 rule table with §6 severities
  and buckets; the finding format (`readings` all four keys, `suggestedFix` quotes old line → new line
  the CodeRabbit way, one rewrite per reading for owner-decision); the explicit note that, unlike
  omission-lens, comments count as evidence here; Compose (§2.3); the code-job bar (opt-in); the gate
  line: `fixtures/ambiguity/` + labels.json + two git backtests, recall ≥ 0.8, **precision ≥ 0.8**
  (deliberately stricter than the 0.7 suggestion); repo rules win, return a ruleCheck for every rule
  handed.
- NEW `skills/ambiguity-lens/trigger-tests.md` in the agent-config-lens format: 3 `fire:` lines (a
  SECURITY.md scope review; skills/checklists that prescribe severities; contradictory agent
  instructions) and 3 `miss:` lines ("do the paths in AGENTS.md still exist?" → docs-drift; "is this
  hook safe?" → agent-config; "find SQL injection in the API" → security).

### 7.2 Agents

- `agents/audit-reviewer.md`: add `ambiguity` to the lens list (`:15`); tool map (`:34`):
  `ambiguity` → `${CLAUDE_PLUGIN_ROOT}/tools/ambiguity.sh` (`prose` + `contract` for prose jobs,
  `code` for code jobs; run from the TOOL ROOT the dispatch prompt names, with its exact globs and
  excludes); Output discipline (`:60`): the literal `readings: { a, b, consumer, divergence }`
  (ambiguity only, each with file:line; AC-047 parses it).
- `skills/compliance-lens/SKILL.md:12`: §7.4.
- `agents/audit-verifier.md`: the §5 section, placed before `:26`; Output discipline notes that for
  ambiguity `reachabilityTrace` is the divergence trace and is required at every severity.
- `agents/audit-synthesizer.md` (~`:28`): render Readings / Diverges for / Proposed wording for
  `ambiguity:*`; Owner-decision entries as A-or-B questions grouped per document.
- `agents/audit-recon.md:22`: §4.1 wording.

### 7.3 Report (`skills/audit-report-format/SKILL.md` + `templates/AUDIT-TEMPLATE.md`)

Finding block (after ~`:176`), for `ambiguity:*` only:
```markdown
- **Readings:** A: "<reading a>" · B: "<reading b>"
- **Diverges for:** <consumer>: A → <outcome>; B → <outcome>
- **Proposed wording:**
  - <old line, quoted>
  + <new line, quoted>
```
Verifier note for these: "survived adversarial refutation: voters independently reproduced both
readings and found no disambiguator." Owner decisions (`:266-270`):
```markdown
- **[M-3] `SECURITY.md:21` scope clause**: which did you mean, A or B? If A: "<rewrite A>". If B: "<rewrite B>". To keep the text as written, baseline it.
```
Coverage summary: ambiguity denominators per group (`normative`, scope sites, contract docs/enums),
shown as `examined X / N`, plus the line
`Dropped by the ambiguity proof contract (held without a divergence trace): N (<ids>)` from
`PROOF_CONTRACT_DROPPED`. `AUDIT-TEMPLATE.md`: lens list gains `| ambiguity` (~`:97`), Readings line
after ~`:105`.

### 7.4 Sibling compose lines

- `skills/agent-config-lens/SKILL.md` (~`:34-38`): "ambiguity-lens owns whether an instruction reads
  two ways or contradicts its schema; this lens owns whether it is unsafe."
- `skills/docs-drift-lens/SKILL.md` (~`:37`): "docs-drift checks quoted tokens exist; ambiguity-lens
  checks meaning and doc-to-schema values."
- `skills/compliance-lens/SKILL.md:12`: the input list stops enumerating lenses (it is already stale:
  docs-drift, omission, concurrency, state-machine and economic are missing). New text: "Your input is
  the **confirmed findings from every other lens** (each with `id`, `title`, `severity`, `file`,
  `rule`, `rootCause`; the engine does not send the lens) plus the repo's own rules. Identify an
  ambiguity finding by its `ambiguity:*` rule id: those map to no control in the shipped rulebooks, so
  leave them unmapped and never count them as a violation." (Revised 2026-11-02, §15: the engine's
  CONFIRMED_FINDINGS carry no `lens`.) The rest of compliance-lens (mapping table, rulebooks) is
  unchanged; no SOC 2/CASA rows are added.

---

## 8. Config surface

`templates/audit.config.example.yaml`:
- lenses comment (`:13`) appends `, ambiguity (text a reader can take two ways: policy docs,
  instructions, doc-to-schema values; prose groups by default, code opt-in)`.
- after the `agentConfig` block (`:77-81`), commented:
```yaml
# ambiguity:                     # ambiguity lens (opt-in)
#   code: false                  # true = ALSO cross with units for code-level ambiguity (experimental)
#   prose:
#     groups:                    # REPLACES the defaults; one review job per group; a file belongs to the FIRST group that matches
#       policy: ['**/SECURITY.md', '**/CONTRIBUTING.md', '**/CODE_OF_CONDUCT.md', '**/PRIVACY*.md', '**/SUPPORT.md', '**/GOVERNANCE.md', 'README.md', '**/security.md', '**/contributing.md', '**/code_of_conduct.md', '**/privacy*.md', '**/support.md', '**/governance.md']
#       instructions: ['**/.claude/**/*.md', '**/skills/**/*.md', '**/agents/*.md', '**/commands/*.md', '**/.cursor/rules/**', '**/.github/copilot-instructions.md', '**/CLAUDE.md', '**/AGENTS.md']   # + rulesFrom when defaulted
#     exclude: ['**/CHANGELOG*.md', '**/HISTORY.md', '**/LICENSE*', '**/NOTICE*.md', '**/fixtures/**', '**/node_modules/**', '**/vendor/**']   # REPLACES defaults; `ignore` always added
```
- `skills/audit-init/SKILL.md` (`:40`): suggest `ambiguity` when the repo ships policy docs or an
  instruction layer. Sizing rule: if `git ls-files '*.md' | grep -cE '/(skills|agents|commands)/'` is
  above 40, write `ambiguity.prose.groups` split per top-level package or plugin dir. Leave `code` off.
- `skills/audit-run/SKILL.md` (`:33`): "`ambiguity` runs one job per prose group (default `policy` +
  `instructions`, never sampled by quick mode) and is crossed with units only when
  `ambiguity.code: true`."
- `commands/run.md` (`:6`): add `ambiguity` with a one-line gloss. `commands/quick.md` (`:6`): add to
  the also-available list; the sampling sentence names the ambiguity prose groups as whole-scope jobs.

---

## 9. Fixtures (`fixtures/ambiguity/`)

### 9.1 Layout and labels

Each case is a **mini repo root**: `should-flag/<case>/` or `should-not-flag/<case>/`, holding the
doc(s) plus the schema or consumer they are checked against. Every file is named `*.example.*` (so no
fixture matches a default glob: `SECURITY.example.md` ≠ `**/SECURITY.md`). Each file's first line is
an empty comment, `<!-- -->` in md and `//` in js/ts: it only keeps label line numbers stable (no case
id, no labels path, no `FIXTURE` marker: §15 LEAK). No `Expected verdict`, `Reading A`, `Reading B`, `expect:` or `should-flag` text in any
fixture file. Code `should-flag` cases contain no comment other than line 1. Never name a real
third-party product: the SECURITY.md cases use "Acme".

`fixtures/ambiguity/labels.json`:
```json
{ "lens": "ambiguity",
  "cases": [ {
    "id": "F1", "dir": "should-flag/contract-mismatch", "modes": ["contract"],
    "toolExpect": { "exact": ["contract-mismatch@checklist.example.md:9"] },
    "expect": [ { "file": "checklist.example.md", "lines": [9, 9], "rules": ["ambiguity:contract-mismatch"], "severity": "medium", "bucket": "quick-win" } ],
    "lookAlikes": [ { "file": "schema.example.js", "lines": [4, 4], "why": "counts key info is not a severity" } ],
    "why": "verbatim pre-fix PR #22 row" } ] }
```
- `toolExpect.exact` (contract and code modes): the set of `kind@file:line` from running each listed
  mode with root = the case dir must equal this set. `should-not-flag` contract/code cases: `[]`.
- `toolExpect.includes` (prose mode): required subset for `should-flag` cases (a clear clause is
  still a site); for `should-not-flag` cases the prose output must equal it exactly (§15 EXACT).
- `expect` drives the LLM gate (§10.1); `should-not-flag` cases have `expect: []`.
- Line numbers count the header line.
- **The answer key is derived by hand, never from the tool.** The fixture author writes each file,
  then derives every `toolExpect` entry from §3.4-§3.6 and the planted text (counting lines in the
  file as written). Only then is the tool run, to confirm. A divergence is a **tool bug or a spec
  gap**, reported to the tool's owner with the file, line, expected and actual record; it is never
  absorbed into labels.json. The fixture test (AC-042) fails until the tool is fixed.
- **Who fixes a divergence.** A conditional tool-fix task (runs only when the fixture author reports
  divergences) classifies each one: (a) tool bug: fix the tool and pin it with a new
  `tests/tools.test.mjs` case; (b) label error: fix `labels.json`, citing the §3.4-3.6 clause that
  proves the hand count wrong; (c) spec gap: decide, record the decision in §15 of this file, then
  (a) or (b). It re-runs the GB-1/GB-2 tool commands afterwards and updates the AC-073/AC-074 sections
  of the proof doc only if their output changed.

### 9.2 Cases

**should-flag**

| Id | dir | Planted | Expected |
|---|---|---|---|
| F1 | `contract-mismatch/` | `checklist.example.md`: "Starting severities below are defaults." + table `\| Rule id \| What \| Default \|` with rows `medium; high if…`, `low`, **the verbatim 2602aff mcp-review row** (`info, needs-owner-input`), `medium`, `high`. `agent.example.md`: "Load @checklist.example.md; return findings matching REVIEW_SCHEMA in schema.example.js." `schema.example.js`: REVIEW excerpt with severity and confidence enums; REPORT excerpt with `counts` keys incl. `info`. | contract-mismatch at the mcp-review row, medium, quick-win |
| F2 | `scope-clause/` | `SECURITY.example.md` = OOOhm `1ec208f` anonymized to Acme, same line layout | scope-clause at the "Out of scope" sentence, medium, quick-win; look-alikes "within 3 business days", "self-hosters should update" |
| F3 | `vague-conditional/` | `agents/release.example.md` (agent instruction; the `agents/` dir makes it docClass `instruction`, §2.1): "After CI finishes, merge the PR and delete the branch if the checks are mostly green." + crisp sibling "If the build fails, stop and report." | vague-conditional at the merge line, medium, owner-decision; crisp sibling clean |
| F4 | `unit-prose/` | `CONFIG.example.md` table: `verify.maxWait` "How long a voter may run before it is dropped." default `300`; `verify.voters` default `3`. `config.example.js`: `setTimeout(drop, cfg.verify.maxWait ?? 300)` | unit at the maxWait row, medium, quick-win; `voters` clean |
| F5 | `contradiction/` | `agents/reviewer.example.md` "Load skills/detector/skill.example.md first. You MUST run the detector tool before reading any code." + `skills/detector/skill.example.md` (loaded by the agent) "Running the detector is optional; read the code first when the unit is small." | contradiction (either line), medium, owner-decision |
| F6 | `overloaded-term/` | `skills/triage/triage.example.md` (docClass `instruction`): §1 "The baseline is `.audit-baseline.json`: accepted fingerprints are suppressed." §3 "Keep at least 3 baseline voters." §5 "If a run is noisy, raise the baseline." | overloaded-term at §5, medium, owner-decision |
| C1 | `code-unit/` | `retry.example.ts`: `export const RETRY_DELAY = 5`; `setTimeout(fn, RETRY_DELAY)` and `await sleep(RETRY_DELAY * 1000)` (`sleep(ms)` stub) | unit, medium, targeted-fix (code mode) |
| C2 | `code-falsy-default/` | `list.example.ts`: `const limit = opts.limit \|\| 50`; caller `listItems({ limit: 0 })` | falsy-default, medium |
| C3 | `code-sentinel/` | `quota.example.ts`: `quotaFor` returns `-1` for no plan AND for unlimited; consumer `const quota = quotaFor(p); if (quota === -1) return allow()` (tool flags the comparison line) | sentinel, high (verifier must trace) |

**should-not-flag** (expect 0 confirmed findings each)

| Id | dir | Look-alike |
|---|---|---|
| N1 | `contract-match/` | F1's checklist with the 55868e5 row (`low, confidence needs-owner-input`); `report.example.md` with `counts: { critical: 2, high: 5, medium: 8, low: 3, info: 4 }`, "Statuses are exactly violation \| verified-safe \| not-applicable \| unchecked", "exploit confidence is `confirmed-exploitable` or `likely`"; `engine.example.js` with a second `confidence` enum `['confirmed-exploitable','likely','refuted']` and a `closeRule` fold that returns `unchecked` (§15 N1-FOLD). Tool: `exact: []`. |
| N2 | `clear-scope/` | `SECURITY.example.md` = OOOhm `cf98486` anonymized |
| N3 | `non-normative/` | `GUIDE.example.md`: "You should see a green check once the build finishes." "Large repos may take a while." "Fixes usually land within a day." |
| N4 | `defined-terms/` | `agents/release.example.md` (same placement as F3, so the look-alike is a fair test): "merge if the checks are green (every check in `checks.required` passed)"; "stale = no commits in 30 days" in a Definitions section |
| N5 | `unit-explicit/` | `CONFIG.example.md`: `verify.maxWaitMs` 300000; "`retry.delay` (seconds) 5"; `verify.voters` 3; consumer multiplies `retry.delay` by 1000 |
| N6 | `quoted-antipattern/` | `style.example.md`: "Don't write:" + blockquote "findings that need access an admin already has" + "Write instead: …"; a fenced "wrong" yaml example with `level: info` under a heading that says it is wrong (no `severity` binding, so the tool stays `[]`) |
| N7 | `consistent-modals/` | `agents/reviewer.example.md` "MUST run the detector" and `skills/detector/skill.example.md` "MUST run the detector first" (same placement as F5); a `## [INFORMATIONAL]` section "you should skim the CHANGELOG" |
| N8 | `history/` | `CHANGELOG.example.md`: "- mcp-review defaulted to severity `info`, which the schema rejects; now `low`." (the tool skips CHANGELOG*, so `exact: []`) |
| N9 | `code-clean/` | `ok.example.ts`: `RETRY_DELAY_MS = 5000` used as ms; `opts.limit ?? 50` with a `limit: 0` caller; `name \|\| 'Anonymous'`; `retries \|\| 3` typed `1\|2\|3\|4\|5` with no 0 caller (tool flags it, LLM must not confirm: `toolExpect.exact` lists that one record); `indexOf(x) === -1`; `maxRetries = -1 // -1 means unlimited`. |

**docClass check.** For every should-flag `expect` entry on a markdown file, each rule in
`expect.rules` (prefix stripped) is in `DOC_CLASS_RULES[docClass(file)]` (both imported from
`tools/ambiguity/common.mjs`); for a code file, it is one of `unit`, `falsy-default`, `sentinel`.
A fixture whose expected rule its own path forbids cannot be flagged by a reviewer that follows the
lens skill, so the gate could never reach its recall bar. AC-041 asserts this.

`fixtures/README.md`: add `ambiguity` to the layout comment (`:13`) and a section after `:60`: case
dirs as mini repo roots, `.example.*` naming, the labels.json sidecar and why this lens does not use
in-file verdict headers, the Acme rule.

---

## 10. Backtest acceptance

### 10.1 Mode 1: fixture gate (LLM pipeline, release gate)

1. Deterministic preflight: `node --test plugins/cklph-audit/tests/*.test.mjs`.
2. For each labels.json case: one run of **`workflows/audit.workflow.js` itself** (D22), so the
   shipped review prompt, the §5 contract and the D11 arbiter are what is measured, never a hand
   replica. Per-case args:
   ```js
   { path: 'tmp/ambiguity-gate/case-<NN>',     // a neutral copy of the case dir (§15 LEAK)
     lenses: ['ambiguity'], mode: 'full',
     config: {
       maxConcurrentAgents: 3,                      // D24: the user's hard cap
       ambiguity: { code: <true for C1-C3 and N9, else false>,
                    prose: { groups: { fixture: ['**/*.example.md'] }, exclude: [] } },
       units: { autoInfer: false, list: <code cases: [{ key: 'case', globs: ['tmp/ambiguity-gate/case-<NN>/**/*.example.ts', 'tmp/ambiguity-gate/case-<NN>/**/*.example.js'] }]; else []> },
       recon: { enabled: false }, map: { enabled: false }, variant: { enabled: false },
       selfReview: { enabled: false }, riskRouting: { enabled: false },
       verify: { voters: 3 } } }
   ```
   **Gate tree (§15 LEAK).** Every gate run (cases and the GB-1/GB-2 LLM runs) happens in a
   throwaway copy of the repo, never the working checkout: `git worktree add <scratch>/gate <branch
   tip>` once the change is committed, else a `cp -R` of the working tree. Before any run, delete in
   that copy every path in `GATE_TREE_DELETE` (`tests/lib/gate-tree.mjs`): the fixtures (incl.
   `labels.json`) and their README, this SPEC, `docs/proof/ambiguity-lens/`, `tests/`,
   `skills/audit-backtest/`, `skills/agent-config-lens/` and `plugins/cklph-os/`, so no search the
   panel makes (`rg` and Grep skip the git-ignored `tmp/`, so a sentence search would land on the
   labelled original) reaches a case path, a label or the §9.2 fixture table. If the plugin under
   test is loaded from another path (a marketplace cache), that copy lacks `fixtures/ambiguity/` too.
   The workflow runs with the gate tree as its working directory. Copy each case dir from the main
   checkout to the gate tree's git-ignored `tmp/ambiguity-gate/case-<NN>/`, `<NN>` = the case's
   position in ONE shuffled numbering over every gate run (cases and GB trees alike), drawn once by
   the gate runner and kept out of the run (never its F/N/C id, never `pre`/`post`). `labels.json`
   and the ordinal map stay in the main checkout, outside the gate tree, until scoring; score only
   after the run; remove the gate tree afterwards. `exclude: []` because the default `**/fixtures/**`
   exclude would drop every case run from the fixture path; D25 makes the tool root the case copy. Recon, Map, Variant and SelfReview are off to cut cost: none of them feeds
   the ambiguity review prompt or the arbiter. Score from the synth input's `FINDINGS`,
   `HELD_UNTRACED` and `PROOF_CONTRACT_DROPPED` (or the report's Findings and Coverage sections).
3. Score per finding: TP = confirmed, same file, line within `expect.lines`, rule ∈ `expect.rules`;
   FN = an `expect` entry with no TP; FP = any other confirmed finding, including look-alike lines
   inside should-flag cases. Held-untraced and deferred count as neither; list them. Severity and
   bucket agreement is reported, not gated.
4. **Gate:** prose/contract cases (F1-F6, N1-N8): recall ≥ 0.8 (≥5 of 6), precision ≥ 0.8. Code cases
   (C1-C3, N9) are measured and reported; code stays opt-in and "experimental" in 1.3.0 whatever the
   score.
5. **When and how it runs (D22).** In its own wave, after the fixtures exist, the tool agrees with
   labels.json, and `maxConcurrentAgents` is in the engine; before any version bump. It is a
   **main-session (orchestrator) step**, not a sub-agent dispatch: a sub-agent generally cannot
   start a workflow, and a sub-agent plus 3 voters would be 4 live agents. Cases run **one workflow
   at a time**, each with `maxConcurrentAgents: 3`, in this order so the most important evidence lands
   first even if the run is cut short: F1, N1, F2, N2, then GB-1 LLM, GB-2 LLM, then F3-F6, N3-N8, then
   C1-C3, N9. Preflight first: `node --test plugins/cklph-audit/tests/*.test.mjs` passes, else
   `GATE: NOT RUN (preflight failed)`.
   **Cost, stated up front:** each case is about 3-8 agent spawns (rulebook, scout skipped, one
   reviewer, 3 voters per finding, synth); 18 cases plus 4 git-tree runs (the GB-1 tree has ~44
   instruction/policy docs, so more findings) is roughly 80-150 spawns, serialized at 3 at a time:
   expect several hours of wall time. A `GATE: FAIL` is a valid result, not a task failure; never
   re-run a case to change its score.
6. **Merge precondition.** The PR does not merge, and the release task does not bump the version,
   unless the proof doc's gate line reads `GATE: PASS` (all of: Mode 1 prose/contract recall ≥ 0.8
   and precision ≥ 0.8, F2 TP and N2 no FP, GB-1 LLM PASS, GB-2 LLM PASS or its documented F2/N2
   fallback). F2/N2 are the only proof of the SECURITY.md catch: the tool emits a `scope` site for
   both the buggy and the fixed clause, so tool-level ACs (AC-010, AC-042, AC-074) prove recall of
   the site, never the judgment.

### 10.2 GB-1: PR #22 (git, manual; CI covers it with the verbatim-row unit test)

```
T=$(mktemp -d); git -C <repo> archive 2602aff plugins/cklph-audit | tar -x -C "$T"
plugins/cklph-audit/tools/ambiguity.sh contract "$T/plugins/cklph-audit"
```
- Tool PASS iff a record `{ file: skills/agent-config-lens/checklist.md, line: 13, field: severity,
  value: info }` is present, and the same command on `55868e5` does not return it.
- LLM PASS: in the §10.1 gate tree, extract each commit into its git-ignored `tmp/` under the next
  two shuffled ordinals, `<A>` for `2602aff` and `<B>` for `55868e5` (never `pre`/`post` in the
  path: the name would say which tree holds the bug; the ordinal map stays outside the gate tree)
  (`mkdir -p <gate>/tmp/ambiguity-gate/case-<A> && git archive 2602aff plugins/cklph-audit | tar -x -C <gate>/tmp/ambiguity-gate/case-<A>`),
  then one workflow run with `path: 'tmp/ambiguity-gate/case-<A>/plugins/cklph-audit'`,
  `lenses: ['ambiguity']`, the §10.1 config **without** the `ambiguity` override (the default groups
  and excludes are what is under test: `**/skills/**/*.md` must reach `checklist.md`). PASS iff a
  confirmed `ambiguity:contract-mismatch` at `skills/agent-config-lens/checklist.md:13` whose trace
  cites the load chain to the engine schema, and nothing confirmed on `audit-report-format/SKILL.md`
  `counts.info`, `unchecked` or `confirmed-exploitable`; the same run on `55868e5` (`case-<B>`) has no
  contract-mismatch on that row. Remove the gate tree afterwards.
- Cannot run in CI: `actions/checkout@v5` is depth 1.

### 10.3 GB-2: OOOhm SECURITY.md (manual; needs `~/Development/ooohm`)

- `git -C ~/Development/ooohm show 1ec208f:SECURITY.md` into a scratch dir. Tool PASS iff a `scope`
  record with `docClass: policy` has `line` in [21, 23] and `signal` containing
  `access an admin already has`. Same on `cf98486`: a scope site exists (by design).
- LLM PASS: in the §10.1 gate tree, write `1ec208f`'s version to `tmp/ambiguity-gate/case-<C>/SECURITY.md`
  and `cf98486`'s to `case-<D>/SECURITY.md` (`<C>`, `<D>` = the next shuffled ordinals, never
  `pre`/`post`), one workflow run each with `path: 'tmp/ambiguity-gate/case-<C>'` (default groups: the policy group's
  `**/SECURITY.md` matches). PASS iff exactly one confirmed `ambiguity:scope-clause` at lines 21-23 on
  `1ec208f`, lines 9-11 and 15-16 clean, and 0 confirmed on `cf98486`. Never write into the OOOhm
  checkout.
- If that branch is gone, fall back to fixtures F2/N2.

### 10.4 GB-3: dogfood (informational until hand-labelled)

Run `/cklph-audit:run ambiguity` on `plugins/cklph-audit` with groups split per plugin. Hand-label
every confirmed finding. Must not survive: `audit-report-format/SKILL.md:34`, `:79`, `:175`. Expected
candidates to label: `agent-config-lens/checklist.md:48` ("and siblings") vs `audit.workflow.js:91`
(SKILL.md-only glob); `agents/audit-synthesizer.md:28` (`likely` called a status; `alsoValidFor:
['confidence']`). Must NOT be emitted by ambiguity (docs-drift owns them): `correctness-lens/SKILL.md:14`
and `audit-backtest/SKILL.md:12` pointing at the missing `fixtures/correctness/`.

### 10.5 Proof doc

`docs/proof/ambiguity-lens/2026-11-02.md` (repo-root precedent `docs/proof/agent-config-lens/2026-10-26.md`):
tool-level GB-1 and GB-2 output, the Mode 1 gate table, GB-1/GB-2 LLM results, the dogfood contract
run, GB-3 labels. Sections not yet run say "NOT RUN" with the command; never blank.

Machine-checkable result lines (exact prefixes, one per line, so verifies can grep them):
- `AC-073: PASS` or `AC-073: FAIL` (GB-1 tool level, both commits)
- `AC-074: PASS`, `AC-074: FAIL` or `AC-074: NOT RUN (<reason>)` (GB-2 tool level)
- `GATE: PASS`, `GATE: FAIL` or `GATE: NOT RUN (<reason>)` (§10.1 item 6)
- `AC-072: PASS` or `AC-072: FAIL` (dogfood, written by the release task after it runs the committed
  dogfood test)

Writers, in wave order: the tool-backtest task writes the file with the AC-073/AC-074 sections and
`GATE: NOT RUN (pending gate wave)`; the conditional tool-fix task (§9.1) may rewrite the AC-073/AC-074
sections only if its fix changed their output; the gate step replaces the GATE line and fills the
Mode 1, GB-1 LLM and GB-2 LLM sections; the release task adds the AC-072 section. Each writer edits
only its own sections. A FAIL is recorded, never re-run to a PASS.

---

## 11. cklph-os changes (0.13.0 → 0.14.0)

No fourth review axis. No call into cklph-audit's tool.

- `agents/cklph-reviewer.md`:
  - Spec axis (`:15`), append: "If the spec or an acceptance criterion itself reads two ways, name both
    readings and which one you reviewed against. Never silently pick one."
  - Omissions axis (`:17-19`), append an **Ambiguity** bullet: a changed instruction, doc, policy
    clause, config key or public contract that a competent reader, caller or agent can take two ways
    with different outcomes. Cite both readings and who acts on the text; **if no one would act
    differently under the two readings, drop it (not even a Nit)**. A lone "should" is not a finding.
    A value the text prescribes that the receiving schema, enum or type rejects (a checklist telling
    an agent to emit the value `info` into a severity field whose schema allows
    critical|high|medium|low) is a **contract violation**: blocking, High, `confidence: certain`.
    Two-reading prose with a divergent consumer is a non-blocking `tentative` question, unless it
    gates security or an irreversible action (then blocking, High, `confidence: certain` once both
    readings and the divergent consumer are cited at file:line; until then, a non-blocking question).
- `skills/review/SKILL.md` (`:27-29`): omissions "(what wasn't asked, including text and contracts
  that read two ways)"; pointer: a whole-repo sweep is `/cklph-audit:run ambiguity`.
- `skills/review/two-reviewer-gate.md` (`:21-27`): Consistent row Pass adds "and no value the work
  prescribes that its own schema/type rejects"; Fail adds "a doc prescribes severity `info`, the
  schema allows critical/high/medium/low". New row:
  `| Unambiguous | No normative sentence, policy clause or AC has two reasonable readings that lead a named reader, caller or agent to different outcomes (two readings with the same outcome pass); it names its subject, and quantities carry units | Two readings plus the consumer who acts differently: "findings that need access an admin already has" (a reporter cannot tell whether privilege escalation is excluded), a timeout with no unit that a caller reads as ms and the doc means as s |`
- `skills/spec/spec-authoring-rules.md`: a rule after "Pair every example…" (~`:20`): "**One reading
  per normative sentence.** Units on every quantity (`timeoutMs: 5000`, not `timeout: 5000`); each
  term of art defined once and used in one sense; scope and exclusion clauses name their subject.
  Don't write: 'findings that need access an admin already has'. Write instead: 'findings that require
  an attacker to already have administrative access'." Quality gate (`:50-57`) gains four items:
  every quantity has a unit and ranges say inclusive or exclusive; defined terms used in one sense;
  each AC has one reading (two implementations that both satisfy the wording behave the same, else
  tighten it); every value prescribed from a closed set cites the set's file:line and is a member of
  it.
- `skills/plan/plan-check.md` (`:13`): "- [ ] Every quantity in the brief has a unit, and every value
  the brief tells the implementer to emit, write or return is accepted by the schema, enum or type
  that receives it (cite file:line). An instruction that contradicts its own contract fails silently
  at runtime."
- Unchanged: `agents/red-team.md`, `skills/survey/SKILL.md`, `skills/writing/SKILL.md`,
  `skills/spec/SKILL.md`, every skill `description`.
- `plugins/cklph-os/.claude-plugin/plugin.json` → `0.14.0`; `CHANGELOG.md` `[0.14.0] — 2026-11-02` under
  Changed. Marketplace description unchanged.
- **Ships in the same PR as cklph-audit 1.3.0 and merges only on `GATE: PASS` (D22).** The review
  skill's pointer to `/cklph-audit:run ambiguity` would dangle against cklph-audit 1.2.5. If the gate
  FAILs and cklph-os is split out to ship alone, remove that pointer line first.

---

## 12. Versioning and docs (cklph-audit)

- **Precondition (D22):** the release edits below happen only when
  `docs/proof/ambiguity-lens/2026-11-02.md` contains the line `GATE: PASS`. Otherwise the release
  task makes **no change at all** (no version, README, description, CHANGELOG, and no new test
  files: an uncommitted registry test would fail on the existing `skills/ambiguity-lens/` dir and
  turn CI red) and reports the gate state.
- `tests/dogfood-contract.test.mjs` (new, plain node script that exits non-zero on failure): calls
  `runContractCheck({ root: 'plugins/cklph-audit', minDocs: 40, engineGlobs: true, excludes:
  ['**/fixtures/**'] })` (§3.7) and asserts `ok`; plus a teeth case that runs `runContractCheck` on a
  temp-dir copy of the AC-002 pre-fix sandbox and asserts `!ok` with exactly one offender (line 6).
- `plugins/cklph-audit/.claude-plugin/plugin.json`: `1.2.5` → **`1.3.0`**. Description: replace
  `× opt-in docs-drift + omission + agent-config (the AI tooling layer, static).` with
  `× opt-in docs-drift + omission + agent-config (the AI tooling layer, static) + ambiguity (instructions, doc-to-schema values and policy prose a reader can take two ways).`
- Root `.claude-plugin/marketplace.json`: the cklph-audit `description` is a **verbatim copy** of
  plugin.json's (marketplace.json carries no version field). New test pins it (§AC-070).
- `CHANGELOG.md` `## 1.3.0 — <release date>` (only after `GATE: PASS`): Added (lens, prose groups, `ambiguity.code`, tool, proof
  contract enforced in code, fixtures + labels.json, scenario E, registry test, backtests); Changed
  (`LENS_HINTS` single source, `readings` in REVIEW_SCHEMA and report, Variant skips ambiguity,
  verifier keeps comments for ambiguity); Fixed (rulebook prompt and audit-recon listed 6 of 16
  lensHints). No root CHANGELOG entry (marketplace-level events only).
- `README.md`: lens table row after `:74`
  (`| **ambiguity** (opt-in, 1.3.0) | Text a competent reader, caller or agent can take two ways with different outcomes: instructions that prescribe a value their schema rejects, scope or exclusion clauses with no clear subject, contradictions, vague thresholds, unitless quantities. A finding needs both readings and the consumer where they diverge. Prose groups by default; code opt-in. Rule ids ambiguity:<kind>. |`),
  a sentence at `:76` on groups and code crossing, roadmap line **`v4.3 (1.3.0)`** after the
  `v4.2 (1.2.0)` line (`:221`): `v4` already names 1.0.0 at `:219`, and reusing it would ship an
  overloaded term in the release of the lens that flags them. The closing sentence at `:224` ("See
  `SPEC.md`, ...") adds `SPEC-v4-ambiguity.md` (the ambiguity lens).
- `tests/lens-registry.test.mjs`: the example-config check reads **line 13 of
  `templates/audit.config.example.yaml`, the YAML array or its trailing comment** (security,
  correctness and architecture sit in the array, the rest in the `# also:` comment).
- `skills/audit-backtest/SKILL.md`: `ambiguity` in the lens list (`:12`); a note after `:32` (case dirs
  are mini repo roots; run `ambiguity.sh <mode> <case-dir>`; labels in labels.json; precision gate 0.8
  is deliberate); Mode 2 entries GB-1 and GB-2 (§10.2-10.3).
- Do not edit `SPEC.md`, `SPEC-v2.md`, `SPEC-v3.md`.

---

## 13. Known limits (accepted for 1.3.0)

- Package-root linking can miss a shared schema package unless the doc names the file; the stderr
  `enums=K fields=[...]` line makes this visible, not fixed.
- Same-named fields are merged per package: a value valid for one `status` enum but meant for another
  is not reported.
- Regex enum harvest misses runtime-built enums (other than H5), nested braces before `enum`, and
  multi-line TS unions starting with `|`. Only `enums=0` is loud.
- D2 needs ≥3 matching cells: a 2-row table is caught only when its header names the field.
- Indented code blocks are not detected in prose v1.
- A low/medium ambiguity hold without a trace is not confirmed (precision-first); it is counted and
  listed by id in the report's Coverage summary (`PROOF_CONTRACT_DROPPED`), not promoted.
- The D21 vocabulary anchor trades recall for precision: an instruction that prescribes a bad value
  inline, in a doc that quotes fewer than two allowed values and never names the schema file, is
  missed. Tables are unaffected.
- Every prose finding costs base voters; a noisy instructions group can eat the
  `maxVerifierAgents` budget. Overflow is deferred and surfaced, but may starve other lenses in the
  same run. Split groups on large repos (audit-init sizing rule).
- A code reviewer may open a `.md` file on its own; duplicates with different `normalizedSnippet`
  would not dedupe.
- Node ≥18 required; no fallback.
- `omissions.sh` has two bugs seen while designing this (bash-case globbing at `:96` skips top-level
  files for `src/**/*.ts`; silent `head -n 500` at `:108`). Not fixed here; do not copy them.

---

## 14. Acceptance criteria

Tool (`tests/tools.test.mjs`; each case names in a comment the broken implementation it kills).
AC-001 (contract and failure-mode parts), AC-002 to AC-007, AC-013, AC-014, AC-016 and AC-017 live in
section "ambiguity.sh: CLI + contract". AC-001 (prose and code summary lines), AC-008 to AC-012 and
AC-015 live in section "ambiguity.sh: prose + code".

- **AC-001** CLI contract: modes `code|prose|contract`; one JSON array on stdout; exit 0 in every case
  below; stderr summary line per mode in the §3.3 format (each asserted by parsing its `key=value`
  fields, not by substring).
  Verify: `node plugins/cklph-audit/tests/tools.test.mjs` (both `ambiguity.sh` sections all ✓).
- **AC-002** PR #22 verbatim row: a sandbox with `workflows/engine.js` (severity enum on line 2,
  confidence enum on line 3), `.claude-plugin/plugin.json`, and `skills/x/checklist.md` (header
  `| Rule id | What | Default |`, separator, rows `medium; high if…`, `low`, the verbatim 2602aff
  mcp-review row at line 6, `medium`, `high`, `high (critical if a live-looking key)`) gives exactly 1
  record `{file:'skills/x/checklist.md', line:6, field:'severity', value:'info', via:'table-inferred',
  schema:'workflows/engine.js:2'}`. The post-fix row (``low, confidence `needs-owner-input` ``) gives
  `[]`. Kills: header-only/near-field detection (0), every-token-in-cell (2), off-by-one line.
  Verify: same command.
- **AC-003** Inline forms and the anchor. Sandbox: `.claude-plugin/plugin.json`, `workflows/engine.js`
  (severity and confidence enums as in AC-002), and `skills/x/inline.md` with exactly these lines:
  ```
  1  Severities are `critical`, `high`, `medium` or `low`.
  2  Record these at severity `info`.
  3  ```json
  4  { "severity": "info" }
  5  ```
  6  `confidence` ("confirmed" | "probable" | "needs-owner-input")
  7  Pick severity from consequence of the wrong reading.
  8  `severity` ∈ critical/high/medium/low
  9  Bash(git status:*)
  10 Set severity to `info` when unsure.
  ```
  The `{line@value@via}` set is exactly {`2@info@inline-connector`, `4@info@inline-assign`,
  `6@probable@inline-list`, `10@info@inline-connector`}, and the line-4 record has `inFence:true`.
  Then delete line 1 (and nothing else; line numbers shift up by one): the result is exactly
  {`5@probable@inline-list`} (confidence stays anchored by the quoted values on its own line; severity
  loses its anchor, because line 8's values are unquoted). Kills: the prefix form missing (no line 2), accepting unquoted words (line 7 `from`), not
  scanning fences, treating `/` lists as invalid, an implementation without the D21 anchor (second
  run emits severity records). Verify: same command.
- **AC-004** No schema: a doc with `"severity": "info"` and no schema gives `[]` and stderr matching
  `/no schema enums found .* NOT run/`. Verify: same command.
- **AC-005** Linking: schema in `pkgA/` (own package.json), doc in `pkgB/` (own package.json) gives
  `[]`; adding "see engine.js" to the doc gives 1 record. Verify: same command.
- **AC-006** Union and `alsoValidFor` (sandbox also holds the severity enum): two `confidence` enums (`['confirmed','likely']`,
  `['confirmed-exploitable','likely','refuted']`) in one package; a doc saying `confidence: "refuted"`
  gives `[]`; a `status` enum `['patched','met']` in `engine.js` and the doc
  ``Per engine.js, render the `likely` status.`` (anchored by the basename) gives one record with
  `field:'status'`, `value:'likely'`, `alsoValidFor:['confidence']`; the same doc without
  `Per engine.js, ` gives `[]` (no anchor). A `logLevel` enum `['info','debug']` does not rescue
  ``Use `severity: "info"`; severities are `low` or `high`.``: exactly one record, `field:'severity'`,
  `alsoValidFor:['logLevel']`. Verify: same command.
- **AC-007** Same-file const enum (H5): `const HINTS = ['a','b','c']` + `lensHint: { type: 'string', enum: HINTS }`
  and a doc table `| lensHint |` with a `zzz` cell gives one record for `lensHint`. Verify: same command.
- **AC-008** Code detectors, one file `src/a.ts` with lines 1-13 = `config.retries || 3`,
  `config.retries ?? 3`, `user.name || 'anonymous'`, `export const CACHE_TTL = 3600;`,
  `export const CACHE_TTL_SECONDS = 3600;`, `await page.goto(url, { timeout: 30000 });`,
  `if (origin.startsWith('https://example.com')) allow();`, `if (ALLOWED_ORIGINS.includes(origin)) allow();`,
  `const maxRetries = -1;`, `const maxRetries2 = -1; // -1 means unlimited`,
  `if (list.indexOf(x) === -1) add(x);`, `// const timeout = 30`, `log('maxRounds: 0 disables it');`:
  the kind@line multiset is exactly `falsy-default@1, unit@4, sentinel@9`. Kills: no `??` distinction,
  no comment strip, no string mask, any loose-match detector (L7), no documented-sentinel exemption
  (L10 flags), a window that looks at lines below (L9 exempted by L10's comment), no indexOf
  exemption, no call-option skip. Also: the same two lines in the order
  `// -1 means unlimited` then `const maxRetries = -1;` give no sentinel (the line-above exemption).
  Verify: same command.
- **AC-009** Test paths and globs: `tests/a.test.ts` with line 1's content yields no record and
  `skippedTests=1`; with `AMBIGUITY_INCLUDE_TESTS=1` one record; `code <root> 'src/**/*.ts'` returns
  `src/a.ts` records (kills bash-case globbing). Verify: same command.
- **AC-010** Prose, the CodeRabbit clause. `SECURITY.md` is exactly these 18 lines (line 8 starts
  with two spaces; lines 2, 4, 6, 10, 12 and 16 are empty):
  ```
  1  # Security
  2
  3  We reply within 3 business days.
  4
  5  ## Out of scope
  6
  7  - Issues in the hosting provider, database or email service you run Acme on, and findings that need
  8    access an admin already has.
  9  - Missing rate limits.
  10
  11 ## Notes
  12
  13 ```
  14 You MUST NOT run this.
  15 ```
  16
  17 This should take about a minute.
  18 Retry after 30.
  ```
  The record set (`kind@line`) is **exactly** {`scope@7`, `scope@9`, `unit@18`}. The `scope@7` record
  has `docClass:'policy'`, `heading:'Out of scope'` and a signal containing `admin already has.`;
  `scope@9` has `heading:'Out of scope'`. Line 11's heading ends the scope section, so nothing below it
  is a scope site; no record has line 5 or 11 (headings are not units). `docs/config.md` with
  `| Key | Meaning | Default |`, `|---|---|---|`, `| verify.maxWait | How long a voter may run. | 300 |`,
  `| verify.voters | Voters. | 3 |`, `| verify.maxWaitMs | Same, explicit. | 300000 |` (lines 1-5)
  gives exactly {`unit@3`}. Kills: line-by-line scanning (no join: signal lacks line 8), no fence skip
  (line 14), a naive unit regex (line 3 "3 business days"), flagging every "should" (line 17), a heading
  stack that never pops (lines 17-18 tagged scope), a table detector that ignores the name test.
  Verify: same command.
- **AC-011** Sentence split and vague-conditional: ``Use `a.b` here, e.g. in tests. Merge the PR if
  the checks are mostly green.`` on line 1 gives exactly one `vague-conditional` at line 1 whose signal starts
  `Merge the PR`; a second paragraph line "If the build fails, stop." gives none; no split inside
  `a.b` or `e.g.`. A root-level `agents/x.md` (path exactly `agents/x.md`, no leading directory)
  containing only "Stop unless the build is mostly green." gives exactly one record: `kind:
  'vague-conditional'`, `docClass: 'instruction'`, and no `scope` record (the except/unless scope
  form is policy-only). Kills: a `/agents/` substring check (classes it `reference`), applying the
  unless-scope form outside policy docs. Verify: same command.
- **AC-012** Denominator honesty (§3.4 definition of N). `CONTRIBUTING.md` (policy) holds exactly
  three normative sentences, one of which is also a scope site: "You must sign your commits.",
  "Never force-push to main.", "You must not report issues that are out of scope." plus one
  non-normative sentence "Thanks for helping.". Default run: stderr `normative=3`, zero `normative`
  records, and exactly one `scope` record. `AMBIGUITY_ALL_SITES=1` run: exactly 3 `normative` records
  (including one on the scope sentence's line) and the same single `scope` record. Kills: N counting
  only sentences with no other kind (gives 2), all-sites mode suppressing normative on overlapping
  sentences (gives 2 records), all-sites mode dropping the scope record. Verify: same command.
- **AC-013** Determinism (contract): `contract` run twice on the AC-002 sandbox, the second time
  with files created in reverse order, gives byte-identical stdout. Verify: same command.
- **AC-015** Cap (code): 600 `retries || 3` lines with `AMBIGUITY_MAX=500` give exactly 500 records
  and stderr matching `/600 record\(s\), truncated to 500/`; the summary's `emitted=500`. Kills a
  silent `head -n 500` and an uncapped run. Verify: same command.
- **AC-016** docClass and the rule matrix (`common.mjs`, pure): `docClass` returns `instruction` for
  `agents/a.md`, `plugins/p/skills/x/checklist.md`, `skills/triage/triage.example.md`, `.claude/rules/r.md`,
  `commands/run.md`, `SKILL.md`; `policy` for `SECURITY.md`, `docs/SECURITY.md`, `SECURITY.example.md`,
  `CONTRIBUTING.md`, `skills/SECURITY.md` (policy is checked first); `reference` for `release.example.md`, `myagents/x.md`, `README.md`,
  `docs/agents.md`. `DOC_CLASS_RULES` equals the §2.1 matrix exactly (policy: scope-clause,
  contradiction, unit, vague-conditional; instruction: contract-mismatch, contradiction,
  vague-conditional, unit, overloaded-term, scope-clause; reference: contract-mismatch, unit,
  contradiction); `RULE_IDS` is set-equal to the 8 distinct rule ids of the 9 §1 rows. Kills: substring matching
  (`myagents/x.md`), a leading-`/` requirement (`agents/a.md`), policy checked after instruction
  (`skills/SECURITY.md`). Verify: same command.
- **AC-017** Fail-closed check (§3.7) and engine-source parsers. `runContractCheck` returns `!ok` with
  exactly one offender on the AC-002 pre-fix sandbox; `!ok` with a problem naming `enums` on a
  no-schema sandbox; `!ok` naming `docs` when `minDocs` exceeds the scanned count; `!ok` naming
  `helper failed` when `tool` is a fake script that prints `[]` and that stderr line; `ok` on the
  post-fix sandbox. `parseProseDefault`, `parseExcludeDefault` and `parseLensHints` return the exact
  arrays from a synthetic engine source string written in the §4.1/§4.2 shape, and throw on a source
  without the literal. Kills: a check that only filters stdout (passes the no-schema and
  helper-failed cases), a parser that silently returns `{}`. Verify: same command.
- **AC-014** Robustness: missing root → `[]` + `/root not found/`; mode `bogus` → `[]` +
  `/unknown mode 'bogus'/`; `sandbox({}, {noNode:true})` → `[]` + `/node not found, NOTHING scanned/`;
  `sandbox({ node: 'exit 3' }, { noNode: true })` → `/helper failed \(exit 3\)/`; a doc named
  `we"ird\tname.md` with a mismatch gives valid JSON whose `file` round-trips; a CRLF copy of AC-002
  gives line 6; `--exclude 'skills/**'` on AC-002 gives `[]`. Verify: same command.

Engine (`tests/engine-flow.test.mjs`, new SCENARIO E; plus `node --check`)

- **AC-020** `LENS_HINTS` is the single source: the rulebook prompt's pipe list is
  `RULEBOOK_SCHEMA...lensHint.enum` filtered to the base hints plus the running review lenses (§15
  HINTS) and includes `ambiguity` when the lens runs (fails on today's code: 6 vs 16);
  `agents/audit-recon.md` has no line matching the regex ``/security`? *\| *`?correctness/`` (the
  current line 22 is `` `security` | `correctness` | … ``, with backticks; this regex matches it at
  HEAD, which the test author confirms before relying on it).
  Verify: `node plugins/cklph-audit/tests/engine-flow.test.mjs && ! grep -nE 'security`? *\| *`?correctness' plugins/cklph-audit/agents/audit-recon.md`.
- **AC-021** Default config with `lenses: ['ambiguity']`: the review labels are exactly
  `review:prose-policy:ambiguity` and `review:prose-instructions:ambiguity`; their prompts contain
  `**/skills/**/*.md` and `**/SECURITY.md`; no `review:<unit>:ambiguity`. Verify: same command.
- **AC-022** `ambiguity: { code: true }` adds one `review:<unit>:ambiguity` per unit; a recon seed
  `lib/SECURITY.md` appears in the prose-policy prompt and not in the unit job's prompt.
  Verify: same command.
- **AC-023** Ownership and excludes: `groups: { a: ['docs/**'], b: ['**/*.md'] }` puts seed
  `docs/x.md` only in prose-a and `other/y.md` only in prose-b; seeds under `**/fixtures/**` and
  `**/CHANGELOG.md` appear in no prompt; prose prompts contain `skip:` with `**/fixtures/**` and a
  `config.ignore` entry. Verify: same command.
- **AC-024** `args.path = 'packages/app/'`: prose-policy globs include `packages/app/README.md` and
  `packages/app/**/SECURITY.md`; no glob starts with `./` or `//`; the prose prompt contains
  `TOOL ROOT:` followed by `packages/app`, and the command `ambiguity.sh prose packages/app` with the
  **unscoped** `**/SECURITY.md` (and no `packages/app/**/SECURITY.md` inside the tool command); with a
  `config.ignore` of `['packages/app/gen/**', 'other/**']` the tool excludes contain `gen/**` and not
  `other/**`. Unscoped run: TOOL ROOT is `.`. Kills: the reviewer running the tool from the repo root
  with scoped globs (D25). Verify: same command.
- **AC-025** Quick mode, `topN: 1`, two units, `code: true`: both prose jobs exist and exactly one unit
  ambiguity job exists. Verify: same command.
- **AC-026** Proof contract prompt: an `ambiguity:scope-clause` finding's verifier prompt contains
  `AMBIGUITY PROOF CONTRACT` and `"readings"`, does not contain `attacker-controlled input`, and its
  snippet `// x\nand/or` reaches the verifier intact; a security finding's prompt has no contract
  marker and its snippet is comment-stripped. Verify: same command.
- **AC-027** Arbiter, paired: a medium ambiguity finding held by voters WITH a trace is in synth
  FINDINGS with that trace; a low ambiguity finding held WITHOUT a trace is in neither FINDINGS nor
  HELD_UNTRACED, a log line names the proof contract, **and** the synth prompt's
  `PROOF_CONTRACT_DROPPED` JSON contains exactly that finding's id; a medium security finding held
  without a trace IS in FINDINGS and is not in `PROOF_CONTRACT_DROPPED`; a high ambiguity finding held
  without a trace is in HELD_UNTRACED and not in `PROOF_CONTRACT_DROPPED`. A scenario with no
  ambiguity findings passes `PROOF_CONTRACT_DROPPED: []`. Verify: same command.
- **AC-028** A confirmed high ambiguity finding spawns no `variant:` label. Verify: same command.
- **AC-029** A confirmed owner-decision ambiguity finding reaches synth FINDINGS with `readings`
  intact; `REVIEW_SCHEMA` findings items have optional `readings` with keys a, b, consumer,
  divergence. Verify: same command.
- **AC-030** `node --check plugins/cklph-audit/workflows/audit.workflow.js` passes; scenarios A-D
  still pass unchanged; no `Date.now()`/`Math.random()`/argless `new Date()` added.
  Verify: `node --check plugins/cklph-audit/workflows/audit.workflow.js && node plugins/cklph-audit/tests/engine-flow.test.mjs`.
- **AC-031** Concurrency cap (§4.12), new SCENARIO F with a stub agent that records in-flight count
  and yields (`await new Promise(r => setImmediate(r))`) before returning: with no
  `maxConcurrentAgents` the observed max in-flight is > 3 (proves the harness can see overlap); with
  `maxConcurrentAgents: 3` the max is ≤ 3, the run completes, and the synth input's FINDINGS equal
  the uncapped run's FINDINGS (same ids); with `maxConcurrentAgents: 1` the max is exactly 1. A stub
  that throws for one label still lets the capped run finish (slots are released on rejection).
  The source has no bare `agent(` call outside `callAgent` (regex `(?<![A-Za-z])agent\(` matches only
  inside `callAgent`'s body). Kills: a cap that ignores rejections (deadlock), a release that
  decrements before handing over (max 4), a missed call site. Verify: same command.

Lens, fixtures, agents, report, config

- **AC-040** `skills/ambiguity-lens/SKILL.md` exists; its description is <300 chars, starts `Use when`,
  contains no `": "`; its rule table lists exactly the 8 distinct rule ids of the 9 §1 rows (parsed, set-equal); it states
  never critical and precision ≥ 0.8. `trigger-tests.md` has 3 fire and 3 miss lines. The rule set is
  compared to `RULE_IDS` imported from `tools/ambiguity/common.mjs` (no hand list).
  Verify: `node --test plugins/cklph-audit/tests/ambiguity-skill.test.mjs`.
- **AC-041** Fixtures parity: every file under `fixtures/ambiguity/should-*/` is listed in
  labels.json and every listed file exists; every basename contains `.example.`; should-not-flag
  `expect` is `[]`, should-flag has ≥1; every `expect.rules` id is in `RULE_IDS`; **every
  should-flag expected rule is allowed for its file's docClass** (§9.2 docClass check, using
  `docClass` and `DOC_CLASS_RULES` from `common.mjs`); label lines are within file length; no fixture
  contains `Expected verdict`, `Reading A`, `Reading B`, `expect:`, `should-flag`, `should-not-flag`;
  code should-flag files have no comment after line 1. Teeth self-checks inside the test: the parity
  checker, given a synthetic file list with one unlabeled path, reports exactly that path; the
  docClass check, given a synthetic label `{ file: 'release.example.md', rules:
  ['ambiguity:vague-conditional'] }`, reports it. Verify: `node --test plugins/cklph-audit/tests/ambiguity-fixtures.test.mjs`.
- **AC-042** Tool vs labels: for every case and listed mode, `ambiguity.sh <mode> <case dir>` output
  equals `toolExpect.exact` (contract, code) or includes `toolExpect.includes` (prose). F1 yields the
  mcp-review row; N1 yields `[]`. Verify: `node --test plugins/cklph-audit/tests/ambiguity-fixtures.test.mjs`.
- **AC-043** Agents: `audit-reviewer.md` maps `ambiguity` to `ambiguity.sh` and documents `readings`;
  `audit-verifier.md` has the "Ambiguity findings" section with all four proof parts and the
  human-reader-role clause; `audit-synthesizer.md` renders Readings and A-or-B owner decisions.
  Outcome test `tests/ambiguity-agents.test.mjs` (AC-047). Verify: `node --test plugins/cklph-audit/tests/ambiguity-agents.test.mjs`.
- **AC-044** Report: `audit-report-format/SKILL.md` and `templates/AUDIT-TEMPLATE.md` carry
  `**Readings:**`, `**Diverges for:**`, `**Proposed wording:**` and the A-or-B owner-decision form;
  the report format also carries the `Dropped by the ambiguity proof contract` coverage line.
  Verify: `for f in plugins/cklph-audit/skills/audit-report-format/SKILL.md plugins/cklph-audit/templates/AUDIT-TEMPLATE.md; do for m in '**Readings:**' '**Diverges for:**' '**Proposed wording:**' 'which did you mean'; do grep -qF "$m" "$f" || { echo "missing $m in $f"; exit 1; }; done; done && grep -qF 'Dropped by the ambiguity proof contract' plugins/cklph-audit/skills/audit-report-format/SKILL.md`.
- **AC-045** Config surface: the example config has the commented `ambiguity:` block with
  `code: false`, `groups`, `exclude`; audit-init, audit-run, commands/run.md, commands/quick.md and
  audit-backtest mention `ambiguity`; audit-backtest has GB-1 (`2602aff`/`55868e5`) and GB-2.
  Verify: `test $(grep -l "ambiguity" plugins/cklph-audit/templates/audit.config.example.yaml plugins/cklph-audit/skills/audit-{init,run,backtest}/SKILL.md plugins/cklph-audit/commands/{run,quick}.md | wc -l) -eq 6` (6 files) and AC-046.
- **AC-046** Config surface matches the engine (`tests/ambiguity-config.test.mjs`): take the commented
  `# ambiguity:` block of `templates/audit.config.example.yaml` (the run of `#` lines starting at
  `# ambiguity:`), strip `^# ?` and trailing `   # ...` comments, read `code`, `groups.policy`,
  `groups.instructions` and `exclude` (single-quoted flow arrays → JSON); assert `code` is `false`,
  the groups deep-equal `parseProseDefault(engineSource)` and `exclude` deep-equals
  `parseExcludeDefault(engineSource)` (§3.1 helpers; no hand copy). Teeth: the same comparison on an
  in-memory template with one glob removed reports that glob. Verify: `node --test plugins/cklph-audit/tests/ambiguity-config.test.mjs`.
- **AC-047** Agents match the engine (`tests/ambiguity-agents.test.mjs`): the `ambiguity` tool-map
  entry in `agents/audit-reviewer.md` names `${CLAUDE_PLUGIN_ROOT}/tools/ambiguity.sh`, and that path
  (with the variable replaced by the plugin dir) is an existing executable file; the literal
  `readings: { a, b, consumer, divergence }` appears in `audit-reviewer.md` and its keys equal the
  `readings` properties parsed from `REVIEW_SCHEMA` in the engine source; `audit-verifier.md` has a
  heading containing `Ambiguity findings`, the four parts (`reading A`, `consumer`, `outcome`,
  `disambiguator`, case-insensitive) inside that section, and the phrase `human` within it;
  `audit-synthesizer.md` contains `A or B` or `A-or-B`; `skills/compliance-lens/SKILL.md` no longer
  matches `/\(security, sca,/` and mentions `ambiguity`. Teeth: the keys comparison, run on an
  in-memory reviewer doc with `divergence` removed, reports `divergence`. Verify: same command.

Release

- **AC-070** Registry test `tests/lens-registry.test.mjs`: every `skills/*-lens` dir name (minus
  `-lens`) appears in `LENS_HINTS` (parsed from the engine source), as a README table row
  `| **<lens>**`, on line 13 of the example config (the YAML array or its trailing comment), and in
  plugin.json's description; the
  marketplace.json cklph-audit description equals plugin.json's; every lens has
  `fixtures/<lens>/should-flag` and `should-not-flag` except the legacy allowlist (`correctness`,
  `compliance`, `concurrency`, `state-machine`, `economic`); `SPEC*.md` are not checked.
  Verify: `node --test plugins/cklph-audit/tests/lens-registry.test.mjs`.
- **AC-071** Only after AC-075 (`GATE: PASS`): cklph-audit version `1.3.0`; manifests parse;
  CHANGELOG has `## 1.3.0`, citing the proof doc's gate result.
  Verify: `node -e "const p=require('./plugins/cklph-audit/.claude-plugin/plugin.json');const m=require('./.claude-plugin/marketplace.json');if(p.version!=='1.3.0'||m.plugins.find(x=>x.name==='cklph-audit').description!==p.description)process.exit(1)" && grep -n "^## 1.3.0" plugins/cklph-audit/CHANGELOG.md`.
- **AC-072** Dogfood, committed (`tests/dogfood-contract.test.mjs`, owned by the release task). It
  calls `runContractCheck({ root: 'plugins/cklph-audit', minDocs: 40, engineGlobs: true, excludes:
  ['**/fixtures/**'] })` (§3.7, fail-closed: a run that scanned nothing fails) and asserts `ok`. `SPEC*.md` and `docs/**`
  are outside the default groups, so they are not checked (they are design records that quote bad
  values on purpose). Teeth: the same assertion over the AC-002 pre-fix sandbox reports exactly one
  record. Ownership of what it finds: the tool tasks fix tool false positives (with a pinned test
  case); each doc-writing task keeps its own files clean (its verify runs the same contract command
  over its files); the release task fixes any true-positive record left in an existing doc, and
  names the fix in the CHANGELOG under Fixed.
  Verify: `node plugins/cklph-audit/tests/dogfood-contract.test.mjs`.
- **AC-073** GB-1 tool level (manual, recorded in the proof doc): §10.2 tool PASS on `2602aff` and
  clear on `55868e5`. Verify: `grep -qx 'AC-073: PASS' docs/proof/ambiguity-lens/2026-11-02.md`.
- **AC-074** GB-2 tool level (manual): §10.3 tool PASS. Verify:
  `grep -qE '^AC-074: (PASS|NOT RUN \(.+\))$' docs/proof/ambiguity-lens/2026-11-02.md` (NOT RUN only
  when the OOOhm checkout or its commits are missing; then F2/N2 carry it).
- **AC-075** Release gate (manual, LLM, §10.1 items 5-6): Mode 1 prose/contract recall ≥ 0.8 and
  precision ≥ 0.8, F2 TP, N2 no FP, GB-1 and GB-2 LLM PASS, recorded with the per-case table in the
  proof doc. **Merge precondition**; the release task does not bump without it. Two different checks:
  the gate step is *complete* when `grep -qE '^GATE: (PASS|FAIL)$'` holds (a FAIL is a finished,
  valid result and must not trigger a re-run); the *release precondition* is the PASS line below.
  Verify (release precondition): `grep -qx 'GATE: PASS' docs/proof/ambiguity-lens/2026-11-02.md`.
- **AC-076** Whole suite: `node --test plugins/cklph-audit/tests/*.test.mjs` passes (this includes
  `dogfood-contract`, `lens-registry`, `ambiguity-fixtures`, `ambiguity-skill`, `ambiguity-config`
  and `ambiguity-agents`) and
  `bash -n plugins/cklph-audit/tools/ambiguity.sh` passes. Verify: those two commands.

cklph-os

- **AC-080** `cklph-reviewer.md` Omissions axis has the Ambiguity bullet (a sub-bullet indented
  deeper than the axis bullets) with "contract violation", "blocking", "High" and "lone \"should\"";
  Spec axis has the two-readings clause; still exactly three axes; no `description:` line changed in
  any cklph-os file.
  Verify: `f=plugins/cklph-os/agents/cklph-reviewer.md; grep -q 'Ambiguity' $f && grep -q 'contract violation' $f && grep -q 'lone "should"' $f && grep -qE 'reads two ways|two readings' $f && test $(grep -cE '^   - \*\*[A-Za-z]+\*\* —' $f) -eq 3 && test $(git diff -U0 main -- plugins/cklph-os | grep -c '^[+-]description:') -eq 0` (the axis count is 3 at HEAD, confirmed).
- **AC-081** `two-reviewer-gate.md` has the `| Unambiguous |` row and the extended Consistent row.
  Verify: `grep -n "Unambiguous\|schema/type rejects" plugins/cklph-os/skills/review/two-reviewer-gate.md`.
- **AC-082** `spec-authoring-rules.md` has the "One reading per normative sentence" rule with the
  Don't write / Write instead pair and the four new gate items. Verify:
  `grep -n "One reading per normative\|inclusive or exclusive\|one reading\|closed set" plugins/cklph-os/skills/spec/spec-authoring-rules.md`.
- **AC-083** `plan-check.md` has the units/contract item. Verify: `grep -n "accepted by the schema" plugins/cklph-os/skills/plan/plan-check.md`.
- **AC-084** cklph-os `0.14.0` with a `[0.14.0]` CHANGELOG entry; the manifest parses; the cklph-os
  hook suite (`bats test/` at the repo root, `.github/workflows/test.yml:21-25`) passes in CI. bats is
  not installed locally, so locally this AC checks only that nothing under `plugins/cklph-os/hooks/`
  or the root `test/` changed (the pre-commit gate reads skill descriptions, so AC-080's
  description check covers the other input).
  Verify: `grep -q '"version": "0.14.0"' plugins/cklph-os/.claude-plugin/plugin.json && grep -q "\[0.14.0\]" plugins/cklph-os/CHANGELOG.md && node -e "JSON.parse(require('fs').readFileSync('plugins/cklph-os/.claude-plugin/plugin.json','utf8'))" && test -z "$(git status --porcelain plugins/cklph-os/hooks test)" && test -z "$(git diff main --name-only -- plugins/cklph-os/hooks test)"`.

---

## 15. Implementation decisions (append-only)

Spec gaps found while building, each with the date, the clause, the decision and the test that pins
it. Written only by the conditional tool-fix task (§9.1). Empty at revision 2.

All entries below: 2026-11-02, from the post-build review round (spec, red-team and mutation
reviewers). Engine pins are in `tests/engine-flow.test.mjs` SCENARIO E ("review-round fixes"), tool
pins in `tests/tools.test.mjs` ("review-round fixes and teeth"), fixture pins in
`tests/ambiguity-fixtures.test.mjs`.

- **LEAK** (§9.1, §10.1). The case path (`should-flag/…`) reached the review prompt and every
  verifier payload, and each fixture's line 1 named its case id (F/N/C = the verdict) and
  `labels.json` (the answer key) to a reviewer told to read comments as evidence. Decision: line 1 is
  only `FIXTURE ambiguity`; the gate runs each case from a neutral copy
  `tmp/ambiguity-gate/case-<NN>/` (shuffled numbering, never the id; labels.json never copied). Pin:
  AC-041 header and leak checks (`labels.json` and `FIXTURE ambiguity/<id>` are forbidden), each
  with a teeth self-check. Amended (review round 3): the neutral copy sat under the git-ignored
  `tmp/`, so a repo-root `rg`/Grep for a case sentence skipped it and landed on the labelled original
  and `labels.json`; F3's sentence and the N3 / F2 look-alike sentences were the lens SKILL's own
  examples (prompt recall, not lens recall); GB copies were named `pre`/`post`; and the `FIXTURE`
  marker, read in instruction docs, met a SKILL line calling fixtures "ground truth, not findings".
  Decision: every gate run happens in a throwaway gate tree with `fixtures/ambiguity/`, this SPEC and
  the proof doc deleted, labels and the ordinal map kept outside it; GB trees take ordinals from the
  same shuffle; the SKILL examples are reworded; line 1 is an empty comment. Pin: AC-041's
  prompt-overlap check (no 4-word run of fixture prose in the lens SKILL or an agent def, code spans
  and quoted one-token values aside) and the `FIXTURE`-forbidden header/leak checks, each with teeth.
- **EXACT** (§9.1, AC-042). A subset check on `should-not-flag` prose cases accepted any output, so a
  prose false positive could never fail. Decision: `should-not-flag` prose output must equal
  `toolExpect.includes` exactly; `should-flag` prose stays a subset. Pin: AC-042 (kills
  `if (vague.length)` without the conditional).
- **HINTS** (§4.1, AC-020). Offering all 17 hints in every run let the extractor tag a rule for a lens
  with no reviewer this run (concurrency, compliance, ambiguity in a default run), which then closed
  NOT CHECKED. Decision: the prompt offers `LENS_HINTS` filtered to the pre-v4 base (security,
  correctness, architecture, docs-drift, agent-config, any) plus the running lenses other than
  compliance (no review job); the schema enum stays all 17. A default run's prompt is byte-identical
  to pre-v4. Pin: AC-020 (derived list) and the default/compliance hint cases.
- **SYNTH** (§4.10, §4.11). The rendering sentence and `PROOF_CONTRACT_DROPPED` changed every run's
  synth prompt. Decision: both are sent only when the proof contract was in play (ambiguity lens ran,
  or any finding went through it); then the block is always sent, `[]` when empty. Pin: AC-027 paired
  cases and the security + docs-drift no-block case.
- **PRED** (§4.9). Variant excluded `f.lens === 'ambiguity'` only, while the verifier routes by lens
  OR `ambiguity:*` rule. Decision: one predicate (`isAmbiguityFinding`) for both. Pin: the
  security-lens `ambiguity:unit` high finding spawns no `variant:` job; E09/E10 routing cases.
- **CLAMP** (§1, §6). "Never critical" lived only in prompts. Decision: `verifyFindings` clamps a
  critical ambiguity finding to high and logs it. Pin: the ACR case.
- **TRACE** (§5, D11). Any non-blank `reachabilityTrace` confirmed. Decision: an ambiguity trace must
  have the §5 shape `A → outcome | B → outcome @ consumer` (`→` or `->`); filler routes like no trace.
  Pin: the 'n/a' / 'see reason' cases (low/medium dropped, high held) and the ASCII-arrow case.
  Amended (review round 3, TRACE-PARSE): the shape regex rejected a trace quoting `x || 3` (the
  falsy-default code itself) or using `⇒`, and backtracked super-linearly on a long arrow-only trace
  with no `@` (10KB: 137s on the event loop). Decision: `isDivergenceTrace` is a linear parse of the
  first 4000 chars: mask code spans, split on a lone `|` before the last `@` into exactly two sides,
  each with an arrow (`→`, `->`, `⇒`) and text on both ends, and a non-blank consumer. Pin: the
  falsy-default trace cases, the three-sided case and the 8KB timing case.
- **NORM** (§4.2). The ambiguity config block runs at load for every run; a string `ignore` or
  `prose.exclude` crashed security-only runs. Decision: a string is one glob, a non-list is none
  (groups too). Pin: the string-config cases.
- **IGN** (§4.2, D25, AC-024). Under a scope, a `**/`-led `config.ignore` glob was dropped from the
  tool command although it applies inside the scope. Decision: `**/` globs pass unchanged, globs under
  the scope are rebased, others dropped. Pin: the scoped ignore case.
- **PATHS** (§4.3, §4.5, §4.6, D25). Tool paths are TOOL-ROOT-relative; a scoped run dropped
  tool-relative seeds and misfiled tool-relative findings. Decision: recon and review are told to
  prefix the scope; the engine also rebases ambiguity seeds, safe controls and review findings that
  are not already in scope. Pin: the scoped seed/finding cases.
- **POLICY-CASE** (§2.1, §4.2, §8). Policy matching was case-sensitive. Decision: `docClass` policy
  basenames ignore case; the default policy group adds lowercase variants (mixed case such as
  `Security.md` still needs a custom group). Pin: the docClass case table and the lowercase seed case.
  Amended (review round 3): a case-insensitive prefix-plus-suffix match checked before instruction
  made `commands/security-review.md`, `agents/support-triage.md` and `skills/sast/security-checklist.md`
  policy, dropping contract-mismatch and overloaded-term. Decision: the case-sensitive prefix form is
  checked first, then instruction, then a case-insensitive **exact** basename (`security.md`). Pin: the
  policy-word-led instruction case table.
- **LEAK-WIDE** (§10.1). The delete list covered only the fixtures, SPEC and proof doc; `tests/`,
  `skills/audit-backtest/` (expected GB verdicts) and cklph-os docs (the SECURITY.md clause as the
  worked example) survived, and AC-041 compared fixtures only against the lens SKILL and agents.
  Decision: one `GATE_TREE_DELETE` list in `tests/lib/gate-tree.mjs`; AC-041 also checks every text
  file that survives it for a 5-word fixture run, except the documented contract mirrors
  (`GATE_MIRROR_OK`). Pin: the gate-tree survivor check and its teeth case.
- **TRACE-CHAIN** (§5). The proof prompt told voters to hold contract-mismatch "with the full chain",
  which has no `|` and no `@`, so the A|B parser dropped it. Decision: for
  `ambiguity:contract-mismatch` only, a trace with >= 3 arrows and >= 2 file:line cites also counts;
  the prompt says the chain goes in `reachabilityTrace`. Pin: the TRACE-CHAIN engine-flow case.
- **TRACE-SHAPE** (§5). Gaps left after TRACE-PARSE: a pipe after the last `@` (a third side) passed,
  filler (`n/a -> n/a | n/a -> n/a @ n/a`) passed, a reading wrapped in backticks lost its arrow to the
  code-span mask, and `=>` was not an arrow. Decision: inside code spans only `|` and `@` are masked;
  exactly one lone `|` in the whole trace, before the last `@`; arrows `→ -> ⇒ =>`; a side or consumer
  that is only `n/a|none|tbd|todo|unknown|see reason` or punctuation is filler. Pin: the trace-shape
  table in engine-flow.
- **DOC-CAP** (§3.5). A glob-matched code/JSON file read as a doc (a 1.1 MB `docs/openapi.json` under
  `docs/**`) printed `skipped`, failing contract-check as an unread doc. Decision: non-markdown docs
  join the informational `schema candidate(s) ... not harvested` lines, once per file; an unreadable
  markdown doc still prints `skipped` and still fails. The reviewer records both informational lines as
  `contract check partial`. Pin: the DOC-CAP tools case.
- **POLICY-SUFFIX** (§2.1). The exact-basename-only step classed `privacy-policy.md`,
  `privacy_notice.md` and `security-policy.md` as reference although the default policy group globs
  `**/privacy*.md`, so scope-clause could not fire on the usual privacy policy file. Decision: step 3
  also accepts ONE policy-type suffix (`policy|notice|statement|policies|of-service|of-use|guidelines`);
  an arbitrary suffix (`security-review.md`) stays reference. Pin: the POLICY-SUFFIX rows of the
  docClass table.
- **PRUNE** (§3.3). `build`/`dist` were pruned at any depth, dropping `plugins/cklph-os/skills/build/`
  with a clean `files=0`. Decision: `node_modules .git vendor` pruned everywhere; `dist build .next
  coverage` pruned only outside instruction paths, each with a `pruned <dir>/` line. Pin: the prune
  case. Amended (review round 3): an instruction ANCESTOR kept every generated dir below it
  (`skills/x/dist/`, `packages/agents/dist/`). Decision: kept only when the dir's own parent is an
  instruction dir and not a package root. Pin: the amended prune case.
- **SCHEMA-CAP** (§3.3, §3.5, §3.7). Contract mode read schema candidates through the doc reader, so
  a 1.1MB `package-lock.json` or data JSON printed `skipped <file>: too large`, which contract-check
  and the lens SKILL treat as an unread doc: every prose job in such a repo reported a tool failure.
  Decision: `*-lock.json` and `*.min.js` are never schema candidates (a hand-written `.d.ts` still
  is: H3); an oversized or unreadable candidate gets one informational `N schema candidate(s) ... not
  harvested: <files>` line; `skipped` stays a failure for docs only. Pin: the oversized-schema case,
  its paired oversized-doc case and the `.d.ts` / `.min.js` case.
- **CLEAN-DROP** (§4.10). The clean-run short-circuit ignored `proofContractDropped`: a run whose every
  held ambiguity finding lacked a trace logged "Clean run", returned `report: null` and listed the
  dropped ids nowhere. Decision: a non-empty drop list writes a report; both result objects carry
  `proofContractDropped`. Pin: the all-dropped case and its truly-clean pair.
- **EMPTY** (§3.3, D27). A prose/contract selection of 0 readable docs printed only a clean summary.
  Decision: also print `0 docs selected or readable, NOTHING scanned` (contract: when enums > 0).
  The fixture test accepts that line only for a case with 0 eligible docs (N8). Pin: the
  empty-selection cases.
- **MDC** (§3.2, §3.5). Cursor rules (`.cursor/rules/*.mdc`, in the default instructions group) were
  never scanned. Decision: `.mdc` is markdown in prose and contract modes. Pin: the `.mdc` cases.
- **THOUS** (§3.4). `5,000 ms` became a unitless `5`. Decision: `\d{1,3}(,\d{3})+` is one number.
  Pin: the thousands case.
- **CAP** (§3.3). No size cap, and three quadratic paths (code-mode prefix re-scan, prose per-sentence
  line lookup, lazy code-span regex) stalled on bundles. Decision: `AMBIGUITY_MAX_BYTES` (default
  1 MiB) skips a larger file by name; the three paths are linear (incremental paren depth, binary
  search, `codeSpanRanges` in common.mjs). No wrapper `timeout`: macOS has none by default and the
  root cause is fixed. Pin: the size-cap and linear-time cases.
- **NAMES** (§3.3, §3.7). A newline in a file name could forge a summary line. Decision: names with a
  control char are JSON-quoted on stderr; `contract-check` reads the LAST summary line, fails on more
  than one, on any `skipped` / `truncated` line, and on a tool that exits non-zero. Pin: the forged
  name case and AC-017's one-rule fakes.
- **ISO** (§3.1, D23). prose.mjs imported code.mjs. Decision: `isUnitName` / `UNIT_WORD` live in
  common.mjs. Pin: the sibling-syntax-error case.
- **R-IDS** (§2.1, AC-016, AC-040). "The 9 ids of §1" means the 8 distinct rule ids of the 9 rows
  (`ambiguity:unit` is both a prose and a code row). Text reworded; no code change.
- **COMPLIANCE-TEXT** (§7.4). The engine's CONFIRMED_FINDINGS carry no `lens`; the compliance skill
  now identifies ambiguity findings by rule id instead (no engine prompt change).
- **REVIEWER-TEXT** (§11). cklph-reviewer's "then blocking" now states High and `confidence:
  certain` once both readings and the consumer are cited (the blocking rule forbids blocking
  Medium/tentative); the two-reviewer gate's Unambiguous row uses the same divergent-consumer test.
- **N1-FOLD** (§9.2, gate 2026-11-02). The only gate FP was N1 `output-format.example.md:6`
  (`unchecked`). At HEAD that value is right because the engine's rule-closure fold produces it for the
  coverage matrix; the fixture had no fold, so `CONTROL_SCHEMA.status` was the only "status" in reach
  and the flag was fair. Decision: the fixture is fixed, not the label: `engine.example.js` gains a
  `closeRule` fold that returns `unchecked`, and the verifier's contract-mismatch refutations add "the
  doc describes a derived output and code in the package produces V". The 2026-11-02 gate score stands
  as recorded; the next gate run measures the fixed fixture.
- **SCRIPTPATH** (1.3.1, audit-run). Workflow loads a `scriptPath` only from the working directory or a
  session-added directory; the installed plugin cache is neither, so every `:run`/`:quick` failed and
  the model inlined the 100 KB engine. Decision: audit-run copies the engine to the session scratchpad
  and runs the copy; inlining is forbidden. Pin: `tests/audit-run-skill.test.mjs`.
- **PROSE-MAP** (1.3.1, Map). A run whose lenses are all `ambiguity`/`docs-drift` spawned the modeler
  for a threat model no prose reviewer reads. Decision: skip Map with `skipReason: 'prose-only'`
  (`quick` and `disabled` are the other reasons). Pin: engine-flow PROSE-MAP cases.
- **RULE-SCOPE** (1.3.1, §7.5 closure). Closure folded every rule no job was handed into `unchecked`,
  so an ambiguity-only run reported 90 of 96 rules NOT CHECKED. Decision: one `ruleForLens` routing
  function serves the reviewer hand-off and closure; a rule no job in the run can receive is
  `outOfScope`, counted apart from checked/unchecked and listed under the matrix. Pin: engine-flow
  RULE-SCOPE cases.
- **CLEAN-RECORD** (1.3.1, Synthesize). A clean run returned `report: null` and wrote nothing, so the
  refuted candidates and their reasons were lost. Decision: `report` stays null (the clean signal);
  the engine adds `cleanReport`, built in plain code (no agent), with placeholders `__AUDIT_DATE__`
  and `__REPO_SHA__` that audit-run fills before writing. Pin: engine-flow CLEAN-RECORD cases.
  Amended (review round 1): only a majority refutation is "refuted"; inconclusive panels and
  below-floor confirmations get their own sections; the record is written to `AUDIT-<date>-clean.md`
  and no report overwrites another. RULE-SCOPE amended: scope is by REQUESTED lens; a requested lens
  with no job leaves its rules NOT CHECKED. PROSE-MAP amended: `ambiguity` with `code: true` is not
  prose-only.
