---
name: stocktake
description: Skill hygiene from the local usage log. Use during the weekly review, when asked which skills actually get used, or before adding or porting a skill, to find unused skills to prune and duplicates that compete to fire.
---

# stocktake — which skills earn their place

A skill that never fires is not neutral: it adds a competing trigger that makes *other* skills
fire less reliably. This is the Measure and Prune stage of the skill lifecycle (STANDARD.md §10).

## 1. Run the script
```bash
python3 "${CLAUDE_PLUGIN_ROOT}/skills/stocktake/stocktake.py"
```
It is read-only and stdlib-only. It reads `~/.claude/cklph-usage/skills.jsonl` (written by the
`skill-usage-log.sh` hook) and the installed, enabled skills (`claude plugin list --json` plus
`~/.claude/skills/`), then prints three sections:
- **Most used:** invocations per skill over 7 / 30 / 60 days.
- **Zero invocations in 60 days:** per plugin. A fully unused plugin is one row ("disable it?");
  a partly used plugin lists its unused skills by name, since those are the real prune candidates.
  `--full` names every unused skill.
- **Trigger collisions:** known duplicates, same-named skills in different plugins, and pairs whose
  descriptions overlap heavily (`--threshold`, default 0.30).

If the log covers fewer than 60 days, the script marks the prune list **provisional**. Say so,
and recommend nothing gets deleted on a provisional list.

## 2. Read the output with judgment
- **Blind spots.** The hook sees model-invoked skills (Skill tool) and typed `/plugin:skill` slash
  commands. It cannot see a skill whose text was read without invoking it, or invocations on Desktop
  or the web (hooks are CLI-only). A skill used mostly on those surfaces will look dead here.
- **Phase skills that `flow` calls** count only when invoked through the Skill tool. If `flow` ran
  and a phase shows zero, check whether `flow` loaded it some other way before calling it dead.
- **A collision score is a hint**, not a verdict. Read both descriptions before calling it a duplicate.

## 3. Report
Keep it to one screen:
1. The three tables from the script, trimmed to the rows that matter.
2. **At most 3 recommendations**, each one of: *rewrite the trigger* (it should fire and doesn't),
   *merge into <neighbor>*, *disable the plugin*, or *delete*. Name the skill and the reason.
3. Two-strike rule, only once the log covers 60 days: a skill on the prune list at two consecutive
   weekly reviews with no trigger rewrite in between gets **delete** as the recommendation. A skill
   installed or updated less than 60 days ago is never on the list; the script reports it as new
   instead.

Peter decides. Never delete, disable, or uninstall anything from this skill; recommend only.

## Anti-patterns
- Pruning on a provisional log.
- Ten recommendations. Three, ranked; the rest wait for next week.
- "It might be useful someday." That is what the 60-day window already accounts for.
