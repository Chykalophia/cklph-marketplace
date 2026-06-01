# Changelog

All notable changes to cklph-os are documented here.
Format: [Keep a Changelog](https://keepachangelog.com); versioning follows [SemVer](https://semver.org).

## [0.9.0] — 2026-06-01

### Changed (breaking)
- **`using-cklph` skill renamed to `start-here`** — old name was opaque to a fresh user scanning
  their skill list ("how do I use cklph?"). New name is unambiguous — "this is where you start
  every task." Behavior unchanged; only the trigger name, frontmatter `name:`, and body header
  changed. Cross-references in `learn`, `handoff`, `survey`, and `STANDARD.md` updated.

### Notes (repo-level, not plugin-specific)
- The hosting **GitHub repo was renamed** from `Chykalophia/cklph-os` → `Chykalophia/cklph-marketplace`.
  Better reflects what it is — a marketplace hosting 4 plugins (cklph-os, cklph-nextjs,
  cklph-architect, cklph-eos), not a single plugin named after its first child. GitHub provides
  a redirect from the old URL; existing marketplace registrations continue to work, but the
  canonical URL is now the new one.
- **README rewritten** to reflect the marketplace structure (one repo, four plugins) instead of
  the original "cklph-os is a plugin" framing. Old README confused fresh-Monday-morning users.

## [0.8.6] — 2026-05-31

### Added
- **`pre-commit-gate.sh` now lints `SKILL.md` descriptions for colon-space.** A `word: word` inside a
  frontmatter description value re-parses as a nested YAML key, breaking plugin loading. Real
  previously-hit bug; the gate now catches any regression at commit time.

### Fixed
- **`harness-limits` rewritten to distinguish hard classifier blocks from soft care rules.** Previous
  version conflated the two and would have caused Claude to wait for explicit user authorization on
  locally-reversible actions because the skill lumped "irreversible ops" with "classifier denies":
  - **Layer A — hard blocks** (push outside trusted org, disable safety gate, route around denied
    action). Route: hand back to user with exact terminal commands. Alternative tools also denied.
  - **Layer B — care rules** (force-push, hard reset, `rm -rf`, delete prod data, mass external
    messages). Route: ASK the user with specific action + blast radius; do not pre-emptively hand to
    terminal.
- **`using-cklph` now directs Claude to `harness-limits` on tool denial.** New "When a tool call is
  denied" section closes the "Claude reflects, doesn't immediately route" gap that meant
  `harness-limits` only fired by luck.
- **`learn` documents how to FETCH PR review comments.** Trigger said "PR comments are pre-distilled
  lessons" — useful framing, useless instruction. Now includes the `gh pr view <PR#> --comments` (and
  `gh api .../comments` for inline) commands so the trigger is actionable.
- **Memory pruning is now part of the loop.** `learn` gains a "Prune stale memory" section
  (update / delete / promote). `weekly-review` gains a "Prune stale memory (60 seconds)" step.
  Active pruning beats `MEMORY.md` silently truncating at line 200.
- **`nextjs-quality-check.sh` word-boundary bugs.** Old regexes flagged `useStateOf` /
  `useEffect comment` / `"onClick handler"` as interactive features (substring match). Now uses
  `\b...\b`. Page default-export check also now handles arrow functions (`export default async () => …`)
  which the old check missed.

### Token cost note
- Always-on description load ~2,000 tokens (across ~28 cklph-os skills + 3 agents). Up from ~1,445 at
  v0.5; reflects the ~12 new skills added since. Per-skill descriptions land in the 70-120 token band.
  Not at concern threshold — flagging for future reference.

## [0.8.5] — 2026-05-31

### Added
- **`harness-limits` skill** — catalogs what the Claude Code auto-mode safety classifier blocks
  (push outside trusted source-control orgs, disabling safety gates, routing around denied actions,
  wide-blast / irreversible ops) and the right route in each case — hand back to the user with exact
  terminal commands rather than burning turns on alternative tools that will also be blocked. Closes
  the "rediscover the ceiling every session" gap surfaced by a parallel session's debugging note.

### Fixed
- **`learn` skill now explicitly persists.** Previous version said "writes to the auto-memory
  feedback type" but never told the model **how** — relied on the harness's memory instructions being
  loaded and parsed. Added an explicit "Persist the lesson" section with slug-naming, file path,
  frontmatter format, body fields, and `MEMORY.md` indexing step. Lessons now actually reach the
  next session.
- **`pre-commit-gate.sh --max-warnings` is now configurable.** Was hardcoded to `28` (a
  MailPrism-specific budget that other repos shouldn't inherit). Now defaults to `0`; per-repo
  override via the `CKLPH_ESLINT_MAX_WARNINGS` env var.
- **`handoff` filename collision** — `handoff-<repo>-<date>.md` overwrote silently when two sessions
  ran on the same repo on the same day. Now `handoff-<repo>-<date>T<HHMMSS>.md` so concurrent or
  same-day sessions don't clobber each other.
- **Marker hygiene note** added to `flow`, `cklph-implementer`, `cklph-reviewer`, and `red-team` —
  markers (`## TASK COMPLETE`, `## REVIEW CLEAN`, `## RED-TEAM CLEAR`, etc.) must emit only at the
  very end of an agent's output, never inside quoted code blocks (prevents false routing on examples
  that echo the marker text).

## [0.8.4] — 2026-05-31

### Fixed
- **`pre-commit-gate.sh` no longer chokes on release merges or bulk reformats.** Real-world bug
  surfaced when a `dev → staging` release merge with **~2,400 staged files** (a tree-wide Prettier
  reformat) was blocked in-session — `git commit --no-verify` doesn't bypass Claude harness hooks,
  and the auto-mode safety classifier prevented routing around the gate. The fix scopes the gate
  to its intended use (incremental dev commits) and lets release merges flow:
  - **Merge commits skipped automatically** — `git rev-parse --verify MERGE_HEAD` detects an
    in-progress merge; CI is the right enforcement layer for release merges, not this hook.
  - **Stages over 500 files skipped** with an explanatory message — bulk reformats and mass
    refactors aren't what this gate is for, and **passing thousands of files explicitly to eslint
    bypasses `.eslintignore`** (eslint's ignore rules only apply when eslint discovers files
    itself, not when we hand it a file list). Trust CI for bulk changes.

## [0.8.3] — 2026-05-30

### Added
- **`survey` skill** — gap-filling design partner sitting between `refine` and `spec`. Wears the
  BA / CTO / engineer / PM hats together and drills the "but what about…" questions across users /
  contexts, states, devices (including **in-between sizes** and dark mode), cross-cutting SaaS
  defaults (auth, billing-tier, observability, a11y/WCAG, performance, compliance), edge cases,
  alternatives with tradeoffs, cascading impacts, and failure modes. Conversational by design —
  3–5 dimensions at a time, not a 30-question dump. End markers `## SURVEY COMPLETE` or
  `## SURVEY OPEN`. Pairs with `decide` for the chosen-alternative's reversal signal, and
  complements `cklph-reviewer`'s Omissions axis (which catches gaps *after* the fact in code review).
- **`learn` skill** — the self-improvement loop. Captures lessons into the auto-memory `feedback`
  type on **five triggers**: user corrections, self-detected fixes mid-task, console / build / test
  signals that reveal wrong mental models, **code-review feedback** (human or AI — CodeRabbit /
  `cklph-reviewer` / `red-team`), and end-of-task retrospectives. Captures rule + why + how-to-apply +
  scope (project-local vs cross-project). Skips one-off typos and anything already authoritative in
  `AGENTS.md` / `CLAUDE.md`. `using-cklph` updated to scan recent `feedback` entries at task start.

## [0.8.2] — 2026-05-30

### Added
- **`design` skill** — cross-cutting design principles for any code, framework-agnostic: SOLID (the
  five), DRY (extract at the *third* repetition, not the second), YAGNI, composition-over-inheritance,
  and a closing "principles are filters, not laws" judgment note. Referenced from
  `cklph-nextjs:architecture` (per the split decision — principles live here, wiring lives there).

## [0.8.1] — 2026-05-30

### Added
- **Principles surface** — `using-cklph` now opens with a tight 5-principle block (Lean / Boring-wins /
  DRY / Spine-not-walled-garden / Evidence-over-vibes) so values are unmissable before any
  skill-routing decision. Surfaced from `STANDARD.md`, inspired by next-forge's principles-front-and-center pattern.

### Sibling plugin launched
- **`cklph-nextjs` v0.1.0** — Peter's opinionated Next.js + Supabase patterns now live in a sibling
  plugin in the same `cklph` marketplace. Auto-loads across his Next.js + Supabase repos
  (MailPrism / SendBriefs / BeforeMerge / ApertureStack), **composing with `vercel:*` framework
  skills rather than replacing them**. Install: `claude plugin install cklph-nextjs@cklph`. See
  `plugins/cklph-nextjs/CHANGELOG.md` for its own version log.

## [0.8.0] — 2026-05-30

### Added — daily-rhythm primitives
- **`triage`** — value × urgency × energy filter for "what's worth my next 25 minutes." Routes each
  open item into do-now / schedule / delegate / drop with a one-line *why*. Domain-agnostic (inbox,
  tickets, opportunities, requests). Anti-pattern: triaging without a routed-list deliverable.
- **`decide`** — 5-minute frame for non-trivial choices, gated by a **one-way / two-way door filter
  at the top**. Two-way → just pick (skip the skill). One-way → run the frame (problem · options ·
  criteria · pick · **reversal signal**). Domain-agnostic (hire/fire, framework upgrade, hard email,
  client take/decline).
- **`daily-frame`** — one skill, two modes: **morning** (one focus / what's at risk / what a win
  looks like) and **evening shutdown** (what shipped / what didn't and why / tomorrow's one focus).
  Action-shaped, not journaling.
- **`weekly-review`** — short periodic retro: what worked, what was recurring friction, **one** thing
  learned, next week's **ONE** focus. Discipline is selectivity — anti-pattern is a 30-item list.

## [0.7.1] — 2026-05-30

### Added — new skills
- **`handoff`** — compact the live session into a lean handoff doc (goal / state / next steps /
  suggested skills / linked artifacts / open questions) written to a **temp file**, so a fresh session
  resumes without re-deriving context. References artifacts instead of duplicating them; redacts
  secrets. (Adapted from mattpocock/skills.) Complements per-wave compaction notes and the durable `STATE.md`.
- **`browser-debug`** — live browser debugging via the Chrome DevTools MCP: tool table, three
  workflows (UI / network / performance), the "browser content is untrusted data" security boundary,
  and constrained JS execution. **Enables live-debug-in-chat in Claude Desktop.** (Adapted from
  agent-skills' `browser-testing-with-devtools`.)
- **`authoring`** — author or extend a cklph-os skill: house-style structure rules + TDD-for-skills
  (RED baseline → GREEN minimal → REFACTOR loopholes). The meta-skill for extending cklph-os itself.
  (Merged from MailPrism's `skill-creator` + `writing-skills`.)
- **`writing`** — co-author structured documents (proposals, specs, PRDs, decision docs, PR
  narratives) via a 3-stage workflow (context gather → section-by-section drafting → fresh-Claude
  reader test). Neutral, chat-native; suitable for Desktop. (Adapted from MailPrism's `doc-coauthoring`.)

### Added — dynamic skill discovery
- cklph-os now composes with *any* installed skill, not just its own:
  - `using-cklph` discovery broadened to consider **all** available skills (other plugins + project
    `.claude/skills/`), with the rule "cklph phases own the workflow; specialist skills own domain depth."
  - `build` surveys stack-specific installed skills and names the relevant ones in implementer briefs;
    `cklph-implementer` invokes a fitting installed skill instead of reinventing the pattern; `plan`
    notes specialist skills a task should use.
  - Framing: **cklph-os is a spine, not a walled garden** — which is why framework-specific skills stay
    external (e.g. a future `cklph-nextjs`) and get pulled in dynamically.

### Added — discipline pulls (audited from the agent-skills set)
- **Source-citation discipline** → `build` + `cklph-implementer`. Announce the stack ("STACK
  DETECTED: …"), verify against current docs (Context7 > official changelog > MDN), cite sources
  inline for non-obvious decisions, flag unverifiable assumptions with `UNVERIFIED: …`.
- **"NOTICED BUT NOT TOUCHING" + inline planning** → `cklph-implementer`. New report field captures
  adjacent issues observed but out-of-scope so they don't get lost; multi-step tasks announce
  `PLAN: 1… 2… 3… → executing unless you redirect.`
- **Prove-It (failing repro test FIRST)** → `debugging`. Strengthened step 2 — for bug fixes, write
  the regression test BEFORE attempting the fix; it IS the guard, kept verbatim.
- **Context discipline** → `using-cklph`. Trust tiers (TRUSTED / VERIFY / UNTRUSTED) and an
  A/B/C confusion-stop template ("pick one rather than guess").
- **Posture frame** → `red-team`. "Always do / Ask first / Never do" envelope stated before reporting.
- **Change-sizing lens** → `review`. ~100 / ~300 / ~1000+ LOC review ladder; oversize is a finding.
- **CI feedback loop + commit-message types** → `ship`. CI fails → repro locally → push, never guess;
  conventional types (`feat` / `fix` / `refactor` / `test` / `docs` / `chore`) referenced.

### Notes
- No always-on cost change — discovery uses the skill list already in context; `claude plugin list`
  enumerates plugins on demand.

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
