---
name: audit-report-format
description: The exact AUDIT-<date>.md contract — front-matter, coverage summary + rule-closure matrix, severity sections (file:line, snippet, why-real + verifier note, fix, confidence/bucket/context/validation), positive controls (INFO), ordered remediation waves for /cklph-os:flow with an owner-decisions subsection, and an appendix with NO silent truncation. Loaded by audit-synthesizer when writing the report.
---

# audit-report-format — the AUDIT-<date>.md contract

This skill defines the exact shape `audit-synthesizer` must emit as `report.markdown`. The contract exists so reports are consistent, git-diffable across runs, and feed cleanly into `/cklph-os:flow`. **Nothing is silently truncated** — anything not audited, whether a *unit*, a *rulebook rule*, or an *enumerated pattern* (budget, sampling, low-confidence, recon gaps), is named in the report.

The document has seven parts, in order: **Front-matter → Coverage summary → Coverage matrix → Severity sections → Positive controls (INFO) → Remediation waves → Appendix.**

An OPTIONAL `## Summary` lead block (new-finding counts, rule closure, positive-control count, unit derivation, a one-or-two-line headline) may sit between the front-matter and the Coverage summary — a human skim layer only, never a substitute for the sections below. The template includes one.

## 1. Front-matter (YAML)

Open the file with a YAML front-matter block capturing the run's provenance:

```yaml
---
date: 2026-06-10            # YYYY-MM-DD of the run
repo_sha: a1b2c3d           # HEAD SHA the audit ran against
lenses: [security, correctness, architecture]
units:                      # units actually covered, + derivation method
  source: inferred          # config | inferred | deep-mapped
  covered: [auth, billing, rule-engine]
  low_confidence: [rule-engine]   # flagged so you can pin in config next run
mode: full                  # full | quick
counts: { critical: 2, high: 5, medium: 8, low: 3, info: 4 }   # info = positive controls
coverage:
  rulebook_size: 12         # discrete rules extracted from the rulesFrom docs
  checked: 10               # rules with any status other than unchecked
  unchecked: [agents-md:rule-7, claude-md:rule-2]   # NOT CHECKED — mirrored in the matrix
positive_controls: 4        # entries in the Positive controls (INFO) section
suppressed_by_baseline: 4   # confirmed but already accepted
skipped:
  by_budget: []             # units/jobs dropped when budget ran low
  by_sampling: []           # units NOT audited in quick mode (top-N only)
---
```

If a field is empty, emit it empty (`[]` / `0`) — never omit it. The reader must be able to tell coverage from the front-matter alone: `coverage.checked` of `coverage.rulebook_size` rules, and every `unchecked` rule id named.

## 2. Coverage summary

A `## Coverage summary` section directly after the front-matter: the coverage math, per lens. Denominators come from recon **verbatim**; examined counts come from reviewer-reported coverage. **Coverage is arithmetic, not vibes.**

One table per lens:

```markdown
## Coverage summary

### security

| Pattern | Command | Examined |
| --- | --- | --- |
| `.single()` callsites | `grep -rn "\.single()" src/` | 325 / 325 |
| webhook POST handlers | `grep -rln "async function POST" app/api/webhooks/` | 6 / 9 — **sampled**: risk-weighted to signature-bearing routes |

**Reviewer coverage:** seeds verified 14 / 14 given · tool candidates judged 87
```

Rules for the summary:
- Every recon denominator gets a row: the pattern, the **re-runnable command verbatim**, and `examined X / N`.
- Where `X < N`, the row says **sampled** and gives the sampling rationale (risk-weighting) — never leave a shortfall unexplained.
- Each lens states its reviewer coverage: `seedsVerified / seedsGiven` and `toolCandidatesJudged`.
- If recon didn't run for a lens (quick mode, config, agent died), say so here in one line — and expand why in the appendix. Never render an empty table silently.

## 3. Coverage matrix

A `## Coverage matrix` section after the summary: **one row for EVERY rulebook rule** — closure means no rule is silently absent. Statuses are exactly `violation` | `verified-safe` | `not-applicable` | `unchecked` (rendered as **NOT CHECKED**).

```markdown
## Coverage matrix

| Rule id | Source | Status | Finding IDs / citation / reason |
| --- | --- | --- | --- |
| `agents-md:rule-3` | `AGENTS.md:41` | violation | C-1, H-2 |
| `claude-md:no-console` | `CLAUDE.md:88` | verified-safe | `src/logger.ts:12` — pino wrapper used throughout |
| `agents-md:rule-9` | `AGENTS.md:77` | not-applicable | repo has no client bundle |
| **`agents-md:rule-7`** | **`AGENTS.md:63`** | **NOT CHECKED** | **no reviewer reached this rule** |
```

Rules for the matrix:
- `violation` rows list the finding IDs — each must exist in the severity sections.
- `verified-safe` rows cite the evidence (`file:line`); `not-applicable` rows give the one-line reason.
- `unchecked` rows render as **NOT CHECKED** with the **whole row bold** — an honest NOT CHECKED is a feature, not an embarrassment. The same rule ids appear in front-matter `coverage.unchecked`.

## 4. Severity sections

One section per severity, highest first: `## Critical` → `## High` → `## Medium` → `## Low`. Omit a section only if it has zero findings (and the count is then 0 in front-matter). Within a section, each finding is a subsection with a stable id:

```markdown
### [C-1] <short finding title>

- **Location:** `lib/users/update-role.ts:42`
- **Rule:** CWE-269 / ASVS-4.2.2 (and the repo rule if one applies)
- **Severity:** critical
- **Unit / lens:** auth / security
- **Confidence:** confirmed                 # confirmed | likely | needs-owner-input
- **Bucket:** quick-win                     # quick-win | targeted-fix | systemic-refactor | owner-decision
- **Context:** server / prod / ungated      # surface / runtime / gated — classified BEFORE severity
- **Validated by:** <the read-only checks the reviewer ran to confirm true-positive>

```ts
// the offending code, quoted exactly (a few lines of context)
await supabase.from('users').update({ role: body.role }).eq('id', user.id)
```

**Why it's real.** <the concrete reason this is a true issue — what an attacker/bug does>.
*Verifier:* survived adversarial refutation — majority of N voters confirmed; the reviewer's missed-guard hunt found no mitigating middleware/RLS/validation/caller. <one line on what the verifier checked>.

**Fix.** <a specific, actionable remediation — not "add validation" but what/where>.
```

Rules for every finding:
- **Always** a `file:line` anchor and a **quoted snippet** of the offending code. No finding without a code anchor.
- The **why-real** must explain the impact, and the **verifier note** must state it survived the default-to-refuted vote (this is the plugin's core trust signal — every shipped finding passed it). For `source: "reasoning"` findings with no deterministic tool, label them **candidate for human review**, honestly.
- The **Confidence / Bucket / Context / Validated by** lines carry the reviewer's `confidence`, `remediationBucket`, `context`, and `validationSteps` — emit all four. Severity was derived from context (real exploitability, not raw pattern match); the Context line shows that work.
- Cite the rule id (CWE/ASVS/own-rule). If a repo rule applied, name it.
- Finding ids are stable per-report (`C-1`, `H-3`, `M-2`, `L-1`) and are what remediation waves and the coverage matrix reference.

## 5. Positive controls (INFO)

A `## Positive controls (INFO)` section after the severity sections: the "checked and clean" knowledge that would otherwise evaporate every run. Front-matter `positive_controls` and `counts.info` both equal the number of entries here. Omit the section only when there are zero entries (`positiveControls.max: 0` disables harvesting entirely).

```markdown
## Positive controls (INFO)

### [I-1] Stripe webhook signature verification

- **Citation:** `app/api/webhooks/stripe/route.ts:18`
- **Protects:** all Stripe webhook mutations (signature check + idempotency key)
- **Why it shipped:** killed-candidate — the counter-evidence that refuted a high "unauthenticated webhook" candidate
```

Rules for each entry:
- **Always** a `file:line` citation and what the control protects.
- **Why it shipped** is exactly one of: `killed-candidate` (counter-evidence that refuted a critical/high candidate), `rule-verified` (a rulebook rule reconciled verified-safe), `recon` (a recon safe-control a reviewer confirmed in scope — unconfirmed candidates never ship).
- Ids are stable per-report (`I-1`, `I-2`, …). INFO entries are not findings — they never appear in waves.

## 6. Remediation waves

A `## Remediation waves` section: ordered groups of findings designed to be handed to `/cklph-os:flow` as sequential implementation passes. Order by dependency and blast radius (fix foundational/security-critical first; group changes that touch the same module) — **quick-wins first within a severity band**.

```markdown
## Remediation waves

### Wave 1 — Close privilege-escalation paths
**Findings:** C-1, C-2, H-4
**Rationale:** these share the users-table RLS surface; fix together before any tier work.
**Handoff:** `/cklph-os:flow "Wave 1: ..."`

### Wave 2 — Silent-failure hardening
**Findings:** H-1, M-3, M-5
**Rationale:** ...

### Owner decisions
- **[M-4] <title>** — <the question: what looks intentional, what evidence says so, what the owner should confirm>
```

The waves section closes with an `### Owner decisions` subsection: findings with `remediationBucket: owner-decision` are **questions for the repo owner, not scheduled work** — intentional-but-not-locally-obvious calls only the owner can make. They are NOT placed in a wave. Every confirmed finding belongs to exactly one wave **or** to Owner decisions; waves are ordered, and each rationale explains why the wave is sequenced where it is.

## 7. Appendix — coverage & what was skipped (NO silent truncation)

A closing `## Appendix` that makes coverage auditable:

- **Units covered** — each unit, its globs, and its derivation (`config` / `inferred` / `deep-mapped`). Repeat **low-confidence** units here and recommend pinning them in `units.list` next run.
- **What was skipped, and why** — explicitly list:
  - units **not audited in quick mode** (top-N sampling — partial coverage; name every dropped unit),
  - jobs **dropped for budget** (token ceiling hit — name them),
  - anything the ignore globs excluded that a reader might expect covered.
- **Recon gaps** — if recon was skipped (quick mode without `recon.quick`, or `recon.enabled: false`) or partial (a lens's recon agent died, or budget killed it), state which lenses' denominators and seeds are absent/partial and why. Absent denominators mean the Coverage summary has no math for that lens — say so plainly, don't fake it.
- **Rulebook extraction failure** — if RUN_META says `rulebookMissing: true`, state that the Coverage matrix is empty because rulebook extraction died — NOT because the `rulesFrom` docs contain no rules. Silence must never read as "no rules".
- **Denominator commands (verbatim)** — every recon denominator command, exactly as run, so the coverage math is re-runnable by the reader.
- If the run was `quick` mode, state plainly at the top of the appendix: **coverage is partial — only the top-N highest-risk units were audited.**

The appendix is non-negotiable: a reader must never have to wonder whether silence means "clean" or "didn't look." If it wasn't audited — a **unit**, a **rulebook rule**, or an **enumerated pattern** — it's named here, or shown as **NOT CHECKED** in the matrix.

> A starting layout lives at `${CLAUDE_PLUGIN_ROOT}/templates/AUDIT-TEMPLATE.md` — match this contract over the template if they ever diverge.
