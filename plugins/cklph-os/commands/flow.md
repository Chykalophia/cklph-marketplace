---
# Mirrors skills/flow/SKILL.md's description (test/hooks.bats checks they match). This command
# shares the skill's name, so its description is the one Claude sees; keep the trigger text here.
description: The cklph-os ORCHESTRATOR — runs the full refine→spec→plan→build→review→verify→ship loop end-to-end. Use for a complete build. Asks the user's mode (full-agentic / partial / interactive), auto-detects the next phase, and keeps the main context lean via sub-agent waves.
argument-hint: <what to build>
---

Read `${CLAUDE_PLUGIN_ROOT}/skills/flow/SKILL.md` (the **flow** skill) and follow it for: $ARGUMENTS

First ask which mode — **full-agentic**, **partial**, or **interactive** — unless I already said. Then
run the phases (detect where we are; skip `refine` if the goal is already clear), keeping your context
lean via sub-agent waves. Branch first; never commit to dev/main.
