---
name: spec
description: The SPEC phase of the cklph-os flow — turn a goal into requirements and acceptance criteria before planning. Use before building anything non-trivial. Defines WHAT, not HOW.
---

# spec — define what we're building

*Specs are the real code — a bad spec line becomes hundreds of bad code lines.* Author for AI execution:
decision logic as **matrices not prose**, marked sections (`[EXECUTABLE]`/`[VERIFICATION]`), explicit
out-of-scope, a required-context file list, verification-first. Full rules + quality gate: `@spec-authoring-rules.md`.

Capture, tightly:
- **Problem** — what we're solving and why.
- **Scope** — explicitly in and out.
- **Requirements** — the behavior that must exist.
- **Acceptance criteria** — *testable* statements of "done" (drive `verify` later). **Reframe every fuzzy ask into a measurable target** ("faster" → "LCP < 2.5s on 4G") and confirm the targets.
- **Boundaries** — the build's autonomy envelope: *Always do* / *Ask first* (schema changes, new deps, destructive or externally-visible ops) / *Never do*. (Full six-area template: `@spec-template.md`.)

Read `AGENTS.md` for project constraints. Surface assumptions and get the user's nod on anything
ambiguous — don't silently fill gaps. Keep it short; this is a contract, not an essay.

**Output:** a spec with testable acceptance criteria. Hands off to `plan`.
