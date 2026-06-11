# Changelog

All notable changes to `cklph-audit` are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

## 0.1.0

First release — the productized version of the hand-run MailPrism CASA 8-agent audit.
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
