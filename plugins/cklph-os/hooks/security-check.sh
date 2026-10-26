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

echo "Security Check: $FILE_PATH"

WARNINGS=0

# Check for hardcoded secrets. Patterns use $'…' quoting so a real single quote can sit in the
# bracket class: before 0.11.1 they used ["\x27], which neither BSD nor GNU grep reads as a quote,
# so single-quoted secrets slipped through. [[:space:]] instead of \s for portability.
# Report LINE NUMBERS only: echoing the matched line would copy the secret into the transcript.
check() {  # check <ERE> <label>
    local lines
    lines=$(grep -niE "$1" "$FILE_PATH" 2>/dev/null | cut -d: -f1 | tr '\n' ' ')
    if [[ -n "$lines" ]]; then
        echo "Warning: Possible hardcoded $2 detected (line ${lines% })" >&2
        ((WARNINGS++))
    fi
}
SP='[[:space:]]*'
check $'api[_-]?key'"$SP[:=]$SP"$'["\'][A-Za-z0-9]{20,}' "API key"
check $'password'"$SP[:=]$SP"$'["\'][^"\']{8,}' "password"
check $'(secret|token)'"$SP[:=]$SP"$'["\'][A-Za-z0-9_-]{16,}' "secret/token"
check 'AKIA[0-9A-Z]{16}' "AWS access key (AKIA...)"
check 'BEGIN.*PRIVATE KEY' "private key"

# Run gitleaks if available (advisory — findings are reported but non-blocking)
if command -v gitleaks >/dev/null 2>&1; then
    GITLEAKS_OUTPUT=$(gitleaks detect --source="$FILE_PATH" --no-git --no-banner --redact 2>&1) || {
        echo "Warning: gitleaks found potential secrets:" >&2
        echo "$GITLEAKS_OUTPUT" >&2
        ((WARNINGS++))
    }
fi

# Python-specific: run bandit if available
if [[ "$FILE_PATH" =~ \.py$ ]] && command -v bandit >/dev/null 2>&1; then
    BANDIT_OUTPUT=$(bandit -q "$FILE_PATH" 2>&1) || {
        echo "Warning: bandit found security issues:" >&2
        echo "$BANDIT_OUTPUT" >&2
        ((WARNINGS++))
    }
fi

if [[ $WARNINGS -eq 0 ]]; then
    echo "Passed: No secrets detected"
else
    echo "Found $WARNINGS security warning(s) — review above output" >&2
fi

# Always exit 0 - security checks are advisory, not blocking
exit 0
