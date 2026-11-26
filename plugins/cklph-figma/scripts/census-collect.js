// census-collect.js: the browser half of the live-site census.
//
// Not a module. Run it in the page (a browser tool's JavaScript runner, DevTools, or
// puppeteer's page.evaluate) as one expression; it returns the census as a JSON string.
// Save that string to a file and pass the file to census.mjs. Read-only: it changes nothing.
//
// It walks every visible element and counts the computed values the browser paints:
// text, background and border colors, font families, font sizes, corner radii and spacing.
// Each value carries a weight, so a color that paints half the page outranks one stray link:
//   text color, family, size: characters of text the element itself holds
//   background: painted area in thousands of square pixels
//   border: painted border length in pixels
//   radius, spacing: number of elements using the value
//
// Limits: font-family is the declared stack, not the face that loaded; background area counts
// overlapping boxes twice; text an ancestor hides with opacity 0, visually-hidden text and
// shadow DOM are not told apart from what shows. Read the shares as rough, not exact.
(() => {
  const tally = {};
  const add = (kind, value, w) => {
    if (!w) return;
    const bucket = (tally[kind] ||= {});
    bucket[value] = (bucket[value] || 0) + w;
  };
  const px = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  };
  // Chrome keeps the authored color space in computed values (oklab() from Tailwind's color-mix,
  // color(display-p3 ...), lab(), a `none` hue). Painting each one on a 1x1 canvas turns it into
  // sRGB bytes, so census.mjs only ever sees rgb()/rgba().
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const srgbCache = new Map();
  const srgb = (c) => {
    if (!srgbCache.has(c)) {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      srgbCache.set(c, a === 0 ? null : a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * 100) / 100})`);
    }
    return srgbCache.get(c);
  };
  const firstFamily = (f) => f.split(',')[0].trim().replace(/^["']|["']$/g, '');
  const ownText = (el) => {
    let n = 0;
    for (const node of el.childNodes) if (node.nodeType === 3) n += node.textContent.trim().length;
    return n;
  };

  for (const el of document.querySelectorAll('body, body *')) {
    if (el.closest('script, style, noscript, template, svg')) continue;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;

    const chars = ownText(el);
    if (chars) {
      const tc = srgb(s.color);
      if (tc) add('text', tc, chars);
      add('family', firstFamily(s.fontFamily), chars);
      add('fontSize', String(px(s.fontSize)), chars);
      add('fontWeight', s.fontWeight, chars);
    }
    const bg = srgb(s.backgroundColor);
    if (bg) add('background', bg, Math.round((r.width * r.height) / 1000) || 1);
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const w = px(s[`border${side}Width`]);
      const c = w > 0 && s[`border${side}Style`] !== 'none' ? srgb(s[`border${side}Color`]) : null;
      if (c) {
        add('border', c, Math.round(side === 'Top' || side === 'Bottom' ? r.width : r.height));
      }
    }
    // A percentage radius (a circle at 50%) is not a length on the scale; keep it apart.
    const rawRadius = s.borderTopLeftRadius;
    if (rawRadius.trim().endsWith('%')) add('radiusPercent', rawRadius.trim(), 1);
    else if (px(rawRadius) > 0) add('radius', String(px(rawRadius)), 1);
    for (const prop of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginBottom', 'rowGap', 'columnGap']) {
      const v = px(s[prop]);
      if (v > 0) add('spacing', String(v), 1);
    }
  }
  return JSON.stringify({
    tool: 'census-collect',
    url: location.href,
    // A hidden tab can report a zero window. census.mjs warns when the width is 0.
    viewport: { width: innerWidth || document.documentElement.clientWidth, height: innerHeight || document.documentElement.clientHeight },
    collectedAt: new Date().toISOString(),
    tally,
  });
})()
