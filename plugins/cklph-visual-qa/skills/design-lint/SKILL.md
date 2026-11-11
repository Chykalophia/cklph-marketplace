---
name: design-lint
description: Run a deterministic type and layout check on a live page with the impeccable detector (no AI model) and triage what it finds. Use before a release or a client hand-off, as an optional CI gate on preview URLs, or when asked to "lint the design", "check type and layout", or "run impeccable".
---

# design-lint: a fast, repeatable check of type and layout

`visual-verify` proves a page matches a design. This catches the problems nobody asked about:
cramped line height, lines too long to read, overflowing content, broken images, illegible text.
It uses the `impeccable` detector: 62 fixed rules, no AI model, the same result every run, about 11s
per URL.

## Run it

```bash
export DO_NOT_TRACK=1 IMPECCABLE_NO_TELEMETRY=1 npm_config_ignore_scripts=true
npx --yes impeccable@4.8.2 detect 'https://staging.site/page?v=1' --json > /tmp/lint-desktop.json
npx --yes impeccable@4.8.2 detect 'https://staging.site/page?v=1' --viewport 390x844 --json > /tmp/lint-mobile.json
```

- Pin the version. A new rule set changes what passes; bump it on purpose.
- Scan URLs, not source files. A file scan has no real layout, and in our trial it reported a
  contrast failure the live scan correctly dropped.
- URL scans need Chrome and see what a logged-out visitor sees, like `shot`. Point it at a published
  or preview URL.
- Exit codes: 0 clean, 2 findings, 1 a target couldn't be scanned. Advisory findings never change
  the exit code.
- If the repo has a `DESIGN.md` (see `cklph-figma:design-md`), the detector reads it for context.
  `--no-design-system` turns that off.

## Triage

Each finding has `category`: `quality` (readability and layout) or `slop` (looks generated).
- **quality**: check each one, then fix or dismiss with a reason. Look before fixing: crop the area
  with `shot` and confirm the problem is visible.
- **slop**: taste, not a bug. An eyebrow label or an italic serif headline can be the brand's real
  voice. Report them as a list for a human to judge; never fail a build on them.

Known false positives from trying it on our sites: tiny hatched calendar squares read as a "cyan
gradient", inline sentence chips flagged as cramped. Element findings report `"line": 0`, so find the
element by its `selector` and `snippet`.

## As a CI gate

On a preview URL, fail the job on exit 2 and post annotations with `--github` (not with `--json`).
Keep project exceptions in the client repo's `.impeccable/config.json`:

```json
{ "detector": { "ignoreRules": ["hero-eyebrow-chip"] } }
```

Add a rule there only with a reason in the PR. `impeccable ignores` edits the same file.

## What not to use

Only the `detect` command. Don't install impeccable's skills: its `audit` and `critique` are
checklist prompts that `cklph-os:frontend-ui` already covers. It doesn't replace a real WCAG audit
either; contrast here is a smoke test, and `cklph-figma:design-md` checks the token pairs properly.
