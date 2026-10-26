---
name: authoring
description: Author a new cklph-os skill (or extend an existing one). Use when creating, editing, or testing a skill before deployment. Combines the format spec with TDD-for-skills (baseline → write → close loopholes).
---

# authoring — extending cklph-os

A cklph-os skill is a **thin, trigger-loaded reference** the agent consults. Authoring follows
TDD-for-documentation: run a baseline scenario without the skill, watch what the agent gets wrong,
write the minimal skill that fixes those specific failures, then close the loopholes.

## Iron rule
**No new skill (or material edit) without a failing baseline first.** "Clear to me" ≠ "clear to a
fresh agent." 15 min of testing saves hours of bad guidance in circulation.

## 1. Decide if a skill is the right answer
Create when: a non-obvious technique reused across projects; agents reliably fail without it.
**Skip** for: one-off solutions; well-documented standard practice; project-specific rules (put in
`AGENTS.md`); anything regex / static analysis can enforce — automate it, skills are for judgment calls.

## 2. Structure (cklph-os house style)
- One folder per skill: `skills/<name>/SKILL.md` (kebab-case name, matches the directory).
- Frontmatter — minimal, **no colon-space (`: `)** inside the description value (it parses as YAML
  nested keys and breaks loading):
  ```yaml
  ---
  name: <kebab-name>
  description: <trigger>. Use when <situation>, before <action>.
  ---
  ```
  The description is the **trigger** — *when* to invoke. NOT a workflow summary. Summarizing the
  process in the description causes the model to shortcut past the body and follow the description
  instead of the skill.
- Body in **imperative voice** ("Read the file…" not "This skill reads…"), under ~120 lines for thin
  skills. Push depth into `references/*.md` and load on demand (progressive disclosure).
- One excellent example beats five mediocre ones; one language, not five.
- Reference sibling refs with `@relative/path.md`. Reference other skills by **name only**; never
  force-load with `@plugin/skills/...` — that burns context.

## 3. RED → GREEN → REFACTOR
1. **RED — baseline.** Run the scenario via a fresh-context sub-agent WITHOUT the skill. Capture the
   exact failures and the verbatim rationalizations.
2. **GREEN — minimal skill.** Write only what addresses those specific failures + their
   rationalizations. Don't add content for hypothetical cases.
3. **REFACTOR — close loopholes.** Re-run; if a new rationalization appears, add an explicit counter
   ("Don't keep it 'for reference' — delete it") and re-test until bulletproof.

## 4. Register & verify
Every skill moves through the lifecycle in STANDARD.md §10 (Intake → Port/Write → Wire → Prove →
Measure → Prune). Authoring covers the first four:
- **Intake:** name the gap in one sentence and check for an existing skill that already covers it.
- **Wire:** add a row to `start-here`'s routing table **and** call it from a phase skill or a hook.
  A skill Peter has to remember is a skill that won't fire.
- **Prove:** write `skills/<name>/trigger-tests.md` and run it; see @trigger-tests.md. Then do one
  real run on a real repo and save it under `docs/proof/<skill>/<date>.md`.

Then:
- Directory name matches `name:` exactly.
- cklph-os auto-discovers from `skills/`; no index edit needed.
- Validate: `claude plugin validate <plugin-dir>`; ensure no broken `@ref` links.
- Final pass:
  - [ ] Description is a trigger, not a process summary; no `: ` inside.
  - [ ] Body ≤ ~120 lines (longer → push into `references/`).
  - [ ] One concrete example; imperative voice.
  - [ ] Failing baseline existed, now passes with the skill present.
  - [ ] Routing row in `start-here` + a call from a phase skill or hook.
  - [ ] `trigger-tests.md` passes (3 fire, 2 near misses); output pasted in the PR.

## Anti-patterns
- **Narrative** ("In session 2025-03-…") — too specific, not reusable.
- **Multi-language dilution** — example.js + example.py + example.go. Pick one; do it well.
- **Force-loading other skills via `@path`** — burns context. Reference by name.
- **Editing a skill without re-testing** — same iron rule applies.
