# AI tells: the defaults to not reach for

Load this before building a page, a section or a marketing surface, and whenever there is no full
design to copy. Each item is a look that generated UIs fall into by reflex. Avoid them at build time
so the page doesn't need fixing later.

**The project's design system wins.** If `DESIGN.md`, the tokens or the Figma file call for Inter, a
cream background or a label above a heading, build it. These rules are about what you add when
nobody asked for it, not about overriding a brand. When the brand asks for a tell, don't let it
pass silently and don't argue it on every build: name the element and the tell once, ask the owner,
and record the answer with its reason in the site's `.cklph/design-exceptions.json` (see
`cklph-visual-qa:design-lint`). Both detectors and `copy-lint` then list it as excused.

The honesty rules below are the exception. No brand, design system or exceptions file overrides
them.

## Honesty

These are never a style choice. Fix them before any other finding.

- **No invented proof.** No metric, testimonial, customer logo, case-study count, rating or award
  that the client didn't give you. A missing fact is a visible placeholder ("Customer count to
  come") listed in the handoff, or it's left out.
- **No fake success.** A form or button never says "Sent", "You're on the list" or "Thanks" unless a
  request really went out. Until the endpoint exists, the form validates and says plainly that
  nothing was sent.
- **No mock of a product that exists.** If the product runs (a URL, a dev server, the app), show
  screenshots of it in a telling state. Build a mock only for a product that doesn't run yet, and
  say so in the handoff.
- **No drawn browser or OS window.** No traffic-light dots or URL pill drawn in CSS around a
  screenshot. Show the screenshot in a plain frame, or with no chrome.

Each tell from the `impeccable` detector carries its rule id, so a `cklph-visual-qa:design-lint`
finding maps back to a line here. The detector checks those 31. The 8 marked ◇ come from other
catalogs and no tool checks them. On our own sites (MailPrism, SendBriefs,
OOOhm) 15 of them fired, marked ●. Those are the ones we actually fall into.

## Color and surface

- ● **Purple, violet or cyan-on-dark** (`ai-color-palette`). A purple gradient is a tell by itself.
  Take the hues from the brand.
- ● **Gradient text** (`gradient-text`), on headings and metrics especially. Use solid color.
- **Cream or beige page background** (`cream-palette`) picked as the safe "tasteful" surface. Use
  the palette's own background.
- ◇ **Stock status colors** (not checked). Info blue, warning amber, success green, error red,
  each a framework's default tint with border, text and background in one hue at three opacities.
  Carry the state in words and weight first ("Error:" in bold); if it needs color, take one muted
  hue from the palette on a neutral surface.
- ◇ **An icon on a tint of its own color** (not checked): a blue icon in a faint blue rounded
  square, a green one in faint green. Let the icon inherit the text color with no container, or give
  it a deliberate opaque surface from the palette.
- ● **Colored glow shadows** (`dark-glow`): a zero-offset colored halo, or any colored blurred
  shadow on a dark page. Use neutral elevation shadows.
- **Radial glow behind content** (`radial-halo`, `radial-spotlight-glow`): a colored radial gradient
  fading to transparent, used as a background halo or a "spotlight" behind a hero. Leave the surface
  solid or shift it slightly.
- ● **Decorative stripes** (`repeating-stripes-gradient`) and ● **grid-line backgrounds**
  (`codex-grid-background`). A grid belongs on a canvas, a map or a measuring surface. Elsewhere,
  leave the surface plain.

## Type

- ● **The usual fonts** (`overused-font`): Inter, Roboto, Geist, Plus Jakarta Sans, Space Grotesk,
  Fraunces. Use the brand's face. If there isn't one, pick it on purpose and say why.
- **Flat hierarchy** (`flat-type-hierarchy`): heading and body sizes less than 1.25× apart at every
  step. Make at least one step clearly bigger.
- ● **A long sentence at display size** (`oversized-h1`) that fills the first screen. Display size
  suits one or two words. Set longer headlines smaller, or cut the copy.
- **Oversized italic serif hero** (`italic-serif-display`): Fraunces, Recoleta, Playfair italic.
  Set it roman, unless the brand is genuinely editorial.
- **Crushed letter spacing** (`extreme-negative-tracking`) tight enough that letters touch. Tighten
  display type a little, never until shapes merge.

## Labels above headings

- ● **A tiny uppercase label above the heading** (`kicker-above-heading`), and ● the hero version, a
  letter-spaced eyebrow or a pill chip above the headline (`hero-eyebrow-chip`). Delete it; the
  heading carries itself. If the words matter, put them in the heading or the body. Other ways to
  open a section, if it needs more than a heading:
  - Nothing: space above, the heading flush left.
  - A heading whose first two words name the subject.
  - A heavier lead-in inside the first sentence, not on its own line.
  - A rule that does more than separate: a hairline, a color edge, a change of background.
  - A real number at large size, once per page, when the number is the point (a price, a year).
  - A caption below the content instead of a label above it.
  - Small type is fine when it carries a fact the reader lacks: a date, a byline, a unit, a file
    name, a live status.
- ● **Small numbers beside each section heading** (`numbered-section-labels`), like "01", "02".
  Let the order of the content carry the sequence.

## Layout and components

- ● **Cards inside cards** (`nested-cards`). Use spacing, type and dividers to group instead.
- ● **Icon in a rounded square above the heading** (`icon-tile-stack`): the generic feature card.
  Put the icon beside the heading, or inline without its own tile.
- ● **A thick colored border down one side of a card** (`side-tab`). Use a subtler accent or none.
- **A thick accent border on a rounded card** (`border-accent-on-rounded`), where it fights the
  corners. Drop the border or the radius.
- **Every card with a hairline border and a wide soft shadow** (`gpt-thin-border-wide-shadow`).
  Across a row of cards, use one: a clear edge or a soft shadow.
- **The same spacing everywhere** (`monotonous-spacing`). Keep related items tight and put more room
  between sections.
- ◇ **Corners that don't nest** (not checked): an inner box with the same radius as its outer box.
  Inner radius = outer radius minus the padding between them, or no radius inside.
- ◇ **A border that disappears at the corners** (not checked): a wrapper with `rounded-xl
  overflow-hidden` clips a child's 1px border, so the straight edges show and the arcs don't. Put
  the border and the radius on the same element.
- ◇ **The "tasteful terminal"** (not checked): monospace UI on near-black with one warm accent.
  Keep monospace for code, not for the interface around it.
- ◇ **The editorial dashboard** (not checked): a working UI dressed as a magazine, with a serif
  "Good evening", serif oldstyle numbers in stat cards and cream paper. Screens people scan take a
  legible sans with tabular lining numbers (`font-variant-numeric: tabular-nums lining-nums`).
- **A hero illustration built from basic shapes** (`shape-assembled-illustration`): circles and
  rectangles in a large inline SVG read as clip art. Use a photo, real artwork or a product screenshot.

## Motion

`references/motion.md` has the full rules. The tells:

- ● **A pulsing status dot** (`pulsing-dot`) with no live data behind it. Use a static dot and a
  label.
- **A fake blinking cursor** (`blinking-cursor`) typing into a hero where there's no input.
- **Auto-scrolling marquees** (`marquee`), such as a logo strip that never stops. Let people scroll.
- **Bounce or elastic easing** (`bounce-easing`). Use ease-out.
- ◇ **The springy hover** (not checked): `hover:scale-105 transition-all` on every card, button and
  image. Hover feedback is a change of surface (background, border, opacity) over 120 to 200ms, and
  `transition` names its properties.
- ◇ **A wobbling spinner** (not checked): the arc traces a small circle because the rotate keyframe
  overwrote the centering `translate(-50%, -50%)`, or the artwork is off-center. Center it with a
  wrapper or the standalone `rotate` property, and watch one full turn.

## Copy

`cklph-os:writing` covers copy in general. The tells:

- **Buzzwords** (`marketing-buzzword`): streamline, empower, supercharge, world-class,
  enterprise-grade, cutting-edge. Say what the product does, with a specific verb and noun.
- **The same punchline shape in three or more sections** (`aphoristic-cadence`): "X. No Y.",
  "Not a feature. A platform."
- ● **Em dashes all through the body copy** (`em-dash-overuse`).
- **Calling something "theater"** (`theater-slop-phrase`). Say what it does or doesn't do.

## Check

Run `cklph-visual-qa:design-lint` on the built page, and `cklph-visual-qa:copy-lint` on its copy.
Slop findings go to a human as a list: they're taste, and a few may be the brand's real voice. Never
fail a build on them. For the page as a whole, see `page-shape.md`. No tool checks the ◇ tells or
the honesty rules: look for those on the screenshots.

---

The rule ids and the tells come from the detector catalog of `impeccable` 4.8.2
(`impeccable detect --list-rules`), by Paul Bakaus, licensed under Apache-2.0
(https://github.com/pbakaus/impeccable). The ◇ tells adapt ideas from yetone/kill-ai-slop
(Apache-2.0, commit f6e2ae3) and the honesty rules and section openings from Nutlope/hallmark (MIT,
commit 04977e1); see `NOTICE.md`. The wording, grouping and site findings here are our own.
