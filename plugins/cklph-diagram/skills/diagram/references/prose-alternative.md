# Prose alternative

Every diagram ships with a linear text version. Required by
[`accessibility.md`](accessibility.md) rule A4 and checked by the linter.

## Required shape

```html
<details class="diagram-alt">
  <summary>Text description of this diagram</summary>
  <div id="arch-cklph-alt">
    <p><strong>What it shows.</strong> One sentence. Same content as
       <code>&lt;desc&gt;</code>.</p>
    <p><strong>Reading order.</strong> Left to right, starting at Intake.</p>
    <ol>
      <li><strong>Intake</strong> (edge worker) — receives the form post,
          validates, and forwards to Queue.</li>
      <li>…one item per node, in reading order…</li>
    </ol>
    <p><strong>Connections.</strong> Intake → Queue (sync). Queue → Worker
       (sync). Worker → Notify (async, dashed).</p>
    <p><strong>Highlighted.</strong> Worker is the focal node — it is where the
       retry logic lives.</p>
  </div>
</details>
```

The `<svg>`'s `aria-describedby` may point at the `-alt` div in addition to its
`<desc>`, which gives a screen-reader user the long version on demand.

## What good looks like

- **Node list in reading order** — the order defined by rule C2, not
  the order they appear in the SVG source.
- **Connections stated explicitly**, including direction and line style meaning.
  "A → B (async)" beats "A and B are connected."
- **The focal point named.** Whatever `accent` is doing visually, say in words.
- **No geometry.** "Top-left box" tells a blind reader nothing. "The intake
  service, which runs first" tells them everything.

## Why it is worth the 90 seconds

Three payoffs, and only one of them is compliance:

1. A screen-reader user gets the diagram's content rather than its existence.
2. It is the only part of an inline SVG that search engines and LLM crawlers can
   read — on a client site, the diagram becomes indexable content instead of a
   hole in the page.
3. Writing it is the fastest way to catch a diagram that doesn't actually say
   anything. If the prose version is boring, the diagram was decorative and
   should be cut.
