#!/bin/bash
# Security Scanner for Claude Code
# Called by Claude Code PostToolUse hook (cklph-os plugin)

set -uo pipefail

# Resolve the edited file path. Prefer the JSON payload on stdin (modern hook
# contract); fall back to the legacy env var, then a positional arg. The legacy
# CLAUDE_TOOL_FILE_PATH env var is not reliably set, so stdin is the source of truth.
INPUT=$(cat 2>/dev/null || true)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
if [[ -z "$FILE_PATH" ]]; then
    FILE_PATH="${CLAUDE_TOOL_FILE_PATH:-${1:-}}"
fi

if [[ -z "$FILE_PATH" ]] || [[ ! -f "$FILE_PATH" ]]; then
    exit 0
fi

# How Claude sees the result. On PostToolUse, exit-0 stdout goes to the debug log and exit-0
# stderr is never shown, so before 0.12.3 every warning here was invisible to Claude. Warnings are
# collected in REPORT and returned as JSON hookSpecificOutput.additionalContext (shown to Claude
# next to the tool result, exit 0, nothing blocked). Without jq there is no safe way to build that
# JSON, so the fallback is stderr + exit 2, which PostToolUse also shows to Claude (the tool has
# already run, so exit 2 cannot block it either).
WARNINGS=0
REPORT="Security Check: $FILE_PATH"
warn() { REPORT="$REPORT"$'\n'"$1"; WARNINGS=$((WARNINGS + 1)); }

# Check for hardcoded secrets. Patterns use $'…' quoting so a real single quote can sit in the
# bracket class: before 0.11.1 they used ["\x27], which neither BSD nor GNU grep reads as a quote,
# so single-quoted secrets slipped through. [[:space:]] instead of \s for portability.
# Report LINE NUMBERS only: echoing the matched line would copy the secret into the transcript.
# -a: without it grep prints "Binary file matches" for a file with a NUL byte, and the line number
# is lost. Case-insensitive only where the key name varies in case (API_KEY, Password); AKIA and
# the PEM header are uppercase by spec, so "a private key" in prose is not a hit.
check() {  # check <i|-> <ERE> <label>
    local lines flags=-naE
    [ "$1" = i ] && flags=-naiE
    lines=$(grep "$flags" "$2" "$FILE_PATH" 2>/dev/null | cut -d: -f1 | tr '\n' ' ')
    if [[ -n "$lines" ]]; then
        warn "Warning: Possible hardcoded $3 detected (line ${lines% })"
    fi
}
SP='[[:space:]]*'
check i $'api[_-]?key'"${SP}[:=]${SP}"$'["\'][A-Za-z0-9]{20,}' "API key"
check i $'password'"${SP}[:=]${SP}"$'["\'][^"\']{8,}' "password"
check i $'(secret|token)'"${SP}[:=]${SP}"$'["\'][A-Za-z0-9_-]{16,}' "secret/token"
check - 'AKIA[0-9A-Z]{16}' "AWS access key (AKIA...)"
check - 'BEGIN.*PRIVATE KEY' "private key"

# Run gitleaks if available (advisory — findings are reported but non-blocking)
if command -v gitleaks >/dev/null 2>&1; then
    GITLEAKS_OUTPUT=$(gitleaks detect --source="$FILE_PATH" --no-git --no-banner --redact 2>&1) || {
        warn "Warning: gitleaks found potential secrets:"$'\n'"$GITLEAKS_OUTPUT"
    }
fi

# Python-specific: run bandit if available. Line and test id only: bandit's default report quotes
# the offending code (B105 prints the hardcoded password itself).
if [[ "$FILE_PATH" =~ \.py$ ]] && command -v bandit >/dev/null 2>&1; then
    BANDIT_OUTPUT=$(bandit -q -f custom --msg-template 'line {line}: {test_id} ({severity})' "$FILE_PATH" 2>&1) || {
        warn "Warning: bandit found security issues:"$'\n'"$BANDIT_OUTPUT"
    }
fi

if [[ $WARNINGS -eq 0 ]]; then
    printf '%s\nPassed: No secrets detected\n' "$REPORT"
    exit 0
fi

REPORT="$REPORT"$'\n'"Found $WARNINGS security warning(s). Advisory: the edit was kept; move the value to an env var or secret store if it is real."
if command -v jq >/dev/null 2>&1; then
    jq -n --arg c "$REPORT" '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $c}}'
    exit 0
fi
printf '%s\n' "$REPORT" >&2
exit 2
