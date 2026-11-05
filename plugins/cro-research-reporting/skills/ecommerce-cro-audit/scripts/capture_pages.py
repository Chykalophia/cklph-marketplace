#!/usr/bin/env python3
"""Render pages the way shoppers see them, for the heuristic checklist.

Reading HTML through a fetch tool shows text only: no layout, imagery, fold,
sticky bars or mobile view, and Nielsen's re-analysis of Baymard's data found
43% of usability problems span several screens. This script renders each URL
at desktop and mobile widths and saves:
  * an above-the-fold screenshot and a full-page screenshot per viewport
  * facts.json: title, H1, price text, add-to-cart button text and whether it
    is above the fold, checkout buttons, image count, form-field counts (page
    and largest form), load timings, and whether the lazy-load scroll reached
    the bottom. A URL that answers with an HTTP error is recorded as an error.

Only http(s) URLs are captured; file:// needs --allow-file (the eval fixture).

Requires Playwright for Python (pip install playwright). Set CHROMIUM_PATH to use an
existing Chromium binary, else run `python3 -m playwright install chromium`.
HTTPS_PROXY from the environment is honoured unless --no-proxy is given.

  python3 capture_pages.py https://store.example/products/x https://store.example/cart --out audit-captures
  python3 capture_pages.py --viewports mobile https://store.example/products/x
"""
import argparse
import hashlib
import json
import os
import re
import sys

VIEWPORTS = {
    "desktop": {"viewport": {"width": 1440, "height": 900}},
    "mobile": {"viewport": {"width": 390, "height": 844}, "is_mobile": True, "has_touch": True,
               "device_scale_factor": 2,
               "user_agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
                             "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"},
}

FACTS_JS = r"""
() => {
  const vh = window.innerHeight;
  // hidden by size, display, visibility or opacity (on the element or an ancestor)
  const vis = el => { const r = el.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) return false;
    if (el.checkVisibility) return el.checkVisibility({opacityProperty: true, visibilityProperty: true,
                                                       checkOpacity: true, checkVisibilityCSS: true});
    for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false; }
    return true; };
  // English labels only; the screenshots remain the evidence for other languages
  const buyRe = /(add to (cart|bag|basket)|buy now|purchase|pre-?order)/i;
  const checkoutRe = /check ?out/i;
  const label = b => (b.innerText || b.value || b.getAttribute('aria-label') || '').trim().slice(0, 60);
  const controls = [...document.querySelectorAll('button, input[type=submit], [role=button], a.button, a.btn')]
    .filter(vis).map(b => ({text: label(b), top: Math.round(b.getBoundingClientRect().top)}));
  const buttons = controls.filter(b => buyRe.test(b.text));
  const checkouts = controls.filter(b => checkoutRe.test(b.text) && !buyRe.test(b.text));
  const fieldSel = 'input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea';
  const formCounts = [...document.forms].map(f => [...f.querySelectorAll(fieldSel)].filter(vis).length);
  const priceEl = [...document.querySelectorAll('[class*=price], [itemprop=price], [data-price]')].find(vis);
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const lcp = window.__lcp || null;
  return {
    title: document.title,
    h1: [...document.querySelectorAll('h1')].filter(vis).map(h => h.innerText.trim().slice(0, 120)),
    price_text: priceEl ? priceEl.innerText.trim().slice(0, 60) : null,
    buy_buttons: buttons.slice(0, 5),
    buy_button_above_fold: buttons.length ? Math.min(...buttons.map(b => b.top)) < vh : null,
    checkout_buttons: checkouts.slice(0, 5),
    images_visible: [...document.images].filter(vis).length,
    form_fields_visible: [...document.querySelectorAll(fieldSel)].filter(vis).length,
    largest_form_fields_visible: formCounts.length ? Math.max(...formCounts) : null,
    page_height_px: document.documentElement.scrollHeight,
    dom_content_loaded_ms: nav.domContentLoadedEventEnd ? Math.round(nav.domContentLoadedEventEnd) : null,
    load_ms: nav.loadEventEnd ? Math.round(nav.loadEventEnd) : null,
    lcp_ms: lcp,
    has_horizontal_scroll: document.documentElement.scrollWidth > window.innerWidth + 1,
  };
}
"""

LCP_INIT = """
window.__lcp = null;
try { new PerformanceObserver(l => { const e = l.getEntries(); window.__lcp = Math.round(e[e.length-1].startTime); })
  .observe({type: 'largest-contentful-paint', buffered: true}); } catch (e) {}
"""


SCROLL_JS = """async () => {
  let y = 0, i = 0;
  for (; i < 40 && y < document.documentElement.scrollHeight; i++, y += window.innerHeight) {
    window.scrollTo(0, y); await new Promise(r => setTimeout(r, 150)); }
  const done = y >= document.documentElement.scrollHeight;
  window.scrollTo(0, 0);
  return done; }"""


def slug(url):
    return re.sub(r"[^a-z0-9]+", "-", url.lower().split("://", 1)[-1]).strip("-")[:80]


def viewport_list(value):
    names = [v.strip() for v in value.split(",") if v.strip()]
    bad = [v for v in names if v not in VIEWPORTS]
    if not names or bad:
        raise argparse.ArgumentTypeError(f"choose from {', '.join(VIEWPORTS)} (comma-separated)")
    return names


def parse_args(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("urls", nargs="+")
    ap.add_argument("--out", default="audit-captures")
    ap.add_argument("--viewports", type=viewport_list, default=list(VIEWPORTS),
                    help="comma-separated, e.g. mobile or desktop,mobile (default both)")
    ap.add_argument("--timeout", type=int, default=45000)
    ap.add_argument("--no-proxy", action="store_true", help="ignore HTTPS_PROXY from the environment")
    ap.add_argument("--allow-file", action="store_true",
                    help="also accept file:// URLs (for the local eval fixture)")
    args = ap.parse_args(argv)
    for url in args.urls:
        scheme = url.split(":", 1)[0].lower() if ":" in url else ""
        if scheme == "file" and not args.allow_file:
            ap.error(f"file:// URLs need --allow-file: {url}")
        if scheme not in ("http", "https", "file"):
            ap.error(f"only http:// and https:// URLs can be captured: {url}")
    return args


def main(argv=None):
    args = parse_args(argv)
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        sys.exit("Playwright for Python is not installed. Run: python3 -m pip install playwright "
                 "(and `python3 -m playwright install chromium` if no browser is available). "
                 "Without it, ask the user for desktop and mobile screenshots instead.")
    os.makedirs(args.out, exist_ok=True)
    results = {}
    with sync_playwright() as p:
        launch = {}
        if os.environ.get("CHROMIUM_PATH"):
            launch["executable_path"] = os.environ["CHROMIUM_PATH"]
        proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
        if proxy and not args.no_proxy:
            launch["proxy"] = {"server": proxy}
        browser = p.chromium.launch(**launch)
        for url in args.urls:
            results[url] = {}
            for vp in args.viewports:
                ctx = browser.new_context(**VIEWPORTS[vp])
                ctx.add_init_script(LCP_INIT)
                page = ctx.new_page()
                base = os.path.join(args.out, f"{slug(url)}-{hashlib.md5(url.encode()).hexdigest()[:6]}--{vp}")
                try:
                    resp = page.goto(url, wait_until="load", timeout=args.timeout)
                    if resp is not None and resp.status >= 400:
                        raise RuntimeError(f"HTTP {resp.status}; not scoring an error page")
                    page.wait_for_timeout(1500)
                    # scroll through the page so lazy-loaded images render, then return to the top;
                    # stops after 40 screens, and says so, rather than scrolling an endless feed forever
                    scrolled_to_end = page.evaluate(SCROLL_JS)
                    page.wait_for_timeout(500)
                    page.screenshot(path=base + "--fold.png")
                    page.screenshot(path=base + "--full.png", full_page=True)
                    facts = page.evaluate(FACTS_JS)
                    facts["lazy_load_scroll_complete"] = scrolled_to_end
                    facts["screenshots"] = [base + "--fold.png", base + "--full.png"]
                except Exception as e:  # keep going for the other pages
                    facts = {"error": str(e)[:300]}
                results[url][vp] = facts
                ctx.close()
        browser.close()
    path = os.path.join(args.out, "facts.json")
    with open(path, "w") as f:
        json.dump(results, f, indent=2)
    for url, vps in results.items():
        print(f"## {url}")
        for vp, fx in vps.items():
            if "error" in fx:
                print(f"- {vp}: ERROR {fx['error']}")
                continue
            print(f"- {vp}: buy button above fold: {fx['buy_button_above_fold']} | price: {fx['price_text']} | "
                  f"images: {fx['images_visible']} | fields: {fx['form_fields_visible']} "
                  f"(largest form {fx['largest_form_fields_visible']}) | "
                  f"LCP: {fx['lcp_ms']} ms | horizontal scroll: {fx['has_horizontal_scroll']}")
            if not fx["lazy_load_scroll_complete"]:
                print(f"  - {vp}: page longer than 40 screens; content below that may not have loaded")
    ok = sum(1 for vps in results.values() for fx in vps.values() if "error" not in fx)
    if ok == 0:
        sys.exit("All captures failed. Ask the user for desktop and mobile screenshots; do not score from HTML.")
    print(f"\nScreenshots and {path} written. Read the screenshots before scoring the checklist.")


if __name__ == "__main__":
    main()
