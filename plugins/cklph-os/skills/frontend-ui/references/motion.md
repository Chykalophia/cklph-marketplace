# Motion: when to animate, and how

Load this when a change adds or edits a transition, animation, hover or press state, or an animated
component from a library. Values here are the defaults; the project's own design system wins.

Adapted from Emil Kowalski's `review-animations` standards (MIT, notice at the end), trimmed to what
we can check and with notes from trying it on our own sites.

## Should it animate?

| How often people see it | Decision |
| --- | --- |
| Hundreds of times a day (shortcuts, command palette, list navigation) | Instant, or a sub-100ms state change at most |
| Tens of times a day (hover, tab switches) | Reduce: colour or opacity, no movement |
| Occasionally (modals, drawers, toasts) | Standard animation |
| Rarely (onboarding, a success moment) | Room for delight |

Keyboard-driven actions stay fast, but a short confirmation that something happened (a row sliding
out after an approval) is feedback, not decoration. Keep it. Motion needs a job: show where something
came from, confirm a state, or explain a change. "It looks nice" on something seen all day is not a job.

## Easing and duration

- Entering or leaving: ease-out. Moving on screen: ease-in-out. Colour and hover: ease. Never ease-in
  on UI; it delays the moment the user is watching.
- Built-in CSS curves are weak. Defaults: `cubic-bezier(0.23, 1, 0.32, 1)` for ease-out and
  `cubic-bezier(0.77, 0, 0.175, 1)` for ease-in-out.
- UI motion stays under 300ms: press feedback 100 to 160ms, tooltips 125 to 200ms, dropdowns 150 to
  250ms, modals and drawers 200 to 500ms. Marketing pages can run longer.
- Exits run about half as long as entrances.

## Physical feel

- Never start from `scale(0)`. Start from `scale(0.9)` to `scale(0.97)` with opacity 0.
- Popovers and menus scale from their trigger (`transform-origin` at the trigger). Modals stay centred.
- Anything pressable gets press feedback: `active:scale-[0.97]` with a 160ms ease-out transform.
  A button with no hover and no press state feels dead.
- Overshoot and bounce are for rare, playful moments. Keep them small.

## Performance

- Animate `transform` and `opacity` only. Height, width, padding, margin, top and left force layout
  on every frame. The exception is a deliberate collapse (a card folding away), where animating
  height or `grid-template-rows` is the normal technique.
- Prefer CSS transitions for anything that can be interrupted (toggles, toasts): they retarget
  mid-flight, while keyframes restart from zero. `@starting-style` gives an entry animation with no JS.
- Don't read layout and write styles in the same frame (no `getBoundingClientRect` inside an
  animation loop).

## Scroll reveals

- Content must be readable at rest. Never leave a section at `opacity: 0` waiting for an observer:
  a fast scroller sees blank blocks, and so does a screenshot or a crawler.
- Keep reveals short (under 400ms) and small (8 to 16px of travel). Stagger groups by 30 to 80ms.
- Without JS, everything shows. Add the hidden-until-revealed class from script, not in the markup.

## Touch and hover

- Gate hover-only motion so a tap doesn't leave it stuck: `@media (hover: hover) and (pointer: fine)`.
- **Tailwind v4 already does this.** Its `hover:` variant only applies where the device can hover, so
  don't flag `hover:` classes as ungated. Hand-written `:hover` rules in plain CSS still need the
  media query.

## Reduced motion

- Respect `prefers-reduced-motion: reduce`. It means fewer and gentler animations, not none: keep
  opacity and colour changes that help people follow what happened, and drop movement, parallax,
  zoom and autoplay.
- Motion that runs on its own (marquees, counters, background effects) stops or stays still.

## Animated components from libraries

Check each one before it ships. These three checks caught every problem we found trialling Magic UI,
React Bits and Canvas UI:
1. **Reduced motion.** Turn it on (DevTools > Rendering > Emulate `prefers-reduced-motion`) and watch.
   The component must stop or calm down. Many don't.
2. **No-JS and first paint.** View the server HTML (disable JS, or `curl` the page). The real content
   must be there. A number counter that renders "0" until it animates shows the wrong figure to
   crawlers, screenshots and slow devices.
3. **Size.** Compare the route's client JS before and after (gzip). Note the cost in the PR. A
   decoration that adds more than about 10 kB gzip needs a reason.

Our vetted list, with licence notes, is in `cklph-nextjs`'s `ui-quality` skill.

## Checking motion by eye

Slow it down (DevTools Animations panel, or 3x the duration) to see easing, origin and properties
that drift apart. Test gestures and drawers on a real phone.

---

Portions adapted from emilkowalski/skills (`skills/review-animations/STANDARDS.md`, commit 715c180):

MIT License

Copyright (c) 2026 Emil Kowalski

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
