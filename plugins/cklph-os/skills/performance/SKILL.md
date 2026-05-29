---
name: performance
description: Measure-first performance optimization. Use when load times, Core Web Vitals, or response times miss their targets, or when profiling reveals a bottleneck. Never optimize without evidence.
---

# performance — measure first, then fix

No optimizing without evidence — profiling-free tuning adds complexity for guesses. Loop:
**measure → identify the real bottleneck → fix that one thing → measure again → guard against regression.**

## Targets (Core Web Vitals)
| Metric | Good |
|---|---|
| LCP | ≤ 2.5s |
| INP | ≤ 200ms |
| CLS | ≤ 0.1 |

Backend rule of thumb: API p95 < 200ms; initial JS < ~200KB gzipped.

## Where to look (by symptom)
- **Slow first load** → bundle size + code-splitting; server TTFB in the network waterfall.
- **Sluggish interaction** → long tasks (>50ms) on the main thread; excess re-renders.
- **Slow after navigation** → API response times; request waterfalls; N+1 fetches.
- **Slow API** → DB query log: N+1, missing indexes, unbounded scans.

## Top anti-patterns → fix
- **N+1 queries** — fetch with a join / `include`, not a query per row.
- **Unbounded fetch** — always paginate (`take` / `range` + ordering); never `findMany()` the whole table.
- **Images** — set width/height (stops CLS); `loading="lazy"` + `decoding="async"` below the fold;
  `fetchpriority="high"` on the LCP image; responsive `srcset` with AVIF/WebP.
- **React re-renders** — hoist stable object/array literals out of render; `memo` / `useMemo` only for
  *proven* hot paths (overuse is its own cost).
- **Bundle** — route-level `lazy()` + `Suspense`; dynamic-import heavy, rarely-used deps.
- **Caching** — cache hot, rarely-changing reads (TTL or HTTP `Cache-Control`); content-hash +
  `immutable` for static assets.

## Verify
- [ ] Before/after numbers exist (not vibes).
- [ ] The named bottleneck is the thing you fixed.
- [ ] CWV back in "Good"; bundle didn't grow.
- [ ] No new N+1; existing tests still green.

Reject the usual rationalizations: "optimize later" (debt compounds — fix obvious anti-patterns now),
"fast on my machine" (profile on representative hardware/network), "users won't notice 100ms" (they do).
