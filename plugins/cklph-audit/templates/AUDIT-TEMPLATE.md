---
audit: cklph-audit
date: <YYYY-MM-DD>
repo: <repo name>
repo_sha: <git SHA at time of run>
lenses: [<security, correctness, architecture>]
mode: <full | quick>
units:
  source: <inferred | config | deep-mapped>
  covered: [<unit keys actually covered>]
  low_confidence: [<unit-keys flagged low-confidence>]
counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 }   # info = positive controls
coverage:
  rulebook_size: <N>
  checked: <N>
  unchecked: [<rule ids NOT CHECKED — mirrored in the matrix>]
positive_controls: <N>
suppressed_by_baseline: <N>
skipped:
  by_budget: [<units/jobs dropped when budget ran low>]
  by_sampling: [<quick-mode dropped units>]
---

# Audit — <repo> — <YYYY-MM-DD>

> Scoped, adversarially-verified whole-repo audit. Every finding below survived a
> default-to-refuted verifier pass. Findings already accepted in `.audit-baseline.json`
> are suppressed (count in front-matter). Coverage is arithmetic, not vibes — see the
> Coverage summary and matrix. Nothing is silently truncated — see Appendix for exactly
> what was skipped and why.

## Summary

<!-- OPTIONAL lead block (see audit-report-format §intro) — a human skim layer only,
     never a substitute for the coverage sections below. -->

- **New confirmed findings:** <N> (critical <c> / high <h> / medium <m> / low <l>)
- **Suppressed by baseline:** <N>
- **Rule closure:** <checked> / <rulebook_size> rules checked — NOT CHECKED: <list or "none">
- **Positive controls:** <N> verified-good patterns (INFO section)
- **Unit derivation:** <inferred | config | deep-mapped> — low-confidence units flagged: <list or "none">
- **Headline:** <one or two lines on the most important thing found>

---

## Coverage summary

Per lens: recon denominators (command verbatim) vs what reviewers actually examined.
Where examined < N, the row says **sampled** and gives the risk-weighting rationale.

### <lens>

| Pattern | Command | Examined |
| --- | --- | --- |
| <what was enumerated> | `<re-runnable command, verbatim>` | <X> / <N> |
| <pattern> | `<command>` | <X> / <N> — **sampled**: <rationale> |

**Reviewer coverage:** seeds verified <X> / <N> given · tool candidates judged <N>

---

## Coverage matrix

Every rulebook rule gets a row — no rule silently absent. `unchecked` renders as **NOT CHECKED**, whole row bold.

| Rule id | Source | Status | Finding IDs / citation / reason |
| --- | --- | --- | --- |
| `<slug>` | `<file:line>` | violation | <C-1, H-2> |
| `<slug>` | `<file:line>` | verified-safe | `<file:line>` — <evidence> |
| `<slug>` | `<file:line>` | not-applicable | <reason> |
| **`<slug>`** | **`<file:line>`** | **NOT CHECKED** | **<no reviewer reached this rule>** |

---

## Critical

### C-1: <title>
- **Where:** `<file>:<line>`
- **Lens / rule:** <security | correctness | architecture> · `<CWE-… | ASVS-… | own-rule>`
- **Confidence:** <confirmed | likely | needs-owner-input>
- **Bucket:** <quick-win | targeted-fix | systemic-refactor | owner-decision>
- **Context:** <server | client | shared> / <prod | test | generated> / <gated | ungated>
- **Validated by:** <the read-only checks the reviewer ran to confirm true-positive>
- **Snippet:**
  ```ts
  <the offending code>
  ```
- **Why it's real:** <rationale with a code anchor>
- **Verifier note:** <how the refuter failed to refute it — the guard it looked for and didn't find>
- **Fix:** <concrete remediation>

---

## High

### H-1: <title>
- **Where:** `<file>:<line>`
- **Lens / rule:** <…>
- **Confidence:** <…>
- **Bucket:** <…>
- **Context:** <…>
- **Validated by:** <…>
- **Snippet:**
  ```ts
  <code>
  ```
- **Why it's real:** <…>
- **Verifier note:** <…>
- **Fix:** <…>

---

## Medium

### M-1: <title>
- **Where:** `<file>:<line>` · **rule:** `<…>`
- **Confidence / bucket / context:** <…> / <…> / <…>
- **Why / fix:** <…> · **Verifier note:** <…> · **Validated by:** <…>

---

## Low

### L-1: <title>
- **Where:** `<file>:<line>` · **rule:** `<…>`
- **Confidence / bucket / context:** <…> / <…> / <…>
- **Validated by:** <…> · **Fix:** <…>

---

## Positive controls (INFO)

Verified-good patterns worth knowing about — the guards that killed candidate findings,
rulebook rules verified safe, and recon safe-controls a reviewer confirmed in scope.
Not findings; never in waves.
`counts.info` = the number of entries here.

### I-1: <what the control is>
- **Citation:** `<file>:<line>`
- **Protects:** <what it guards>
- **Why it shipped:** <killed-candidate | rule-verified | recon> — <one line>

---

## Remediation waves

Ordered groups ready to hand to `/cklph-os:flow` or `cklph-implementer` waves. Each wave
is independently shippable; later waves may depend on earlier ones. Quick-wins come first
within a severity band.

### Wave 1 — <title>
- **Findings:** [C-1, H-1]
- **Rationale:** <why this is first — blast radius, dependency, or quick-win>

### Wave 2 — <title>
- **Findings:** [H-2, M-1]
- **Rationale:** <…>

### Owner decisions

Questions for the repo owner, not scheduled work — `owner-decision` findings are
intentional-but-not-locally-obvious calls only the owner can settle.

- **[<id>] <title>** — <the question: what looks intentional, what evidence says so, what to confirm>

---

## Appendix — coverage & what was skipped

**Units covered (<source>):**

| Unit | Globs | Lenses run | Confidence |
| --- | --- | --- | --- |
| <key> | `<globs>` | <lenses> | <0.0–1.0> |

**Low-confidence units (pin these in `units.list` next run):** <list or "none">

**Skipped — budget:** <units/jobs not run because the token budget ran out, or "none">

**Skipped — sampling (`:quick`):** <units dropped by top-N risk ranking, or "n/a (full mode)">

**Recon gaps:** <lenses whose denominators/seeds are absent or partial, and why — quick mode
without `recon.quick`, `recon.enabled: false`, agent died, budget — or "none">

**Rulebook:** <N rules extracted — or "extraction FAILED: the Coverage matrix is empty because
the extractor died, NOT because the `rulesFrom` docs contain no rules">

**Denominator commands (verbatim):**

| Lens | Pattern | Command |
| --- | --- | --- |
| <lens> | <pattern> | `<command exactly as recon ran it>` |

**Tools run for recall:** <dry.sh / await.sh / deadcode.sh / layering.sh / secrets.sh / docsdrift.sh — and any that degraded to reasoning because the binary was absent>

> No silent truncation: if a unit, lens, rulebook rule, or enumerated pattern was not
> evaluated, it is named above — or shown as **NOT CHECKED** in the Coverage matrix.
