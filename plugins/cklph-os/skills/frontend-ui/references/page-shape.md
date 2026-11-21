# Page shape: build rules for a whole page

`ai-tells.md` covers how a section looks. This covers the page as a whole: how much is on it, in
what order, and how it ends. Generated pages fail here even when every section looks fine. They run
long, repeat one block on every page, put three hundred words on one screen and end on a newsletter
box.

Apply these while you build. `cklph-visual-qa` checks the same things afterwards, and each rule
names its check, so a finding maps back to a line here. **The design system and the client win**:
if the brief asks for twelve sections, build twelve and say so in the PR.

## The rules

1. **The hero fits a laptop.** At 1280x800, the headline, one supporting sentence and the primary
   action are all visible without scrolling. Keep a display-size headline to about ten words.
   (visual-reviewer check 1)
2. **One job per page, and the page ends on it.** Name the job before you build: book, buy, apply,
   download. The last section before the footer is that action, not a newsletter sign-up, unless
   subscribing is the job. (check 6, Hallmark gate 85)
3. **Six to nine sections.** Before adding a tenth, merge two that make the same point. (check 4,
   Hallmark gate 59)
4. **About 150 words per screen.** Count a 1440x900 screen. When it runs over, cut the copy or
   split the idea, don't shrink the type. (check 5, Hallmark gate 58)
5. **Write each section for its page.** A guarantee, a process strip or a testimonial pasted on
   every page reads as filler. Put it where it does the most work and link to it from the rest.
   (`copy-lint` repeated-block)
6. **One primary action label per screen.** Thirteen "Book a call" buttons don't help. Vary the
   secondary actions or drop them. (`copy-lint` repeated-cta)
7. **Cap the content width.** Text columns and grids stop growing at a max width, and the margins
   grow instead. At 1920, text should not start within 100px of the screen edge. (check 3, Hallmark
   gate 44d)
8. **Nothing scrolls sideways from 320 to 1920.** In a flex row, an image or a fixed-width child
   needs `min-w-0` (and usually `flex-1`) so it can shrink. A 509px footer image did exactly this on
   chykalophia.com at 768px. (check 2, Hallmark gate 34)
9. **Spacing shows what belongs together.** A heading sits at least twice as far from the section
   above as from the content it introduces. (check 7, Hallmark gate 71)
10. **Small text gets room to breathe.** Body and card text that wraps needs about 1.4 to 1.6 line
    height, including 14px and 16px sizes. Set it in the type tokens, not per element.
    (impeccable tight-leading, Hallmark gate 75)

## The layout log

Generated pages drift toward the same shape: split hero, three cards, logo strip, testimonial, CTA
band. Each site keeps a log of the layouts it has used, so a new page is built to differ.

The log is `.cklph/layout-log.md` at the site's repo root, next to `design-exceptions.json`. Add one
row per page when the page is built or rebuilt:

```markdown
| Page | Date | Job | Sections, top to bottom |
|---|---|---|---|
| /services | 2026-11-02 | book a call | hero-split, stat-band, card-grid-3, process-steps, testimonial, faq, cta-band |
| /pricing | 2026-11-09 | apply | hero-centered, comparison, long-form, faq, form |
```

Use these names so rows compare. Add a new name only when nothing fits, and say what it is:
`hero-split`, `hero-centered`, `hero-full-bleed`, `logo-strip`, `card-grid-2`, `card-grid-3`,
`card-grid-4`, `feature-alternating`, `bento`, `stat-band`, `testimonial`, `testimonial-grid`,
`comparison`, `process-steps`, `timeline`, `long-form`, `media-full`, `faq`, `form`, `cta-band`.

Before building a page, read the last five rows, then:

- Don't use the same hero layout as the most recent page.
- Don't use any layout more than twice on one page.
- If a section layout appears on all of the last five pages, choose another, unless the design
  system makes it a fixed part of every page (then note that in the log, once).
- Keep the sequence different from every logged page, not just the last one.

When the site has no log, start one with the page you're building. Back-fill older pages only when
someone asks.

## Check

- `cklph-visual-qa:design-lint` (impeccable and Hallmark) on the preview URL.
- `cklph-visual-qa:copy-lint` on the page and its sibling pages, for repeats.
- `cklph-visual-qa:visual-reviewer` with a page-shape review, which reports each of checks 1 to 7.

---

Rules 1 to 4, 7 and 9 are reworded from Hallmark's page gates (github.com/Nutlope/hallmark, MIT,
commit 04977e1). The layout log is our own. The
thresholds are starting points for a marketing page; a docs page or an app screen may need others.
