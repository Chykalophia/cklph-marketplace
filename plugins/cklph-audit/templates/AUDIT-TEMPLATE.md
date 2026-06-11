---
audit: cklph-audit
date: <YYYY-MM-DD>
repo: <repo name>
sha: <git SHA at time of run>
lenses: [<security, correctness, architecture>]
mode: <full | quick>
units:
  source: <inferred | config | deep-mapped>
  covered: <N>
  lowConfidence: [<unit-keys flagged low-confidence>]
counts: { critical: 0, high: 0, medium: 0, low: 0 }
suppressedByBaseline: <N>
skipped:
  byBudget: <N>
  bySampling: <N>      # quick-mode dropped units
---

# Audit — <repo> — <YYYY-MM-DD>

> Scoped, adversarially-verified whole-repo audit. Every finding below survived a
> default-to-refuted verifier pass. Findings already accepted in `.audit-baseline.json`
> are suppressed (count in front-matter). Nothing is silently truncated — see Appendix
> for exactly what was skipped and why.

## Summary

- **New confirmed findings:** <N> (critical <c> / high <h> / medium <m> / low <l>)
- **Suppressed by baseline:** <N>
- **Unit derivation:** <inferred | config | deep-mapped> — low-confidence units flagged: <list or "none">
- **Headline:** <one or two lines on the most important thing found>

---

## Critical

### C-1: <title>
- **Where:** `<file>:<line>`
- **Lens / rule:** <security | correctness | architecture> · `<CWE-… | ASVS-… | own-rule>`
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
- **Why / fix:** <…> · **Verifier note:** <…>

---

## Low

### L-1: <title>
- **Where:** `<file>:<line>` · **rule:** `<…>` · **Fix:** <…>

---

## Remediation waves

Ordered groups ready to hand to `/cklph-os:flow` or `cklph-implementer` waves. Each wave
is independently shippable; later waves may depend on earlier ones.

### Wave 1 — <title>
- **Findings:** [C-1, H-1]
- **Rationale:** <why this is first — blast radius, dependency, or quick-win>

### Wave 2 — <title>
- **Findings:** [H-2, M-1]
- **Rationale:** <…>

---

## Appendix — coverage & what was skipped

**Units covered (<source>):**

| Unit | Globs | Lenses run | Confidence |
| --- | --- | --- | --- |
| <key> | `<globs>` | <lenses> | <0.0–1.0> |

**Low-confidence units (pin these in `units.list` next run):** <list or "none">

**Skipped — budget:** <units/jobs not run because the token budget ran out, or "none">

**Skipped — sampling (`:quick`):** <units dropped by top-N risk ranking, or "n/a (full mode)">

**Tools run for recall:** <dry.sh / await.sh / deadcode.sh / layering.sh / secrets.sh — and any that degraded to reasoning because the binary was absent>

> No silent truncation: if a unit, lens, or finding-class was not evaluated, it is named above.
