---
description: Validate a lens — run it against fixtures and/or a historical commit; report precision/recall vs ground truth
argument-hint: <lens> [ref]
---

Use the **audit-backtest** skill to validate a lens against ground truth. Parse `$ARGUMENTS` as `<lens> [ref]`. Run the lens over `fixtures/<lens>/should-flag/` and `fixtures/<lens>/should-not-flag/` to compute recall + precision, and — when a git `[ref]` is given — run the lens against that historical commit and compare to its known findings. Report recall, precision (after verify), and pass/fail against the §10 gate (suggested recall ≥ 0.8, precision ≥ 0.7). This is the validation gate that decides whether a lens is trusted to ship. $ARGUMENTS
