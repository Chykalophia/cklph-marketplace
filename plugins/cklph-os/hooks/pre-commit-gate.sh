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

# Only intercept git commit commands. "git commit" counts when it starts the command or follows a
# separator (; && || | ( newline), optionally behind VAR=value prefixes, an absolute path to git,
# and git's global options (-C <dir>, -c <k=v>, --git-dir <dir>, --no-pager, …), whose values may
# be quoted ("dir with spaces", k="a b"). Before 0.11.1 only a bare leading "git commit" matched,
# so `cd repo && git commit` and `git -C repo commit` skipped the whole gate.
#
# Limits (a matcher, not a shell parser): a "(" or ";" inside a quoted argument still counts as a
# separator, so `printf '(git commit -m x'` runs the gate needlessly (false run, never a bypass;
# stripping quoted text first would hide `bash -c '…; git commit'`). Backslash-escaped quotes,
# pushd, and commits hidden in scripts or variables ($CMD) are not seen.
VAL='(\$\([^)]*\)|`[^`]*`|"[^"]*"|'\''[^'\'']*'\''|\\.|[^[:space:];&|"'\''\\])+'   # one shell word
GIT_OPTS="([[:space:]]+(-[Cc][[:space:]]+$VAL|--(git-dir|work-tree|namespace|exec-path|super-prefix|config-env)[[:space:]]+$VAL|--[a-z-]+(=$VAL)?|-[pP]))*"
COMMIT_RE="(^|[;&|(])[[:space:]]*([A-Za-z_][A-Za-z0-9_]*=($VAL)?[[:space:]]+)*([^[:space:];&|]*/)?git${GIT_OPTS}[[:space:]]+commit([[:space:]]|\$)"
ONE_LINE="${COMMAND//$'\n'/;}"   # newline separates commands too
[[ $ONE_LINE =~ $COMMIT_RE ]] || exit 0
INVOCATION="${BASH_REMATCH[0]}"

# Run the checks in the repo being committed, not the session's directory. Start from the payload's
# cwd, apply every `cd <dir>` before the commit, then git's -C options (cumulative, like git).
# Fail CLOSED: if the dir can't be worked out without running the shell ($VAR, $(…), cd -, a cd
# inside a subshell, --git-dir/--work-tree), block and ask for a plain `cd <repo> && git commit`,
# rather than quietly checking the session's repo and letting the commit through.
unresolved() {
    echo "pre-commit-gate: BLOCKED: can't tell which repo this commits to ($1); cd into it first, then git commit" >&2
    exit 2
}
# One shell word as typed -> path in $WP. Handles quotes, a leading ~, $HOME and ${HOME}.
word_path() {
    local s="$1" out="" seg
    WP=""
    if [[ $s == "~" || $s == "~/"* ]]; then out="$HOME"; s="${s:1}"; fi
    while [ -n "$s" ]; do
        if [[ $s =~ ^\'([^\']*)\'(.*)$ ]]; then out="$out${BASH_REMATCH[1]}"; s="${BASH_REMATCH[2]}"; continue; fi
        if [[ $s =~ ^\"([^\"]*)\"(.*)$ ]] || [[ $s =~ ^([^\"\']+)(.*)$ ]]; then
            seg="${BASH_REMATCH[1]}"; s="${BASH_REMATCH[2]}"
        else
            return 1
        fi
        seg="${seg//\$\{HOME\}/$HOME}"
        while [[ $seg =~ ^(.*)\$HOME([^A-Za-z0-9_].*)?$ ]]; do seg="${BASH_REMATCH[1]}$HOME${BASH_REMATCH[2]}"; done
        [[ $seg == *[\$\`\\]* ]] && return 1
        out="$out$seg"
    done
    WP="$out"
}
DIR=$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)
[ -n "$DIR" ] && [ -d "$DIR" ] || DIR="$PWD"
apply_dir() {
    word_path "$1" || unresolved "'$1' needs the shell to expand it"
    case "$WP" in /*) DIR="$WP" ;; *) DIR="$DIR/$WP" ;; esac
}
# cd's before the commit, in order.
PRE="${ONE_LINE%%"$INVOCATION"*}"
REST="$PRE"; SAW_CD=0
CD_RE='(^|[;&|(])[[:space:]]*cd(([[:space:]]+[^;&|()]*)?)([;&|()]|$)'
while [[ $REST =~ $CD_RE ]]; do
    m="${BASH_REMATCH[0]}"; arg="${BASH_REMATCH[2]}"; SAW_CD=1
    REST="${REST#*"$m"}"
    if [[ $arg =~ ^[[:space:]]*$ ]]; then DIR="$HOME"
    elif [[ $arg =~ ^[[:space:]]+($VAL)[[:space:]]*$ ]] && [ "${BASH_REMATCH[1]}" != "-" ]; then apply_dir "${BASH_REMATCH[1]}"
    else unresolved "a cd target it can't read without running the shell"
    fi
done
[ "$SAW_CD" = 1 ] && [[ $PRE == *")"* ]] && unresolved "a cd next to a subshell"
# git's global options on the commit itself.
OPTS_RE="git(${GIT_OPTS})[[:space:]]+commit([[:space:]]|\$)"
[[ $INVOCATION =~ $OPTS_RE ]]
OPTS="${BASH_REMATCH[1]}"
while [[ $OPTS =~ [^[:space:]] ]]; do
    if [[ $OPTS =~ ^[[:space:]]+-C[[:space:]]+($VAL) ]]; then
        m="${BASH_REMATCH[0]}"; apply_dir "${BASH_REMATCH[1]}"
    elif [[ $OPTS =~ ^[[:space:]]+--(git-dir|work-tree)[[:space:]=] ]]; then
        unresolved "--git-dir/--work-tree"
    elif [[ $OPTS =~ ^[[:space:]]+(-c|--(namespace|exec-path|super-prefix|config-env))[[:space:]]+($VAL) ]] \
        || [[ $OPTS =~ ^[[:space:]]+(--[a-z-]+(=($VAL))?|-[pP]) ]]; then
        m="${BASH_REMATCH[0]}"
    else
        break
    fi
    OPTS="${OPTS:${#m}}"
done
cd "$DIR" 2>/dev/null || unresolved "'$DIR' is not a directory"

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

# One private report file per run (fixed /tmp names collided across concurrent sessions).
GATE_LOG=$(mktemp "${TMPDIR:-/tmp}/cklph-gate.XXXXXX") || GATE_LOG=/dev/null
trap '[ "$GATE_LOG" != /dev/null ] && rm -f "$GATE_LOG"' EXIT

# Staged TS/TSX files (presence check). Reused by ESLint and Semgrep below.
HAS_STAGED=$(git diff --cached --name-only --diff-filter=ACM -- '*.ts' '*.tsx' 2>/dev/null)

# 1. TypeScript type check — only when this is a TS project AND tsc is installed locally.
#    A missing tsconfig or missing compiler SKIPS (never blocks); the repo's own gate enforces strictly.
echo "--- TypeScript Check ---"
TSC_BIN=$(local_bin tsc || true)
if [ -f tsconfig.json ] && [ -n "$TSC_BIN" ]; then
    if ! "$TSC_BIN" --noEmit > "$GATE_LOG" 2>&1; then
        echo "FAIL: TypeScript errors found" >&2
        tail -5 "$GATE_LOG" >&2
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
        | xargs -0 "$ESLINT_BIN" --max-warnings="$ESLINT_MAX_WARNINGS" > "$GATE_LOG" 2>&1; then
        echo "FAIL: ESLint errors found" >&2
        tail -5 "$GATE_LOG" >&2
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
        | xargs -0 semgrep scan --config .semgrep/ --severity ERROR --quiet --error > "$GATE_LOG" 2>&1; then
        echo "FAIL: Semgrep ERROR-level findings" >&2
        tail -10 "$GATE_LOG" >&2
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

# 4. cklph skill description sanity — colon-space inside a frontmatter description value re-parses
#    as a nested YAML key and breaks plugin loading. Real previously-hit bug; prevent regression.
echo "--- Skill Description Sanity ---"
STAGED_SKILLS=$(git diff --cached --name-only --diff-filter=ACM -- '*SKILL.md' 2>/dev/null || true)
if [ -n "$STAGED_SKILLS" ]; then
    DESC_BAD=0
    while IFS= read -r f; do
        [ -z "$f" ] && continue
        # Pull the description value (line after `description:`), check for ": " (colon-space).
        desc_val=$(awk '/^description:/{sub(/^description:[ ]*/, ""); print; exit}' "$f")
        # A quoted scalar may contain ": " (valid YAML); only a plain scalar re-parses as a key.
        # Skip it only when the quote is closed on the same line (optionally followed by a
        # comment): an unterminated quote is broken frontmatter and falls through to the check.
        desc_val="${desc_val%"${desc_val##*[![:space:]]}"}"
        case "$desc_val" in
            \"*\"|\'*\'|\"*\"[[:space:]]#*|\'*\'[[:space:]]#*) continue ;;
        esac
        if printf '%s' "$desc_val" | grep -q ': '; then
            echo "FAIL: $f has colon-space inside description value (breaks YAML loading)" >&2
            DESC_BAD=1
        fi
    done <<< "$STAGED_SKILLS"
    if [ "$DESC_BAD" = "1" ]; then
        FAILURES=$((FAILURES + 1))
    else
        echo "PASS: Skill descriptions clean"
    fi
else
    echo "SKIP: No staged SKILL.md files"
fi

echo "=== GATE COMPLETE ==="

if [ $FAILURES -gt 0 ]; then
    echo "BLOCKED: $FAILURES check(s) failed. Fix issues before committing." >&2
    exit 2
fi

echo "All checks passed. Commit allowed."
exit 0
