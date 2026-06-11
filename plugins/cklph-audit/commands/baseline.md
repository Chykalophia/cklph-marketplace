---
description: Interactively accept currently-open findings into .audit-baseline.json, with a reason for each
argument-hint:
---

Use the **audit-baseline** skill to accept the currently-open confirmed findings into `.audit-baseline.json`. Walk each open finding interactively, prompt for a `reason` (so accepting debt is a deliberate, annotated act — like the CASA "deferred to H-8" notes), and write its stable fingerprint + rule + file + title + reason + author into the baseline. Future `:run`s suppress anything whose fingerprint is baselined. $ARGUMENTS
