# Changelog

All notable changes to cklph-os are documented here.
Format: [Keep a Changelog](https://keepachangelog.com); versioning follows [SemVer](https://semver.org).

## [0.6.0] — 2026-05-29

### Added
- **`performance` skill** — measure-first optimization loop (measure → identify → fix → verify → guard),
  Core Web Vitals targets, a symptom→bottleneck map, and the top anti-pattern fixes (N+1, unbounded
  fetch, image/CLS, React re-renders, bundle splitting, caching).
- **`frontend-ui` skill** — production-quality UI: composition over configuration, data/presentation
  split, a state-selection ladder, anti-"AI-aesthetic" design-system adherence, WCAG 2.1 AA
  (keyboard / ARIA / focus / contrast), dark-mode pairing, and required loading/error/empty states.
- **Red-team adversarial layer:**
  - `cklph-reviewer` gains a third review axis — **Omissions** (what wasn't asked: unstated
    requirements, uncovered edge cases / failure modes, missing acceptance criteria, unscoped
    error/security paths).
  - New **`red-team` agent** — maximum-intensity escalation for high-stakes changes (security / auth /
    money / data integrity / irreversible / pre-release): assumes the change is broken until proven,
    burden-of-proof on every reliant claim, an enumerate-then-disprove protocol, and a
    failure-injection attack checklist.
  - `review` gains a **standard | red-team** intensity; `flow` **auto-escalates** to red-team at hard
    gates. New markers `## RED-TEAM CLEAR` / `## RED-TEAM FINDINGS`.
- **Build-loop hardening (audited from the SaaS Product Architect instruction set):**
  - **Compaction notes per wave** — `build` + `cklph-implementer` emit a handoff (what shipped /
    deviations / state + files the next wave loads), so waves and resumed sessions continue without
    re-deriving context.
  - **Executable acceptance commands** — `plan` tasks carry a runnable pass/fail command (not prose);
    `verify` runs them. "If you can't write the command, the task isn't understood."
  - **Out-of-scope field** + **anti-pattern pairing** in the task brief — fights implementer scope-creep
    and teaches from negative examples (`build`, `plan`, `cklph-implementer`, `spec-authoring-rules`).
  - **Review-leverage gradient** rationale in `plan` (an error costs ~100× / 10× / 1× to fix at
    research / plan / code).
  - **Refinement impact-cascade** mode in `refine` — a mid-flight requirement change marks stale
    spec/plan/built slices and routes re-work instead of drifting silently.
  - New **`build/failure-modes.md`** lazy ref — named wave failures (off-script, invented API,
    scope-creep, same-file clobber, rubber-stamp) + fixes.

### Fixed
- **`pre-commit-gate.sh`** no longer blocks commits in repos that lack a local `tsc`/`eslint` — a
  missing tool now **skips** that check instead of being misreported as "errors found" (the false
  positive that blocked `git commit` when `npx` couldn't resolve the compiler/linter).

### Why
- The two new skills close the only real gaps left when `agent-skills` was disabled for the
  cklph-os-only cutover: `performance-optimization` (no prior equivalent) and `frontend-ui-engineering`
  (high-value for the Next.js/React stack). Security was already covered by `security-hardening`.
- The red-team layer closes the third adversarial dimension — *what was missed / never asked* — that
  standards+spec review structurally can't catch. The `npx`-tool-missing false positive fixed above was
  exactly such an unspecced failure mode, which a spec-only review sails past.

## [0.5.1] — 2026-05-29

### Changed
- **Privacy:** scrubbed internal/client project names from docs (and history) — generic placeholders now.
  The public repo is the shareable core.

### Added
- **Private overlay** — `private/` (gitignored except its README) for personal/internal/client skills,
  refs, and notes; documented the user-level private layer (`~/.claude/skills/`, `~/.claude/memory/GLOBAL.md`).

## [0.5.0] — 2026-05-29

### Added — leveraged from the SaaS Product Architect instruction set
- **Spec-authoring rules** (`spec/spec-authoring-rules.md`) — write specs Claude Code executes faithfully:
  decision logic as matrices (not prose), `[EXECUTABLE]`/`[VERIFICATION]`/`[REFERENCE]` section markers,
  explicit out-of-scope, a required-context file list, verification-first, + a spec quality gate.
- **Bias hunt** in `cklph-reviewer` — planning-fallacy (1.5×/2×/3× estimate multiplier), sunk-cost,
  confirmation, and optimism counter-prompts when reviewing plans/decisions.
- `plan-check`: decision logic in task briefs must be explicit (matrices/rules), not prose.
- Fresh-context review rationale cited (Huang et al., ICLR 2024 — "LLMs can't self-correct") in `cklph-reviewer`.

## [0.4.0] — 2026-05-29

### Added — agent-skills parity pass
- **4 pull-in skills:** `debugging` (root-cause: reproduce → localize → fix → guard),
  `security-hardening` (review checklist), `simplify` (behavior-preserving cleanup),
  `api-design` (contract-first interface design).
- **Core-phase depth:** `spec` gains **Boundaries** (autonomy envelope) + full `spec-template.md`;
  `plan` gains **risk-first** ordering + checkpoints + **contract-first** (Slice 0); `refine` gains a
  convergence rubric (`criteria.md`); `cklph-implementer` gains the **Keep-It-Compilable** per-increment gate.

### Notes
- Depth lives in lazy reference files + tight-description skills — closes the agent-skills gaps while
  keeping always-on token cost low (progressive disclosure).

## [0.3.0] — 2026-05-29

### Added — self-correcting loops (from GSD + agent-skills + mattpocock/skills)
- **Plan-check loop:** `plan` runs `cklph-reviewer` (Mode B + `plan-check.md`) and re-plans until
  `## PLAN VERIFIED` — max 3 cycles, stall-detected.
- **verify → gap → re-build loop:** `verify` emits a structured gap list (`gaps-format.md`) routed back
  into `build` as a gaps-only wave, then re-verifies — instead of dead-ending.
- **Marker contracts:** phases/agents end with machine-parseable markers so `flow` auto-routes instead
  of guessing from prose.
- **Two-axis review:** `cklph-reviewer` reviews **standards** and **spec** separately, reads tests first,
  and gained a **plan-check** mode.
- **Prove-It tests:** `cklph-implementer` writes a failing/repro test before bug fixes (RED→GREEN, one behavior at a time).

### Changed (content enrichments)
- `spec`: reframe fuzzy asks into measurable targets. `refine`: assumptions stop-gate.
  `plan`: vertical slices + bottom-up ordering. `build`: structured task briefs.
  `cklph-implementer`: Context7 source-driven (don't code framework APIs from memory).
- Depth moved to lazy-loaded supporting files (`plan/plan-check.md`, `verify/gaps-format.md`) — skills
  stay thin (progressive disclosure).

## [0.2.0] — 2026-05-29

### Added
- **Full phase model** — each a standalone skill + `/cklph-os:<phase>` command:
  `refine → spec → plan → build → review → verify → ship`.
- **`/cklph-os:flow`** orchestrator — runs the whole loop with a mode prompt
  (full-agentic / partial / interactive), auto-detects the next phase, executes via sub-agent waves.

### Changed
- Refactored `agentic-build` → the `build` phase (execution only). Planning, review, verify, and ship
  are now their own phases, sequenced by `flow`. Merges GSD's loop + wave execution with
  agent-skills' composable phases.

## [0.1.1] — 2026-05-29

### Changed
- Renamed the build command `cklph-build` → `build` (invoked as `/cklph-os:build`; the plugin
  namespace already conveys "cklph" — don't repeat it).

### Fixed
- `agentic-build` now detects the stack accurately: reads `package.json` + `AGENTS.md` and recognizes
  **Next.js** (not "pure React"), and handles monorepos per-package. `cklph-implementer` follows the
  detected framework.

## [0.1.0] — 2026-05-29

### Added
- **Agentic builds (sub-agent waves):**
  - `agentic-build` skill — orchestration playbook (decompose → dispatch fresh-context implementers in
    waves → atomic commit per task → review gate → lean main context).
  - `/cklph-build` command to launch a build.
  - `cklph-reviewer` sub-agent (adversarial, read-only review) and `cklph-implementer` sub-agent
    (focused single-task executor).

## [0.0.1] — 2026-05-29

### Added
- Initial plugin: `using-cklph` bootstrap / skill-discovery spine.
- Quality-gate hooks wired via `${CLAUDE_PLUGIN_ROOT}`:
  - `nextjs-quality-check.sh` (advisory; exit 2 surfaces findings to Claude)
  - `security-check.sh` (advisory secret scan; reads file path from stdin)
  - `pre-commit-gate.sh` (blocks `git commit` on tsc/ESLint/Semgrep errors)
- Personal `cklph` marketplace manifest.
- `STANDARD.md` (the spec), `AGENTS.md` / `CLAUDE.md` / `STATE.md` templates, and a `bats` hook test suite.

### Notes
- Hooks run on the Claude Code **CLI only**; Desktop/Cowork load skills via the marketplace UI, not hooks.
