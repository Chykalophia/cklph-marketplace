#!/usr/bin/env bats
# Tests for cklph-os quality-gate hooks.  Run:  bats test/

HOOKS="${BATS_TEST_DIRNAME}/../plugins/cklph-os/hooks"

setup() {
  TMP="$(mktemp -d)"
}

teardown() {
  rm -rf "$TMP"
}

# Output assertions. Never assert with a bare `[[ ... ]]`: on macOS's bash 3.2 a false `[[` does not
# trip `set -e`, so the test passes regardless. A function that returns 1 fails on every bash.
has()   { [[ "$output" == *"$1"* ]] || { echo "expected output to contain: $1" >&2; return 1; }; }
hasnt() { [[ "$output" != *"$1"* ]] || { echo "expected output NOT to contain: $1" >&2; return 1; }; }

@test "nextjs-quality-check: clean non-app TS file passes (exit 0)" {
  printf 'export const x = 1;\n' > "$TMP/util.ts"
  run bash "$HOOKS/nextjs-quality-check.sh" <<< "{\"tool_input\":{\"file_path\":\"$TMP/util.ts\"},\"tool_response\":{\"success\":true}}"
  [ "$status" -eq 0 ]
}

@test "nextjs-quality-check: app page missing default export fails (exit 2)" {
  mkdir -p "$TMP/app"
  printf 'export const config = {};\n' > "$TMP/app/page.tsx"
  run bash "$HOOKS/nextjs-quality-check.sh" <<< "{\"tool_input\":{\"file_path\":\"$TMP/app/page.tsx\"},\"tool_response\":{\"success\":true}}"
  [ "$status" -eq 2 ]
}

@test "nextjs-quality-check: skips non-JS/TS files (exit 0)" {
  printf '# readme\n' > "$TMP/readme.md"
  run bash "$HOOKS/nextjs-quality-check.sh" <<< "{\"tool_input\":{\"file_path\":\"$TMP/readme.md\"},\"tool_response\":{\"success\":true}}"
  [ "$status" -eq 0 ]
}

@test "security-check: reads path from stdin and passes a clean file (exit 0)" {
  printf 'const x = 1;\n' > "$TMP/clean.ts"
  run bash "$HOOKS/security-check.sh" <<< "{\"tool_input\":{\"file_path\":\"$TMP/clean.ts\"}}"
  [ "$status" -eq 0 ]
  has "Security Check:"
}

@test "security-check: detects an AWS access key (exit 0, advisory)" {
  printf 'const k = "AKIAIOSFODNN7EXAMPLE";\n' > "$TMP/secret.ts"
  run bash "$HOOKS/security-check.sh" <<< "{\"tool_input\":{\"file_path\":\"$TMP/secret.ts\"}}"
  [ "$status" -eq 0 ]
  has "AKIA"
}

@test "security-check: AKIA and private-key checks are case-sensitive" {
  printf 'Begin by generating a private key.\nconst id = "akiaiosfodnn7exampleab";\n' > "$TMP/prose.md"
  run bash "$HOOKS/security-check.sh" <<< "{\"tool_input\":{\"file_path\":\"$TMP/prose.md\"}}"
  [ "$status" -eq 0 ]
  hasnt "private key detected"
  hasnt "AKIA...) detected"
}

@test "security-check: reports a line number in a file with a NUL byte" {
  printf 'abc\000\nconst k = "AKIAIOSFODNN7EXAMPLE";\n' > "$TMP/bin.dat"
  run bash "$HOOKS/security-check.sh" <<< "{\"tool_input\":{\"file_path\":\"$TMP/bin.dat\"}}"
  [ "$status" -eq 0 ]
  has "AKIA...) detected (line 2)"
}

@test "security-check: detects a single-quoted API key without echoing it" {
  printf "const api_key = 'ABCDEFGHIJKLMNOPQRSTUVWX';\n" > "$TMP/sq.ts"
  run bash "$HOOKS/security-check.sh" <<< "{\"tool_input\":{\"file_path\":\"$TMP/sq.ts\"}}"
  [ "$status" -eq 0 ]
  has "API key detected (line 1)"
  hasnt "ABCDEFGHIJKLMNOPQRSTUVWX"
}

@test "security-check: detects double-quoted API key, single-quoted password and token" {
  printf 'const api_key = "ABCDEFGHIJKLMNOPQRSTUVWX";\n' > "$TMP/dq.ts"
  printf "x = 1\npassword = 'hunter2hunter2'\ntoken: 'abcdefghijklmnop1234'\n" >> "$TMP/dq.ts"
  run bash "$HOOKS/security-check.sh" <<< "{\"tool_input\":{\"file_path\":\"$TMP/dq.ts\"}}"
  has "API key detected (line 1)"
  has "password detected (line 3)"
  has "secret/token detected (line 4)"
  hasnt "hunter2hunter2"
}

@test "pre-commit-gate: skips non-commit Bash commands (exit 0)" {
  run bash "$HOOKS/pre-commit-gate.sh" <<< "{\"tool_input\":{\"command\":\"ls -la\"}}"
  [ "$status" -eq 0 ]
}

# A repo whose staged SKILL.md trips the gate's own description check, so the gate exits 2 if (and
# only if) it ran AND ran inside that repo. Runs from $TMP/elsewhere, mimicking a session whose cwd
# is not the repo being committed.
make_bad_repo() {
  REPO="$TMP/repo"; mkdir -p "$REPO/skills/x" "$TMP/elsewhere"
  git -C "$REPO" init -q
  printf -- '---\nname: x\ndescription: Use when: things break\n---\n' > "$REPO/skills/x/SKILL.md"
  git -C "$REPO" add skills/x/SKILL.md
}
gate() {  # gate <command> [payload cwd, default $TMP/elsewhere]
  # Without jq the gate fails open (exit 0), so every "allowed" assertion would pass vacuously.
  command -v jq >/dev/null || skip "jq required"
  local json; json=$(jq -cn --arg c "$1" --arg d "${2:-$TMP/elsewhere}" '{tool_input:{command:$c},cwd:$d}')
  run bash -c "cd '$TMP/elsewhere' && bash '$HOOKS/pre-commit-gate.sh'" <<< "$json"
}

@test "pre-commit-gate: gates 'git -C <repo> commit' inside that repo (exit 2)" {
  make_bad_repo
  gate "git -C $REPO commit -m x"
  [ "$status" -eq 2 ]
  has "colon-space"
}

@test "pre-commit-gate: gates 'cd <repo> && git commit' inside that repo (exit 2)" {
  make_bad_repo
  gate "cd $REPO && git commit -m x"
  [ "$status" -eq 2 ]
}

@test "pre-commit-gate: gates commits behind env prefixes and absolute git paths (exit 2)" {
  make_bad_repo
  gate "cd $REPO && GIT_AUTHOR_NAME=x /usr/bin/git -c core.editor=true commit -m x"
  [ "$status" -eq 2 ]
}

@test "pre-commit-gate: gates a commit after || (exit 2)" {
  make_bad_repo
  gate "false || git -C $REPO commit -m x"
  [ "$status" -eq 2 ]
  has "colon-space"
}

@test "pre-commit-gate: gates quoted global options and a quoted -C dir (exit 2)" {
  make_bad_repo
  mkdir -p "$TMP/dir with spaces"; mv "$REPO" "$TMP/dir with spaces/repo"
  gate 'git -C "dir with spaces/repo" commit -m x' "$TMP"
  [ "$status" -eq 2 ]
  has "colon-space"
  gate "git -c user.name=\"A B\" -C '$TMP/dir with spaces/repo' commit -m x"
  [ "$status" -eq 2 ]
  has "colon-space"
}

@test "pre-commit-gate: resolves a relative -C against a preceding cd (exit 2)" {
  make_bad_repo
  gate "cd $TMP && git -C repo commit -m x"
  [ "$status" -eq 2 ]
  has "colon-space"
}

@test "pre-commit-gate: expands \$HOME, \${HOME} and ~ in the commit dir (exit 2)" {
  make_bad_repo
  HOME="$TMP" gate 'cd "$HOME/repo" && git commit -m x'
  [ "$status" -eq 2 ]
  has "colon-space"
  HOME="$TMP" gate 'git -C ~/repo commit -m x'
  [ "$status" -eq 2 ]
  has "colon-space"
}

@test "pre-commit-gate: fails closed when the commit dir can't be resolved (exit 2)" {
  make_bad_repo
  gate 'git -C "$REPO" commit -m x'
  [ "$status" -eq 2 ]
  has "can't tell which repo"
  gate 'cd "$(git rev-parse --show-toplevel)" && git commit -m x'
  [ "$status" -eq 2 ]
  has "can't tell which repo"
  gate 'git --git-dir /p commit -m x'
  [ "$status" -eq 2 ]
  has "can't tell which repo"
  gate "git -C $TMP/missing commit -m x"
  [ "$status" -eq 2 ]
  has "can't tell which repo"
}

@test "pre-commit-gate: a plain commit in a clean dir still passes (exit 0)" {
  mkdir -p "$TMP/elsewhere"
  gate "git commit -m x"
  [ "$status" -eq 0 ]
  hasnt "can't tell which repo"
}

@test "pre-commit-gate: ignores git log --grep commit and git commit-tree (exit 0)" {
  make_bad_repo
  gate "git -C $REPO log --grep commit"
  [ "$status" -eq 0 ]
  gate "git -C $REPO commit-tree HEAD^{tree}"
  [ "$status" -eq 0 ]
}

@test "skill-usage-log: quotes and backslashes in cwd/session still give valid JSON lines" {
  command -v python3 >/dev/null || skip "python3 required"
  export CKLPH_USAGE_DIR="$TMP/usage"
  printf '%s' '{"session_id":"s\"1\\x","cwd":"/a/we\"ird\\dir","hook_event_name":"PostToolUse","tool_name":"Skill","tool_input":{"skill":"cklph-os:plan"}}' \
    | bash "$HOOKS/skill-usage-log.sh"
  printf '%s' '{"session_id":"s2","cwd":"/a/b\\\\","hook_event_name":"UserPromptSubmit","prompt":"/cklph-os:flow go\n"}' \
    | bash "$HOOKS/skill-usage-log.sh"
  run python3 -c '
import json, sys
rows = [json.loads(l) for l in open(sys.argv[1])]
assert len(rows) == 2, rows
assert rows[0]["repo"] == "we\"ird\\dir" and rows[0]["session"] == "s\"1\\x", rows[0]
assert rows[0]["skill"] == "cklph-os:plan" and rows[0]["via"] == "tool", rows[0]
assert rows[1]["repo"] == "b\\\\" and rows[1]["skill"] == "cklph-os:flow", rows[1]
print("ok")' "$TMP/usage/skills.jsonl"
  [ "$status" -eq 0 ]
  has "ok"
}

@test "destructive-command-gate: blocks git reset --hard (exit 2)" {
  run bash "$HOOKS/destructive-command-gate.sh" <<< '{"tool_name":"Bash","tool_input":{"command":"git reset --hard"}}'
  [ "$status" -eq 2 ]
}

@test "destructive-command-gate: full case suite passes" {
  run bash "$HOOKS/tests/destructive-command-gate.test.sh"
  [ "$status" -eq 0 ]
}

@test "reply-shape-context: prints the rules without frontmatter; CKLPH_REPLY_SHAPE=off disables it" {
  run env CLAUDE_PLUGIN_ROOT="$HOOKS/.." bash "$HOOKS/reply-shape-context.sh"
  [ "$status" -eq 0 ]
  has "First line = the answer"
  hasnt "description:"
  run env CKLPH_REPLY_SHAPE=off CLAUDE_PLUGIN_ROOT="$HOOKS/.." bash "$HOOKS/reply-shape-context.sh"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}
