---
name: audit-report-format
description: The exact AUDIT-<date>.md contract — front-matter, severity sections (file:line, snippet, why-real + verifier note, fix), ordered remediation waves for /cklph-os:flow, and an appendix with NO silent truncation. Loaded by audit-synthesizer when writing the report.
---

# audit-report-format — the AUDIT-<date>.md contract

This skill defines the exact shape `audit-synthesizer` must emit as `report.markdown`. The contract exists so reports are consistent, git-diffable across runs, and feed cleanly into `/cklph-os:flow`. **Nothing is silently truncated** — anything not audited (budget, sampling, low-confidence) is named in the appendix.

The document has four parts, in order: **Front-matter → Severity sections → Remediation waves → Appendix.**

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
counts: { critical: 2, high: 5, medium: 8, low: 3 }
suppressed_by_baseline: 4   # confirmed but already accepted
skipped:
  by_budget: []             # units/jobs dropped when budget ran low
  by_sampling: []           # units NOT audited in quick mode (top-N only)
---
```

If a field is empty, emit it empty (`[]` / `0`) — never omit it. The reader must be able to tell coverage from the front-matter alone.

## 2. Severity sections

One section per severity, highest first: `## Critical` → `## High` → `## Medium` → `## Low`. Omit a section only if it has zero findings (and the count is then 0 in front-matter). Within a section, each finding is a subsection with a stable id:

```markdown
### [C-1] <short finding title>

- **Location:** `lib/users/update-role.ts:42`
- **Rule:** CWE-269 / ASVS-4.2.2 (and the repo rule if one applies)
- **Severity:** critical
- **Unit / lens:** auth / security

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
- Cite the rule id (CWE/ASVS/own-rule). If a repo rule applied, name it.
- Finding ids are stable per-report (`C-1`, `H-3`, `M-2`, `L-1`) and are what remediation waves reference.

## 3. Remediation waves

A `## Remediation waves` section: ordered groups of findings designed to be handed to `/cklph-os:flow` as sequential implementation passes. Order by dependency and blast radius (fix foundational/security-critical first; group changes that touch the same module).

```markdown
## Remediation waves

### Wave 1 — Close privilege-escalation paths
**Findings:** C-1, C-2, H-4
**Rationale:** these share the users-table RLS surface; fix together before any tier work.
**Handoff:** `/cklph-os:flow "Wave 1: ..."`

### Wave 2 — Silent-failure hardening
**Findings:** H-1, M-3, M-5
**Rationale:** ...
```

Every confirmed finding belongs to exactly one wave. Waves are ordered; the rationale explains why this wave is sequenced where it is.

## 4. Appendix — coverage & what was skipped (NO silent truncation)

A closing `## Appendix` that makes coverage auditable:

- **Units covered** — each unit, its globs, and its derivation (`config` / `inferred` / `deep-mapped`). Repeat **low-confidence** units here and recommend pinning them in `units.list` next run.
- **What was skipped, and why** — explicitly list:
  - units **not audited in quick mode** (top-N sampling — partial coverage; name every dropped unit),
  - jobs **dropped for budget** (token ceiling hit — name them),
  - anything the ignore globs excluded that a reader might expect covered.
- If the run was `quick` mode, state plainly at the top of the appendix: **coverage is partial — only the top-N highest-risk units were audited.**

The appendix is non-negotiable: a reader must never have to wonder whether silence means "clean" or "didn't look." If it wasn't audited, it's named here.

> A starting layout lives at `${CLAUDE_PLUGIN_ROOT}/templates/AUDIT-TEMPLATE.md` — match this contract over the template if they ever diverge.
