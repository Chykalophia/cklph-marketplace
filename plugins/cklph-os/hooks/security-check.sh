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

# Check for hardcoded secrets (simplified patterns to avoid quoting issues)
# Pattern 1: API keys
if grep -iE 'api[_-]?key\s*[:=]\s*["\x27][A-Za-z0-9]{20,}' "$FILE_PATH" 2>/dev/null; then
    echo "Warning: Possible hardcoded API key detected" >&2
    ((WARNINGS++))
fi

# Pattern 2: Passwords
if grep -iE 'password\s*[:=]\s*["\x27][^\x27"]{8,}' "$FILE_PATH" 2>/dev/null; then
    echo "Warning: Possible hardcoded password detected" >&2
    ((WARNINGS++))
fi

# Pattern 3: Secret/Token patterns
if grep -iE '(secret|token)\s*[:=]\s*["\x27][A-Za-z0-9_-]{16,}' "$FILE_PATH" 2>/dev/null; then
    echo "Warning: Possible hardcoded secret/token detected" >&2
    ((WARNINGS++))
fi

# Pattern 4: AWS keys
if grep -E 'AKIA[0-9A-Z]{16}' "$FILE_PATH" 2>/dev/null; then
    echo "Warning: Possible AWS Access Key detected" >&2
    ((WARNINGS++))
fi

# Pattern 5: Private keys
if grep -q 'BEGIN.*PRIVATE KEY' "$FILE_PATH" 2>/dev/null; then
    echo "Warning: Private key detected in file" >&2
    ((WARNINGS++))
fi

# Run gitleaks if available (advisory — findings are reported but non-blocking)
if command -v gitleaks >/dev/null 2>&1; then
    GITLEAKS_OUTPUT=$(gitleaks detect --source="$FILE_PATH" --no-git --no-banner 2>&1) || {
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
