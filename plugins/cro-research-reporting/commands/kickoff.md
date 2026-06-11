---
description: Kick off an engagement — orient, set up the brief, and route
argument-hint: "[what you want to do] [--brief path]"
allowed-tools: Read, Write, Edit, Glob, Grep, Task
---

Run the `getting-started` flow for the CRO/research/reporting toolkit. Apply the `getting-started` skill and its references in `${CLAUDE_PLUGIN_ROOT}/skills/getting-started/references/`.

1. **Load or create the engagement brief.** Look for `./cro-engagement.md` (or the `--brief` path). If it exists, read it and summarize in 2–3 lines; ask if anything changed. If not, and the work is more than a one-off, capture one using `references/engagement-brief-template.md` — ask only the questions that matter, infer the rest, and write the file (confirm before overwriting).
2. **Orient briefly.** One or two lines on what the toolkit does and the recommended end-to-end flow (brief → audit → report → verify → copy/positioning).
3. **Route.** Take what the user put in `$ARGUMENTS` (or ask "what do you want to do first?") and route to the right skill/command/agent using `references/routing-map.md`. Offer to kick off that first step now.

Keep it light. If the user already knows what they want, skip orientation and route straight there, after loading the brief.
