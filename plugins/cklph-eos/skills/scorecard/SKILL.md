---
name: scorecard
description: Pick and run 5-15 weekly leading metrics that predict outcomes, with a number, target, owner, and weekly trend per row. Use when setting up team metrics, doing a weekly metrics review, or when a number is off two weeks running and needs to become an issue.
---

# scorecard — 5-15 numbers that predict the result

A scorecard is a small set of weekly leading metrics. Each row — **number, target, owner, weekly trend.** Five to fifteen rows. Reviewed in five minutes at the weekly sync.

## Leading, not lagging

- **Leading** — predicts the result. "Discovery calls booked this week." "Trials started this week." "Cycle time on PRs this week."
- **Lagging** — confirms the result after the fact. "MRR this month." "Quarterly revenue." "Churn last month."

You need lagging metrics for the board. You need leading metrics to actually change anything. The scorecard is leading. If your scorecard is lagging, you're driving by looking in the mirror.

## Scoreboard vs dashboard

- **Scoreboard** — the 5-15 numbers everyone on the team watches every week. Tight, public, simple.
- **Dashboard** — the deeper analytics layer you dig into when a scoreboard number is off. Wide, on-demand.

Don't confuse them. A scoreboard with 40 rows is a dashboard, and no one reads it.

## Rules per row

- **Number** — measurable, automated to pull if possible.
- **Target** — set on day one. "We'll know it when we see it" is not a target.
- **Owner** — one person. They report the number; they investigate when it's off.
- **Trend** — last 8-13 weeks visible. A single week is noise; a trend is signal.

## Off-target two weeks running → it becomes an issue

One bad week is noise. Two in a row is a pattern. Route it to `issues-ids` in the same `weekly-sync`. Don't talk about it during the scorecard block; surface it and move on.

## Anti-patterns

- **30 metrics** — no one watches; the review eats the meeting.
- **Lagging-only** — revenue, MRR, churn. By the time it moves, you missed the window to act.
- **Vanity metrics** — impressions, followers, page views. Replace with the conversion that actually matters.
- **No owner per metric** — when it's off, no one investigates.
- **No target** — you can't tell if you're on or off; the meeting devolves into vibes.
- **Targets that never move** — review them quarterly. If a target hasn't moved in a year, it's wallpaper.

## Triggers

Setting up team metrics. Weekly metrics review. A number is off and needs surfacing. "What should we actually be measuring?"

Pairs with `weekly-sync` (the 5-minute scorecard block lives there) and `issues-ids` (where off-target metrics get solved).
