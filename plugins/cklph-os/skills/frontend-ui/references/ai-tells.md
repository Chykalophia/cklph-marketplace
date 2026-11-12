# AI tells: the defaults to not reach for

Load this before building a page, a section or a marketing surface, and whenever there is no full
design to copy. Each item is a look that generated UIs fall into by reflex. Avoid them at build time
so the page doesn't need fixing later.

**The project's design system wins.** If `DESIGN.md`, the tokens or the Figma file call for Inter, a
cream background or a label above a heading, build it. These rules are about what you add when
nobody asked for it, not about overriding a brand.

Each tell carries its rule id from the `impeccable` detector, so a `cklph-visual-qa:design-lint`
finding maps back to a line here. The detector checks all 31. On our own sites (MailPrism, SendBriefs,
OOOhm) 15 of them fired, marked ●. Those are the ones we actually fall into.

## Color and surface

- ● **Purple, violet or cyan-on-dark** (`ai-color-palette`). A purple gradient is a tell by itself.
  Take the hues from the brand.
- ● **Gradient text** (`gradient-text`), on headings and metrics especially. Use solid color.
- **Cream or beige page background** (`cream-palette`) picked as the safe "tasteful" surface. Use
  the palette's own background.
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
  heading carries itself. If the words matter, put them in the heading or the body.
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
- **A hero illustration built from basic shapes** (`shape-assembled-illustration`): circles and
  rectangles in a large inline SVG read as clip art. Use a photo, real artwork or a product screenshot.

## Motion

`references/motion.md` has the full rules. The tells:

- ● **A pulsing status dot** (`pulsing-dot`) with no live data behind it. Use a static dot and a
  label.
- **A fake blinking cursor** (`blinking-cursor`) typing into a hero where there's no input.
- **Auto-scrolling marquees** (`marquee`), such as a logo strip that never stops. Let people scroll.
- **Bounce or elastic easing** (`bounce-easing`). Use ease-out.

## Copy

`cklph-os:writing` covers copy in general. The tells:

- **Buzzwords** (`marketing-buzzword`): streamline, empower, supercharge, world-class,
  enterprise-grade, cutting-edge. Say what the product does, with a specific verb and noun.
- **The same punchline shape in three or more sections** (`aphoristic-cadence`): "X. No Y.",
  "Not a feature. A platform."
- ● **Em dashes all through the body copy** (`em-dash-overuse`).
- **Calling something "theater"** (`theater-slop-phrase`). Say what it does or doesn't do.

## Check

Run `cklph-visual-qa:design-lint` on the built page. Slop findings go to a human as a list: they're
taste, and a few may be the brand's real voice. Never fail a build on them.

---

The rule ids and the tells come from the detector catalog of `impeccable` 4.8.2
(`impeccable detect --list-rules`), by Paul Bakaus, licensed under Apache-2.0
(https://github.com/pbakaus/impeccable). The wording, grouping and site findings here are our own.
