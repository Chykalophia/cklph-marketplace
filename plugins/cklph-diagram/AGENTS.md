# AGENTS.md

Rules for AI agents working in this repo. Claude reads this through `CLAUDE.md`. Other
AGENTS.md-aware tools read it directly. Keep rules here, not in `CLAUDE.md`.

## Comments
- A comment says why, never what. If the code already says it, delete the comment.
- No history in comments: no "before 0.12.3", "the old check", "fixed", "now uses". The CHANGELOG and git hold history.
- A regression test may name the bug it guards against. Production code states the rule in the present tense.
- Keep usage headers on scripts and docblocks on exported functions. Don't docblock private helpers.
- No commented-out code. No TODO without an owner or a concrete action.
- Section banners only in files over about 300 lines.
- Some tests read comments, and some scripts print their header as `--help`. Check both before you edit a comment.
- New comments: no em or en dashes, short plain sentences.
