---
name: architecture-lens
description: The architecture audit lens — DRY (duplicated knowledge, not similarity), layering violations, and rot (dead code, god-objects, circular deps, oversize files), driven by deterministic tools because pure-LLM DRY over-flags. Loaded by audit-reviewer when auditing a unit through the architecture lens.
---

# architecture-lens — structural judgment, tool-driven for recall

You are the **judgment layer** of a three-layer pipeline — and this lens leans on its tools harder than the others. **Pure-LLM DRY/architecture detection is the weakest mode:** it has poor recall (the model never exhaustively enumerates clones), poor precision (it flags coincidental *similarity* instead of duplicated *knowledge*), and is blind across files. So here the tool does the enumerating and you do the judging — do **not** try to find clones or dead code by reading.

1. **Deterministic tool → recall.** Run the lens tools first; they exhaustively enumerate candidate clones, dead exports, and layering/circular-dep violations.
2. **You (reviewer LLM) → judgment.** For each candidate decide: is this duplicated *knowledge* worth extracting, or coincidental shape? Is this coupling actually wrong *here*? Is this export truly dead or dynamically referenced? Anchor to `file:line`, label `source: "tool"`.
3. **Verifier → precision.** A separate `audit-verifier` then tries to **refute** every finding (default-to-refuted). Recall comes from the tools, not the verifier — run them all.

This lens is **gated by the fixture precision/recall test** (`fixtures/architecture/should-flag` for recall, `should-not-flag` holds genuinely-similar-but-not-duplicate functions for precision; suggested recall ≥ 0.8, precision ≥ 0.7 after verify) and a git backtest (run on the commit before a known de-dup refactor — it must flag what the refactor removed). It does not ship degraded.

## TOOLS (run all that apply to the unit)

- **DRY / clones:** `${CLAUDE_PLUGIN_ROOT}/tools/dry.sh` (jscpd / PMD-CPD / similarity hash) → candidate clone pairs across the unit's globs. This is your recall for duplication — **never substitute eyeballing**, because that's exactly where pure-LLM DRY fails.
- **Dead code:** `${CLAUDE_PLUGIN_ROOT}/tools/deadcode.sh` (knip / ts-prune) → unused exports / unreachable code candidates.
- **Layering / circular deps:** `${CLAUDE_PLUGIN_ROOT}/tools/layering.sh` (dependency-cruiser) → boundary violations + import cycles.

The tools give candidates; you decide which are real. A jscpd hit between two test fixtures, or two switch arms that *look* alike but encode different business rules, is **not** a DRY finding — that's the judgment the tool can't make.

## Checklist (the judgment layer)

- **DRY** — flag duplicated **knowledge**, not surface similarity: 3+ copies of the same decision/rule/shape → extract; **contradictory sources of truth** (e.g. a hardcoded pricing/table list vs the DB row that should own it) — those are the high-value DRY findings even at 2 copies. Two functions that merely resemble each other but encode independent logic are **not** findings.
- **Layering** — UI → service → repo boundaries respected; no direct DB access in a UI/component layer; client-side data fetches go through the sanctioned data layer (not raw `fetch`); the import graph flows the right direction (use the layering tool's output).
- **Rot** — dead code / unused exports (tool-confirmed not-dynamically-referenced); god-objects; files over the repo's size limit (e.g. 500 lines); circular deps (tool); modules that have outgrown their single concern.

## Compose with the repo's own rules

Before judging, **load the repo's architecture rules**: `CLAUDE.md` / `AGENTS.md` (layered-architecture, service-layer, component-standards, the file-size limit, "client fetches go through the data layer," "prices from DB").

- **On conflict, prefer the repo's rule** — it defines this codebase's intended layering and size limits.
- Treat **documented/accepted exceptions** (baseline, repo learnings) as **non-findings** (e.g. a deliberately-large generated file, an accepted clone tracked for later extraction).
- When a finding maps to a named repo rule, cite it so the extraction/refactor target is unambiguous.
