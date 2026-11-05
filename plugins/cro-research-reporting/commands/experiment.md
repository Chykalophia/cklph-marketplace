---
description: Plan, size, or read out an A/B test, or log a result
argument-hint: "plan|size|readout|log [details: page, baseline, traffic, counts...]"
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

Apply the `experiment-design` skill and its references in `${CLAUDE_PLUGIN_ROOT}/skills/experiment-design/`; the scripts below live in its `scripts/` folder, run with `python3`. Read `./cro-engagement.md` first for traffic, testing tool and test-log path. The first word of `$ARGUMENTS` picks the mode; if it's missing, infer it from the rest.

- **plan** — fill `templates/preregistration.md` for the hypothesis given (pull evidence and lever from the audit if one exists), then size it as below. Save the plan next to the brief.
- **size** — run `scripts/power.py` (`size` for a target MDE, `mde` for fixed traffic and duration). If the detectable lift is above ~10% or the run exceeds ~8 weeks, present the options in `references/low-traffic.md` instead of a test.
- **readout** — run `scripts/readout.py` with the arm counts (and the configured split as `--weights` if unequal, guardrails, planned MDE, days). Write the result with `report-information-design/references/experiment-readout.md`. Then offer to log it.
- **log** — `scripts/test_log.py add ...`; with no details, run `summary` if the log has tests, otherwise say none are logged yet and offer `init`.

Never compute statistics by hand; always run the scripts and quote their output. Ask only for numbers the scripts need and you can't find.
