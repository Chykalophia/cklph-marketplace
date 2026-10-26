# reply-shape — trigger tests

Simulates a surface without the SessionStart hook, so the skill must be chosen by its description:
Run: `CKLPH_REPLY_SHAPE=off bash plugins/cklph-os/skills/authoring/run-trigger-tests.sh plugins/cklph-os cklph-os:reply-shape plugins/cklph-os/skills/reply-shape/trigger-tests.md`

- fire: Give me a status update on where the database migration work stands and what's left.
- fire: My deploy failed with "ECONNREFUSED 127.0.0.1:5432". Tell me what's wrong and what to do.
- fire: Lay out the steps to move our app from Heroku to Vercel.
- miss: Draft an email to a client explaining the project is delayed by a week.
- miss: Write the release notes for version 2.3 of our app.

## Result (2026-10-26, Sonnet): 2/5. Known limit, not a pass.
Two description rounds, 0/3 should-fire both times; the near misses pass. The model doesn't load a
reply-style skill to answer an ordinary question. This skill's real wiring is the SessionStart hook
(STANDARD §10 Wire, "or a hook"), which is verified by `test/hooks.bats`. On Desktop, Cowork and the
web there is no hook, so expect the rules to apply only when the user invokes `reply-shape` by name.
