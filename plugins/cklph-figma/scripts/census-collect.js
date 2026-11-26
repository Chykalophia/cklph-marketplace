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
  const opaque = (c) => c && c !== 'transparent' && !/rgba?\([^)]*,\s*0\)$/.test(c) && !/\/\s*0\)$/.test(c);
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
      add('text', s.color, chars);
      add('family', firstFamily(s.fontFamily), chars);
      add('fontSize', String(px(s.fontSize)), chars);
      add('fontWeight', s.fontWeight, chars);
    }
    if (opaque(s.backgroundColor)) add('background', s.backgroundColor, Math.round((r.width * r.height) / 1000) || 1);
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const w = px(s[`border${side}Width`]);
      const c = s[`border${side}Color`];
      if (w > 0 && s[`border${side}Style`] !== 'none' && opaque(c)) {
        add('border', c, Math.round(side === 'Top' || side === 'Bottom' ? r.width : r.height));
      }
    }
    const radius = px(s.borderTopLeftRadius);
    if (radius > 0) add('radius', String(radius), 1);
    for (const prop of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginBottom', 'rowGap', 'columnGap']) {
      const v = px(s[prop]);
      if (v > 0) add('spacing', String(v), 1);
    }
  }
  return JSON.stringify({
    tool: 'census-collect',
    url: location.href,
    // A hidden tab reports a zero window; the document still has its layout width.
    viewport: { width: innerWidth || document.documentElement.clientWidth, height: innerHeight || document.documentElement.clientHeight },
    collectedAt: new Date().toISOString(),
    tally,
  });
})()
