---
name: handoff
description: Compact the current session into a handoff doc so a fresh session continues cleanly. Use when context is filling up, at session end, or when switching tasks. Saves to a temp file (not the repo) and references artifacts instead of duplicating them.
---

# handoff — bridge to the next session

Compact the live session into a short handoff so a fresh agent (or future-you) resumes without
re-deriving context. Trigger when context is filling, at session end, or when switching tasks. If the
user names a focus for the next session, tailor the doc to it.

Write it to a **temp file** — `"$TMPDIR/handoff-<repo>-<date>T<HHMMSS>.md"` (fall back to `/tmp/…`;
include the time so concurrent or same-day sessions don't clobber each other), **not** the repo —
it's ephemeral. Durable working state still belongs in `STATE.md`; this is just the session bridge.

## Contents (reference, don't duplicate)
- **Goal** — what we're doing + why, in 1–2 lines.
- **State** — done / in-progress / current branch + last commit.
- **Next steps** — the concrete actions to resume, in order.
- **Suggested skills** — which skills the next agent should invoke: cklph-os phases **plus** any installed
  specialist skill that fits the work (see `start-here` for discovery).
- **Key artifacts** — link specs / plans / PRDs / issues / commits / `STATE.md` by path or URL; don't
  paste their contents in.
- **Open questions / blockers.**

**Redact secrets** — no API keys, tokens, passwords, or PII. Keep it lean: a pointer map, not a transcript.
