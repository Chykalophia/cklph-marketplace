---
description: Turn findings into a polished HTML report
argument-hint: "<topic or source files> [--format html|docx|pdf] [--audience internal|client]"
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, Task
---

Turn the findings or sources in `$ARGUMENTS` into a polished, well-organized, render-safe report. Parse `--format` (default html) and `--audience`. Apply the `report-information-design` skill and its references in `${CLAUDE_PLUGIN_ROOT}/skills/report-information-design/references/`. For a hands-off build, delegate to the `report-builder` agent.

Steps:
1. **Confirm audience & format.** Default to a self-contained HTML report unless docx/pdf/pptx is requested. Match the subject's real brand tokens.
2. **Structure BLUF:** executive summary → data/baseline → diagnosis → teardown → evidence (tiered) → recommendations + annotated blueprint → action plan (impact/effort + roadmap + metric) → sources & method.
3. **Build robustly** with the component library. Obey the rendering rules: no text inside data-width bars (use label|track|value rows); no absolute-positioned label clouds (use quadrant grids); collapse grids on mobile; keep prose out of visuals.
4. **Generate outline-first, section-by-section** (pass prior headers in to avoid duplication); polish pass at the end.
5. **Cite** with the gapless sequential spec + one-per-line Sources list; keep footnote ids and superscripts in sync; tier reliability.
6. **QA before delivering** (`references/qa-checklist.md` + the grounding gate in `references/citations-and-grounding.md`): tag balance, `node --check` on any JS, a render check, link/footnote integrity, grounding, responsive, print. Optionally run the `cro-verifier` agent. Then present the file and offer a browser screenshot if you couldn't render locally.
