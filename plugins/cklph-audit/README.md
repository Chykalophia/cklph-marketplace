# cklph-audit

**Scoped, adversarially-verified, agentic whole-repo audits — that also prove what they covered.**
Marketplace: `cklph` · install: `claude plugin install cklph-audit@cklph` · CLI-only (sub-agents + workflows).

> Diff-review tools (CodeRabbit, `/code-review ultra`, the cklph-reviewer agent) deliberately stay on the **diff**. `cklph-audit` fills the other gap: **deep reasoning over the _whole_ repo** — decompose the codebase, fan out a sub-agent per subsystem × lens, **refute** each finding to kill false positives, drop anything already accepted in a baseline, and synthesize a triaged report + a remediation-wave plan that feeds `/cklph-os:flow`. v2 adds the completeness accounting: recon denominators, a rule-closure coverage matrix, and positive controls — the report shows what was checked and clean, not just what's broken.

It's the productized version of a hand-run **8-agent pre-certification security audit**; v2 ports the coverage accounting from the ZenCoder audit methodology.

---

## When to use it (and when NOT)

**Use it for:** a periodic deep pass — pre-compliance (CASA/SOC2), pre-launch, post-big-refactor, "we haven't looked at the whole thing in a while," onboarding a new repo, or hunting a class of bug across the codebase (all the silent failures, all the N+1s).

**Do NOT use it for:** per-PR review. That's what diff review is for, and it stays your default. A whole-repo audit is expensive and surfaces a lot — it's a scheduled-quarterly / before-a-milestone move, not a per-change one.

---

## Design principles (boring-wins)

1. **Scope is mandatory.** You pick lenses. "Audit everything" → noise. There is no unscoped mode.
2. **Adversarial verify is non-negotiable.** Every finding is attacked by a separate refuter before it reaches you. False positives are the #1 way AI audits lose trust; this is the feature that earns it.
3. **Delta over re-noise.** A git-able baseline of accepted/known findings means re-runs show only what's **new**. Your "deferred to H-8" decisions never resurface.
4. **Transparent + git-able.** Config, baseline, and reports are plain files in the repo. No hidden state. Nothing gets silently truncated — what was skipped (budget, sampling) is logged, and every rulebook rule no reviewer touched renders as `NOT CHECKED` in the coverage matrix.
5. **Cost-bounded.** Token budget, top-risk sampling mode, and loop caps are first-class.

---

## Quick start

```bash
claude plugin install cklph-audit@cklph
# in the target repo, once:
/cklph-audit:init                 # scaffolds audit.config.yaml (auto-detects subsystems)
# then:
/cklph-audit:run security,correctness,architecture
# triage the report, then accept what you're deferring:
/cklph-audit:baseline             # everything currently open becomes the accepted baseline
# next quarter:
/cklph-audit:run security         # shows only NEW security findings since the baseline
```

Cheap scoping pass (top-risk subsystems only, no full fan-out):

```bash
/cklph-audit:quick security
```

`:quick` also skips the recon phase to stay cheap — no denominators or seeds, and the report appendix says so. Set `recon: { quick: true }` in config if you want recon in quick mode anyway.

---

## The lenses

Project-agnostic knowledge packs. Each layers **over** the repo's own rules (e.g. a project's `CLAUDE.md`/`AGENTS.md`), so it speaks your conventions, not generic ones — and since v2, each answers for **every** repo rule handed to it (see the coverage matrix below).

| Lens | Hunts for |
| --- | --- |
| **security** | CWE/ASVS/OWASP: authz/authn gaps, injection, secrets, SSRF, RLS/row-scoping, money & privilege paths, unsafe deserialization, missing rate-limit/CSRF. (The CASA lens.) |
| **correctness** | Silent failures, swallowed errors, missing error IDs, state-machine catch-block gaps, race conditions/TOCTOU, null/undefined handling, off-by-one, fail-open defaults. |
| **architecture** | DRY/duplication (extract-when-3+), layering violations, dead code, god-objects, circular deps, contradictory sources of truth, files over the size limit. |
| **docs-drift** (opt-in) | The rulebook itself: paths, script names, and scoped package names (`@scope/pkg`) in your `rulesFrom` docs that no longer match the tree — unscoped tech-name prose ("BullMQ" in the docs, QStash in the code) is the judgment layer's catch. LOW severity by default; MEDIUM+ only when the drift misleads a security control. |

`docs-drift` is the exception to the unit × lens cross-product: when requested, the engine adds exactly **one** job over the `rulesFrom` docs — it never fans out per unit. It's not in the default lens list; ask for it explicitly.

Extensible (later): `performance` (N+1, hot paths, caching, bundle), `a11y` (WCAG/dark-mode), `compliance` (SOC2/CASA control mapping).

**How a lens stays honest:** a lens isn't just a prompt — it's a deterministic **tool** for recall (`jscpd` for DRY, ESLint for floating awaits, `gitleaks` for secrets, `dependency-cruiser` for layering) + the **LLM** for judgment + the **verifier** for precision. Pure-LLM detection of DRY/SOLID over-flags coincidental similarity and misses cross-file clones, so the tool does the enumerating and the model does the judging. Every lens is then validated against **golden fixtures** (planted issues it must catch / clean look-alikes it must not flag) and a **git backtest** before it's trusted — see `SPEC.md` §4 & §10.

---

## How it works (5 phases)

```
1. DISCOVER   audit-scout INFERS units (subsystem → globs) + surface; escalates to
              audit-unit-mapper when the repo won't decompose cleanly, flags low-confidence
              units. In parallel, a rulebook extractor parses the rulesFrom docs
              (CLAUDE.md/AGENTS.md) into discrete, citable rules.
2. RECON      one audit-recon per lens (concurrent with Discover): denominators
              (re-runnable enumeration command + candidate count), cited seeds (hints,
              not findings — reviewers re-verify every one), and safe-control candidates.
              Skipped in :quick — and logged, never silent.
3. REVIEW     audit-reviewer × (unit × lens) → findings + a ruleCheck for EVERY rule
              handed + honest coverage counts   [pipeline, parallel]
4. VERIFY     audit-verifier refutes each finding (majority-refute → drop); refuting
              counter-evidence is harvested as positive-control candidates   [adversarial]
5. SYNTHESIZE plain-code reconcile first (dedup + baseline + rule closure + coverage
              totals — not an agent), then audit-synthesizer → AUDIT-<date>.md
              (coverage summary + matrix, severity buckets, positive controls (INFO),
              remediation-wave plan that feeds /cklph-os:flow)
```

Implemented as one deterministic **Workflow** so the fan-out, verify, and budget are reproducible. See `SPEC.md` (v1 engine) and `SPEC-v2.md` (the coverage delta).

---

## What v2 adds (coverage you can check)

v1 is a repeatable engine. v2 is the same engine that can also show what it covered — six mechanics:

1. **Recon with denominators + seeds** — before any review, each lens's concern surface is mechanically enumerated. Denominators are the report's coverage math (`.single()` callsites → 325), recorded with the exact command so you can re-run it. Seeds are pre-qualified leads — hints, not findings; reviewers must re-open every one, because citations drift.
2. **Rule-closure coverage matrix** — the repo's own rules become a discrete rulebook, and every rule gets a matrix row: finding IDs, a cited `verified-safe`, a `not-applicable` reason, or an honest `NOT CHECKED`. No rule is silently absent.
3. **Coverage summary** — `examined X / N` per denominator. Where X < N the report says "sampled" and why (risk-weighting). Arithmetic, not vibes.
4. **Positive controls (INFO)** — refutations that cite a concrete guard, verified-safe rule checks, and confirmed recon safe-patterns ship as a "checked and clean" section. Noise-gated (must attach to a rulebook rule or have killed a critical/high candidate) and capped (`positiveControls.max`, default 15; 0 disables). This knowledge used to evaporate every run.
5. **Docs-drift lens** — audits the rulebook against reality (see the lens table above). One job over the `rulesFrom` docs, opt-in.
6. **Richer findings** — every finding carries `confidence` (confirmed / likely / needs-owner-input), `validationSteps` (the read-only checks that confirmed it), a `remediationBucket` (quick-win / targeted-fix / systemic-refactor / owner-decision), and `context` (server/client · prod/test/generated · gated) — classified **before** severity, so severity reflects real exploitability, not a raw pattern match. `owner-decision` items render as questions for the owner, not scheduled work.

Plus **per-stage model routing**: `config.models.<stage>` sends mechanical stages (scout, recon, rulebook) to cheap model/effort tiers and routes the verifier — the precision bet — up, while judgment stages inherit the session model. The difficulty heuristic is encoded in config, where you can see and tune it; omit the block and everything inherits (v1 behavior).

Backward compatible: a v1 `audit.config.yaml` runs unchanged — recon defaults on, positive controls default to 15, docs-drift only when you ask for it, model routing inherits everywhere.

---

## What you get out

- **`AUDIT-<date>.md`** — a coverage summary (examined X/N per denominator, commands verbatim), the rule-closure coverage matrix, findings bucketed Critical/High/Medium/Low (each with `file:line`, confidence, remediation bucket, why it's real and how the verifier confirmed it, and a concrete fix), and a positive-controls (INFO) section of checked-and-clean patterns.
- **A remediation-wave plan** — grouped, ordered fixes (quick wins first within a severity band) ready to hand to `/cklph-os:flow` or `cklph-implementer` waves; `owner-decision` items in their own subsection — they're questions, not work.
- **An updated baseline** (when you run `:baseline`) so the next run is delta-only.

---

## Cost & honest caveats

- A full multi-lens run on a large repo is a **real token spend** (it's many deep sub-agent reads). Use `:quick` to scope first, set a budget in config, and lean on the baseline so re-runs are cheap.
- **Without verify + baseline it floods you** — both ship in v1 for exactly this reason.
- It finds a lot of **pre-existing tech debt**. That's the point of the first run; the baseline is how you stop drowning in it afterward.
- Don't wire the scheduled/gate layer (roadmap, below) until a couple of manual runs prove the signal on a real repo (validation target: reproduce the CASA audit's top findings).

---

## Roadmap

- **v1 (0.1.0)**: `cklph-audit` plugin · security + correctness + architecture lenses · scout/reviewer/verifier/synthesizer agents · the workflow engine · `audit.config.yaml` + `.audit-baseline.json` · `run` / `quick` / `baseline` / `init` commands.
- **v2 (0.2.0, current)**: the coverage upgrade — recon (denominators + seeds), rulebook + rule-closure matrix, coverage math, positive controls (INFO), docs-drift lens, richer finding schema. See `SPEC-v2.md`.
- **Later**: `performance` + `a11y` + `compliance` lenses · a scheduled weekly **delta** audit (emails/ClickUps only NEW findings) · a CLI pre-promotion gate (fast security lens before dev→staging→main) · auto-handoff of confirmed Criticals into a `/cklph-os:flow` remediation run.

See `SPEC.md` (the v1 engine) and `SPEC-v2.md` (the coverage delta) for the full build design.
