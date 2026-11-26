---
name: frontend-ui
description: Production-quality UI engineering. Use when building or changing user-facing components, layouts, or interactions, and the result must look design-aware rather than AI-generated. Pairs with security-hardening and performance.
---

# frontend-ui — production-quality, not AI-generated

Goal: UI that reads as built by a design-aware engineer — real design-system adherence, real
accessibility, no generic "AI look."

## Structure & state
- **Compose, don't over-configure** — `<Card><CardHeader>…` beats a 10-prop `<Card title= headerVariant= …>`.
- **Split data from presentation** — a container handles fetch / loading / error / empty; a dumb
  component renders.
- **Pick the simplest state that works:** local `useState` → lifted → URL params (filters, pagination,
  shareable) → server-cache (React Query / SWR) → global store (only for genuinely app-wide client
  state). Don't prop-drill past ~3 levels.
- Keep components under ~200 lines — split when bigger.

## Avoid the AI aesthetic
Use the project's *actual* design system, not the safe defaults models reach for: no
purple/indigo-everything, no gratuitous gradients, no `rounded-2xl` on everything, no oversized uniform
padding, no shadow-heavy cards. Use realistic content (not lorem) so wrapping/overflow surfaces early.

- **Spacing** — stay on the scale (e.g. 0.25rem steps); no `13px`, no `2.3rem`.
- **Color** — semantic tokens (`text-primary`, `bg-surface`), never raw hex; pair every color with its
  `dark:` variant; never use color as the *only* signal.
- **Type** — respect the hierarchy; don't skip heading levels.

Read `references/ai-tells.md` before building a page or section without a full design. It lists the
39 looks generated UIs fall into, with what to do instead, and four honesty rules no brand overrides:
no invented metrics, testimonials or logos; no form that says "Sent" when nothing was sent; real
screenshots, not a mock, of a product that runs; no drawn browser window. The short version: no purple or
cyan-on-dark gradients, gradient text or colored glows; no stock fonts (Inter, Geist) unless the brand
uses them; no tiny uppercase label above a heading; no cards inside cards and no icon tile above
every heading; no buzzwords. The design system wins where it asks for one of these.

## Page shape
Read `references/page-shape.md` before building or rebuilding a whole page. It has ten rules for the
page as a whole and the site's layout log. The short version: the hero fits 1280x800, the page has
one job and ends on it, six to nine sections, about 150 words a screen, no block pasted on every
page, a capped content width, no sideways scroll from 320 to 1920, and readable line height on small
text. Read `.cklph/layout-log.md` first, so the new page doesn't repeat the last one's layout, and
add the page's row when it's built.

## Accessibility (WCAG 2.2 AA — non-negotiable)
- Real `<button>` / `<a>` for actions (keyboard-focusable by default); if you must `role="button"`, add
  `tabIndex={0}` + Enter/Space handlers.
- Label icon-only controls (`aria-label`); associate `<label htmlFor>` with inputs.
- Move/trap focus when dialogs open; return it on close.
- Contrast ≥ 4.5:1 (3:1 for large text).
- Always handle **loading / error / empty** — skeletons for content (not spinners); no blank screens.

## Interaction states
List every interactive element on the screen, then check each for default, hover, focus, active,
disabled and loading or error. The gaps generated UIs leave:
- A disabled control says why (a hint beside it or a tooltip that keyboard users can reach), and
  isn't disabled by opacity alone: also `disabled` or `aria-disabled` and `cursor: not-allowed`.
- Loading blocks a second submit: the button disables or shows progress the moment it's pressed.
- The focus ring appears instantly, at least 2px with an offset, 3:1 against what's behind it.
- Success and failure are never silent. Failure says what went wrong and what to do; success needs
  no toast when the change is already visible.

## Responsive & feel
- Mobile-first; verify at 320 / 768 / 1024 / 1440px.
- Optimistic updates for perceived speed (snapshot → mutate → roll back on error).

## Motion
Read `references/motion.md` before adding or changing any animation, transition, hover or press
state, or an animated library component. The short version:
- Animate only what has a job, and the more often people see it, the less it moves.
- Ease-out for entering and leaving, under 300ms for UI, never from `scale(0)`.
- Every pressable element gets hover and press feedback (`active:scale-[0.97]`).
- `transform` and `opacity` only; content is readable at rest, never hidden waiting for a scroll.
- Reduced motion means gentler, not none. Tailwind v4 `hover:` is already gated for touch.
- Animated library components pass three checks: reduced motion, correct no-JS output, and their
  gzip size cost.

## Verify
- [ ] Tab through everything; screen reader conveys structure.
- [ ] Loading / error / empty states all present.
- [ ] Works at all four breakpoints; light **and** dark.
- [ ] Matches the design system; no axe-core warnings.
- [ ] With reduced motion on, nothing moves that shouldn't; with JS off, the real content shows.
- [ ] No tell from `references/ai-tells.md` unless the site's exceptions file names it, and none of
  its honesty rules broken.
- [ ] Every interactive element has all its states, per "Interaction states".
- [ ] Browser surfaces match the palette: `::selection`, `caret-color`, `scrollbar-color`, a
  `text-underline-offset` on links, and tabular numbers wherever digits line up.
- [ ] A whole page meets `references/page-shape.md`, and its row is in `.cklph/layout-log.md`.
