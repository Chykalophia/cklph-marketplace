---
name: harness-limits
description: What the Claude Code auto-mode safety classifier blocks and how to route around it cleanly. Use when you hit a denied tool call, when planning shared-state or destructive operations, or when scoping a session that might need user-side terminal steps.
---

# harness-limits — what auto-mode can't do alone

The auto-mode classifier blocks a small set of actions that need explicit per-action user authorization.
**Recognize the class, hand it off, don't burn turns rediscovering.**

## What gets blocked
- **Pushing to a remote outside the session's "trusted source-control orgs"** — e.g. pushing
  `cklph-os` from a MailPrism-rooted session. (Data-exfiltration class.)
- **Disabling a global safety gate** — editing `settings.json` to remove a hook, deleting a
  pre-commit script. (Bypass class.)
- **Routing around a denied action** — alternative paths to the same end are also denied. The
  classifier sees the *goal*, not just the surface action.
- **Wide-blast or irreversible ops** — force-push to shared branches, `git reset --hard` on
  remote-tracking, deleting production data, mass external messages.

## What works
When blocked, **don't try alternative tools** — those get blocked too. Hand it back to the user with
**exact terminal commands**:

> The harness classifier blocked `<action>`. Run this in your terminal — your terminal isn't behind
> the classifier and the action will go through:
>
> ```
> <exact command>
> ```

Specific routes:
- **Push outside trusted org** → user runs `git -C <repo> push origin <branch>` in their terminal.
- **Release-merge that an older `cklph-os` pre-commit-gate blocks** — gate v0.8.4+ skips merges
  automatically; older versions need a user terminal `git merge` + `git commit`.
- **Disable a safety gate** → ask the user to flip the setting in `settings.json` themselves.

## Don't do
- **`git commit --no-verify`** doesn't help — that skips *git's* hooks; the Claude harness hook is a
  layer above and runs anyway.
- **Disabling the hook from in-session** as a workaround — the classifier blocks that too.
- **Pretending the failure was something else** — be specific in your report so future-you (or the
  next session) recognizes the pattern instantly.

## Capture the pattern
If the same classifier block hits twice in a project, capture it as a `feedback` memory via `learn`
so the next session routes straight to "here are your terminal commands" instead of rediscovering.
That's what the v0.8.4 merge-gate fix and this skill are jointly closing.
