# Trigger tests — lifecycle Stage 4 (STANDARD.md §10)

A trigger test answers one question: **does the description make the skill fire on its own,
and only when it should?** It tests the `description`, not the body.

## Write the prompts
Store them in `skills/<name>/trigger-tests.md`, one prompt per line, in this exact format:
```
- fire: <a request that should invoke the skill>
- miss: <a near miss that must NOT invoke it>
```
- **3 should-fire prompts.** Phrase them the way Peter actually asks, without naming the skill.
  Vary the wording: one plain, one mid-task, one that only implies the need.
- **2 near misses.** The plausible confusions: a sibling skill's job, or the same nouns with a
  different intent. "Write a new skill" is a near miss for `stocktake`; "prune memory" is a near
  miss for it too, because `weekly-review` and `learn` own that.
- Put the run command at the top of the file so the next person doesn't have to look it up.

## Run them
```bash
bash plugins/cklph-os/skills/authoring/run-trigger-tests.sh <plugin-dir> <plugin:skill> <tests-file>
```
Each prompt gets a fresh `claude -p` session, started from an empty temp directory with
`--setting-sources project`. Only `<plugin-dir>` and Claude Code's built-ins load: your installed
plugins and `~/.claude/skills` are out. A pass therefore means the trigger works on its own merits
against its siblings, not that it happened to win against whatever else is installed.

The runner reads the stream-json output for a Skill tool call naming the skill, prints PASS/FAIL per
prompt and exits non-zero on any failure. `TRIGGER_MODEL` (default `sonnet`) and
`TRIGGER_BUDGET_USD` (default `0.50` per prompt) override the defaults. Expect about a minute and a
few cents per prompt.

## Read the result
- **should-fire fails:** the description reads as a summary, or misses the words people use.
  Rewrite it as a trigger ("Use when…, before…") with the situation's vocabulary. Rerun.
- **near miss fires:** the description is too broad, or overlaps a sibling. Narrow it, and check
  the sibling's description too; the fix may belong there.
- Two rewrite rounds without a pass means the skill's job is fuzzy. Go back to Stage 1: name the gap.

Record the final output (the PASS/FAIL lines and the summary line) in the PR that adds or changes
the skill. A skill without a passing trigger test does not advance past Stage 4.

## Limits
A clean session is not Peter's session. With ~500 installed skills competing, a skill that passes
here can still lose in real use. That is what the usage log and `stocktake` catch at Stage 5.
