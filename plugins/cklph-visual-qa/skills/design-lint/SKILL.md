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
npx --yes impeccable@4.10.0 detect 'https://staging.site/page?v=1' --json > /tmp/lint-desktop.json
npx --yes impeccable@4.10.0 detect 'https://staging.site/page?v=1' --viewport 390x844 --json > /tmp/lint-mobile.json
```

- Pin the version. A new rule set changes what passes; bump it on purpose and re-check the known
  false positives below. 4.10.0 changed side-bar detection: a bar on a rounded box is flagged
  whether it is a border, an inset shadow or a pseudo-element, and a bar on a square box no longer is.
- The npm package is a launcher for a native binary. It comes from a per-platform optional
  dependency, or is downloaded once into `~/.impeccable/bin/<version>/`. `npm_config_ignore_scripts`
  does not stop either. Set `IMPECCABLE_BIN` to a binary you already have to skip both.
- Scan URLs, not source files. A file scan has no real layout, and in our trial it reported a
  contrast failure the live scan correctly dropped.
- URL scans need Chrome and see what a logged-out visitor sees, like `shot`. Point it at a published
  or preview URL. Cookie banners (OneTrust, Cookiebot and similar) and product tours are hidden
  before the scan, so they don't produce findings.
- Exit codes: 0 no findings, 2 findings, 1 a target couldn't be scanned. Advisory findings never
  change the exit code. Report an exit 0 as "scanned these URLs at these widths, no findings", never
  as "clean": the detector checks 62 rules, not the page.
- `--scope type` or `--scope layout` limits the report to one domain, for a pass that only touches
  type or spacing.

## The DESIGN.md drift check

If the repo has a `DESIGN.md` (see `cklph-figma:design-md`), the detector reads its frontmatter
tokens and flags live values outside them: `design-system-color`, `design-system-font`,
`design-system-radius` and `design-system-font-size`. On a WordPress or Elementor site this is a
free check that the page still uses the Kit. Expect hits from third-party plugin CSS (forms, sliders,
cookie banners); dismiss those with the plugin named, and fix the ones in theme or Elementor CSS.

It also reads the prose. A pattern the "Do's and Don'ts" section allows on purpose (a documented
`.eyebrow`, say) stops the matching slop finding. Tonal ramps and shadows that don't fit the
frontmatter go in a sidecar, `.impeccable/design.json`. `--no-design-system` turns all of this off.

## Triage

Each finding has `category`: `quality` (readability and layout) or `slop` (looks generated).
- **quality**: check each one, then fix or dismiss with a reason. Look before fixing: crop the area
  with `shot` and confirm the problem is visible.
- **slop**: report them as a list for a human. Some are the brand's real voice. When the brand calls
  for one, `cklph-os:frontend-ui`'s `references/ai-tells.md` says how to record that once, so the
  finding stops coming back.
- **Access** findings are never taste, even in the slop list: failed contrast, illegible text. Fix
  them. The detector can't see honesty problems (an invented metric, a form that claims it sent);
  check those by hand against `ai-tells.md`.

Known false positives from trying it on our sites: tiny hatched calendar squares read as a "cyan
gradient", inline sentence chips flagged as cramped. Element findings report `"line": 0`, so find the
element by its `selector` and `snippet`.

## As a CI gate

On a preview URL, fail the job on exit 2 and post annotations with `--github` (not with `--json`).
For GitHub code scanning, write `--sarif` instead:
`npx impeccable@4.10.0 detect --sarif <url> > impeccable.sarif || test $? -eq 2`, then upload it with
`github/codeql-action/upload-sarif` (`category: impeccable`).

Keep project exceptions in the client repo's `.impeccable/config.json`:

```json
{ "detector": { "ignoreRules": ["hero-eyebrow-chip"] } }
```

Add a rule there only with a reason in the PR. `impeccable ignores` edits the same file. For one
element, an inline `impeccable-disable` comment beats a project-wide ignore. Run
`--report-unused-ignores` now and then to find exceptions that no longer waive anything.

## What not to use

Only the `detect` command. Don't install impeccable's skills. Most of `critique` and `audit` is a
generic checklist that `cklph-os:frontend-ui` covers, and the rest assumes a local dev server or
impeccable's account, which Elementor pages don't have. Lift a good idea into our own files instead
(the drift model in `polish`, critique's rule that the reviewer finishes before it sees detector
output).

Don't run `impeccable login` or `impeccable loop` on a work machine. Login links an impeccable
account and then offers to write its own block into each agent's rule file (`~/.claude/CLAUDE.md`
and the like).

It doesn't replace a real WCAG audit either; contrast here is a smoke test, and
`cklph-figma:design-md` checks the token pairs properly.
