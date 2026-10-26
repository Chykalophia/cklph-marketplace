#!/bin/bash
# Skill usage log — feeds the `stocktake` skill (STANDARD.md §10, Measure/Prune).
#
# Appends ONE JSON line per skill invocation to ~/.claude/cklph-usage/skills.jsonl:
#   {"ts":"<UTC>","skill":"<plugin:skill>","via":"tool|slash","repo":"<cwd basename>","session":"<id>"}
# Never logs full paths or prompt text. Nothing leaves the machine.
#
# Payloads, verified empirically on Claude Code 2.1.310 (2026-10-26):
#   PostToolUse, matcher Skill (the model invoked a skill):
#     {"session_id":"…","cwd":"/abs/path","hook_event_name":"PostToolUse","tool_name":"Skill",
#      "tool_input":{"skill":"plugin:skill"},"tool_response":{"success":true,"commandName":"plugin:skill"},…}
#   UserPromptSubmit (the user typed a slash command; this does NOT fire PostToolUse/Skill):
#     {"session_id":"…","cwd":"/abs/path","hook_event_name":"UserPromptSubmit","prompt":"/plugin:skill args\n",…}
#   For prompts we keep only the leading /command token, and only when the prompt starts with "/".
#
# Must never block and never fail loudly: pure bash (no jq), every failure swallowed, exit 0.

{
    INPUT=$(cat)
    LOG_DIR="${CKLPH_USAGE_DIR:-$HOME/.claude/cklph-usage}"

    field() { [[ $INPUT =~ \"$1\":\"([^\"]*)\" ]] && printf '%s' "${BASH_REMATCH[1]}"; }

    SKILL=""; VIA=""
    case "$(field hook_event_name)" in
        PostToolUse)
            [ "$(field tool_name)" = "Skill" ] && { SKILL=$(field skill); VIA=tool; } ;;
        UserPromptSubmit)
            [[ $INPUT =~ \"prompt\":\"/([A-Za-z0-9_.:-]+) ]] && { SKILL="${BASH_REMATCH[1]}"; VIA=slash; } ;;
    esac

    if [ -n "$SKILL" ]; then
        CWD=$(field cwd)
        mkdir -p "$LOG_DIR"
        printf '{"ts":"%s","skill":"%s","via":"%s","repo":"%s","session":"%s"}\n' \
            "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$SKILL" "$VIA" "${CWD##*/}" "$(field session_id)" \
            >> "$LOG_DIR/skills.jsonl"
    fi
} 2>/dev/null || true
exit 0
