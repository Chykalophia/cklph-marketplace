#!/usr/bin/env bash
# reply-shape-context.sh — SessionStart hook.
# Prints the reply-shape rules (SKILL.md minus frontmatter) to stdout; Claude Code adds
# SessionStart stdout to the session context, so the contract is always on in the CLI.
# Read-only, no network. Fails open: a missing file never blocks a session.
set -uo pipefail

# Opt out: CKLPH_REPLY_SHAPE=off (in your shell or settings.json env) skips the injection.
[ "${CKLPH_REPLY_SHAPE:-on}" = "off" ] && exit 0

RULES="${CLAUDE_PLUGIN_ROOT:-}/skills/reply-shape/SKILL.md"
[ -f "$RULES" ] || exit 0

# Skip YAML frontmatter: print only lines after the second '---'.
awk 'n>=2 {print} /^---$/ && n<2 {n++}' "$RULES"
exit 0
