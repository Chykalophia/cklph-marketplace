# Evals

Three lightweight checks to run before each release.

1. **Script tests** (fast, deterministic; run from the repository root): `python3 -m unittest discover -s tests -v`
2. **Trigger evals**: `triggers.json` lists should-trigger and near-miss prompts per skill. Run each in a fresh session (Haiku, Sonnet, Opus) with only this plugin installed and record which skill loads. Adjust a skill's `description` when it misfires. The `anthropic-skills:skill-creator` harness can automate this.
3. **Audit precision fixture**: `audit-fixture/` holds a seeded, flawed PDP and the expected checklist answers. Re-score it after any change to the audit skill, checklist or agent, and track precision and recall over time.
