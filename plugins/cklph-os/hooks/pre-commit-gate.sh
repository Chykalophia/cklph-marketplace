#!/bin/bash
# Pre-Commit Quality Gate for Claude Code — LAYER 0 (automatic)
#
# Runs when Claude attempts a git commit via the Bash tool.
# Checks: TypeScript, ESLint, Semgrep custom rules — against the CURRENT project.
# Exit 2 = block the tool call. Exit 0 = allow it.
#
# Project-tunable assumptions (kept for parity with the original project gate):
#   - ESLint --max-warnings budget
#   - Semgrep config dir (.semgrep/)
# These degrade gracefully when the tool/config is absent. Parameterize per-repo later.

set -uo pipefail

# jq is required to read the tool payload. If it's missing we cannot gate — fail OPEN
# with a loud warning rather than silently blocking every commit on this machine.
if ! command -v jq >/dev/null 2>&1; then
    echo "pre-commit-gate: jq not found — skipping quality gate" >&2
    exit 0
fi

# Read the tool input from stdin
INPUT=$(cat 2>/dev/null || true)
COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

# Only intercept git commit commands. Match "git commit" whether invoked bare or via an
# absolute path (no hardcoded install location).
if ! printf '%s' "$COMMAND" | grep -qE '(^|/)git[[:space:]]+commit'; then
    exit 0
fi

echo "=== PRE-COMMIT QUALITY GATE ==="
FAILURES=0

# Staged TS/TSX files (presence check). Reused by ESLint and Semgrep below.
HAS_STAGED=$(git diff --cached --name-only --diff-filter=ACM -- '*.ts' '*.tsx' 2>/dev/null)

# 1. TypeScript type check
echo "--- TypeScript Check ---"
if ! npx tsc --noEmit > /tmp/tsc-gate.txt 2>&1; then
    echo "FAIL: TypeScript errors found" >&2
    tail -5 /tmp/tsc-gate.txt >&2
    FAILURES=$((FAILURES + 1))
else
    echo "PASS: TypeScript"
fi

# 2. ESLint (staged files only, NUL-delimited so filenames with spaces are safe)
echo "--- ESLint Check ---"
if [ -n "$HAS_STAGED" ]; then
    if ! git diff --cached -z --name-only --diff-filter=ACM -- '*.ts' '*.tsx' \
        | xargs -0 npx eslint --max-warnings=28 > /tmp/eslint-gate.txt 2>&1; then
        echo "FAIL: ESLint errors found" >&2
        tail -5 /tmp/eslint-gate.txt >&2
        FAILURES=$((FAILURES + 1))
    else
        echo "PASS: ESLint"
    fi
else
    echo "SKIP: No staged .ts/.tsx files"
fi

# 3. Semgrep custom rules (staged files only, if installed)
echo "--- Semgrep Check ---"
if command -v semgrep >/dev/null 2>&1 && [ -n "$HAS_STAGED" ]; then
    if ! git diff --cached -z --name-only --diff-filter=ACM -- '*.ts' '*.tsx' \
        | xargs -0 semgrep scan --config .semgrep/ --severity ERROR --quiet --error > /tmp/semgrep-gate.txt 2>&1; then
        echo "FAIL: Semgrep ERROR-level findings" >&2
        tail -10 /tmp/semgrep-gate.txt >&2
        FAILURES=$((FAILURES + 1))
    else
        echo "PASS: Semgrep"
    fi
elif ! command -v semgrep >/dev/null 2>&1; then
    echo "SKIP: Semgrep not installed"
else
    echo "SKIP: No staged .ts/.tsx files for Semgrep"
fi

echo "=== GATE COMPLETE ==="

if [ $FAILURES -gt 0 ]; then
    echo "BLOCKED: $FAILURES check(s) failed. Fix issues before committing." >&2
    exit 2
fi

echo "All checks passed. Commit allowed."
exit 0
