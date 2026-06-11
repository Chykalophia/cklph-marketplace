---
name: correctness-lens
description: The correctness audit lens — silent failures, state-machine gaps, concurrency/TOCTOU, data handling, and fail-direction, layered over the repo's own rules. Loaded by audit-reviewer when auditing a unit through the correctness lens.
---

# correctness-lens — bug-class judgment over a recall tool

You are the **judgment layer** of a three-layer pipeline. Don't hunt by reading alone; don't present guesses as facts.

1. **Deterministic tool → recall.** Run the lens tool first; it enumerates candidates exhaustively. Reason over its output rather than eyeballing every call site.
2. **You (reviewer LLM) → judgment.** Decide which candidates are real bugs, why, where (`file:line`), and the fix. Add the bug classes no linter catches (state-machine gaps, races, fail-direction), labeled `source: "reasoning"`.
3. **Verifier → precision.** A separate `audit-verifier` then tries to **refute** every finding (default-to-refuted). Recall comes from the tool, not the verifier — be thorough at step 1.

This lens is **gated by the fixture precision/recall test** (`fixtures/correctness/should-flag` for recall, `should-not-flag` for precision; suggested recall ≥ 0.8, precision ≥ 0.7 after verify) and a git backtest (run on the commit just before a known bugfix — it must re-flag the bug). It does not ship degraded.

## TOOL

- **Floating promises / missing await:** run `${CLAUDE_PLUGIN_ROOT}/tools/await.sh` (ESLint `no-floating-promises` + `tsc`) on the unit's globs. This is near-exact — the linter is the recall AND most of the precision; your job is just to confirm the unawaited call actually matters (fire-and-forget that should have been awaited, lost rejections, ordering bugs).
- **Everything else** (silent failures, state machines, concurrency/TOCTOU, data handling, fail-direction) has **no clean deterministic tool** — that's reasoning. Anchor every finding to `file:line` + quoted code; ship it labeled honestly (`source: "reasoning"`, candidate-for-human-review). No speculation without a code anchor.

## Checklist (the judgment layer)

- **Silent failures** — unchecked errors; swallowed `catch` (caught then ignored / logged-and-continue); missing error IDs; **zero-row writes treated as success** (an `update`/`delete` that matched nothing but returns "ok"); discarded `ServiceResult`/error returns.
- **State machines** — every `in_progress` (or `pending`/`processing`) status has a reachable `failed` path; if a `try` sets `in_progress`, the `catch` MUST set `failed`; catch blocks restore invariants (counters, locks, in-flight flags) rather than leaving partial state.
- **Concurrency** — TOCTOU (check-then-act on shared state); read-then-write races; non-atomic guards — prefer a **predicate-in-UPDATE** (`WHERE status = 'x'`) over read-modify-write; rapid-toggle idempotency (in-flight guard).
- **Data handling** — null/undefined dereferences; off-by-one; **inclusive-range** bugs (e.g. Supabase `.range(offset, offset + limit - 1)`, not `+ limit`); pagination needs `{ count: "exact" }` or `hasMore` is a guess; partial `select` typed with `Pick`, not cast to the full interface; `JSON.parse` wrapped in try/catch **before** Zod (Zod can't catch a parse throw).
- **Fail direction** — defaults fail **closed** where wrongness is dangerous (security/integrity), **open** only where it can't break correctness — and only when that openness is **intentional and documented**. An accidental fail-open is a finding.

## Compose with the repo's own rules

Before judging, **load the repo's rules**: `CLAUDE.md` / `AGENTS.md` (its "common review pitfalls" / correctness conventions) and any repo Semgrep rules. Many of the bug classes above are repo conventions (inclusive `range()`, `count: exact`, `Pick` on partial selects, catch-must-set-failed, updater purity).

- **On conflict, prefer the repo's rule** — it encodes this codebase's intended behavior.
- Treat **documented/accepted exceptions** (baseline, repo learnings) as **non-findings**.
- When a finding maps to a named repo pitfall, cite it so the fix is unambiguous.
