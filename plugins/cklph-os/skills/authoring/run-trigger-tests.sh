#!/bin/bash
# Stage 4 trigger test for one skill (STANDARD.md §10). See trigger-tests.md beside this file.
#
# Usage: run-trigger-tests.sh <plugin-dir> <plugin:skill> <tests-file>
#   tests-file lines:  "- fire: <prompt>"  should invoke the skill
#                      "- miss: <prompt>"  near miss, must NOT invoke it
#
# Each prompt runs in a fresh `claude -p` session, from an empty temp dir, with
# `--setting-sources project` so ONLY <plugin-dir> (plus Claude Code built-ins) is loaded.
# Your installed plugins and ~/.claude/skills stay out, so a pass means the trigger works on
# its own merits. Detection reads the stream-json output for a Skill tool_use naming the skill.
#
# Env: TRIGGER_MODEL (default sonnet), TRIGGER_BUDGET_USD per prompt (default 0.50).
# Exit 0 = all pass, 1 = any fail, 2 = usage error.

set -uo pipefail

PLUGIN_DIR="${1:-}"; SKILL="${2:-}"; TESTS="${3:-}"
if [ -z "$PLUGIN_DIR" ] || [ -z "$SKILL" ] || [ ! -f "$TESTS" ]; then
    echo "usage: $0 <plugin-dir> <plugin:skill> <tests-file>" >&2
    exit 2
fi
PLUGIN_DIR=$(cd "$PLUGIN_DIR" && pwd)
MODEL="${TRIGGER_MODEL:-sonnet}"
BUDGET="${TRIGGER_BUDGET_USD:-0.50}"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

pass=0; fail=0; n=0
while IFS= read -r line; do
    case "$line" in
        "- fire: "*) want=fire; prompt="${line#- fire: }" ;;
        "- miss: "*) want=miss; prompt="${line#- miss: }" ;;
        *) continue ;;
    esac
    n=$((n + 1))
    out="$WORK/run-$n.jsonl"
    (cd "$WORK" && printf '%s\n' "$prompt" | claude -p \
        --plugin-dir "$PLUGIN_DIR" --setting-sources project --no-session-persistence \
        --model "$MODEL" --max-budget-usd "$BUDGET" --allowedTools Skill \
        --output-format stream-json --verbose > "$out" 2>/dev/null)
    rc=$?
    # A Skill tool_use carries {"name":"Skill","input":{"skill":"<plugin:skill>"...}}.
    # A session that errored (auth, budget, crash) never calls the Skill tool either: it must count
    # as an ERROR, never as a miss, or every near-miss case would pass on a broken run.
    if [ "$rc" -ne 0 ] || ! grep -q '"type":"result"' "$out"; then got=error
    elif grep -qF "\"skill\":\"$SKILL\"" "$out"; then got=fire
    else got=miss; fi
    if [ "$got" = "$want" ]; then
        pass=$((pass + 1)); verdict=PASS
    else
        fail=$((fail + 1)); verdict=FAIL
    fi
    printf '%s  want=%-4s got=%-5s  %s\n' "$verdict" "$want" "$got" "$prompt"
done < "$TESTS"

if [ "$n" -eq 0 ]; then
    echo "no test cases in $TESTS (lines must start with '- fire: ' or '- miss: ')" >&2
    exit 2
fi
echo "--- $SKILL: $pass/$n passed (model=$MODEL)"
[ "$fail" -eq 0 ]
