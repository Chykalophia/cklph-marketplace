#!/usr/bin/env python3
"""Render pages the way shoppers see them, for the heuristic checklist.

Reading HTML through a fetch tool shows text only: no layout, imagery, fold,
sticky bars or mobile view, and Nielsen's re-analysis of Baymard's data found
43% of usability problems span several screens. This script renders each URL
at desktop and mobile widths and saves:
  * an above-the-fold screenshot and a full-page screenshot per viewport
  * facts.json: title, H1, price text, primary buy button text and whether it
    is above the fold, image count, form-field count, load timings

Requires Playwright for Python (pip install playwright). Set CHROMIUM_PATH to use an
existing Chromium binary, else run `python3 -m playwright install chromium`.
HTTPS_PROXY from the environment is honoured unless --no-proxy is given.

  python3 capture_pages.py https://store.example/products/x https://store.example/cart --out audit-captures
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
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const buyRe = /(add to (cart|bag|basket)|buy now|checkout|purchase|pre-?order)/i;
  const buttons = [...document.querySelectorAll('button, input[type=submit], a[role=button], a.button, a.btn')]
    .filter(vis).map(b => ({text: (b.innerText || b.value || '').trim().slice(0, 60),
                            top: Math.round(b.getBoundingClientRect().top)}))
    .filter(b => buyRe.test(b.text));
  const priceEl = [...document.querySelectorAll('[class*=price], [itemprop=price], [data-price]')].find(vis);
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const lcp = window.__lcp || null;
  return {
    title: document.title,
    h1: [...document.querySelectorAll('h1')].filter(vis).map(h => h.innerText.trim().slice(0, 120)),
    price_text: priceEl ? priceEl.innerText.trim().slice(0, 60) : null,
    buy_buttons: buttons.slice(0, 5),
    buy_button_above_fold: buttons.length ? Math.min(...buttons.map(b => b.top)) < vh : null,
    images_visible: [...document.images].filter(vis).length,
    form_fields_visible: [...document.querySelectorAll('input:not([type=hidden]), select, textarea')].filter(vis).length,
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


def slug(url):
    return re.sub(r"[^a-z0-9]+", "-", url.lower().split("://", 1)[-1]).strip("-")[:80]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("urls", nargs="+")
    ap.add_argument("--out", default="audit-captures")
    ap.add_argument("--viewports", nargs="+", default=list(VIEWPORTS), choices=list(VIEWPORTS))
    ap.add_argument("--timeout", type=int, default=45000)
    ap.add_argument("--no-proxy", action="store_true", help="ignore HTTPS_PROXY from the environment")
    args = ap.parse_args(argv)
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
                    page.goto(url, wait_until="load", timeout=args.timeout)
                    page.wait_for_timeout(1500)
                    # scroll through the page so lazy-loaded images render, then return to the top
                    page.evaluate("""async () => {
                      for (let i = 0, y = 0; i < 40 && y < document.documentElement.scrollHeight; i++, y += window.innerHeight) {
                        window.scrollTo(0, y); await new Promise(r => setTimeout(r, 150)); }
                      window.scrollTo(0, 0); }""")
                    page.wait_for_timeout(500)
                    page.screenshot(path=base + "--fold.png")
                    page.screenshot(path=base + "--full.png", full_page=True)
                    facts = page.evaluate(FACTS_JS)
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
                  f"images: {fx['images_visible']} | fields: {fx['form_fields_visible']} | "
                  f"LCP: {fx['lcp_ms']} ms | horizontal scroll: {fx['has_horizontal_scroll']}")
    ok = sum(1 for vps in results.values() for fx in vps.values() if "error" not in fx)
    if ok == 0:
        sys.exit("All captures failed. Ask the user for desktop and mobile screenshots; do not score from HTML.")
    print(f"\nScreenshots and {path} written. Read the screenshots before scoring the checklist.")


if __name__ == "__main__":
    main()
