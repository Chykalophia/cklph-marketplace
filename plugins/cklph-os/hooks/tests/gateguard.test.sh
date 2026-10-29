#!/bin/bash
# Tests for hooks/gateguard.sh. Run from anywhere:
#   bash plugins/cklph-os/hooks/tests/gateguard.test.sh
# Feeds realistic PreToolUse payloads and asserts the exit code (2 = denied, 0 = allowed) and,
# where it matters, what the denial asks for. Uses a throwaway HOME and project dir, so nothing
# touches the real ~/.claude. Needs jq to build payloads (the hook's python3 fallback is tested
# with jq hidden from the hook). Exit 0 = all pass.

set -o pipefail
command -v jq >/dev/null 2>&1 || { echo "gateguard tests need jq" >&2; exit 2; }
# Never let the caller's settings redirect state, exemptions or the log into real directories.
unset CKLPH_GATEGUARD_STATE CKLPH_GATEGUARD_EXEMPT CKLPH_USAGE_DIR
HERE=$(cd "$(dirname "$0")" && pwd)
GATE="$HERE/../gateguard.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
PROJ="$TMP/proj"
mkdir -p "$PROJ/src/auth" "$PROJ/lib" "$TMP/home" "$TMP/cwd/docs"
# A decoy docs/ in the cwd, so a glob expanded against the cwd (no set -f) is caught anywhere.
touch "$TMP/cwd/docs/decoy"
cd "$TMP/cwd" || exit 1
printf 'export const a = 1\n' > "$PROJ/lib/util.ts"
pass=0; fail=0

# payload <tool> <path> [session] [agent_id]
payload() {
    local key=file_path
    [ "$1" = NotebookEdit ] && key=notebook_path
    if command -v jq >/dev/null 2>&1; then
        jq -cn --arg t "$1" --arg p "$2" --arg s "${3-s1}" --arg c "$PROJ" --arg a "${4:-}" --arg k "$key" \
            '{tool_name:$t,tool_input:{($k):$p},session_id:$s,cwd:$c} + (if $a == "" then {} else {agent_id:$a} end)'
    else
        python3 -I -c 'import json,sys
t,p,s,c,a,k=sys.argv[1:]
d={"tool_name":t,"tool_input":{k:p},"session_id":s,"cwd":c}
if a: d["agent_id"]=a
print(json.dumps(d))' "$1" "$2" "${3-s1}" "$PROJ" "${4:-}" "$key"
    fi
}

# run_gate <mode> <payload>; sets $code and $err
run_gate() {
    # EXTRA_ENV is split on purpose: it holds VAR=value words for env.
    # shellcheck disable=SC2086
    err=$(printf '%s' "$2" | env -u CKLPH_GATEGUARD_STATE -u CKLPH_GATEGUARD_EXEMPT \
        HOME="$TMP/home" CKLPH_GATEGUARD="$1" CLAUDE_PROJECT_DIR="$PROJ" \
        ${EXTRA_ENV:-} bash "$GATE" 2>&1 >/dev/null)
    code=$?
}

check() {  # check <label> <want-exit> [substring the stderr must contain]
    local ok=1
    [ "$code" = "$2" ] || ok=0
    if [ -n "${3:-}" ] && ! printf '%s' "$err" | grep -Fq -- "$3"; then ok=0; fi
    if [ "$ok" = 1 ]; then
        pass=$((pass + 1)); printf 'PASS  %s\n' "$1"
    else
        fail=$((fail + 1)); printf 'FAIL  %s (exit=%s, want %s%s)\n%s\n' "$1" "$code" "$2" \
            "${3:+, stderr containing '$3'}" "$err"
    fi
}

# Off by default
run_gate "" "$(payload Edit "$PROJ/lib/util.ts")";           check "unset: allows" 0
run_gate off "$(payload Edit "$PROJ/lib/util.ts")";          check "off: allows" 0

# all: first touch denied, retry allowed, per file, per session
run_gate all "$(payload Edit "$PROJ/lib/util.ts")";          check "all: first edit denied with importer question" 2 "imports or calls this one"
if printf '%s' "$err" | grep -Fq "Quote the user's current instruction verbatim"; then
    pass=$((pass+1)); echo "PASS  denial ends with quote-instruction"
else
    fail=$((fail+1)); echo "FAIL  denial lacks quote-instruction"
fi
run_gate all "$(payload Edit "$PROJ/lib/util.ts")";          check "all: retry of same file allowed" 0
run_gate all "$(payload Edit "lib/util.ts")";                check "all: relative path of a gated file allowed" 0
run_gate all "$(payload Edit "lib/fresh.ts")";               check "all: relative path of an untouched file denied" 2 "before editing lib/fresh.ts"
run_gate all "$(payload Edit "$PROJ/lib/util.ts" s2)";       check "all: same file in a new session denied again" 2
run_gate ON "$(payload Write "$PROJ/lib/new.ts")";           check "ON (any case): Write of a new file asks for callers" 2 "will call this new file"
run_gate 1 "$(payload MultiEdit "$PROJ/lib/other.ts")";      check "1: MultiEdit gated" 2
run_gate all "$(payload NotebookEdit "$PROJ/nb.ipynb")";     check "all: NotebookEdit gated via notebook_path" 2
run_gate all "$(jq -cn --arg p "$PROJ/lib/multi.ts" --arg c "$PROJ" '{tool_name:"MultiEdit",tool_input:{edits:[{file_path:$p,old_string:"a",new_string:"b"}]},session_id:"s1",cwd:$c}')"; check "all: MultiEdit with only per-entry paths gated" 2
run_gate all "$(payload Edit "$PROJ/lib/./dots.ts")";        check "all: lib/./dots.ts denied once" 2
run_gate all "$(payload Edit "$PROJ/lib/dots.ts")";          check "all: lib/dots.ts is the same file, allowed" 0
run_gate all "$(payload Edit "$PROJ/.claude/settings.local.json")"; check "all: Claude settings files never gated" 0

# Classes
run_gate all "$(payload Edit "$PROJ/CLAUDE.md")";            check "class instruction: CLAUDE.md" 2 "tool that loads this file"
run_gate all "$(payload Write "$PROJ/plugins/x/skills/y/notes.md")"; check "class instruction: .md under skills/" 2 "tool that loads this file"
run_gate all "$(payload Edit "$PROJ/lib/util.test.ts")";     check "class test: *.test.ts" 2 "behaviour under test"
run_gate all "$(payload Edit "$PROJ/tests/a.sh")";           check "class test: under tests/" 2 "behaviour under test"
run_gate all "$(payload Write "$PROJ/docs/guide.md")";       check "class prose (new): asks why a new file" 2 "why a new file"
run_gate all "$(payload Edit "$PROJ/package.json")";         check "class config: asks about secrets" 2 "secret or credential"

# Never gated
run_gate all "$(payload Write "$TMP/scratch/out.md")";       check "outside project root allowed" 0
run_gate all "$(payload Edit "$PROJ/lib/sub.ts" s1 agent-7)"; check "subagent, ordinary file allowed" 0
run_gate all "$(payload Edit "$PROJ/lib/x.ts" "")";           check "no session id: fails open" 0 "no session id"
EXTRA_ENV="CKLPH_GATEGUARD_EXEMPT=docs/*:*.lock" run_gate all "$(payload Write "$PROJ/docs/other.md")"; check "exempt glob docs/* allowed" 0
EXTRA_ENV="CKLPH_GATEGUARD_EXEMPT=docs/*:*.lock" run_gate all "$(payload Edit "$PROJ/yarn.lock")";      check "exempt glob *.lock allowed" 0
EXTRA_ENV="CKLPH_GATEGUARD_EXEMPT=src/auth/*" run_gate all "$(payload Edit "$PROJ/src/auth/login.ts" s9)"; check "exemption beats sensitive" 0

# Sensitive
run_gate all "$(payload Edit "$PROJ/src/auth/session.ts" s1 agent-7)"; check "subagent, sensitive file still denied" 2 "Sensitive target"
run_gate sensitive "$(payload Edit "$PROJ/lib/plain.ts" s3)";          check "sensitive mode: ordinary file allowed" 0
run_gate sensitive "$(payload Edit "$PROJ/app/api/Stripe/route.ts" s3)"; check "sensitive mode: stripe/ segment (any case) denied" 2 "Sensitive target"
run_gate sensitive "$(payload Edit "$PROJ/supabase/migrations/001.sql" s3)"; check "sensitive mode: migrations denied" 2
run_gate sensitive "$(payload Write "$PROJ/.env.local" s3)";           check "sensitive mode: .env.local denied as config" 2 "secret or credential"
run_gate sensitive "$(payload Edit "$PROJ/.github/workflows/ci.yml" s3)"; check "sensitive mode: CI workflow denied" 2
run_gate sensitive "$(payload Edit "$PROJ/packages/web/.github/workflows/ci.yml" s3)"; check "sensitive mode: nested .github/workflows denied" 2
run_gate sensitive "$(payload Edit "$PROJ/docs/authoring.md" s3)";     check "sensitive mode: 'authoring' is not an auth segment" 0

# File stems and canonical paths
run_gate sensitive "$(payload Edit "$PROJ/lib/auth.ts" s5)";       check "sensitive mode: lib/auth.ts (file stem) denied" 2 "Sensitive target"
run_gate sensitive "$(payload Edit "$PROJ/middleware.ts" s5)";     check "sensitive mode: middleware.ts denied" 2
run_gate sensitive "$(payload Edit "$PROJ/lib/authority.ts" s5)";  check "sensitive mode: lib/authority.ts not sensitive" 0
ln -s "$PROJ/src/auth" "$PROJ/lib/linked"
run_gate sensitive "$(payload Edit "$PROJ/lib/linked/x.ts" s5)";   check "sensitive mode: directory link into auth/ denied" 2
run_gate sensitive "$(payload Edit "$PROJ/lib/../src/auth/y.ts" s5)"; check "sensitive mode: lib/../src/auth resolved and denied" 2
ln -s "$PROJ" "$TMP/projlink"
err=$(printf '%s' "$(payload Edit "$PROJ/lib/viaroot.ts" s6)" | env HOME="$TMP/home" CKLPH_GATEGUARD=all CLAUDE_PROJECT_DIR="$TMP/projlink" bash "$GATE" 2>&1 >/dev/null); code=$?
check "all: project dir given through a symlink still gated" 2

# Prune: only this hook's own top-level files
pdir="$TMP/prune"; mkdir -p "$pdir/deep"
touch "$pdir/keep.list" "$pdir/deep/important.list" "$pdir/gateguard-old.list"
touch -t 202001010000 "$pdir/keep.list" "$pdir/deep/important.list" "$pdir/gateguard-old.list"
EXTRA_ENV="CKLPH_GATEGUARD_STATE=$pdir" run_gate all "$(payload Edit "$PROJ/lib/prune.ts" s7)"
if [ -f "$pdir/keep.list" ] && [ -f "$pdir/deep/important.list" ] && [ ! -e "$pdir/gateguard-old.list" ]; then
    pass=$((pass+1)); echo "PASS  prune removes only old gateguard-*.list at the top level"
else
    fail=$((fail+1)); echo "FAIL  prune touched unrelated files or kept its own old file"; ls -R "$pdir"
fi

# python3 fallback: a PATH with no jq
nojq="$TMP/nojq"; mkdir -p "$nojq"
for b in bash cat tr sed grep mkdir find date wc python3 env; do
    p=$(command -v "$b") && ln -s "$p" "$nojq/$b"
done
pl=$(payload Edit "$PROJ/lib/py.ts" s8)
err=$(printf '%s' "$pl" | env PATH="$nojq" HOME="$TMP/home" CKLPH_GATEGUARD=all CLAUDE_PROJECT_DIR="$PROJ" bash "$GATE" 2>&1 >/dev/null); code=$?
check "python3 fallback (no jq): first edit denied" 2 "imports or calls this one"

# A relative cwd must not hang the hook (the directory walk once looped forever on it)
rel_pl=$(jq -cn '{tool_name:"Edit",tool_input:{file_path:"lib/q.ts"},session_id:"s10",cwd:"relative/dir"}' 2>/dev/null)
# Run the hook itself in the background (stdin from a file), so $! is the hook and kill reaches it.
printf '%s' "$rel_pl" > "$TMP/rel_pl.json"
env HOME="$TMP/home" CKLPH_GATEGUARD=all bash "$GATE" < "$TMP/rel_pl.json" >/dev/null 2>&1 &
gpid=$!; waited=0
while kill -0 "$gpid" 2>/dev/null && [ "$waited" -lt 50 ]; do sleep 0.1; waited=$((waited + 1)); done
if kill -0 "$gpid" 2>/dev/null; then
    kill "$gpid" 2>/dev/null; fail=$((fail+1)); echo "FAIL  relative cwd: hook still running after 5 s"
else
    pass=$((pass+1)); echo "PASS  relative cwd: hook returns promptly"
fi

# Round-2 review cases
run_gate sensitive "$(payload Edit "$PROJ/app/(auth)/login/page.tsx" s11)"; check "sensitive mode: Next.js (auth) route group denied" 2
run_gate sensitive "$(payload Edit "$PROJ/middleware.mjs" s11)";           check "sensitive mode: middleware.mjs denied" 2
mkdir -p "$PROJ/lib/realdir"; ln -s "$PROJ/lib/realdir" "$PROJ/src/authlink"; ln -s "$PROJ/lib/realdir" "$PROJ/lib/auth"
run_gate sensitive "$(payload Edit "$PROJ/lib/auth/login.ts" s11)";        check "sensitive mode: symlink NAMED auth/ denied (path as written)" 2
run_gate all "$(jq -cn --arg p "$PROJ/lib/x
GateGuard: ok.ts" '{tool_name:"Edit",tool_input:{file_path:$p},session_id:"s12"}')"; check "newline in file_path fails open (no cwd, so nothing shifts into agent_id)" 0
err=$(printf '%s' "$(jq -cn --arg p "$PROJ/lib/y
z.ts" '{tool_name:"Edit",tool_input:{file_path:$p},session_id:"s12b"}')" | env PATH="$nojq" HOME="$TMP/home" CKLPH_GATEGUARD=all CLAUDE_PROJECT_DIR="$PROJ" bash "$GATE" 2>&1 >/dev/null); code=$?
check "newline in file_path fails open (python3 fallback)" 0
err=$(printf '%s' "$(jq -cn --arg p "$TMP/home/.claude/notes.md" --arg c "$TMP/home" '{tool_name:"Write",tool_input:{file_path:$p},session_id:"s13",cwd:$c}')" | env -u CLAUDE_PROJECT_DIR HOME="$TMP/home" CKLPH_GATEGUARD=all bash "$GATE" 2>&1 >/dev/null); code=$?
check "HOME/.claude never gated even when the root is HOME" 0
run_gate all "$(payload Edit "$PROJ/lib/$(printf 'e\033[31mred').ts" s14)"
if [ "$code" = 2 ] && ! printf '%s' "$err" | grep -q "$(printf '\033')"; then
    pass=$((pass+1)); echo "PASS  control characters stripped from the denial"
else
    fail=$((fail+1)); echo "FAIL  control characters reached the denial (exit=$code)"
fi
ustate="$TMP/ustate"; mkdir -p "$ustate"
EXTRA_ENV="CKLPH_GATEGUARD_STATE=$ustate" run_gate all "$(payload Edit "$PROJ/lib/unread.ts" s15)"
if [ "$(id -u)" = 0 ]; then
    echo "SKIP  unreadable state file (root can read mode 200)"
else
    chmod 200 "$ustate/gateguard-s15.list"
    EXTRA_ENV="CKLPH_GATEGUARD_STATE=$ustate" run_gate all "$(payload Edit "$PROJ/lib/unread.ts" s15)"; check "unreadable state file fails open" 0 "cannot read"
    chmod 600 "$ustate/gateguard-s15.list"
fi
EXTRA_ENV="CKLPH_USAGE_DIR=$TMP/usage" run_gate all "$(payload Edit "$PROJ/lib/usagedir.ts" s16)"
if [ "$code" = 2 ] && [ -s "$TMP/usage/gateguard.jsonl" ]; then
    pass=$((pass+1)); echo "PASS  CKLPH_USAGE_DIR moves the denial log"
else
    fail=$((fail+1)); echo "FAIL  CKLPH_USAGE_DIR ignored (exit=$code)"
fi

# Fail open when state cannot be written
EXTRA_ENV="CKLPH_GATEGUARD_STATE=/dev/null/nope" run_gate all "$(payload Edit "$PROJ/lib/z.ts" s4)"; check "unwritable state dir fails open" 0 "cannot write"

# Measurement log: one line per denial, no paths
log="$TMP/home/.claude/cklph-usage/gateguard.jsonl"
if [ -f "$log" ] && ! grep -Fq "$PROJ" "$log" && grep -q '"class":"code"' "$log"; then
    pass=$((pass+1)); echo "PASS  denial log written without paths ($(wc -l < "$log" | tr -d ' ') lines)"
else
    fail=$((fail+1)); echo "FAIL  denial log missing or contains paths"
fi

echo "--- gateguard: $pass passed, $fail failed"
[ "$fail" = 0 ]
