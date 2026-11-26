---
name: design-lint
description: Run deterministic type, layout and page-shape checks on a live page (impeccable plus Hallmark's page checker, no AI model) and triage what they find. Use before a release or a client hand-off, as a CI gate on preview URLs, or when asked to "lint the design" or "check for AI slop".
---

# design-lint: fast, repeatable checks of type, layout and page shape

`visual-verify` proves a page matches a design. This catches the problems nobody asked about:
cramped line height, lines too long to read, a page that scrolls sideways on a tablet, a hero that
doesn't fit a laptop screen, a page that ends on the wrong thing. Two detectors, both pinned, no AI
model, the same result every run:

| Detector | Catches best | Time |
|---|---|---|
| `impeccable` 4.10.0 (62 rules) | Readability: leading, line length, cramped padding, stub lines | ~11s a width |
| Hallmark's `sloplint` (render tier, via `hallmark-lint`) | Layout at 8 widths (320 to 1920): sideways scroll, container width, wrapping buttons, section count, words per screen, how the page ends | ~20s |

Run both. In the first trial (chykalophia.com, 2026-11-21) each caught real problems the other
missed: impeccable found long lines and cramped table cells, and Hallmark found a 37px sideways
scroll at 768px.

## Run it

```bash
export DO_NOT_TRACK=1 IMPECCABLE_NO_TELEMETRY=1 npm_config_ignore_scripts=true
F="${CLAUDE_PLUGIN_ROOT}/scripts/lint-filter.mjs"
URL='https://staging.site/page?v=1'
worst=0
for vp in 1440x900 1920x1080 768x1024 390x844; do
  rc=0; npx --yes impeccable@4.10.0 detect "$URL" --viewport "$vp" --json > "/tmp/lint-$vp.json" || rc=$?
  if [ $rc -eq 1 ]; then echo "impeccable could not scan $vp"; worst=1; continue; fi
  rc=0; node "$F" --tool impeccable < "/tmp/lint-$vp.json" || rc=$?
  if [ $rc -eq 1 ]; then worst=1; elif [ $rc -eq 2 ] && [ $worst -eq 0 ]; then worst=2; fi
done
rc=0; "${CLAUDE_PLUGIN_ROOT}/scripts/hallmark-lint" "$URL" || rc=$?
if [ $rc -eq 1 ]; then worst=1; elif [ $rc -eq 2 ] && [ $worst -eq 0 ]; then worst=2; fi
echo "design-lint: exit $worst"
exit "$worst"
```

The whole run's result is the worst of the five: 1 if any scan failed, else 2 if anything is left
to check, else 0. Every scan runs even after one fails, and the loop is safe under `set -e`.

- Check all four widths. Desktop and phone alone miss tablet-only bugs, and a wide monitor shows
  whether the content width is capped.
- Pin the versions. A new rule set changes what passes; bump it on purpose and re-check the known
  false positives. `hallmark-lint` pins Hallmark to one commit and fetches only its scripts the
  first time it runs. impeccable 4.10.0 flags a side bar on a rounded box whether it is a border, an
  inset shadow or a pseudo-element, and no longer flags one on a square box.
- impeccable's npm package is a launcher for a native binary, which comes from a per-platform
  optional dependency or a one-time download into `~/.impeccable/bin/<version>/`.
  `npm_config_ignore_scripts` stops neither. Set `IMPECCABLE_BIN` to a binary you already have to
  skip both.
- Scan URLs, not source files. A file scan has no real layout. Hallmark's source scan also expects
  its own token file and stamp comment, so it fails nearly every real project; don't use it.
- Both see what a logged-out visitor sees, like `shot`. Point them at a published or preview URL.
- `hallmark-lint` saves Hallmark's screenshots (folds at 1280, 1440 and 1920, full pages at 1440 and
  375) and prints the folder. Look at them before you report.
- In a container running as root, `hallmark-lint` adds Chrome's `--no-sandbox` for you.
- Exit codes (both, after the filter): 0 nothing to check, 2 findings to check, 1 a page couldn't be
  scanned. Report an exit 0 as "scanned these URLs at these widths, nothing to check", never as
  "clean": the detectors check their rules, not the page.
- `--scope type` or `--scope layout` limits impeccable to one domain, for a pass that only touches
  type or spacing.

## The site's exceptions file

Each site keeps its deliberate brand choices in `.cklph/design-exceptions.json` at the repo root.
`lint-filter.mjs` and `hallmark-lint` read it from the current directory. Matching findings move to
an "excused" list that shows the reason, so the report stays honest about what was skipped.

```json
{
  "exceptions": [
    { "tool": "impeccable", "rule": "kicker-above-heading", "reason": "Crimson section eyebrows are the brand's section labels." },
    { "tool": "impeccable", "rule": "italic-serif-display", "reason": "One italic serif phrase per headline is the brand voice." },
    { "tool": "hallmark", "rule": "49b", "match": "Data Storytelling", "reason": "Long service name, wraps on purpose in the footer." }
  ]
}
```

- Every entry needs a `reason`. The filter refuses an entry without one.
- `rule` is impeccable's `antipattern` or Hallmark's gate number, as the report prints it.
- `match` is optional. It limits the entry to findings whose text contains it, so you can excuse one
  element without excusing the rule everywhere.
- Add an entry only with a reason the client or Peter agreed to, and say so in the PR. A long list is
  a house style, which belongs in the site's `DESIGN.md` (see `cklph-figma:design-md`).
- impeccable's own `.impeccable/config.json` `ignoreRules` still works, but it hides findings with no
  reason. Prefer the shared file.

## The DESIGN.md drift check

If the repo has a `DESIGN.md` (see `cklph-figma:design-md`), impeccable reads its frontmatter tokens
and flags live values outside them: `design-system-color`, `design-system-font`,
`design-system-radius` and `design-system-font-size`. On a WordPress or Elementor site this is a
free check that the page still uses the Kit. Expect hits from third-party plugin CSS (forms,
sliders, cookie banners): excuse those in the exceptions file with the plugin named and a `match`,
and fix the ones in theme or Elementor CSS.

It also reads the prose: a pattern the "Do's and Don'ts" section allows on purpose stops impeccable's
matching slop finding (Hallmark doesn't read it, so keep the exceptions file as the one record).
Tonal ramps and shadows that don't fit the frontmatter go in `.impeccable/design.json`.
`--no-design-system` turns all of this off.

## Triage

The filter sorts every finding into three groups:
- **Check and fix or dismiss**: impeccable `quality` findings and Hallmark `FAIL`s. Check each one,
  then fix it or dismiss it with a reason. Look before fixing: crop the area with `shot` and confirm
  the problem is visible.
- **Taste, for a person to judge**: impeccable `slop`, Hallmark `REFLEX` and `WARN`. An eyebrow label
  or an italic serif headline can be the brand's real voice. Report them as a list; never fail a build
  on them.
- **Excused**: listed with the site's reason. Nothing to do.

Access findings are never taste, even when they land in the taste group: failed contrast, text too
small to read. Check them like quality findings. The detectors can't see honesty problems (an
invented metric, a form that claims it sent); check those by hand against `cklph-os:frontend-ui`'s
`references/ai-tells.md`.

Known false positives:
- impeccable: tiny hatched calendar squares read as a "cyan gradient"; inline sentence chips flagged
  as cramped. Element findings report `"line": 0`, so find the element by its `selector` and `snippet`.
- Hallmark: gate 26a (focus ring contrast) can measure against the wrong surface. On chykalophia.com it
  reported 1.73:1 for a white ring that sits on navy. Tab to the element and look before you trust it.
- Hallmark's design rules (no eyebrows, no italic word in a heading, ~80 words a screen, 6 to 9
  sections) are its own house style. Use them as questions, not orders.

## As a CI gate

On a preview URL, fail the job on exit 2. impeccable's `--github` flag posts annotations, but
bypasses the exceptions file, so run the filter for the gate and `--github` only for annotations.
`--sarif` (for GitHub code scanning) bypasses it the same way:
`npx impeccable@4.10.0 detect --sarif <url> > impeccable.sarif || test $? -eq 2`, uploaded with
`github/codeql-action/upload-sarif` (`category: impeccable`).

For one element in source you control, an inline `impeccable-disable` comment also works, but has
no reason attached; prefer the exceptions file. Run `--report-unused-ignores` now and then to find
inline ignores that no longer waive anything.

## What not to use

- impeccable: only the `detect` command. Don't install its skills. Most of `critique` and `audit`
  is a generic checklist that `cklph-os:frontend-ui` covers, and the rest assumes a local dev server
  or impeccable's account, which Elementor pages don't have. Lift a good idea into our own files
  instead (the drift model in `polish`, critique's rule that the reviewer finishes before it sees
  detector output).
- Don't run `impeccable login` or `impeccable loop` on a work machine. Login links an impeccable
  account and then offers to write its own block into each agent's rule file (`~/.claude/CLAUDE.md`
  and the like).
- Hallmark: only `sloplint --url` through `hallmark-lint`. Don't install the Hallmark skill. Its
  theme catalog and build flow restyle a page into Hallmark's house style, which overrides a client's
  brand. Its image generator calls a paid API and is never run.
- Neither replaces a real WCAG audit. Contrast here is a smoke test, and `cklph-figma:design-md`
  checks the token pairs properly.
- Neither reads the words. Run `copy-lint` for wording giveaways ("X, not Y" headings, stock AI
  words, repeated guarantee blocks).
