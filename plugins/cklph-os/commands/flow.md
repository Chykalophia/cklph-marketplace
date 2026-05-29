---
description: Run the full cklph-os build loop (refine→spec→plan→build→review→verify→ship).
argument-hint: <what to build>
---

Use the **flow** orchestrator skill to take this end-to-end:

$ARGUMENTS

First ask which mode — **full-agentic**, **partial**, or **interactive** — unless I already said. Then
run the phases (detect where we are; skip `refine` if the goal is already clear), keeping your context
lean via sub-agent waves. Branch first; never commit to dev/main.
