# cklph-os — Refined Direction (idea-refine output)

## Problem Statement
**How might we** give one solo dev a single, DRY, low-maintenance system of reusable
skills / automations / guidance that follows him across Claude Code CLI, web, Cowork, and
Desktop — without drift or context bloat?

## Recommended Direction (decided)
**Full from-scratch OS + validate cross-surface first.**

cklph-os is an authoritative personal OS: its own phase-loop commands/agents, its own
skill suite, its own hooks, distributed as a personal **marketplace plugin**. Because it is
authoritative, it **replaces** overlapping external frameworks (addyosmani/agent-skills) rather
than running alongside them — this is the only way a from-scratch build stays coherent and avoids
two frameworks issuing contradictory guidance.

Honest layering: **CLI is the full-power home**; the **marketplace plugin is the cross-surface
vehicle** (the only unit supported on all four surfaces); **AGENTS.md** buys cross-*tool* reach
(Cursor/Codex/etc.). Hooks stay CLI-only by nature; their rules are mirrored as prose in AGENTS.md
so guidance still travels.

## Key Assumptions to Validate
- [ ] **Custom marketplace-plugin SKILLS load/run in Cowork, Desktop, and web** — not just CLI.
      Test: minimal probe plugin installed on each surface. *(Gates everything — do first.)*
- [ ] A single authoritative spine + disabling agent-skills removes contradictory guidance.
- [ ] Surface/profile budgeting keeps context lean enough that skill selection stays accurate.
- [ ] Hooks being CLI-only is acceptable (rules mirrored as AGENTS.md prose elsewhere).

## MVP Scope
- Minimal plugin: `plugin.json` + personal `marketplace.json` + ONE probe skill → confirm load in
  CLI, then Desktop/Cowork/web.
- The 3 quality-gate hooks migrated in via `${CLAUDE_PLUGIN_ROOT}`.
- A `using-cklph` bootstrap meta-skill (the single authoritative spine).
- `AGENTS.md` + `CLAUDE.md @import` templates.

## Not Doing (and Why)
- **No parallel phase-loops** — cklph-os is THE spine; agent-skills is retired at parity (else contradictory guidance).
- **No hooks for Desktop/Cowork** — they don't execute hooks; mirror rules as prose.
- **No web UI** — irrelevant to the goal.
- **No installing GSD/superpowers packages** — borrow ideas only (supply-chain + overlap risk).
- **No GSD execution-wave engine in MVP** — CLI-only power feature; add post-validation.

## Open Questions
- How many machines need the marketplace installed (multi-device)?
- Migrate-or-coexist timeline for agent-skills (hard cutover vs phased)?
