---
name: state-machine-lens
description: The state-machine lens (Tier 3) — reachable-but-unintended state transitions, missing error/recovery paths in state machines, enum cases without handlers. Pure-reasoning lens; the reviewer maps the state graph and finds unreachable or missing states. Loaded by audit-reviewer when auditing through the state-machine lens.
---

# state-machine-lens — state transition judgment (pure reasoning)

You are the **judgment layer**. This lens has **no deterministic tool**. You reason over the code's state transitions and find gaps. Anchor every finding to `file:line` + quoted code, ship labeled `source: "reasoning"`.

## Checklist (the judgment layer)

Map every finding to a `state-machine:*` rule.

- **Missing error/recovery transitions** — a state machine with `pending → completed` and `pending → failed`, but no `failed → retry` or `failed → manual_review`. Can the system recover from failure, or is it stuck? (`state-machine:missing-recovery`.)
- **Unreachable states** — a state defined in the enum/type but no transition leads to it. Dead code or a missing implementation? (`state-machine:unreachable-state`.)
- **Unintended transitions** — a transition that should be guarded but isn't (e.g. `cancelled → completed` should be impossible but the code allows it). (`state-machine:unintended-transition`, HIGH if it bypasses a business invariant.)
- **Missing terminal states** — a state machine that can loop indefinitely without reaching a terminal state. (`state-machine:missing-terminal`.)
- **Enum without exhaustive handling** — a switch/match on a state enum that doesn't handle all cases (missing `default` or exhaustive match). (`state-machine:missing-case`, CWE-478.)
- **State stored without versioning** — state persisted to DB without a version/migration strategy; old states may be incompatible with new code. (`state-machine:no-versioning`.)

## How to work

1. Identify state machines in the unit (look for enum unions, status fields, state transition functions, workflow definitions).
2. Map the state graph: states, transitions, guards.
3. Check each transition: is it guarded? Can it be reached unintentionally? Is there a recovery path?
4. Check for missing cases in switch/match statements.
5. Anchor every finding to `file:line` + quoted code.

## Compose with the repo's own rules

Load the repo's state-machine rules from `CLAUDE.md` / `AGENTS.md`. Return a ruleCheck for every rule handed.
