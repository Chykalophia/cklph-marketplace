# cklph-os

The dev-workflow spine of the cklph marketplace: a phase loop, adversarial review agents,
daily-rhythm skills and quality-gate hooks. The marketplace [README](../../README.md) has the
overview, the phase table and the hook list; this file is the inventory.

## Install

```bash
/plugin marketplace add Chykalophia/cklph-marketplace
/plugin install cklph-os@cklph
```

Restart the CLI afterwards. Hooks are CLI-only. Skills, commands and agents are expected to load in
Claude Desktop through the marketplace too; STANDARD.md §3 tracks that as still to be verified.

## What's inside

| Kind | Contents |
|---|---|
| Phase loop | `refine` → `spec` → `plan` → `build` → `review` → `verify` → `ship`, chained by `flow` (`/cklph-os:flow <goal>`). `survey` fills scope gaps by hand between `refine` and `spec`. |
| Agents | `cklph-implementer` (one task per dispatch), `cklph-reviewer` (code review and plan-check), `red-team` (high-stakes review) |
| Daily rhythm | `triage`, `decide`, `daily-frame`, `weekly-review`, `learn`, `stocktake` |
| Engineering | `api-design`, `debugging`, `browser-debug`, `click-path-audit`, `design`, `frontend-ui`, `performance`, `security-hardening`, `simplify` |
| Working style | `start-here` (read first: instruction priority and routing), `reply-shape`, `writing`, `handoff`, `harness-limits`, `authoring` |
| Hooks | `pre-commit-gate`, `nextjs-quality-check`, `security-check`, `destructive-command-gate`, `skill-usage-log`, `reply-shape-context`, `gateguard` (opt-in) |

## GateGuard (opt-in)

`hooks/gateguard.sh` denies the first Write/Edit to each file in a session and asks the agent to
state the facts the edit depends on (importers, affected exports, the data's real shape, your
instruction quoted verbatim). The retry goes through regardless: it prompts the investigation, it
does not check it. Off by default. Turn it on per project in
`.claude/settings.local.json`:

```json
{ "env": { "CKLPH_GATEGUARD": "sensitive" } }
```

`sensitive` gates only money, auth, migration, secret and CI paths; `all` gates every file in the
project. `CKLPH_GATEGUARD_EXEMPT="docs/*:*.lock"` skips paths. Denials are logged (no paths) to
`~/.claude/cklph-usage/gateguard.jsonl` (or `$CKLPH_USAGE_DIR`) for the weekly review. Full rules: the hook's header.

## Tests

```bash
bats test/                                                   # hook tests, from the repo root
bash plugins/cklph-os/hooks/tests/destructive-command-gate.test.sh   # the gate's own suite
bash plugins/cklph-os/hooks/tests/gateguard.test.sh                  # GateGuard's suite
```

Set `GATE_TIME_SCALE=3` on a slow or loaded machine; the timing limits are tuned on an
Apple-silicon Mac.

## History

[CHANGELOG.md](./CHANGELOG.md). Adapted material is credited in a `NOTICE.md` beside it: in each
adapted skill's folder, `hooks/NOTICE-destructive-command-gate.md` and `hooks/NOTICE-gateguard.md`.
