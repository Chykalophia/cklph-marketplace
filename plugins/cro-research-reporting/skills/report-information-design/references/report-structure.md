# Report Structure & Information Architecture

## Section-by-section template (audit / research report)

**0. Title block** — title, audience ("Internal working document" vs client name), scope, date, data sources. Set expectations immediately.

**1. Executive summary**
- The conclusion in one line, then 2–3 sentences of context.
- A row of 3–4 **metric cards** (the numbers that matter).
- "The one number that matters most" — the single most defensible signal.
- Root-cause list (the few drivers, ordered).
- "The opportunity" and "what's working (don't break these)."
- A "how to read this report" pointer paragraph with anchor links.

**2. The data / baseline**
- First-party numbers as a **funnel** + **step-conversion** view.
- **Benchmarks** vs the right tier (bar comparisons).
- **Data-quality caveats** (e.g., traffic-quality) so you neither over- nor under-state.

**3. Diagnosis** — a *model*, not a symptom list. Explain the mechanism (e.g., a gated funnel where rates multiply). Tie to the audience's reality.

**4. Current-state teardown** — specifics, page by page or area by area. On a real codebase, **map each finding to the actual file/block** so it's directly actionable. Use callouts (issue / opportunity / win) and embed real screenshots where possible.

**5. Evidence** — the sourced research behind the recommendations. Group by theme; mark reliability tiers; show conflicts. Include best-in-class **reference examples with links** (and "what to steal").

**6. Recommendations / blueprint** — the prioritized fixes, plus an **annotated blueprint/wireframe** of the proposed solution (desktop + mobile, current vs recommended). Number each block and map it to the rationale + evidence.

**7. Action plan** — an **impact/effort matrix** (quadrant grid) and a **phased roadmap** (quick wins → structural → advanced), each with expected effect and effort. End with the **metric to track** (a leading indicator on clean data).

**8. Sources & method** — full citations with links and reliability tiers, plus a short methodology/honesty note.

## IA principles
- **Inverted pyramid:** conclusion → support → detail. A reader should get 80% of the value from the exec summary.
- **Progressive depth:** summary for skimmers, sections for readers, appendix/accordions for the thorough.
- **Consistent components:** reuse the same callout/card/table styles so structure is legible at a glance.
- **Anchored navigation:** a sticky top nav or TOC with jump links for any report over a few sections.
- **Numbered cross-references:** blueprint block "6" maps to rationale row "6" maps to action-plan item — the reader can trace a thread.

## Audience calibration
- **Internal / technical** (e.g., for an agency strategist or dev team): dense, data-forward, implementation specifics (file names, exact metrics), reliability tiers exposed, candid trade-offs. This is the default for working documents.
- **Client-facing:** cleaner and outcome-framed, less jargon, fewer hedges, more "what this means for you," visuals over tables. Keep the rigor underneath but lead with benefit.
- When unsure which, ask once up front — it changes tone, density, and how much methodology to show.

## The annotated-blueprint pattern (high value)
When recommending a redesign, don't just describe it — **draw it**:
- A wireframe (structure + intent, not final visual design) of the proposed layout, desktop and mobile.
- **Numbered annotations** on each block explaining the *why* + the evidence reference.
- A **current vs recommended** side-by-side so the change is obvious.
- A color key (keep / add / move / cut).
This turns recommendations into something a team can build from, and is the bridge to an actual prototype. Components for this are in `html-components.md`.
