# ADR-004: Keep ServiceResult for now; neverthrow deferred

## Status

Accepted, 2026-11-14

## Context

Use cases need to return expected failures (validation, not found, forbidden) without throwing, so
actions can render form errors and routes can map codes to HTTP statuses. Peter's apps already use
`ServiceResult<T>`: `{ success: true, data }` or `{ success: false, error, code }`, with `success()`
and `failure()` helpers, and every existing skill and service is written against it.

neverthrow's `Result<T, E>` gives typed error unions, chaining (`andThen`, `map`) and combinators,
and is the more common choice in new TypeScript codebases. Moving to it during the layout change
would mean two migrations at once in every repo, and the skills would have to teach both shapes.

## Decision

Keep `ServiceResult<T>`. In the new layout, use cases return `ServiceResult<DTO>`. Expected
failures are results; only unexpected failures throw, and the action or route boundary catches
them.

Switching to neverthrow (or Effect) is a future, separate ADR, decided once for all repos, not per
repo.

## Consequences

- Existing services keep working unchanged and become use cases by moving, not rewriting.
- One result shape across every repo and every skill.
- The error type is a string `code`, not a typed union, so the compiler cannot check that every
  failure is handled. Code-to-status mapping relies on discipline and tests.
- No chaining helpers: multi-step use cases repeat `if (!r.success) return r;`.
- If a neverthrow ADR is accepted later, every use case changes shape, and the longer this stays,
  the larger that migration becomes.
