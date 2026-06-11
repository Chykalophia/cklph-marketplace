# cklph-audit

**Scoped, adversarially-verified, agentic whole-repo audits.**
Marketplace: `cklph` · install: `claude plugin install cklph-audit@cklph` · CLI-only (sub-agents + workflows).

> Diff-review tools (CodeRabbit, `/code-review ultra`, the cklph-reviewer agent) deliberately stay on the **diff**. `cklph-audit` fills the other gap: **deep reasoning over the _whole_ repo** — decompose the codebase, fan out a sub-agent per subsystem × lens, **refute** each finding to kill false positives, drop anything already accepted in a baseline, and synthesize a triaged report + a remediation-wave plan that feeds `/cklph-os:flow`.

It's the productized version of the hand-run MailPrism **CASA 8-agent audit** (`AUDIT-2026-06-09.md`).

---

## When to use it (and when NOT)

**Use it for:** a periodic deep pass — pre-compliance (CASA/SOC2), pre-launch, post-big-refactor, "we haven't looked at the whole thing in a while," onboarding a new repo, or hunting a class of bug across the codebase (all the silent failures, all the N+1s).

**Do NOT use it for:** per-PR review. That's what diff review is for, and it stays your default. A whole-repo audit is expensive and surfaces a lot — it's a scheduled-quarterly / before-a-milestone move, not a per-change one.

---

## Design principles (boring-wins)

1. **Scope is mandatory.** You pick lenses. "Audit everything" → noise. There is no unscoped mode.
2. **Adversarial verify is non-negotiable.** Every finding is attacked by a separate refuter before it reaches you. False positives are the #1 way AI audits lose trust; this is the feature that earns it.
3. **Delta over re-noise.** A git-able baseline of accepted/known findings means re-runs show only what's **new**. Your "deferred to H-8" decisions never resurface.
4. **Transparent + git-able.** Config, baseline, and reports are plain files in the repo. No hidden state. Nothing gets silently truncated — what was skipped (budget, sampling) is logged.
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

Cheap recon pass (top-risk subsystems only, no full fan-out):

```bash
/cklph-audit:quick security
```

---

## The lenses (v1)

Project-agnostic knowledge packs. Each layers **over** the repo's own rules (e.g. a project's `CLAUDE.md`/`AGENTS.md`), so it speaks your conventions, not generic ones.

| Lens | Hunts for |
| --- | --- |
| **security** | CWE/ASVS/OWASP: authz/authn gaps, injection, secrets, SSRF, RLS/row-scoping, money & privilege paths, unsafe deserialization, missing rate-limit/CSRF. (The CASA lens.) |
| **correctness** | Silent failures, swallowed errors, missing error IDs, state-machine catch-block gaps, race conditions/TOCTOU, null/undefined handling, off-by-one, fail-open defaults. |
| **architecture** | DRY/duplication (extract-when-3+), layering violations, dead code, god-objects, circular deps, contradictory sources of truth, files over the size limit. |

Extensible (v2+): `performance` (N+1, hot paths, caching, bundle), `a11y` (WCAG/dark-mode), `compliance` (SOC2/CASA control mapping).

**How a lens stays honest:** a lens isn't just a prompt — it's a deterministic **tool** for recall (`jscpd` for DRY, ESLint for floating awaits, `gitleaks` for secrets, `dependency-cruiser` for layering) + the **LLM** for judgment + the **verifier** for precision. Pure-LLM detection of DRY/SOLID over-flags coincidental similarity and misses cross-file clones, so the tool does the enumerating and the model does the judging. Every lens is then validated against **golden fixtures** (planted issues it must catch / clean look-alikes it must not flag) and a **git backtest** before it's trusted — see `SPEC.md` §4 & §10.

---

## How it works (5 phases)

```
1. DISCOVER   audit-scout INFERS units (subsystem → globs) + surface; escalates to
              audit-unit-mapper when the repo won't decompose cleanly, flags low-confidence units
2. FAN OUT    audit-reviewer × (unit × lens) → structured findings   [pipeline, parallel]
3. VERIFY     audit-verifier refutes each finding (majority-refute → drop)   [adversarial]
4. RECONCILE  dedup + drop anything in .audit-baseline.json   [plain code, not an agent]
5. SYNTHESIZE audit-synthesizer → AUDIT-<date>.md (severity buckets, file:line, fixes,
              remediation-wave plan that feeds /cklph-os:flow)
```

Implemented as one deterministic **Workflow** so the fan-out, verify, and budget are reproducible. See `SPEC.md`.

---

## What you get out

- **`AUDIT-<date>.md`** — findings bucketed Critical/High/Medium/Low, each with `file:line`, why it's real (and how the verifier confirmed it), and a concrete fix.
- **A remediation-wave plan** — grouped, ordered fixes ready to hand to `/cklph-os:flow` or `cklph-implementer` waves.
- **An updated baseline** (when you run `:baseline`) so the next run is delta-only.

---

## Cost & honest caveats

- A full multi-lens run on a large repo is a **real token spend** (it's many deep sub-agent reads). Use `:quick` to scope first, set a budget in config, and lean on the baseline so re-runs are cheap.
- **Without verify + baseline it floods you** — both ship in v1 for exactly this reason.
- It finds a lot of **pre-existing tech debt**. That's the point of the first run; the baseline is how you stop drowning in it afterward.
- Don't wire the v2 scheduled/gate layer until a couple of manual runs prove the signal on a real repo (validation target: reproduce the CASA audit's top findings).

---

## Roadmap

- **v1** (this spec): `cklph-audit` plugin · security + correctness + architecture lenses · scout/reviewer/verifier/synthesizer agents · the workflow engine · `audit.config.yaml` + `.audit-baseline.json` · `run` / `quick` / `baseline` / `init` commands.
- **v2**: `performance` + `a11y` + `compliance` lenses · a scheduled weekly **delta** audit (emails/ClickUps only NEW findings) · a CLI pre-promotion gate (fast security lens before dev→staging→main) · auto-handoff of confirmed Criticals into a `/cklph-os:flow` remediation run.

See `SPEC.md` for the full build design.
