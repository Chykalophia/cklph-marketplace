# Experimentation

Test design, sizing, readouts and the test log now live in the **`experiment-design`** skill, with scripts that do the maths:

- `skills/experiment-design/references/base-rates.md` — how often tests win and by how much (set expectations with this).
- `skills/experiment-design/references/test-design.md` — metrics, guardrails, peeking, sequential tests, CUPED, SRM, Twyman's law.
- `skills/experiment-design/references/low-traffic.md` — what to do when the store can't power a test.
- `skills/experiment-design/templates/preregistration.md` — the test plan.
- `skills/experiment-design/scripts/` — `power.py`, `srm_check.py`, `readout.py`, `test_log.py`.

## Prioritisation frameworks (for the audit's Test bucket)
- **PXL** (CXL): mostly yes/no criteria, including whether user testing, qualitative feedback, heatmaps or analytics back the idea. Removes scorer subjectivity, but has no published validation that high scores win more, so calibrate it against the client's own test log over time. https://cxl.com/blog/4-frameworks-help-prioritize-conduct-conversion-testing/
- **ICE / PIE**: fast but subjective 1–10 scores; fine for a team starting out, easy to game.
- **Levers** (Conversion.com): tag every idea Cost / Trust / Usability / Comprehension / Motivation and use per-lever win history to choose what to explore next. https://www.conversion.com/blog/lever-framework/
- **ResearchXL** (CXL/Speero) inputs: heuristic + technical review, analytics, mouse tracking, on-site polls, surveys (200+), user testing; findings sorted into Instrument / Just do it / Test / Hypothesize / Investigate. https://speero.com/post/how-to-create-winning-tests-using-the-researchxl-model
