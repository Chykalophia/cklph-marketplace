---
name: ambiguity-lens
description: Use when asked to audit policy docs (SECURITY.md, CONTRIBUTING), skills, agent instructions or doc tables that prescribe schema values for wording a reader can take two ways, or a documented value the schema rejects. Load it before reviewing those files.
---

# ambiguity-lens: text a reader can take two ways

An **ambiguity** is an artifact (doc, instruction, policy, config, code contract) that a competent member of its actual audience (reader, caller, operator, agent) can reasonably read two ways, where the two readings lead to **different outcomes** for a consumer you can name. Two readings with the same outcome are not a finding. A reading only a hostile or careless reader would take is not a reading. A **contract mismatch** is the degenerate case: one reading, and the receiving contract rejects it. That is a defect proven by a citation chain, not a question.

You are the **judgment layer** of a three-layer pipeline:

1. **Deterministic tool → recall.** Run the lens tool first. It enumerates the SITES where two readings are possible (scope clauses, vague conditionals, unitless quantities) and every documented value its schema rejects. You reason over its output instead of eyeballing every sentence.
2. **You (reviewer LLM) → judgment.** For each site, decide whether a second reading is one the audience would really take, who acts on it, and whether the outcomes diverge. Add what no tool sees (contradictions, overloaded terms), labeled `source: "reasoning"`.
3. **Verifier → precision.** A separate `audit-verifier` defaults to refuted and holds a finding only when it independently reproduces both readings, the consumer, the divergent outcomes and the absence of any disambiguator. A hold without a divergence trace is discarded in code, at every severity.

This lens is **opt-in**: it runs only when `ambiguity` is in the run's `lenses`.

## TOOL

`${CLAUDE_PLUGIN_ROOT}/tools/ambiguity.sh <mode> <root> [--exclude <glob>]... [glob...]`, one mode per call, from the TOOL ROOT the dispatch prompt names, with its exact globs and excludes.

- **Prose jobs** run `prose` and `contract`. `prose` emits `{ file, line, kind, rule, docClass, heading, signal, terms }` for kinds `scope`, `vague-conditional` and `unit`. `contract` emits a record per documented value outside its field's allowed set, with the field, the allowed values, the schema location and `alsoValidFor`.
- **Code jobs** (only when `ambiguity.code: true`) run `code`, kinds `unit`, `falsy-default`, `sentinel`.
- The tool's `kind` is the SITE class, not the verdict. A clear clause is still a site by design: most `scope` sites are fine.
- The stderr summary line (`ambiguity.sh prose: ... normative=N ...`, `ambiguity.sh contract: enums=K ... docs=D ...`) is your denominator; quote it in coverage. The tool prints `[]` and exits 0 on every failure, so `[]` next to a `NOTHING scanned` or `NOT run` line means "not checked", never "clean": record it in `coverage.toolFailures`. Also record each `skipped <file>: <reason>` line (that doc was not read: not valid UTF-8, too large, unreadable) and each `N record(s), truncated to M` line (`emitted=` counts the records kept, not the N found; narrow the globs and re-run). `pruned <dir>/ (generated output)` is informational, not a failure: a `dist`, `build`, `coverage` or `.next` dir is skipped unless its own parent is an `agents/`, `skills/` or `commands/` dir, as in `skills/build/`. `contract: N schema candidate(s) over the size cap not harvested: <files>` and `contract: N schema candidate(s) unreadable, not harvested: <files>` are not doc failures either (no prose doc was missed), but they are not clean: those files were not mined for enums, and one of them can be the real enum source (a generated OpenAPI client, a big `schema.json`, a `.d.ts`). Record each as `contract check partial: enums in <files> not harvested` in coverage, and if a named file looks like a schema (`*schema*`, `*types*`, `*.d.ts`, `openapi*`), say a contract-mismatch against it could not be checked.
- A contract record with a non-empty `alsoValidFor` means the value is valid for a different field: consider `ambiguity:overloaded-term` (the doc named the wrong field), not a contract mismatch.

## Which rules apply where (docClass)

The tool assigns each markdown file one `docClass` from its root-relative path; first match wins. Apply only the rules marked for that class.

| docClass | Matches (regex on the root-relative path) | Rules |
|---|---|---|
| policy | basename matches `^(SECURITY\|CONTRIBUTING\|CODE_OF_CONDUCT\|PRIVACY\|TERMS\|SUPPORT\|GOVERNANCE\|DISCLOSURE\|VULNERABILITY)[\w.-]*\.mdx?$` (case-sensitive), checked first; **or**, only after the instruction check fails, the basename, in any case, is one of those words, optionally followed by one `-`/`_`/`.` and a policy-type suffix (`policy`, `notice`, `statement`, `policies`, `of-service`, `of-use`, `guidelines`), then `.md`/`.mdx` (`security.md`, `docs/Security.md`, `privacy-policy.md`, `privacy_notice.md`; not `security-review.md`) | scope-clause, contradiction, unit, vague-conditional (only where it sets a reader's obligation or right) |
| instruction | basename matches `^(CLAUDE\|AGENTS\|GEMINI\|SKILL)\.md$\|^copilot-instructions\.md$`, or the path matches `(^\|/)(agents\|skills\|commands)/\|(^\|/)\.(claude\|cursor/rules)/` | contract-mismatch, contradiction, vague-conditional, unit, overloaded-term, scope-clause |
| reference | any other markdown in a group | contract-mismatch, unit (config tables), contradiction |

The path rule is anchored: `agents/audit-reviewer.md` and `skills/agent-config-lens/checklist.md` are instruction docs; `myagents/x.md` is reference. A lowercase instruction doc named for a policy word (`commands/security-review.md`, `agents/support-triage.md`) stays instruction. Code (opt-in): source files in units, rules falsy-default, sentinel, unit.

## Never in scope

- `CHANGELOG*.md`, `HISTORY.md`, `LICENSE*`, `NOTICE*` (history quotes old values; legal reading is counsel's call), generated and vendored docs.
- `fixtures/**` in an ordinary audit (ground truth, not findings). In a backtest the case dir is the root and its files are the targets.
- Text quoted as an anti-pattern ("Don't write:", "Bad:", a blockquote under it), fenced examples (except for contract-mismatch, where a fenced `"F": "V"` still counts), sections marked `[INFORMATIONAL]` or `[REFERENCE]`.
- Spec docs (`SPEC*.md`, `specs/**`) unless a configured group names them: they are dated design records, and spec ambiguity is caught at authoring time by the cklph-os spec gate.
- HTML comments in policy and reference docs (readers never see them). In instruction docs they are read, because agents read them.

## Never a finding (look-alikes)

- A lone "should" or "may". A modal is a finding only as a conflict on the same requirement (`ambiguity:contradiction`).
- A vague adjective in non-normative prose ("big monorepos can be slow to index", "replies typically come the same week").
- A clause defined nearby: same paragraph, a Definitions section, a doc the consumer is told to load, a pinning example.
- A quoted anti-pattern or a fenced example.
- A value bound to a different field that allows it, e.g. `counts.info` in a report shape is a counts key, not a severity.
- A dimensionless count like `voters: 3`.
- A unit already in the key or the sentence (`maxWaitMs`, "timeout of 30 seconds", "reply within 5 working days").
- Two readings with the same outcome for the consumer.

## Rules

| Rule id | Job | Finding when | Default severity | Default bucket |
|---|---|---|---|---|
| `ambiguity:contract-mismatch` | prose | A doc prescribes value V for field F (table column inferred or titled F, `F: "V"`, a connector or prefix form, or an inline list), the doc is on a consumer's load path, and V is outside the allowed set for F. Chain: doc:line → consumer:line that loads it → schema:line. | medium; high if what is lost is a security finding ≥ medium or a security gate | quick-win (doc edit to an allowed value); targeted-fix if the schema must change |
| `ambiguity:scope-clause` | prose | An inclusion, exclusion or eligibility clause whose subject or scope admits two readings that put a case on opposite sides of the line. | low; medium when the wrong reading excludes a class of security reports (e.g. privilege escalation) or misstates a privacy or data obligation | quick-win when surrounding text shows the intended reading; else owner-decision |
| `ambiguity:vague-conditional` | prose | An instruction someone must branch on uses an undefined threshold ("ship it once coverage looks healthy", "when the cache is old", "as needed") and the readings produce different actions. | low; medium if it gates an irreversible or security-relevant action (merge, delete, publish, skip a check) | owner-decision; quick-win if a definition exists elsewhere in the repo (link it) |
| `ambiguity:unit` | prose | A quantity in an instruction, config or policy doc has no unit, and the consumer (cite the code or reader) would act on a different magnitude. | low; medium if the wrong reading is off by ≥10x on a limit, timeout, budget or money amount | quick-win when code fixes the unit (document it); owner-decision when nothing does |
| `ambiguity:contradiction` | prose | Two normative statements the same consumer reads prescribe incompatible values or behaviour, including a modal conflict on the same requirement (MUST in the agent def, "optional" in the skill it loads). Reasoning only. | medium if one consumer loads both; low otherwise | targeted-fix when the repo states precedence (fix the lesser source); else owner-decision |
| `ambiguity:overloaded-term` | prose | One term used with two incompatible meanings in the same instruction scope, and acting on the wrong one changes behaviour ("tighten the filter": drop more results vs demand more evidence per result). Reasoning, seeded by `alsoValidFor`. | low; medium if one reading hides findings or skips a control | owner-decision; quick-win when the tool shows the doc named the wrong field |
| `ambiguity:unit` | code | Producer and consumer assume different units (s/ms, bytes/KB, cents/dollars), both sites cited; or an unsuffixed knob whose cited consumer and documented or configured value disagree. | medium; high for money or auth/quota windows (needs trace) | targeted-fix |
| `ambiguity:falsy-default` | code | A falsy-coalescing default (`x \|\| d`, `x or d`, `if (!x)`) where a cited caller, test, schema or config passes or allows `0`, `''` or `false`. | medium | targeted-fix |
| `ambiguity:sentinel` | code | One in-band value encodes two states, and a cited consumer branches wrongly for one of them. | medium; high if it fails open on authz or quota | targeted-fix |

Rule ids not in this table are invalid for this lens. **Ambiguity is never critical**, whatever the consequence. `systemic-refactor` is not used by this lens.

**Severity comes from the consequence of the wrong reading** for the named consumer, not from how unclear the text is. Wording only, no consumer acts differently: not a finding. A consumer acts differently with a low blast radius (cosmetic, easily noticed, reversible): low. A finding, report, check or obligation silently lost or misdirected, an action wrong by ≥10x, or a reporter withholding an in-scope report class: medium. A security finding ≥ medium or a security gate lost, an irreversible or security action (merge, delete, publish, authz, quota) taken under the wrong reading, or money off: high, which needs a divergence trace like every high.

**Buckets.** quick-win: a one-line doc or code edit, and the intended reading is evident from the repo. targeted-fix: the schema must change, or precedence is stated so the lesser source is fixed, or a code producer/consumer unit split. owner-decision: only the owner knows the intended reading; it renders as an A-or-B question, and "keep as written" means baseline the fingerprint.

## Finding format

- **`readings: { a, b, consumer, divergence }`**, all four keys, each with file:line where one exists. `consumer` is an agent that loads the doc, a schema its output must match, an operator, the code that reads a value, or a named human-reader role with the doc's file:line ("a reporter deciding whether a privilege-escalation bug is in scope"). `divergence` is "A → outcome | B → outcome". No named consumer with a divergent outcome means no finding.
- **contract-mismatch** carries the full chain: doc:line prescribes V for F → consumer:line loads the doc → schema:line allowed set → V not in it → what is lost. Its `suggestedFix` names both options (edit the doc to an allowed value, or change the schema). `source: "tool"`.
- **`suggestedFix` quotes the old line and the new line**, the CodeRabbit way, so the owner can paste it. For owner-decision, give one rewrite per reading: "If A: <rewrite A>. If B: <rewrite B>."
- **Confidence describes the proof**, the bucket describes the remedy: use `confirmed` (or `likely` before verify), never `needs-owner-input`. The owner question lives in `remediationBucket: "owner-decision"`.
- `normalizedSnippet`: for prose, the sentence lowercased with whitespace collapsed; for contract-mismatch, `<field>=<value> vs <schemaFile>`. The baseline fingerprint then survives edits elsewhere in the doc.
- When you talk about a bad value in a finding, name it without a binding form: write "the value `info`, which the severity enum rejects", so your own text never reads as a second prescription.

## Comments ARE evidence here

Unlike omission-lens (which reasons from code, not comments), comments and prose are evidence in this lens: a comment that defines a unit or a sentinel, a footnote, or a definitions section is exactly the disambiguator that refutes a finding. Read them. The one exception: HTML comments in policy and reference docs are not rendered, so they cannot disambiguate for a human reader.

## Code job (opt-in)

The code job runs only when `ambiguity.code: true`, crossed with the run's units. The bar is strict: a cited divergent pair (producer and consumer that assume different units, a caller that passes `0` into a falsy default, a consumer that branches wrongly on a sentinel) or a reachable divergent value, or no finding. A unit comment does not refute a consumer that computes in the other unit; no reachable divergent value does refute. If the code ambiguity is exploitable, use the security rule id instead.

## Compose with sibling lenses

- **docs-drift-lens** owns paths, scripts and packages that do not resolve. **agent-config-lens** owns what instruction docs make an agent do unsafely. This lens owns whether they can be read two ways or contradict their schema. Cite across; never double-report.
- **security-lens** owns exploitable loose matching and auth sentinels that are already exploitable defects.

## Compose with the repo's own rules

Load the repo's rules (`CLAUDE.md` / `AGENTS.md`, the RULEBOOK subset in your prompt). On conflict, prefer the repo's rule: a stated precedence or a documented definition settles a reading. Treat baselined fingerprints as accepted. Return a ruleCheck for **every** rule handed (`violation` | `verified-safe` | `not-applicable`); `verified-safe` and `not-applicable` need a one-line citation or reason. A skipped rule renders NOT CHECKED in the coverage matrix.

## The gate

Gated by `fixtures/ambiguity/` (`should-flag/` for recall, `should-not-flag/` for the look-alikes, answers in `fixtures/ambiguity/labels.json`) plus two git backtests (the PR #22 contract row and the SECURITY.md scope clause). Recall ≥ 0.8 and **precision ≥ 0.8 after verify**, deliberately stricter than the 0.7 suggestion for other lenses: this is the noisiest class, and a false "this reads two ways" costs an owner a rewrite of a clear doc. A lens that cannot clear the gate is fixed, not shipped degraded.
