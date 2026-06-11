// probe.mjs — capture a structured signal snapshot of one URL.
// Signals are the ground truth Regression Watch diffs against a baseline. No opinion here, just facts.

const ANALYTICS = [
  { key: 'ga4', re: /google-analytics\.com\/g\/collect|googletagmanager\.com\/gtag\/js|\/gtag\/js/i },
  { key: 'gtm', re: /googletagmanager\.com\/gtm\.js/i },
];

export async function probeUrl(page, url, { masks = [], screenshotPath = null } = {}) {
  const requests = [];
  const onReq = (r) => requests.push(r.url());
  page.on('request', onReq);
  const consoleErrors = [];
  const onConsole = (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); };
  page.on('console', onConsole);

  let status = null, finalUrl = url, redirected = false, error = null;
  try {
    const resp = await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1200); // let late-loading tags fire
    status = resp ? resp.status() : null;
    finalUrl = page.url();
    redirected = finalUrl !== url;
  } catch (e) {
    error = String(e && e.message ? e.message : e);
  }

  const dom = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    return {
      title: document.title || null,
      metaDescription: q('meta[name="description"]')?.getAttribute('content') || null,
      canonical: q('link[rel="canonical"]')?.getAttribute('href') || null,
      robots: q('meta[name="robots"]')?.getAttribute('content') || null,
      h1s: Array.from(document.querySelectorAll('h1')).map((h) => (h.textContent || '').trim()),
      jsonLdCount: document.querySelectorAll('script[type="application/ld+json"]').length,
      scripts: Array.from(document.querySelectorAll('script[src]')).map((s) => s.src),
    };
  }).catch(() => ({ title: null, metaDescription: null, canonical: null, robots: null, h1s: [], jsonLdCount: 0, scripts: [] }));

  // analytics: network requests (production truth) OR script src in DOM (offline/fixture fallback)
  const haystack = requests.concat(dom.scripts);
  const analytics = {};
  for (const a of ANALYTICS) analytics[a.key] = haystack.some((u) => a.re.test(u));

  // resolve mask rectangles by selector so visual diff can ignore dynamic regions
  const maskBoxes = [];
  for (const sel of masks) {
    const box = await page.locator(sel).first().boundingBox().catch(() => null);
    if (box) maskBoxes.push({ sel, x: box.x, y: box.y, width: box.width, height: box.height });
  }

  if (screenshotPath && !error) {
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  }

  page.off('request', onReq);
  page.off('console', onConsole);

  return {
    url, status, finalUrl, redirected, error,
    title: dom.title, metaDescription: dom.metaDescription, canonical: dom.canonical,
    robots: dom.robots, h1Count: dom.h1s.length, h1: dom.h1s[0] || null,
    jsonLdCount: dom.jsonLdCount, analytics, requestCount: requests.length,
    consoleErrors: consoleErrors.length,
    screenshotPath: (screenshotPath && !error) ? screenshotPath : null,
    maskBoxes,
  };
}
