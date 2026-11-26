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
| `signpost` | FAIL | "Here's the thing", "The short answer:", "Bottom line", "Let's dive", "Picture this", and run-ups that only wind up: "Let that sink in", "Read that again", "Make no mistake". |
| `colon-reveal` | WARN, FAIL at 2 | A colon holding back a punchline: "The best part: it learns", "The catch: setup takes a week". Needs a determiner, so list labels ("Result: 12 leads", "Step 1:") pass. |
| `reframe-prose` | WARN, FAIL at 2 | The clipped punchline in body copy: "That's not avoidance. That's allocation." |
| `house-rule` | FAIL or WARN | Phrases in the site's own `.cklph/copy-rules.json` (below), at the grade the file gives them. |
| `dash-in-prose` | FAIL | Em or en dashes in body text. Number ranges use "to". |
| `repeated-block` | WARN | A block of 12 or more words on three or more of the pages you named. Blocks shared by the same pages are one finding, since they are one repeated section. |
| `repeated-cta` | WARN | The same link or button label five or more times on a page. |
| `intensifier` | WARN | Three or more of quietly, genuinely, truly, honestly, incredibly. |
| `stiff-english` | WARN | Many uncontracted forms (it is, do not, you will), 4 or more per 1,000 words. |
| `exclamation` | WARN | Sentences ending in "!". |
| `run-up` | WARN | Softer run-ups that real sentences also use: "Honestly?", "The hard part is", "What nobody tells you", "The truth is". |
| `reader-steering` | WARN | Telling the reader how to read: "As you can see", "This distinction matters", "To be clear,". |
| `self-reference` | WARN | Text describing itself: "In this article", "The table below", "As mentioned above". |
| `stock-metaphor` | WARN | Secret sauce, north star, move the needle, low-hanging fruit, deep dive. |
| `drumbeat` | WARN | Three or more one- or two-word sentences in a row: "Every. Single. Day." List numbers and abbreviations don't count. |

The two budgets (`colon-reveal`, `reframe-prose`) allow one use as a WARN, because one can be a
real choice; two on a page is a habit. Measured on 135 chykalophia.com articles, the checks in
this second group raised 20 WARNs and no FAILs, each a real instance.

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

## The site's own word list

A site or a team can ban its own phrases without changing the script. `.cklph/copy-rules.json`,
read from the current directory, so run `copy-lint` from the repo root (or pass `--rules <file>`):

```json
{ "fail": ["reach out", "circle back"], "warn": ["synergies", "best-in-breed"] }
```

Phrases match the same way as the built-in lists: case-insensitive, whole words, curly quotes read
as straight. A file with any key but `fail` and `warn`, or a list that isn't phrases, is bad input
(exit 1). Keep the house list in the repo it belongs to: a
client's bans in the client repo, Chykalophia's in ours.

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

Rule-of-three rhythm, aphorism closers, a lesson restated at the end of every section, monotone
paragraph shape, a made-up example presented as a client, and whether the copy is true. Those need a person, or a careful read with the voice
style guide open.

Exit codes: 0 nothing that blocks, 2 findings to check, 1 a source could not be read. `--json`
prints the filtered result; `--raw` prints findings for `lint-filter.mjs --tool copy`.
