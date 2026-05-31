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

# Skip merge commits — CI is the right gate for release merges (dev -> staging -> main),
# not this hook. MERGE_HEAD exists during an in-progress merge and is cleared on commit.
# This avoids the gate failing on the thousands of unchanged-but-restaged files a merge
# can produce (e.g. after a tree-wide formatter change). Real bug surfaced 2026-05-31.
if git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1; then
    echo "pre-commit-gate: skipping merge commit — CI is the gate for merges"
    exit 0
fi

# Safety net for unusually large stages (bulk reformats, mass refactors).
# The gate's value is incremental quality on dev commits; on 500+ file stages it's
# slower than useful AND can trip on files eslint would normally ignore via its own
# discovery + ignore rules (we pass files explicitly here, which bypasses .eslintignore).
# Trust CI for bulk changes.
STAGED_COUNT=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null | wc -l | tr -d ' ')
if [ "${STAGED_COUNT:-0}" -gt 500 ]; then
    echo "pre-commit-gate: skipping — ${STAGED_COUNT} staged files (too many for incremental gate; trusting CI)"
    exit 0
fi

echo "=== PRE-COMMIT QUALITY GATE ==="
FAILURES=0

# Resolve a locally-installed node binary (this project or a hoisted monorepo root).
# Prints the path and returns 0 if found; returns non-zero otherwise. Never hits the network —
# this is the difference between "tool not installed -> skip" and the old "npx tries to install
# -> prints help -> exits non-zero -> we misreport it as errors and block the commit".
local_bin() {
    local name="$1" dir="$PWD" i=0
    while [ "$i" -lt 6 ]; do
        if [ -x "$dir/node_modules/.bin/$name" ]; then
            printf '%s' "$dir/node_modules/.bin/$name"
            return 0
        fi
        [ "$dir" = "/" ] && break
        dir=$(dirname "$dir")
        i=$((i + 1))
    done
    return 1
}

# Staged TS/TSX files (presence check). Reused by ESLint and Semgrep below.
HAS_STAGED=$(git diff --cached --name-only --diff-filter=ACM -- '*.ts' '*.tsx' 2>/dev/null)

# 1. TypeScript type check — only when this is a TS project AND tsc is installed locally.
#    A missing tsconfig or missing compiler SKIPS (never blocks); the repo's own gate enforces strictly.
echo "--- TypeScript Check ---"
TSC_BIN=$(local_bin tsc || true)
if [ -f tsconfig.json ] && [ -n "$TSC_BIN" ]; then
    if ! "$TSC_BIN" --noEmit > /tmp/tsc-gate.txt 2>&1; then
        echo "FAIL: TypeScript errors found" >&2
        tail -5 /tmp/tsc-gate.txt >&2
        FAILURES=$((FAILURES + 1))
    else
        echo "PASS: TypeScript"
    fi
elif [ ! -f tsconfig.json ]; then
    echo "SKIP: no tsconfig.json (not a TypeScript project)"
else
    echo "SKIP: tsc not installed locally"
fi

# 2. ESLint (staged files only, NUL-delimited so filenames with spaces are safe).
#    Runs only when eslint is installed locally; otherwise SKIPS (never blocks).
#    Warning budget defaults to 0; per-repo override via CKLPH_ESLINT_MAX_WARNINGS env var.
echo "--- ESLint Check ---"
ESLINT_BIN=$(local_bin eslint || true)
ESLINT_MAX_WARNINGS="${CKLPH_ESLINT_MAX_WARNINGS:-0}"
if [ -n "$HAS_STAGED" ] && [ -n "$ESLINT_BIN" ]; then
    if ! git diff --cached -z --name-only --diff-filter=ACM -- '*.ts' '*.tsx' \
        | xargs -0 "$ESLINT_BIN" --max-warnings="$ESLINT_MAX_WARNINGS" > /tmp/eslint-gate.txt 2>&1; then
        echo "FAIL: ESLint errors found" >&2
        tail -5 /tmp/eslint-gate.txt >&2
        FAILURES=$((FAILURES + 1))
    else
        echo "PASS: ESLint"
    fi
elif [ -z "$HAS_STAGED" ]; then
    echo "SKIP: No staged .ts/.tsx files"
else
    echo "SKIP: eslint not installed locally"
fi

# 3. Semgrep custom rules (staged files only; requires both semgrep AND a .semgrep/ config dir).
echo "--- Semgrep Check ---"
if command -v semgrep >/dev/null 2>&1 && [ -d .semgrep ] && [ -n "$HAS_STAGED" ]; then
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
elif [ ! -d .semgrep ]; then
    echo "SKIP: no .semgrep/ config in this repo"
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
