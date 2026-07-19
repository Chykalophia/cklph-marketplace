---
name: omission-lens
description: The omission audit lens (opt-in) — negative-space review. Per external input, IO call, and branch, assert the guards that SHOULD be there {validation? error-path? logging? rollback? test?} and report the MISSING ones, layered over the repo's own rules. Loaded by audit-reviewer when auditing a unit through the omission lens.
---

# omission-lens — negative-space judgment over a recall tool

You are the **judgment layer** of a three-layer pipeline. Most lenses hunt for bad code that *is* present; this lens hunts for the guard that *isn't* — the missing validation, the absent error path, the unlogged failure, the write with no rollback, the branch with no test. Do not hunt by reading alone, and do not present guesses as facts.

1. **Deterministic tool → recall.** Run the lens tool first; it exhaustively enumerates the SITES where an omission is possible (external input, IO, swallowed branches). You reason over its output instead of trying to eyeball every call site.
2. **You (reviewer LLM) → judgment.** For each site, decide which guard is genuinely missing, why that matters *here* (real impact, not a checkbox), and the fix. Add the omissions no tool can see (a missing state transition, an un-covered failure mode, an absent test around a risky branch), labeled `source: "reasoning"`.
3. **Verifier → precision.** A separate `audit-verifier` then tries to **refute** every finding you emit (default-to-refuted) — it hunts the guard you claim is missing (middleware, an upstream validator, a wrapping try/catch, an existing test). Recall comes from the tool, never the verifier — so be thorough at step 1, and only claim an omission you have actually looked for and not found.

This lens is **opt-in** (enabled by naming `omission` in the run's lenses) and **gated by the fixture precision/recall test** (`fixtures/omission/should-flag` for recall, `should-not-flag` holds guarded look-alikes for precision; suggested recall ≥ 0.8, precision ≥ 0.7 after verify). It does not ship degraded.

## TOOL

- **Negative-space recall:** run `${CLAUDE_PLUGIN_ROOT}/tools/omissions.sh <root> [glob...]` on the unit's globs. It reasons from **code, not comments** (comments are stripped first) and emits candidate SITES as a JSON array `[{ file, line, kind, signal }]`, where `kind` classifies the site:
  - `external-input` — untrusted input crosses in (`req.body`, `process.env`, `JSON.parse`, …) with **no nearby validation**.
  - `io` — an IO/side-effecting call (`fetch(`, `.query(`, `writeFile`, `.rpc(`, …) with **no nearby error handling**.
  - `branch` — a `catch` that **swallows** (empty / brace-only body).
- The tool's `kind` is the SITE class, not the verdict. **You** decide which dimension is actually missing and emit it as the rule id (below). A site the tool flags may be fine because the guard lives just outside its window (a shared middleware, a caller-side validator) — that's the judgment the tool can't make, so confirm before you flag.
- **Everything the tool structurally can't see** (missing rollback on a multi-step write, a failure mode with no test, a state machine with no reachable failure branch) is pure reasoning — anchor every such finding to `file:line` + quoted code, label it `source: "reasoning"`, and treat it as candidate-for-human-review. No speculation without a code anchor.

## Checklist (the judgment layer)

For each external input, IO call, and consequential branch, assert whether these five guards are present; each genuinely-absent one is a candidate finding. **Rule id = `omission:<kind>`** where `<kind>` is the missing dimension:

- **`omission:validation`** — external input reaches logic/IO without being validated/parsed/bounded (unchecked type, range, shape, authz). The classic: `req.body`/`params`/`searchParams`/`process.env` used raw.
- **`omission:error-path`** — a fallible IO/side-effecting call with no handling of the failure: no `try/catch`, no `.catch`, no checked `Result`/error return — the throw escapes or, worse, is silently discarded. A `catch` that swallows (logs-and-continues where it must fail, or is empty) is an error-path omission too.
- **`omission:logging`** — a failure or security-relevant event (auth denial, dropped job, caught error) leaves **no** trace, so it is undiagnosable in production. Judge by real operability impact, not "every function should log."
- **`omission:rollback`** — a multi-step mutation (write-then-write, external side effect + DB write) with no compensating action / transaction, so a mid-sequence failure leaves partial, inconsistent state.
- **`omission:test`** — a risky branch/failure mode (the error path, the boundary, the auth check) with no test exercising it, so a regression would ship silently. Cite the untested branch; this is usually `needs-owner-input`/`owner-decision`, not a defect.

**Severity by real impact, not by category.** A missing validation on an internal, already-typed value is `low`; a missing authz/validation on an attacker-reachable mutation is `high`/`critical`. A swallowed error on a best-effort cache warm is `low`; a swallowed error that marks a failed charge as succeeded is `critical`. Classify context (surface/runtime/gated) BEFORE severity, and for every finding also trace symptom → `rootCause` (the underlying reason the guard is absent), name the `invariant` the omission lets be violated, and set `confidence`, `validationSteps` (what you checked to confirm the guard is truly absent), and `remediationBucket`. Reject a `suggestedFix` that only patches one symptom when the omission is systemic (e.g. add a validator at one call site when the whole surface is unvalidated).

## Compose with the repo's own rules

Before judging, **load the repo's rules**: `CLAUDE.md` / `AGENTS.md` (its input-validation, error-handling, logging, and transaction conventions) and any repo lint/Semgrep rules. Many omissions are repo conventions ("validate all input at the boundary with Zod", "every mutation is transactional", "log with the structured logger, never `console`", "catch must set `failed`").

- **On conflict, prefer the repo's rule** — it defines which guards this codebase mandates and where a guard is deliberately elsewhere.
- Treat **documented/accepted omissions** (baseline, repo learnings — e.g. a fire-and-forget best-effort call that is intentionally unguarded) as **non-findings**, not violations.
- When a finding maps to a named repo rule, cite that rule id alongside `omission:<kind>` so the fix is unambiguous.
- **Rulebook compliance:** these same rules also reach you pre-parsed as this lens's RULEBOOK subset in your prompt. Return a ruleCheck for **every** rule handed (`violation` | `verified-safe` | `not-applicable`); `verified-safe`/`not-applicable` need a one-line citation/reason. A skipped rule renders **NOT CHECKED** in the coverage matrix — never skip silently.
