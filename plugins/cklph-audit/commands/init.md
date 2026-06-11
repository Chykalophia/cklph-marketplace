---
description: One-time setup — detect subsystems and scaffold audit.config.yaml + empty .audit-baseline.json
argument-hint:
---

Use the **audit-init** skill to bootstrap auditing in this repo. Detect the repo's subsystems, scaffold an `audit.config.yaml` (pre-filled with inferred `units.list`, the three v1 lenses, and the repo's own rule files in `rulesFrom`) and an empty `.audit-baseline.json`. This is a one-time setup step. $ARGUMENTS
