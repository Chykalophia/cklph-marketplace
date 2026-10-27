---
name: audit-report-format
description: The exact AUDIT-<date>.md contract — front-matter, coverage summary + rule-closure matrix, coverage narrative (positive assurance), severity sections (file:line, snippet, why-real + verifier note, fix, confidence/bucket/context/validation, root-cause/invariant/boundary/reachability), positive controls (INFO), ordered remediation waves for /cklph-os:flow with an owner-decisions subsection, and an appendix with NO silent truncation (incl. whether the Map + Variant phases ran). Loaded by audit-synthesizer when writing the report.
---

# audit-report-format — the AUDIT-<date>.md contract

This skill defines the exact shape `audit-synthesizer` must emit as `report.markdown`. The contract exists so reports are consistent, git-diffable across runs, and feed cleanly into `/cklph-os:flow`. **Nothing is silently truncated** — anything not audited, whether a *unit*, a *rulebook rule*, an *enumerated pattern* (budget, sampling, low-confidence, recon gaps), or a skipped *phase* (whether the Map + Variant + DAST + Patch + SelfReview phases ran), is named in the report.

The document has eleven parts, in order: **Front-matter → Coverage summary → Coverage matrix → Compliance matrix → Coverage narrative → Severity sections → Held-untraced → Positive controls (INFO) → Remediation waves → Appendix → Self-review.** The synthesizer writes the first ten and ends at the Appendix; the engine appends the closing `## Self-review` section (see §9).

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
phases:                     # v3 optional phases — false = skipped (quick mode / disabled / agent died); see appendix
  map: true                 # Map (threat model: trust boundaries + invariants) ran
  variant: true             # Variant (sibling hunt on confirmed critical/high) ran
  dast: false               # DAST (dynamic testing: ZAP/Nuclei) ran — opt-in, off by default
  patch: false              # Patch (generate + test + re-exploit) ran — opt-in, auto-on with DAST
  self_review: false        # write false; the ENGINE rewrites it to the real outcome after the SelfReview pass
counts: { critical: 2, high: 5, medium: 8, low: 3, info: 4 }   # info = positive controls
coverage:
  rulebook_size: 12         # discrete rules extracted from the rulesFrom docs
  checked: 10               # rules with any status other than unchecked
  unchecked: [agents-md:rule-7, claude-md:rule-2]   # NOT CHECKED — mirrored in the matrix
positive_controls: 4        # entries in the Positive controls (INFO) section
held_untraced: 1            # critical/high neither confirmed nor cleanly refuted (see Held-untraced)
deferred_unverified: 0      # reviewer candidates the verifier budget couldn't afford (0 = full coverage)
suppressed_by_baseline: 4   # confirmed but already accepted
skipped:
  by_budget: []             # units/jobs dropped when budget ran low
  by_sampling: []           # units NOT audited in quick mode (top-N only)
---
```

If a field is empty, emit it empty (`[]` / `0`) — never omit it. The reader must be able to tell coverage from the front-matter alone: `coverage.checked` of `coverage.rulebook_size` rules, every `unchecked` rule id named, and whether the Map + Variant + DAST + Patch + SelfReview phases ran (`phases.map` / `phases.variant` / `phases.dast` / `phases.patch` / `phases.self_review` — a skipped phase is expanded in the appendix).

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
- Each lens lists every tool failure its reviewers reported (`COVERAGE_TOTALS.<lens>.reviewed.toolFailures`: a scanner that failed, was missing, or whose output could not be parsed). That recall did NOT run, so its zero candidates mean **not checked**, never clean — say so on the lens line.
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
- `violation` rows list the finding IDs — each must exist in the report. A normal violation cites confirmed findings (in the severity sections). A **held-backed** violation (`heldBacked: true` on the closure row — its cited findings survived verification only as *held-untraced*) cites finding ids that live in the **Held-untraced** section, not a severity section; render it `violation (held — see Held-untraced)` so the reference resolves and the reader knows it is unproven. The engine has already reconciled these ids against what survived — a violation never cites a refuted, absent finding.
- `verified-safe` rows cite the evidence (`file:line`); `not-applicable` rows give the one-line reason.
- `unchecked` rows render as **NOT CHECKED** with the **whole row bold** — an honest NOT CHECKED is a feature, not an embarrassment. The same rule ids appear in front-matter `coverage.unchecked`.
- A `deferredBacked: true` closure row (the reviewer flagged a violation but its cited finding was **deferred — never verified**, budget exhausted) renders as `NOT CHECKED (deferred — unverified)` pointing at the Deferred section. Never label it "refuted" — it was not checked.

## 3b. Compliance matrix (when the compliance lens ran)

A `## Compliance matrix` section after the Coverage matrix and before the Coverage narrative — **one row per control per framework**, with one sub-section per selected framework (SOC 2, CASA, HIPAA). Statuses are `met` | `violation` | `not-applicable` | `not-checked`. This is the audit's bridge to a formal attestation.

```markdown
## Compliance matrix

### SOC 2 — Trust Services Criteria

| Control | Description (short) | Status | Finding IDs / evidence / reason |
| --- | --- | --- | --- |
| CC6.1 | Logical access controls | violation | C-1, H-2 |
| CC6.7 | Restrict access to assets | met | RLS policies on all tables (`db/migrations/003_rls.sql:12`) |
| CC7.1 | Detect vulnerabilities | violation | SCA: 3 known CVEs in deps (H-5, H-6, M-3) |
| C1.2 | Protect confidential info | not-checked | no encryption-at-rest verification performed |

### CASA — Cloud Application Security Assessment

| Control | Description (short) | Status | Finding IDs / evidence / reason |
| --- | --- | --- | --- |
| VM1 | Vulnerability management program | met | SCA lens ran with Trivy/Grype/OSV-Scanner |
| VM2 | Remediate dep vulns within SLA | violation | H-5, H-6 |
| SD3 | CI/CD pipelines secured | violation | SC-1 (pull_request_target with secrets) |
```

Rules for the compliance matrix:
- `violation` rows link the finding IDs from other lenses. `met` rows cite the evidence (the guard/pattern/scan that proved the control). `not-applicable` rows give the one-line reason. `not-checked` rows are **gaps** — controls with no automated evidence; the owner must provide manual evidence for attestation.
- A `not-checked` compliance control is the most actionable output for a team pursuing SOC 2 / CASA / HIPAA — it tells them exactly what they still need to prove.
- Omit the section entirely if the compliance lens did not run.

## 4. Coverage narrative

A `## Coverage narrative` section directly after the Coverage matrix and before the first severity section: **positive assurance in prose**. Where the Coverage summary is arithmetic and the matrix is rule-by-rule, the narrative tells the *story of what held and why* — the assurance that evaporates if a report only ever publishes defects. It is written from `NEAR_MISSES` + `CROWN_JEWELS` + `COVERAGE_TOTALS` (all passed to the synthesizer).

Per area — a crown jewel, a lens, or a trust-bounded flow — state three things:
1. **what was probed** — the surface the audit actually exercised (denominators examined, seeds chased),
2. **why the clean areas held** — the guard/control that made a suspected issue a non-issue,
3. **near-misses chased to ground** — a `critical`/`high` candidate the verifier *refuted*, and the counter-evidence (`guard`) that killed it.

```markdown
## Coverage narrative

**Crown jewels probed:** user-role mutation, Stripe webhook ingestion, session issuance.

- **Auth / role mutation** — probed all 325 `.single()` callsites and every role-write path; held because
  each mutation routes through the `requireAdmin` guard (`lib/auth/guard.ts:20`). Near-miss: a high
  "unauthenticated role update" candidate at `app/api/users/route.ts:40` was **refuted** — the route is
  gated by middleware (`middleware.ts:12`).
- **Payments / webhooks** — 6 of 9 webhook handlers examined (risk-weighted to signature-bearing routes);
  signature verification held at `app/api/webhooks/stripe/route.ts:18`.
```

Rules for the narrative:
- **Crown jewels** (`CROWN_JEWELS`, from the Map phase) frame the areas worth narrating — lead with them. If `CROWN_JEWELS` is empty (the Map phase didn't run or found none), say so in one line and write the narrative per lens from `COVERAGE_TOTALS` instead — never omit the section silently.
- Anchor every "held because" claim to a `file:line` — assurance is evidence, not reassurance.
- Every entry in `NEAR_MISSES` (`{ file, severity, title, guard }`) is accounted for: name the refuted candidate and the `guard` that refuted it. A near-miss is the audit *doing its job* — it looked, and it cleared.
- The narrative is prose assurance; it does **not** replace the arithmetic Coverage summary or the rule-by-rule matrix.

## 5. Severity sections

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
- **Root cause:** <the underlying fault the reviewer traced the symptom back to — not the symptom>
- **Invariant:** <the property the code must guarantee that this finding violates>
- **Boundary:** <the trust boundary crossed — only when the Map phase supplied one>
- **Reachability:** <the concrete attacker-input→sink or invariant-violation path the verifier confirmed>
- **Exploit proof:** <when DAST/exploit ran: the PoC script + sandbox result — "confirmed-exploitable" or "likely (static only)">
- **Patch:** <when the Patch phase ran: the diff summary + "testsPass: ✓, exploitClosed: ✓, judge: addresses root cause" or "patch-unverified" + why>

```ts
// the offending code, quoted exactly (a few lines of context)
await supabase.from('users').update({ role: body.role }).eq('id', user.id)
```

**Why it's real.** <the concrete reason this is a true issue — what an attacker/bug does>.
*Verifier:* survived adversarial refutation — majority of N voters confirmed; the reviewer's missed-guard hunt found no mitigating middleware/RLS/validation/caller. <one line on what the verifier checked>.
*Exploit:* <when DAST ran: "PoC confirmed in sandbox — curl request bypassed authz and returned another user's data" or "PoC could not reproduce (likely static-only)">.

**Fix.** <a specific, actionable remediation — not "add validation" but what/where>.
*Patch:* <when the Patch phase ran: the generated diff, test results, and exploit re-run result — or "not auto-patched, needs manual remediation">.
```

Rules for every finding:
- **Always** a `file:line` anchor and a **quoted snippet** of the offending code. No finding without a code anchor.
- The **why-real** must explain the impact, and the **verifier note** must state it survived the default-to-refuted vote (this is the plugin's core trust signal — every shipped finding passed it). For `source: "reasoning"` findings with no deterministic tool, label them **candidate for human review**, honestly.
- The **Confidence / Bucket / Context / Validated by** lines carry the reviewer's `confidence`, `remediationBucket`, `context`, and `validationSteps` — emit all four. Severity was derived from context (real exploitability, not raw pattern match); the Context line shows that work.
- The **Root cause / Invariant** lines carry the reviewer's `rootCause` and `invariant` — the underlying fault and the violated property, not the symptom; emit both when supplied. **Boundary** carries `boundary` — emit it only when the Map phase ran and the reviewer cited the trust boundary crossed (omit the line otherwise). **Reachability** carries the verifier's `reachabilityTrace` — the concrete attacker-input→sink (or invariant-violation) path. A confirmed `critical`/`high` **always** has one: under the evidence arbiter a critical/high with no trace does not promote, so its presence *is* the promotion proof — render it. `low`/`medium` may omit it.
- Cite the rule id (CWE/ASVS/own-rule). If a repo rule applied, name it.
- Finding ids are stable per-report (`C-1`, `H-3`, `M-2`, `L-1`) and are what remediation waves and the coverage matrix reference.

## 6. Held-untraced (inconclusive critical/high, needs owner review)

A `## Held-untraced` section, written from `HELD_UNTRACED`, immediately after the severity sections. These are critical/high findings the panel **neither confirmed nor cleanly refuted** — either it was majority-held but **no independent verifier supplied a reachability trace** (the reviewer's own `validationSteps` do not count — the accuser cannot vouch for itself), or it was majority-refuted but **no verifier cited a concrete guard** to justify the refutation, or the vote split with no majority either way, or too few voters returned (no quorum). Either way the outcome is *inconclusive*, so under the v3 evidence-arbiter they are not promoted to a severity section — but they are the opposite of "clean." They MUST be surfaced here — never silently dropped — as **needs-owner-input**, so a suspected critical/high is never lost for want of evidence either way.

```markdown
## Held-untraced

> Critical/high findings the verifier panel could neither confirm nor cleanly refute. Not confirmed, not cleared — **needs owner review**. Treat as suspected-real until traced or refuted.

### [U-1] <short title>
- **Location:** `file.ts:42` · **Severity (claimed):** high · **Rule:** CWE-…
- **Why held:** <from `heldReason`> — `majority-held-no-trace`: the majority could not refute it, but no voter produced an input→sink / invariant-violation trace · `refuted-without-guard`: the majority refuted it, but no voter cited the guard · `split-vote`: neither side had a majority (a tie after a voter died, or held short of a unanimous threshold) · `no-quorum`: too few voters returned to decide. Never write "majority-held" for the last three.
- **To resolve:** produce the reachability trace (promote) or the missing guard (refute); for `no-quorum` (and a `split-vote` caused by a dead voter), re-run verification until the voter quorum is reached.
```

Omit the section only when `HELD_UNTRACED` is empty; whenever it is non-empty, `RUN_META.heldUntracedCount` matches the entry count. Ids are stable per-report (`U-1`, `U-2`, …). Held-untraced items are NOT findings and NOT positive controls — they never appear in waves or the INFO section.

### Deferred — UNVERIFIED (verifier budget exhausted)

When `DEFERRED` is non-empty, render a `### Deferred — unverified` subsection right after Held-untraced. These are reviewer candidates the run could **not afford to verify**: the verifier fan-out cap (`RUN_META.verifierBudget`, spent `RUN_META.verifierSpawns`) was hit before they reached the adversarial gate. They are **UNVERIFIED** — they never faced a refuter, so they may include false positives that verification would have killed. Say that plainly, and recommend a follow-up: raise `verify.maxVerifierAgents`, narrow the scope/path, or lower `verify.voters`.

```markdown
### Deferred — unverified (verifier budget exhausted)

> The verifier budget (`RUN_META.verifierBudget`) was spent before these candidates could be verified. They are **UNVERIFIED** — treat as leads, not findings; re-run with a higher `verify.maxVerifierAgents` or a narrower scope. Critical/high are verified first, so what lands here skews lower-severity.

### [X-1] <title>
- **Where:** `file.ts:42` · **severity (claimed):** medium · **rule:** `<…>`
```

Omit only when `DEFERRED` is empty; when non-empty, `RUN_META.deferredCount` matches. Deferred items are NOT confirmed findings, NOT held-untraced, and NOT positive controls — never in waves, never in the INFO section, never silently dropped. If a deferred item carries a `note` (e.g. a Variant sibling of a confirmed critical/high), keep it — it signals a high-prior lead. If the run deferred anything, the appendix must state coverage was budget-limited **and** that *which* candidates were deferred can vary run-to-run (budget is spent in review-arrival order), so a re-run may verify a different subset.

## 7. Positive controls (INFO)

A `## Positive controls (INFO)` section after the held-untraced section: the "checked and clean" knowledge that would otherwise evaporate every run. Front-matter `positive_controls` and `counts.info` both equal the number of entries here. Omit the section only when there are zero entries (`positiveControls.max: 0` disables harvesting entirely).

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

## 8. Remediation waves

A `## Remediation waves` section: ordered groups of findings designed to be handed to `/cklph-os:flow` as sequential implementation passes. Order by dependency and blast radius (fix foundational/security-critical first; group changes that touch the same module) — **quick-wins first within a severity band**.

```markdown
## Remediation waves

### Wave 1 — Close privilege-escalation paths
**Findings:** C-1, C-2, H-4
**Rationale:** these share the same row-level-security surface; fix together before any tier work.
**Handoff:** `/cklph-os:flow "Wave 1: ..."`

### Wave 2 — Silent-failure hardening
**Findings:** H-1, M-3, M-5
**Rationale:** ...

### Owner decisions
- **[M-4] <title>** — <the question: what looks intentional, what evidence says so, what the owner should confirm>
```

The waves section closes with an `### Owner decisions` subsection: findings with `remediationBucket: owner-decision` are **questions for the repo owner, not scheduled work** — intentional-but-not-locally-obvious calls only the owner can make. They are NOT placed in a wave. Every confirmed finding belongs to exactly one wave **or** to Owner decisions; waves are ordered, and each rationale explains why the wave is sequenced where it is.

## 9. Appendix — coverage & what was skipped (NO silent truncation)

A closing `## Appendix` that makes coverage auditable:

- **Units covered** — each unit, its globs, and its derivation (`config` / `inferred` / `deep-mapped`). Repeat **low-confidence** units here and recommend pinning them in `units.list` next run.
- **What was skipped, and why** — explicitly list:
  - units **not audited in quick mode** (top-N sampling — partial coverage; name every dropped unit),
  - jobs **dropped for budget** (token ceiling hit — name them),
  - anything the ignore globs excluded that a reader might expect covered.
- **Recon gaps** — if recon was skipped (quick mode without `recon.quick`, or `recon.enabled: false`) or partial (a lens's recon agent died, or budget killed it), state which lenses' denominators and seeds are absent/partial and why. Absent denominators mean the Coverage summary has no math for that lens — say so plainly, don't fake it.
- **Rulebook extraction failure** — if RUN_META says `rulebookMissing: true`, state that the Coverage matrix is empty because rulebook extraction died — NOT because the `rulesFrom` docs contain no rules. Silence must never read as "no rules".
- **Map phase (threat model)** — state whether the Map phase ran (`RUN_META.mapRan`). If it did NOT, say why: quick mode (Map skips), `map.enabled: false`, or the `audit-modeler` died — and note the consequence: reviewers got no trust-boundary/invariant context, so findings carry no `boundary` and the Coverage narrative has no crown jewels. An empty threat model must never read as "no threats" — it means the model wasn't built.
- **Variant phase (sibling hunt)** — state whether the Variant phase ran (`RUN_META.variantRan`). If it did NOT, say why: quick mode (Variant skips) or `variant.enabled: false` — and note the consequence: confirmed `critical`/`high` findings were NOT swept for siblings, so the same root cause may recur elsewhere unexamined. If it ran but had no confirmed `critical`/`high` to seed from, say that plainly instead.
- **DAST phase (dynamic testing)** — state whether the DAST phase ran (`RUN_META.dastRan`). If it did NOT, say why: `dast.enabled: false` (default — opt-in), quick mode, or the runner died. Note the consequence: runtime-only issues (auth bypass, session, IDOR, headers, rate limits) were NOT dynamically tested — the audit is static-only for this run. If it ran, note what was booted (Docker Compose / local dev / provided URL), which tools ran (ZAP/Nuclei/ffuf), and how many runtime findings were collected.
- **Exploit verification** — state whether exploit verification ran (`RUN_META.exploitRan`). If it did, note how many confirmed critical/high findings had PoC exploits attempted, how many were `confirmed-exploitable` vs `likely (static only)`. If it did NOT, note that findings are based on static reachability only — no dynamic proof of exploitability.
- **Patch phase** — state whether the Patch phase ran (`RUN_META.patchRan`). If it did, note how many findings were auto-patched vs `patch-unverified` vs `patch-failed`. If it did NOT, note that patches are suggestions only (the reviewer's `suggestedFix`) — no automated patch generation or validation occurred.
- **SelfReview phase (adversarial self-review)** — NOT written by the synthesizer. SelfReview runs once, after the report is written; the engine appends a `## Self-review` section at the very end of the report (after the appendix) listing the gaps it found — reported as open coverage gaps, since nothing is re-scanned — or why no review ran (quick mode, disabled, or the agent died), and rewrites `phases.self_review` in the front-matter.
- **Feed freshness** — the engine does not check vulnerability-feed freshness (`RUN_META.feedFreshnessChecked: false`). State that plainly and recommend running `/cklph-audit:refresh-feeds` (which runs `feed-status.sh`) before the next SCA/container audit. Never state a database age the run did not measure.
- **Denominator commands (verbatim)** — every recon denominator command, exactly as run, so the coverage math is re-runnable by the reader.
- If the run was `quick` mode, state plainly at the top of the appendix: **coverage is partial — only the top-N highest-risk units were audited.**

The appendix is non-negotiable: a reader must never have to wonder whether silence means "clean" or "didn't look." If it wasn't audited — a **unit**, a **rulebook rule**, an **enumerated pattern**, or a skipped **phase** (Map / Variant) — it's named here, or shown as **NOT CHECKED** in the matrix.

> A starting layout lives at `${CLAUDE_PLUGIN_ROOT}/templates/AUDIT-TEMPLATE.md` — match this contract over the template if they ever diverge.
