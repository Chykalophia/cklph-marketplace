---
name: harness-limits
description: How the Claude Code auto-mode classifier and care rules constrain in-session actions and how to route around each cleanly. Use when a tool call is denied, when planning shared-state or destructive operations, or when scoping a session that might need user-side terminal steps.
---

# harness-limits — the two layers between you and the action

Two different mechanisms restrict what auto-mode can do. They feel similar; they require **different
responses**.

## Layer A — hard classifier blocks (model literally cannot proceed)

The Claude Code classifier denies these tool calls regardless of intent. Alternative tools that reach
the same goal are denied too — it sees the *goal*, not just the surface action.

- **Push to a remote outside the session's "trusted source-control orgs"** — e.g. pushing `cklph-os`
  from a MailPrism-rooted session. (Data-exfiltration class.)
- **Disabling a global safety gate** — editing `settings.json` to remove a hook, deleting a
  pre-commit script, `chmod -x` on a gate. (Bypass class.)
- **Routing around a denied action** — once a goal is denied, alternative paths to that goal are
  denied too.

**Route — hand back to the user with exact terminal commands:**

> The harness classifier blocked `<action>`. Run this in your terminal — your terminal isn't behind
> the classifier and the action will go through:
>
> ```
> <exact command>
> ```

**Do NOT** try alternative tools first. They will be denied. You'll burn turns.

## Layer B — care rules (you CAN proceed, but ask first)

The harness asks for explicit confirmation on actions that are hard to reverse, affect shared systems
beyond your local environment, or could otherwise be risky/destructive. These are
**judgment-blocked**, not classifier-blocked — you don't try and get denied; you check first.

Examples:
- **Destructive git** — force-push, `git reset --hard`, deleting branches, discarding uncommitted work.
- **`rm -rf`** of anything outside `/tmp`.
- **Production data** — deletes, drops, mass updates; modifying CI/CD pipelines.
- **External messages** — email, Slack, public PRs/issues, posting to third-party services.
- **Uploading code to public services** — pastebins, gists, AI services. Could be cached or indexed
  even after deletion.

**Route — ask the user with specific action + blast radius:**

> About to `<action>` — `<blast radius>` (e.g. "force-push origin/dev — overwrites the last 3 commits
> on the shared dev branch"). Confirm before I proceed?

Once confirmed *in this scope*, proceed. Authorization for one action does **not** generalize to all
similar actions in the session.

## What does not help (for either layer)

- **`git commit --no-verify`** — skips *git's* hooks; the Claude harness hook is a layer above.
- **Disabling the gate from in-session** — Layer A blocks that too.
- **Pretending the failure was something else** — be specific in your report so future-you (and the
  next session) recognizes the pattern instantly.

## Capture recurring blocks

If the same Layer A block hits twice in a project, capture it as a `feedback` memory via `learn` so
the next session routes straight to "here are your terminal commands." That's how the v0.8.4
merge-gate fix and this skill are jointly closing the burn-turns gap.
