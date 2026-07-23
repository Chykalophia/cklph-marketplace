---
name: concurrency-lens
description: The concurrency lens (Tier 3) — every check→use gap, TOCTOU, race conditions, single-packet attack surfaces, non-atomic guards. Pure-reasoning lens (no deterministic tool); the reviewer reasons over code patterns and the verifier confirms. Loaded by audit-reviewer when auditing through the concurrency lens.
---

# concurrency-lens — race condition + TOCTOU judgment (pure reasoning)

You are the **judgment layer**. This lens has **no deterministic tool** — race conditions and TOCTOU bugs are not reliably detectable by static tools. This is pure reasoning, so anchor every finding to `file:line` + quoted code and ship it labeled `source: "reasoning"` (treat as candidate-for-human-review).

## Checklist (the judgment layer)

Map every finding to a CWE id and/or `concurrency:*` rule.

- **TOCTOU (time-of-check-to-time-of-use)** — check a condition, then act on it, but the state changed between check and use. Classic: `if (user.hasPermission) { ... do privileged thing ... }` where the permission check and the action aren't atomic. (CWE-367, `concurrency:toctou`.)
- **Check-then-use on async boundaries** — `await getUser()` then `await db.query(...)` with the user id; the session may have changed between the two awaits. (CWE-367, `concurrency:async-toctou`.)
- **Non-atomic guards** — a guard that checks and acts in separate operations; a concurrent request can slip through. Prefer predicate-in-UPDATE (`UPDATE ... WHERE owner = $1`) over read-then-write. (CWE-362, `concurrency:non-atomic-guard`.)
- **Single-packet attack surfaces** — multiple requests sent in a single TCP packet can bypass rate limits / TOCTOU checks (HTTP/2, PortSwigger research). If the code relies on per-request rate limiting, this is a finding. (`concurrency:single-packet`.)
- **Race in resource creation** — two requests creating the same resource (e.g. creating a user with the same email) — is there a unique constraint / transaction? (`concurrency:create-race`.)
- **Cache invalidation races** — write to DB, invalidate cache, but a concurrent read hits the stale cache. (`concurrency:cache-race`.)

## How to work

1. Read each unit's code looking for check-then-use patterns, async boundaries with state, and non-atomic read-modify-write cycles.
2. Anchor every finding to `file:line` + quoted code.
3. Set `source: "reasoning"` — these are candidates for human review (no tool recall).
4. The verifier will attempt to refute by finding an atomicity guarantee (transaction, unique constraint, mutex, single-threaded runtime).

## Compose with the repo's own rules

Load the repo's concurrency rules from `CLAUDE.md` / `AGENTS.md` (e.g. "always use predicate-in-UPDATE for ownership checks"). Return a ruleCheck for every rule handed.
