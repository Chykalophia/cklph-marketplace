---
name: design-md
description: Write, lint and contrast check a client's DESIGN.md, the agent-readable design tokens file (Google's design.md format). Use when asked to "write a DESIGN.md", create a "design tokens file", "document this client's design system", or "contrast check the tokens", and again whenever a client's tokens change.
---

# design-md: one tokens file per client, checked

A `DESIGN.md` is one markdown file: YAML tokens (colors, typography, rounded, spacing, components)
in the front matter, then prose sections. Agents read it before styling. The format is Google's
[design.md spec](https://github.com/google-labs-code/design.md) (Apache-2.0, still `version: alpha`).

The file lives in the **client repo**, at its root. Never in this marketplace.

## 1. Extract tokens from the real source

Copy values from where the site actually gets them. Never invent, round or "tidy" a value.
- **Tailwind / CSS** → the `@theme` block, `globals.css`, or the tokens package's `theme.css`.
- **Elementor** → the Kit's `custom_colors` / `custom_typography` (`cklph-elementor`, `elementor-templates`).
- **Figma** → `get_variable_defs` (`figma-tokens`).

Keep the code's token names. Say in `description` where the values came from and the date you copied them.

## 2. Harvest real pairs into `components`

The contrast check only sees pairs you declare, so declare the ones the site really renders.
Grep the components for `bg-* text-*` and their CSS twins (buttons, badges, links, banners,
footer, hero, muted text). Write each as a component with `textColor` and `backgroundColor`
references. Add a `typography` reference when the text is large: that is how our script knows to
use 3:1 instead of 4.5:1. A pair with no `typography` counts as normal text.

## 3. One file per theme or mode

The spec has no themes or modes. Write one file per theme (`DESIGN.md`, `DESIGN.dark.md`,
`DESIGN.<theme>.md`), each complete on its own. A separate marketing site with its own stylesheet
gets its own file too. Put sections you skip under `omitted:` with a reason.

## 4. Lint, pinned

```bash
npm_config_ignore_scripts=true npx --yes @google/design.md@0.4.0 lint DESIGN.md
```

Pin the version and never vendor it. Errors (a `{colors.x}` that does not resolve, a duplicate
key) must be fixed. "Defined but never referenced" warnings are noise for a full palette.

## 5. Run our contrast check

The linter's contrast rule is a smoke test. It ignores alpha, so fully transparent text passes and
a transparent background is judged against black. It uses 4.5:1 only, with no 3:1 for large text
or UI edges. Our script covers all three:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/contrast.mjs" --design-md DESIGN.md
node "${CLAUDE_PLUGIN_ROOT}/scripts/contrast.mjs" --design-md DESIGN.md --canvas "#fafaf7"
```

`--canvas` is the page color behind translucent backgrounds (default white). For pairs the
components block can't express, such as field borders or icons (`ui`, 3:1), or a pair on a
special canvas, write a JSON file and pass it instead:

```json
[{ "name": "field-border", "fg": "#908b86", "bg": "#ffffff", "size": "ui" }]
```

Exit 0 means every pair passes, 2 means at least one fails, 1 means bad input. `--json` prints
machine output. A failure is a finding for the client. Report it and don't edit the token to pass.

## 6. Diff against the live site

Tokens drift from what ships. Fetch the live CSS (cache-busted) and grep it for each hex:

```bash
curl -s "https://client.example/?v=$(date +%s)" | grep -o 'href="[^"]*\.css[^"]*"'
curl -s "<stylesheet url>" | grep -io '#1f3658' | head -1
```

A token missing from the live CSS is drift. Find out which side is stale before you change
anything.

## 7. Re-run on every token change

Re-run steps 4 to 6 whenever the source tokens change. To see what changed between versions:

```bash
npm_config_ignore_scripts=true npx --yes @google/design.md@0.4.0 diff DESIGN.old.md DESIGN.md
```

A pre-commit hook in the client repo can run the lint and the contrast check together.

## Visual twin

To give the client something to look at, publish the same tokens as a Claude Design System
artifact. The artifact is for people. `DESIGN.md` is the copy agents read, and it is the
one the checks run on.

## Don't

- Don't copy a brand's DESIGN.md from a public collection into a client repo.
- Don't trust a passing lint on its own. Run the contrast script too.
