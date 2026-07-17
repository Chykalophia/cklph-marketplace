# Changelog

All notable changes to `cklph-audit` are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

## 0.2.1 — 2026-07-16

- Fix: `docs-drift-lens` SKILL.md frontmatter failed YAML parsing (unquoted `:` in the
  description) — the skill would have loaded with empty metadata at runtime. Caught by
  `claude plugin validate` during release tagging; description now quoted.

## 0.2.0 — 2026-07-16

The coverage upgrade. v1 was a repeatable engine; 0.2.0 is the same engine that can also
show what it covered — completeness accounting ported from the ZenCoder audit
methodology. Still read-only. See `SPEC-v2.md`.

### Added

- **Recon phase** — new `audit-recon` agent, one per lens, dispatched in parallel with the
  scout. Returns **denominators** (`{ pattern, command, count }` — the exact enumeration
  command, recorded verbatim in the report appendix so it's re-runnable), **seeds** (cited
  leads; hints, not findings — reviewers must re-verify every one, citations drift), and
  **safe-control candidates**. Skipped in `:quick` unless `recon.quick: true`; the skip is
  logged and stated in the report appendix, never silent.
- **Rulebook + rule-closure coverage matrix** — the same agent (rulebook mode) parses the
  `rulesFrom` docs (`CLAUDE.md`/`AGENTS.md`) into discrete rules with stable IDs. Reviewers
  return a `ruleCheck` for every rule handed (`violation` / `verified-safe` /
  `not-applicable`, each with evidence or a reason); plain-code reconciliation folds them so
  the report renders a matrix row for EVERY rule — including an honest `NOT CHECKED` for
  anything no reviewer touched. Closure: no rule may be silently absent.
- **Denominator coverage math** — reviewers report
  `{ seedsVerified, seedsGiven, toolCandidatesJudged }`; the report's Coverage summary
  states `examined X / N` per denominator (+ command), and says "sampled" plainly where
  X < N, with the risk-weighting rationale.
- **Positive controls (INFO)** — verifier refutations that cite a concrete guard,
  `verified-safe` rule checks, and reviewer-confirmed recon safe controls ship as a
  "checked and clean" report section (citation + what it protects). Noise-gated — must
  attach to a rulebook rule or be the counter-evidence that killed a critical/high
  candidate — and capped at `positiveControls.max` (default 15; 0 disables). This
  knowledge previously evaporated every run.
- **`docs-drift` lens** — audits the rulebook itself against reality: `tools/docsdrift.sh`
  (deterministic recall: path tokens, script names, scoped package names — `@scope/pkg`;
  unscoped tech-name prose is the judgment layer's job — vs the tree /
  `package.json`) + a judgment-layer skill (real drift vs glob/abbreviation vs
  intentional). Opt-in, never in the defaults; when requested the engine adds exactly ONE
  job over the `rulesFrom` docs — not crossed with units. LOW severity by default, MEDIUM+
  only when the drift misleads a security control.
- **Richer finding schema** — findings gain `confidence`
  (`confirmed`/`likely`/`needs-owner-input`), `validationSteps` (the read-only checks that
  confirmed true-positive), `remediationBucket`
  (`quick-win`/`targeted-fix`/`systemic-refactor`/`owner-decision`), and `context`
  (surface/runtime/gated) — classified BEFORE severity, so severity comes from real
  exploitability, not raw pattern match. `owner-decision` items render as questions in
  their own waves subsection, not scheduled work.
- **Per-stage model routing** — `config.models.<stage>` optionally sets `{ model, effort }`
  per engine stage (scout/recon/rulebook/reviewer/verifier/unitMapper/synthesizer), passed
  through to the Workflow `agent()` opts. Suggested policy in the config template:
  mechanical stages at low effort, judgment stages inherit the session model, the verifier
  at high effort. Omit the block to inherit everywhere (v1 behavior).

### Changed

- **Phases** are now Discover → Recon → Review → Verify → Synthesize (reconcile stays
  plain code: dedup + baseline suppression + rule closure + coverage totals +
  positive-control harvest).
- `FINDINGS_SCHEMA` → `REVIEW_SCHEMA` (findings + `ruleChecks` + `coverage`); report
  `counts` gains `info`; the run summary prints rule closure ("rulebook N rules: X
  checked, Y NOT CHECKED") and the positive-control count.
- **No-silent-truncation now extends from units to rules and patterns** — budget-killed
  recon means the appendix says denominators are partial; unchecked rules render as
  `NOT CHECKED`.

### Backward compatibility

A v1 `audit.config.yaml` runs unchanged: `recon.enabled` defaults on,
`positiveControls.max` defaults to 15, `:quick` skips recon (quick stays cheap), and
`docs-drift` runs only when explicitly requested.

## 0.1.0

First release — the productized version of a hand-run 8-agent pre-certification security audit.
Scoped, adversarially-verified, agentic whole-repo audits. **Read-only in v1** (no agent
modifies application code; the only writes are the report + baseline).

### Added

- **Plugin scaffold** — `.claude-plugin/plugin.json`, README, SPEC; CLI-only (sub-agents + workflows).
- **3 lenses** — `security` (CWE/ASVS/OWASP: authz, injection, secrets, SSRF, RLS/row-scoping,
  money & privilege paths), `correctness` (silent failures, state-machine catch gaps, TOCTOU/races,
  null/off-by-one, fail-open defaults), and `architecture` (DRY/duplication, layering, dead code,
  circular deps, god-objects, size limits). Each layers over the repo's own `CLAUDE.md`/`AGENTS.md` rules.
- **5 agents** — `audit-scout` (fast unit inference + per-unit confidence), `audit-unit-mapper`
  (deep mapping, escalated only when inference is low-confidence), `audit-reviewer`
  (per-unit×lens deep review, runs the lens's tool first), `audit-verifier` (dedicated,
  default-to-refuted adversary for precision), `audit-synthesizer` (dedup-aware report + waves).
- **Workflow engine** — `audit.workflow.js`: deterministic Discover → Review → Verify →
  Synthesize, with Review→Verify as a pipeline (a unit verifies as soon as its review lands)
  and N-voter majority-refute verification.
- **Adaptive unit scoping** — scout infers units fast with confidence scores; escalates to
  `audit-unit-mapper` when overall confidence is low, a unit self-flags `needsDeepMap`, or
  `--deep-units` is passed; an explicit `units.list` in config always wins. Derivation method
  and low-confidence units are flagged in the report so they can be pinned next run.
- **Dedicated verifier** — purpose-built `audit-verifier` (not a red-team wrapper):
  default-to-refuted, finding-schema-aware, majority-confirm-to-survive. The core precision bet.
- **Baseline / delta** — `.audit-baseline.json` + `/cklph-audit:baseline` accepts open findings
  with a per-finding reason; fingerprints are line-number-independent (stable across code moves),
  so re-runs surface only what's NEW and accepted debt never resurfaces.
- **Tool-augmented lenses** — deterministic detectors drive recall before the LLM judges:
  `tools/dry.sh` (jscpd), `tools/await.sh` (eslint no-floating-promises + tsc),
  `tools/deadcode.sh` (knip/ts-prune), `tools/layering.sh` (dependency-cruiser),
  `tools/secrets.sh` (gitleaks/detect-secrets). Each degrades gracefully when the binary is
  absent so the reviewer can fall back to reasoning.
- **Fixtures + backtest validation** — golden `fixtures/<lens>/{should-flag,should-not-flag}/`
  ground truth and `/cklph-audit:backtest <lens> [ref]` compute precision/recall against
  fixtures and historical commits. A lens is gated (suggested recall ≥ 0.8, precision ≥ 0.7
  after verify) before it's trusted; fixtures grow as real false-pos/neg are found.
- **Commands** — `/cklph-audit:init`, `:run <lenses> [path]`, `:quick <lens> [path]`,
  `:baseline`, `:backtest <lens> [ref]`.
- **Config + reports** — `audit.config.yaml` (units, lenses, severityFloor, verify, budget,
  quick, ignore, report, rulesFrom) and git-trackable `audits/AUDIT-<date>.md` reports with
  severity buckets, file:line, verifier notes, remediation waves, and a no-silent-truncation
  appendix.

### Notes

- **Cost-bounded** — token budget, `:quick` top-N risk sampling, and dedup/baseline make
  re-runs cheap. Partial reports still emit with a "skipped for budget" appendix.
- **Not for per-PR review** — that's diff review's job. This is a periodic, before-a-milestone
  deep pass.
- v2 (planned): `performance` + `a11y` + `compliance` lenses, scheduled weekly delta audits,
  a pre-promotion CLI gate, and auto-handoff of confirmed Criticals into `/cklph-os:flow`.
