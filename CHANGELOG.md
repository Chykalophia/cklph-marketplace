# Changelog

All notable changes to cklph-os are documented here.
Format: [Keep a Changelog](https://keepachangelog.com); versioning follows [SemVer](https://semver.org).

## [0.12.2] — 2026-10-27

Review follow-ups to 0.12.1 (PR #33's open review threads).

### Fixed — destructive-command gate
- `xargs GIT commit --no-verify` (any capitalisation of the git word) was allowed by 0.12.1 and
  blocked by 0.12.0. Blocked again.
- Shell options before `-c` inside `docker`/`podman`/`kubectl exec` (`bash -x -c "…"`,
  `sh -euxo pipefail -c "…"`, `bash -xO extglob -c`, `bash --rcfile f -c`) now get the nested check.
  Each word is scanned once: a draft that rescanned from every shell-named option value took 47 s
  on `docker exec db bash -o bash -o …`; that shape is now a timing case (0.5 s).
- Each new case failed on the 0.12.1 gate first. Suite: 384 → 398 cases.
- The suite's timing limits scale with `GATE_TIME_SCALE` (whole number, default 1) for slower runners.

### Changed — written rules and skills
- `security-hardening` and the `AGENTS.md` template list `rm -r` as well as `rm -rf`, plus the
  `$HOME`, `..` and `/*` targets the gate already blocked; the mirror test checks for them. The
  template names each `… publish` command in full.
- `survey` (brownfield): repo scripts run only in a disposable sandbox, otherwise those checks
  are recorded as not run; adds `composer install --no-plugins --no-scripts`; the completion
  marker needs only the go-aheads the register actually requires.
- `review` two-reviewer gate: input validation and authorization are separate checks, each with an
  objective surface test and its own N/A; the reviewer prompt allows N/A.
- `verify`: observed behavior is required for any criterion no executable check exercises.
- `spec`: the example verify step uses the repo's own test script, not `npx vitest`.
- `click-path-audit`: separates overlapping mutations from read-after-write lag, with a fix for each.

## [0.12.1] — 2026-10-26

### Fixed — destructive-command gate (follow-up to the PR #24 review)
On the 0.12.0 gate, 134 of the 384 cases in the new suite fail: 115 destructive commands let
through, 18 ordinary commands blocked, and one timing case over its limit. Each fix below was a failing test first. Suite: 124 → 384 cases, passing on
bash 3.2.57 and 5.2.26; `test/hooks.bats` passes except its pre-existing NUL-byte case on Alpine/BusyBox.
- **Hidden behind shell syntax:** commands inside `for`/`while`/`until` … `do`, `if` … `then`/`else`,
  `{ …; }` and after `!`; behind leading or glued redirections (`>/dev/null git …`, `2>&1 git …`,
  `<<< x git …`, `git reset --hard>/dev/null`); split by line continuations; uppercase (`GIT`,
  macOS file systems are case-insensitive); and after `$((1<<2))`, `$[1<<2]` or `${x:-<<EOF}`, which
  are not heredocs. A heredoc inside `$( )` (the `git commit -m "$(cat <<'EOF' …)"` idiom) is still
  tracked, also when closed by `EOF)`, and a quoted `}` in `${BODY:-'{}'}` no longer ends the expansion.
- **Wrappers and command strings:** `env -iS`/`-vS`/`-P`, options between `-c` and the script
  (`bash -c -- '…'`, `-co pipefail`, `-Ec`), `eval --`, `su -c`/`-lc`, `watch`, `bun exec`, `npm exec`,
  `stdbuf`, `ionice`, `chrt`, `setsid`, `caffeinate`, `builtin`, GNU long-option prefixes
  (`sudo --us`), `x+=1` assignments, shells inside `docker`/`podman`/`kubectl exec` and behind
  `docker run --entrypoint sh`.
- **git:** the shortest prefixes git accepts (`reset --h`, `clean --f`, `push --m`, `restore --w`,
  `am --no-v`), short clusters (`commit -nm`, `clean -fdx -e.env`), `push --prune`, `+ref` after `--`,
  `checkout -p .` (piping `yes` defeats the prompt), `--config-env`/`--attr-source` before the
  subcommand, and `--no-verify` on git run through `xargs` or `find -exec`.
- **rm, chmod, SQL:** `~/.*`, `/.*`, `.?*`, `{.,}*`, `*/`, `**`, `--recur`; any world-writable chmod
  (`666`, `1777`, `2`, `o+w`, `o-x+w`; net effect, so `a+rwx,o-w` passes); quote-split SQL piped
  into a client, `DROP/**/TABLE`, clients run by path inside `docker exec|run`;
  `supabase db reset --linked=true`.
- **No longer blocked:** `rg -- "--no-verify"` and `git grep`/`git log` searching for it (checked on
  git options only), `git commit -m "- fix"` / `-uno` / `-S<key>` (option values are skipped),
  `npm run publish` / `npm run -w pkg publish`, `chmod 644 2`, `docker run -d mysql` and
  `docker logs mysql` (an image or container name is not a SQL client), MySQL `TRUNCATE(` .
- **Speed:** a 58 KB command checks in ~0.4 s and 2000 chained commands in ~3-5 s; timing tests cover
  a long command, many SQL clients and many capitalised words. The header gives the shapes that are
  still slow, and the remaining known gaps are listed under DOES NOT CATCH.

### Changed
- The `security-hardening` table and the `AGENTS.md` template mirror the gate's full list, and the
  suite fails if either drops a listed rule (STANDARD.md names this as the one-owner exception).
- `verify`, `ship` and `spec` point to one evidence rule (`verify/rationalization-patterns.md`);
  `ship` re-runs `verify` after a two-reviewer fix round; brownfield `survey` covers pnpm/Yarn 2+
  install flags and `pre`/`post` scripts, and ends with the SURVEY markers.

## [0.12.0] — 2026-10-26

### Added
- **`reply-shape` skill**: a reply contract. Answer or next action first, state restated each turn,
  numbered steps, real-unit time estimates, visible wins, side issues once at the end, a pre-send
  first/last-line check. Scoped to replies *to the user*; never reshapes emails or docs written for
  others. Adapted from `ayghri/i-have-adhd` (MIT, `NOTICE.md`) rather than installing it, so no
  third-party hooks run.
- **`hooks/reply-shape-context.sh`**: SessionStart hook (`startup|resume|clear|compact|fork`) that prints
  the skill body into context, so the contract is always on in the CLI and survives `/compact`.
  Read-only, no network, fails open. **Opt out with `CKLPH_REPLY_SHAPE=off`**, since this plugin is
  public and the hook shapes every installer's sessions.

### Changed
- `start-here` gains a routing row and a "Reply shape" section, including the Desktop/Cowork fallback.

## [0.11.1] — 2026-10-26

### Fixed
- **`pre-commit-gate.sh` was skipped for `cd repo && git commit` and `git -C repo commit`.** The
  matcher now finds `git commit` after any separator, behind `VAR=value` prefixes, an absolute git
  path and git's global options, quoted values included (`-C "dir with spaces"`, `-c k="a b"`,
  `--git-dir /p`). The checks run inside the repo being committed: the payload's `cwd`, then each
  `cd <dir>` before the commit, then `-C` (so `cd a && git -C b commit` checks `a/b`); `~`, `$HOME`
  and `${HOME}` are expanded. When the dir can't be worked out (`$VAR`, `$(…)`, `--git-dir`, a cd
  next to a subshell, a missing dir) the gate blocks and asks for a plain `cd <repo> && git commit`
  instead of checking the session's repo.
- **`security-check.sh` missed single-quoted secrets.** `["\x27]` is not a quote class to BSD or
  GNU grep; patterns now use a real `'` via `$'…'` and `[[:space:]]`. Warnings report line numbers
  instead of echoing the secret, bandit reports line and test id only, and gitleaks runs with
  `--redact`. `grep -a` keeps line numbers for files with a NUL byte; only the API key, password and
  secret/token checks are case-insensitive, so "a private key" in prose is no longer a hit.
- **`test/hooks.bats` assertions were toothless on macOS.** Under bash 3.2 a false `[[ … ]]` doesn't
  trip `set -e`, so output checks always passed locally. All output assertions now go through
  `has`/`hasnt` helpers that `return 1`. New tests cover both bugs above; they fail on 0.11.0.
- **`run-trigger-tests.sh` counted a crashed session as a miss**, so every near-miss case passed on
  a broken run. A missing result line, `"is_error":true` or a non-`success` subtype now reports
  `got=error` and fails. A tests file with no cases, or any `- ` line that isn't `- fire: ` /
  `- miss: `, exits 2 before running anything.
- **`stocktake`**: skills installed or updated less than 60 days ago are reported as "not judged
  yet" instead of joining the prune list; a failing `claude plugin list` puts an "Inventory
  incomplete" note with the reason in the report itself.
- **`skill-usage-log.sh`**: a `\"` in a payload value cut the field short and wrote an invalid line.
  Fields are now read as whole JSON strings and written back still escaped. It no longer logs a
  phantom skill when a prompt starts with a file path.
- **`browser-debug`** recommended `@anthropic/chrome-devtools-mcp@latest`, which doesn't exist on
  npm. It now pins the real package, `chrome-devtools-mcp@1.12.0`.
- **`destructive-command-gate.sh`** (reviews of #24 and #31): blocks `rm -rf .*` and other
  dot-globs (they delete `.git`); parses wrapper option values so `sudo -u root rm -rf /`,
  `env -u HOME …` and `nice -n 10 git reset --hard` reach the real command; checks `npx -c` /
  `env -S` command strings, attached forms too (`env -S'…'`, `--split-string=…`, `npx --call=…`);
  `chmod 00777`; SQL checked on de-quoted words too (`psql -c 'DR'"OP TABLE x"`); nesting deeper
  than 3 levels now blocks instead of allowing; skips WP-CLI global flags and `@alias` targets, so
  `wp --allow-root db reset` and `wp @prod db drop` are blocked; treats `timeout` as a wrapper (its
  duration is not the command). 124/124 cases pass.
- Skill docs (cubic review of #24): two-reviewer gate ends with the agents' real markers and an
  objective "fits the audience" check; `ship` accepts observed browser behavior as evidence and links
  `../review/two-reviewer-gate.md`; "pre-existing failure" is proven at the base revision in a clean
  worktree, not via `git stash`; brownfield runs an inherited repo's scripts only after inspection,
  with approval, isolated; `click-path-audit` no longer presents eager updaters as reliable and uses
  the v5 `invalidateQueries({ queryKey })` form; `spec` Must-not gate aligned with its rule.
- `security-hardening` states the gate needs `jq` or `python3` and fails open without both.
- `click-path-audit` also triggers on a `useEffect` that copies fetched data into local state.
- Docs: the two-strike prune rule applies only to a 60-day log and recommends, never deletes;
  `start-here` gains rows for `spec`, `plan`, `build`, `review` and `ship`; STANDARD §10 states the
  slash-command log records built-ins too.

## [0.11.0] — 2026-10-26

### Added — ECC ports, phase 1
- **`destructive-command-gate.sh` hook** (PreToolUse on `Bash`). Blocks, with a safer alternative in
  the message: recursive `rm` of `/`, `~`, `.`, `*` or the repo root; `git push --force`/`-f`/`+ref`
  (`--force-with-lease` passes); `git reset --hard`; `git checkout .` / `git restore .`; forced
  `git clean` without `-n`; `--no-verify` and `git commit -n`; `DROP TABLE`/`DATABASE`/`SCHEMA` and
  `TRUNCATE` through a SQL client; `wp db drop|reset`; `docker system|volume prune`; `chmod 777`;
  `npm|pnpm|yarn|bun publish` without `--dry-run`; `supabase db reset` with `--linked`, `--db-url` or
  `--project-ref`. Quote-aware tokenizer, so text in `echo`, `grep` or a commit message passes. JSON via
  jq, else python3, else fail open with a warning. ~26 ms per call, bash 3.2 compatible. Escape hatch:
  the literal prefix `CKLPH_ALLOW_DESTRUCTIVE=1 ` on that one command; an exported variable does
  nothing. 90-case test suite (`hooks/tests/`), wired into `test/hooks.bats`.
- **`click-path-audit` skill.** Map every store action's sets and out-of-scope resets, then trace each
  touchpoint's writes in order: does a later call undo an earlier one? Six patterns written for
  Zustand, TanStack Query (optimistic updates, `cancelQueries`, rollback, key mismatch) and React state.
- **`decide` → Council** (`decide/council.md`). Architect, Skeptic, Pragmatist, Critic, for one-way
  doors with real stakes only. The three outside voices are fresh subagents that see the extracted
  question and minimum context, never the conversation.
- **`review` → two-reviewer gate** (`review/two-reviewer-gate.md`). Two fresh reviewers, one written
  rubric, both must pass, at most 2 fix rounds, then escalate to Peter. Only for client-facing
  deliverables, security-sensitive diffs and anything published publicly.
- **`verify` → evidence check** (`verify/rationalization-patterns.md`). "Should work now", "I believe
  this fixes", "likely resolved" with no output from this session fail verify.
- **`survey` → brownfield mode** (`survey/brownfield.md`). For an inherited client site or repo: slice,
  audit with evidence, work backward through git, four-axis gap register (thinking, coding practice,
  missing features, technology).

### Changed
- `debugging` names `click-path-audit` as the move when the UI is wrong but every function works.
- `review` runs `click-path-audit` on diffs that touch shared client state, and gains the gate mode.
- `ship` blocks on `## GAPS FOUND` or an unevidenced "done", and runs the two-reviewer gate for the
  three categories above.
- `security-hardening` and `templates/AGENTS.md` carry the destructive-command rule as prose (hooks
  are CLI-only).
- `spec-authoring-rules.md`: numbered acceptance criteria with a **Must not** clause; business rules
  are confirmed or listed as assumptions, never inferred from code; unmet criteria are marked
  `[revised]`, not dropped.
- `templates/STATE.md` gains a "Removed on purpose" list; STANDARD.md §5 states one owner per fact.
- `survey` description now also triggers on an inherited client site or codebase.
- `start-here` routing table: rows for `click-path-audit`, brownfield `survey`, the council, the
  two-reviewer gate, the verify evidence check and destructive commands.

### Deferred
- delivery-gate's optional **Stop hook** was not built. The rationalization check lives in `verify`
  as prose; revisit a Stop hook (disabled by default) only if unevidenced "done" claims keep slipping
  through.

Adapted from: ECC `skills/council` (MIT), commit 25278e7 → `decide/council.md`.
Adapted from: ECC `skills/click-path-audit` (MIT), commit 25278e7 → `click-path-audit`.
Adapted from: ECC `skills/safety-guard` (MIT), commit 25278e7 → `hooks/destructive-command-gate.sh` + `security-hardening`.
Adapted from: ECC `skills/delivery-gate` (MIT), commit 25278e7 → `verify/rationalization-patterns.md`.
Adapted from: ECC `skills/santa-method` (MIT), commit 25278e7 → `review/two-reviewer-gate.md`.
Adapted from: ECC `skills/brownfield-retrospective` (MIT), commit 25278e7 → `survey/brownfield.md`.
Adapted from: ECC `skills/intent-driven-development` (MIT), commit 25278e7 → `spec/spec-authoring-rules.md` (three techniques only).
Adapted from: ECC `skills/living-docs-governance` (MIT), commit 25278e7 → `templates/STATE.md` "Removed on purpose" only.

## [0.10.0] — 2026-10-26

### Added — skill lifecycle and adoption loop
- **STANDARD.md §10 "Skill lifecycle"**: Intake → Port/Write → Wire → Prove → Measure → Prune, with a
  gate per stage and a definition of a useful skill. Applies to every skill, written or ported.
- **`skill-usage-log.sh` hook** (PostToolUse on `Skill`, plus UserPromptSubmit for typed
  `/plugin:skill` commands, which bypass the Skill tool). Appends one line per invocation to
  `~/.claude/cklph-usage/skills.jsonl`: timestamp, skill, via, repo directory name, session id. No
  paths or prompt text; never blocks; pure bash, ~15 ms.
- **`stocktake` skill** + stdlib `stocktake.py`: usage per skill over 7/30/60 days, a per-plugin prune
  list (provisional until the log covers 60 days), and trigger collisions (seeded known duplicates,
  same-named skills across plugins, description overlap). At most 3 recommendations.
- **`authoring/trigger-tests.md` + `run-trigger-tests.sh`**: the Stage 4 trigger test. Each prompt
  runs in a fresh `claude -p` session with only the plugin under test loaded.
- **`start-here` routing table**: one row per cklph-os skill, the Wire stage's first requirement.

### Changed
- `weekly-review` gains a fixed "Skill hygiene (5 min)" step that runs `stocktake`.
- `authoring` links the lifecycle and the trigger-test method, and adds both to its final checklist.
- `templates/AGENTS.md` states that skill usage is logged locally.

Adapted from: ECC `skills/skill-stocktake` + `skills/skill-comply` (MIT), commit 25278e7 → `stocktake`.

## [Unreleased] — 2026-10-26

### Removed
- Removed cklph-architect and cklph-eos from the public marketplace.

## [Unreleased] — 2026-06-09

### Added — new plugin
- **`cklph-regression-watch`** — on-demand site regression monitor (5th plugin). Baseline a live/staging site and surface only confirmed regressions (availability, SEO integrity, tracking tag-firing, visual, journeys) with evidence. Confirmation engine kills flakes; `regression-verifier` agent gates alerts. First executable plugin in the marketplace (Playwright + pixelmatch, under `plugins/cklph-regression-watch`).

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
  repo-specific budget that other repos shouldn't inherit). Now defaults to `0`; per-repo
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
  (every cklph-stack repo), **composing with `vercel:*` framework
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
  (Merged from an earlier project's `skill-creator` + `writing-skills`.)
- **`writing`** — co-author structured documents (proposals, specs, PRDs, decision docs, PR
  narratives) via a 3-stage workflow (context gather → section-by-section drafting → fresh-Claude
  reader test). Neutral, chat-native; suitable for Desktop. (Adapted from an earlier project's `doc-coauthoring`.)

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
