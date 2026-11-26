---
name: copy-lint
description: Find the wording giveaways of AI-written copy ("X, not Y" headings, stock AI words, signposts, dashes, sections repeated across pages) on live pages or in Markdown/MDX files, with no AI model. Use before publishing copy or an article, after a copy pass, or when asked to "check the copy for AI slop".
---

# copy-lint: the wording checks the design tools miss

`design-lint` checks type, layout and page shape. Neither of its detectors reads the words. This
checks the words, with the same exceptions file and the same three-way triage.

```bash
S="${CLAUDE_PLUGIN_ROOT}/scripts/copy-lint.mjs"
B='https://staging.site'
node "$S" "$B/" "$B/about" "$B/pricing" "$B/contact"      # several pages, so repeats show up
node "$S" content/blog/*.mdx                               # article sources before they ship
```

Pass several pages of one site in one run. A block only counts as repeated across the pages you
name, and needs at least three of them (`--repeat-min` changes that).

## What it checks

| Rule | Grade | What it flags |
|---|---|---|
| `reframe-heading` | FAIL | Two or more "X, not Y" headings on one page: "Partners, not vendors", "Not a feature. A platform." One can stay if it is the page's real point. |
| `ai-vocabulary` | FAIL | delve, leverage, seamless, robust, unlock, elevate, crucial, streamline, holistic, world-class, cutting-edge and the rest of the list in the script. |
| `signpost` | FAIL | "Here's the thing", "The short answer:", "Bottom line", "Let's dive", "Picture this". |
| `dash-in-prose` | FAIL | Em or en dashes in body text. Number ranges use "to". |
| `repeated-block` | WARN | A block of 12 or more words on three or more of the pages you named. Blocks shared by the same pages are one finding, since they are one repeated section. |
| `repeated-cta` | WARN | The same link or button label five or more times on a page. |
| `intensifier` | WARN | Three or more of quietly, genuinely, truly, honestly, incredibly. |
| `stiff-english` | WARN | Many uncontracted forms (it is, do not, you will), 4 or more per 1,000 words. |
| `exclamation` | WARN | Sentences ending in "!". |

FAIL findings go in "check and fix or dismiss". WARN findings are taste, for a person to judge, and
never fail a build. The lists come from the voice style guide used on the Chykalophia sites and from
the copy section of `cklph-os:frontend-ui`'s `ai-tells.md`.

## What it reads

- **URLs**: the HTML as served, with `head`, scripts, styles, SVG, `header`, `nav` and `footer`
  removed, so shared site chrome is not counted on every page. Text that only appears after
  JavaScript runs is missed; Next.js and most CMS pages render on the server, so this is rare.
- **Files**: `.md` and `.mdx` (frontmatter, imports, code blocks and JSX tags skipped, their inner
  text kept), `.html`, `.txt`.
- Like `shot`, it sees what a logged-out visitor sees. Point it at a published or preview URL.

## The site's exceptions file

The same `.cklph/design-exceptions.json` that `design-lint` reads, with `"tool": "copy"`. Use `match`
to excuse one word or one block, not the rule everywhere:

```json
{ "tool": "copy", "rule": "repeated-block", "match": "We build it to convert", "reason": "The guarantee line is on every sales page on purpose." }
```

Every entry needs a reason the client or Peter agreed to.

## Triage

- Read the sentence before changing it. "Leverage" in "the point is leverage when you need it" is
  the buzzword. In a mechanics article, it may be the right word. Dismiss with a reason if so.
- A `repeated-block` finding is a question, not an order: a guarantee or a testimonial strip can be
  on every sales page on purpose. Repeats that only pad pages should be cut or rewritten.
- `repeated-cta` can count copies a carousel or a hidden mobile layout puts in the HTML. Look at
  the page before cutting buttons.
- Fixing copy means the voice style guide's rules: keep every fact, number, price, heading and
  component prop. Change only the wording.

## What it doesn't catch

Rule-of-three rhythm, aphorism closers, monotone paragraph shape, a made-up example presented as
a client, and whether the copy is true. Those need a person, or a careful read with the voice
style guide open.

Exit codes: 0 nothing that blocks, 2 findings to check, 1 a source could not be read. `--json`
prints the filtered result; `--raw` prints findings for `lint-filter.mjs --tool copy`.
