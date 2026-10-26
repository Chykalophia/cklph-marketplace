---
name: weekly-review
description: Short periodic retro — what worked, what was friction, one thing learned, next week's ONE focus. Use at end of week, "time for a review", or when planning the upcoming week. Selectivity is the point — not a 30-item dump.
---

# weekly-review — short, selective, forward

Four sections. Keep it tight — if the list grows past 3 items per section, you're cataloguing, not reviewing.

## What worked
Name the wins. Include the *why* only if it's non-obvious — if it's obvious, skip the why and move on.

## What was friction
**Recurring** friction only. A one-off frustration isn't a pattern; it's a Tuesday. List the things that showed up more than once this week — those are the signal.

## What I learned
**One item.** The single thing you'll do differently next week. Not five lessons (you won't act on five). One concrete behavior change.

## Next week's ONE focus
The one outcome that makes next week a win. Same discipline as `daily-frame` — one, not three. If you can't pick one, you don't have a plan, you have a wishlist.

## Prune stale memory (60 seconds)
Scan `~/.claude/projects/<project-hash>/memory/feedback_*.md`. **Delete** entries where the code / system / pattern they referenced is gone. **Update** entries where the rule holds but the example moved. **Promote** project-specific entries to `GLOBAL.md` if they're now cross-project. See `learn` for the full prune flow. Active beats `MEMORY.md` silently truncating at line 200.

## Skill hygiene (5 min)
Invoke `stocktake`. It reads the local usage log and reports most-used skills, skills with zero
invocations in 60 days, and duplicates competing to fire, with at most 3 recommendations. Peter
picks: rewrite the trigger, merge into a neighbor, disable, or delete. A skill on the prune list two
reviews running with no trigger rewrite in between gets deleted. This step is what makes the Measure
and Prune stages of the skill lifecycle (STANDARD.md §10) actually happen; don't skip it.

## Anti-pattern
30-item retros. Exhaustive lists feel productive and change nothing. **Discipline is selectivity** — what you leave out is the work.

Pairs well with `daily-frame` (which seeds tomorrow's focus from tonight's shutdown) and `decide` (when the "one focus" requires a real choice).
