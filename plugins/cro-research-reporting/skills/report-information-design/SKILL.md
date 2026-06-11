---
name: report-information-design
description: >
  This skill should be used when turning analysis or research into a polished, well-organized report,
  brief, audit, or one-pager, especially a self-contained HTML document. Trigger phrases: "build a
  report", "write up the findings", "create an HTML report/brief/audit", "turn this research into a
  report", "how should I present this", "organize this information", "make it look professional", "add
  an executive summary and recommendations". Use it whenever findings need to become a shareable
  deliverable.
license: MIT
metadata:
  author: Chykalophia
  version: "0.2.0"
---

# Report & Information Design

Turn findings into a document a busy decision-maker can scan in two minutes and a practitioner can act on for a month, and make it render flawlessly.

## Principles
1. **Lead with the conclusion (BLUF).** Open with the finding and the recommendation.
2. **One idea per block.**
3. **Design for scanning** (headings, short paragraphs, callouts, visuals).
4. **Show, don't tell** (charts, annotated blueprints over prose).
5. **Cite inline + collect sources** with reliability tiers and the gapless citation spec (`references/citations-and-grounding.md`).
6. **Prioritize visibly** (impact/effort matrix + phased roadmap).
7. **Calibrate to audience** (internal-technical vs client-facing).
8. **Self-contained, responsive, print-friendly, QA'd** before delivery.

## Default report structure
Executive summary → data/baseline → diagnosis (a model, not symptoms) → current-state teardown → evidence (tiered sources) → recommendations + annotated blueprint → action plan (impact/effort matrix + phased roadmap + the metric) → sources & method. Templates in `references/report-structure.md`.

## Build & cite
- Build with the render-safe component library in `references/html-components.md`. Obey the rules: never put text inside data-width bars (use label|track|value rows); never use absolute-positioned label clouds (use quadrant grids); collapse every grid on mobile; keep prose out of visuals; match the subject's real brand tokens.
- Generate **outline-first, section-by-section** (pass prior headers in to avoid duplication), then a polish pass. Cite with the **gapless sequential spec** and a one-per-line Sources list (`references/citations-and-grounding.md`).

## QA before delivering
Run `references/qa-checklist.md` (tag balance, `node --check` on any JS, a render check, link/footnote integrity) plus the grounding gate from `references/citations-and-grounding.md` (every load-bearing claim cited; numbers/dates attributed; no sources dropped in a merge).

## Reference map
- `references/report-structure.md` — section templates, IA principles, audience calibration, the annotated-blueprint pattern.
- `references/html-components.md` — render-safe HTML/CSS component library + the rendering-bug rules.
- `references/citations-and-grounding.md` — citation spec, outline-first generation, question-type templates, tone presets, and the grounding/self-verification gate.
- `references/qa-checklist.md` — pre-delivery verification steps and commands.

## Engagement context
At the start of a task, check for the engagement brief (default `./cro-engagement.md`, created by the `getting-started` skill / `/kickoff`). If it exists, read it first and match the deliverable's audience (internal vs client-facing) and the brand voice/tokens it records. If it's missing and the work is more than a one-off, offer to capture one via `getting-started`.

## Related skills
`deep-research-synthesis` (supplies tiered evidence), `ecommerce-cro-audit` (a frequent input). Agents: `report-builder` runs this skill; `cro-verifier` checks citations and grounding before ship.

## Guardrails
Don't put explanatory prose inside visuals. Don't ship a visual that could overlap/clip at any width. Always verify before presenting; offer a browser screenshot if you can't render locally.
