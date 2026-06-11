# Render-Safe HTML Component Library

Copy-paste patterns for self-contained HTML reports. All are responsive and degrade safely. **Read the rendering rules first — they prevent the two most common bugs.**

## Rendering rules (learned the hard way)

1. **Never put text inside a bar whose width is data-driven.** A bar at `width:6%` can't hold "119 · 0.42%" — the text wraps and clips. Use a **3-column row: label | track | value**, with the number in its own fixed column. (Applies to funnels, progress bars, any % bar.)
2. **Never lay out labels with absolute positioning in a chart area.** Absolutely-positioned `.item{position:absolute;left:%;top:%}` clouds overlap each other and clip at container edges, and they break on mobile. Use a **CSS grid of cells** (e.g., a 2×2 quadrant grid) instead.
3. **Make every grid collapse on mobile** (`@media(max-width:760px){...grid-template-columns:1fr}`). Two-column layouts that don't collapse get cramped.
4. **Don't put prose inside visuals.** Keep explanatory text in the document; visuals carry labels only.
5. **Wide tables:** in narrow contexts use `table-layout:fixed` + explicit widths, or allow horizontal scroll on a wrapper. Keep numeric cells `white-space:nowrap`.
6. **Verify before shipping** (see `qa-checklist.md`): balanced tags, `node --check` on any JS, a render check, working links.

## Design tokens (adapt to brand)
```css
:root{
  --ink:#13191d; --muted:#5d6b73; --line:#e4e0d6; --surface:#fff; --surface-2:#fbfaf7;
  --accent:#0e7c8b; --good:#1f7a4d; --warn:#9a6a00; --bad:#b3261e;
  --good-tint:#e7f4ec; --warn-tint:#fbf1d9; --bad-tint:#fbe9e7; --accent-tint:#e7f5f7;
  --radius:14px; --shadow:0 1px 2px rgba(20,30,35,.04),0 8px 30px rgba(20,30,35,.06);
}
```
Match the subject's real brand: pull actual tokens from their theme/site (background, text, accent, button radius, fonts) rather than inventing an aesthetic. A "neutral editorial" default (e.g., a sand/cream background) is *not* on-brand for most clients — confirm or match.

## Metric cards
```html
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
  <div style="background:var(--surface-2);border:1px solid var(--line);border-radius:9px;padding:14px">
    <div style="font-size:1.6rem;font-weight:800;color:var(--bad)">0.8%</div>
    <div style="font-size:.76rem;color:var(--muted);font-weight:600">Add-to-cart rate</div>
    <div style="font-size:.72rem;color:#8a979e">~9× below the ~7.5% norm</div>
  </div>
  <!-- repeat -->
</div>
```

## Callouts (issue / win / opportunity / data)
```css
.callout{border:1px solid var(--line);border-left-width:4px;border-radius:10px;padding:13px 16px;margin:14px 0;background:var(--surface-2)}
.callout.issue{border-left-color:var(--bad);background:var(--bad-tint)}
.callout.win{border-left-color:var(--good);background:var(--good-tint)}
.callout.opp{border-left-color:var(--accent);background:var(--accent-tint)}
```
```html
<div class="callout issue"><div style="font-weight:740">Primary leak</div>
<p>99% of visitors never add to cart — a product-page problem.</p></div>
```

## Funnel (label | track | value) — RULE 1
```css
.frow{display:grid;grid-template-columns:150px 1fr 128px;gap:12px;align-items:center;margin:8px 0}
@media(max-width:600px){.frow{grid-template-columns:84px 1fr 86px;gap:8px}}
.ftrack{background:var(--line);border-radius:7px;height:30px;overflow:hidden}
.ffill{height:100%;border-radius:7px;min-width:6px;background:var(--accent)}
.ffill.bad{background:var(--bad)} .ffill.drop{background:#cfc9bc}
.fv{font-size:.82rem;font-weight:700;text-align:right;font-variant-numeric:tabular-nums}
```
```html
<div class="frow"><div>Sessions</div><div class="ftrack"><div class="ffill" style="width:100%"></div></div><div class="fv">12,000</div></div>
<div class="frow"><div>Added to cart</div><div class="ftrack"><div class="ffill bad" style="width:9%"></div></div><div class="fv" style="color:var(--bad)">96 · 0.8%</div></div>
```

## Bar comparison (label | track | value)
```css
.bc{display:grid;grid-template-columns:200px 1fr 70px;align-items:center;gap:10px;margin:8px 0}
@media(max-width:600px){.bc{grid-template-columns:130px 1fr 56px}}
.bctrack{background:var(--line);border-radius:6px;height:18px;overflow:hidden}
.bcfill{height:100%;border-radius:6px}
```
```html
<div class="bc"><div>This store</div><div class="bctrack"><div class="bcfill" style="width:8%;background:var(--bad)"></div></div><div style="text-align:right;font-weight:700">0.8%</div></div>
```

## Impact/effort matrix — quadrant grid (RULE 2: NOT absolute positioning)
```css
.matrix{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media(max-width:620px){.matrix{grid-template-columns:1fr}}
.quad{border:1px solid var(--line);border-radius:12px;padding:12px 13px;background:var(--surface-2)}
.quad .qh{font-size:.7rem;font-weight:800;text-transform:uppercase;margin:0 0 8px}
.chip2{display:inline-block;font-size:.74rem;font-weight:600;padding:4px 9px;border-radius:7px;border:1px solid var(--line);background:#fff;margin:0 4px 4px 0}
.chip2.p1{border-color:var(--good);background:var(--good-tint)}
.chip2.p2{border-color:var(--accent);background:var(--accent-tint)}
```
```html
<div class="matrix">
  <div class="quad"><div class="qh">High impact · Low effort — Do first</div>
    <span class="chip2 p1">Seed reviews</span><span class="chip2 p1">Add images + video</span></div>
  <div class="quad"><div class="qh">High impact · Higher effort — Plan</div>
    <span class="chip2 p2">Guided configurator</span></div>
  <div class="quad"><div class="qh">Lower impact · Low effort — Fillers</div></div>
  <div class="quad"><div class="qh">Lower impact · Higher effort — Later</div></div>
</div>
```

## Annotated wireframe blueprint blocks
```css
.compare2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:760px){.compare2{grid-template-columns:1fr}}
.wf{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--surface-2)}
.wfhead{padding:8px 12px;font-size:.74rem;font-weight:800;text-transform:uppercase;color:#fff}
.wf.cur .wfhead{background:#8a7f6c} .wf.rec .wfhead{background:var(--accent)}
.wbox{border:1px dashed #c9c3b6;border-radius:8px;background:#fff;padding:9px 11px;margin:8px 12px;position:relative}
.wbox.add{border:1px solid var(--accent);background:var(--accent-tint)}
.wbox.move{border:1px solid var(--warn);background:var(--warn-tint)}
.wbox.kill{border:1px solid var(--bad);background:var(--bad-tint)}
.wnum{position:absolute;top:-9px;left:-9px;width:22px;height:22px;border-radius:50%;background:var(--accent);color:#fff;font-size:.72rem;font-weight:800;display:flex;align-items:center;justify-content:center}
```
Use `.compare2` for current-vs-recommended; mark blocks add/move/kill; number them with `.wnum` and map each number to a rationale row in the body. Use a phone-frame div (`max-width:300px;border:9px solid #1c2429;border-radius:30px`) for the mobile view, with a bottom "sticky" bar mock.

## Sources list (with reliability tiers)
```html
<ol style="font-size:.82rem;color:var(--muted)">
  <li id="s-spiegel"><span style="font-size:.7rem;border:1px solid var(--line);border-radius:999px;padding:2px 9px">PRIMARY</span>
  Spiegel Research Center — reviews & sales (2017). <a href="https://spiegel.medill.northwestern.edu/how-online-reviews-influence-sales/">link</a></li>
</ol>
```
Reference inline with `<sup><a href="#s-spiegel">8</a></sup>`. Keep ids and superscripts in sync (QA can diff them).

## Sticky section nav (for longer reports)
```css
.topbar{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.86);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.navlinks a{font-size:.74rem;color:var(--muted);padding:4px 8px;border-radius:7px;font-weight:600}
@media(max-width:780px){.navlinks{display:none}}
```

## Print
```css
@media print{.topbar{display:none}section{box-shadow:none;break-inside:avoid}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
```

## If using a chart library
Chart.js (from cdnjs) is fine for richer charts; give each `<canvas>` `role="img"` + `aria-label`, set height on the wrapper not the canvas, and use hardcoded hex (canvas can't read CSS vars). For most report charts, the CSS bars above are lighter and render instantly.
