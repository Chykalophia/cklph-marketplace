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

# Real PostToolUse payloads. Write and Edit results carry NO `success` field (PostToolUse only fires
# after a successful call). Before 0.12.3 these tests faked "tool_response":{"success":true}, which
# hid that the Next.js hook waited for that field and so never ran on a real edit.
write_payload() {  # write_payload <file>
  printf '{"session_id":"s","hook_event_name":"PostToolUse","tool_name":"Write","tool_input":{"file_path":"%s","content":"x"},"tool_response":{"type":"create","filePath":"%s","content":"x","structuredPatch":[],"originalFile":null}}' "$1" "$1"
}
edit_payload() {  # edit_payload <file>
  printf '{"session_id":"s","hook_event_name":"PostToolUse","tool_name":"Edit","tool_input":{"file_path":"%s","old_string":"a","new_string":"b"},"tool_response":{"filePath":"%s","oldString":"a","newString":"b","originalFile":"a","structuredPatch":[],"userModified":false,"replaceAll":false}}' "$1" "$1"
}

@test "nextjs-quality-check: clean non-app TS file passes (exit 0)" {
  printf 'export const x = 1;\n' > "$TMP/util.ts"
  run bash "$HOOKS/nextjs-quality-check.sh" <<< "$(write_payload "$TMP/util.ts")"
  [ "$status" -eq 0 ]
  has "Passed"
}

@test "nextjs-quality-check: runs on a real Write payload; page missing default export fails (exit 2)" {
  mkdir -p "$TMP/app"
  printf 'export const config = {};\n' > "$TMP/app/page.tsx"
  run bash "$HOOKS/nextjs-quality-check.sh" <<< "$(write_payload "$TMP/app/page.tsx")"
  [ "$status" -eq 2 ]
  has "Page must have a default export"
}

@test "nextjs-quality-check: runs on a real Edit payload (exit 2)" {
  mkdir -p "$TMP/app"
  printf 'export default function Layout() { return null }\n' > "$TMP/app/layout.tsx"
  run bash "$HOOKS/nextjs-quality-check.sh" <<< "$(edit_payload "$TMP/app/layout.tsx")"
  [ "$status" -eq 2 ]
  has "Layout must accept children"
}

@test "nextjs-quality-check: a path merely containing 'app/' is not App Router (exit 0)" {
  mkdir -p "$TMP/webapp/src"
  printf 'const [a] = useState(0);\n' > "$TMP/webapp/src/x.ts"
  run bash "$HOOKS/nextjs-quality-check.sh" <<< "$(write_payload "$TMP/webapp/src/x.ts")"
  [ "$status" -eq 0 ]
  hasnt "use client"
}

@test "nextjs-quality-check: skips non-JS/TS files (exit 0)" {
  printf '# readme\n' > "$TMP/readme.md"
  run bash "$HOOKS/nextjs-quality-check.sh" <<< "$(write_payload "$TMP/readme.md")"
  [ "$status" -eq 0 ]
  hasnt "Next.js Quality Check"
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

@test "security-check: a warning reaches Claude as PostToolUse additionalContext (exit 0)" {
  command -v jq >/dev/null || skip "jq required"
  printf 'const k = "AKIAIOSFODNN7EXAMPLE";\n' > "$TMP/secret.ts"
  # Optional scanners (gitleaks, bandit) add to the count; keep them off PATH so it is exact.
  mkdir -p "$TMP/bin"
  for b in cat grep cut tr jq; do ln -s "$(command -v "$b")" "$TMP/bin/$b"; done
  run env PATH="$TMP/bin" "$BASH" "$HOOKS/security-check.sh" <<< "$(write_payload "$TMP/secret.ts")"
  [ "$status" -eq 0 ]
  run jq -r 'select(.hookSpecificOutput.hookEventName == "PostToolUse") | .hookSpecificOutput.additionalContext' <<< "$output"
  [ "$status" -eq 0 ]
  has "AKIA...) detected (line 1)"
  has "Found 1 security warning"
  hasnt "AKIAIOSFODNN7EXAMPLE"
}

@test "security-check: without jq a warning goes to stderr with exit 2 (still shown to Claude)" {
  mkdir -p "$TMP/bin"
  for b in cat grep cut tr; do ln -s "$(command -v "$b")" "$TMP/bin/$b"; done
  printf 'const k = "AKIAIOSFODNN7EXAMPLE";\n' > "$TMP/secret.ts"
  run env PATH="$TMP/bin" "$BASH" "$HOOKS/security-check.sh" "$TMP/secret.ts" </dev/null
  [ "$status" -eq 2 ]
  has "AKIA...) detected (line 1)"
}

@test "security-check: without jq the path is read from the real stdin payload via python3 (exit 2)" {
  command -v python3 >/dev/null || skip "python3 required"
  mkdir -p "$TMP/bin"
  for b in cat grep cut tr python3; do ln -s "$(command -v "$b")" "$TMP/bin/$b"; done
  printf 'const k = "AKIAIOSFODNN7EXAMPLE";\n' > "$TMP/secret.ts"
  run env PATH="$TMP/bin" "$BASH" "$HOOKS/security-check.sh" <<< "$(write_payload "$TMP/secret.ts")"
  [ "$status" -eq 2 ]
  has "Security Check: $TMP/secret.ts"
  has "AKIA...) detected (line 1)"
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

@test "pre-commit-gate: a quoted description containing ': ' is valid YAML and passes (exit 0)" {
  REPO="$TMP/repo"; mkdir -p "$REPO/skills/q" "$REPO/skills/s" "$TMP/elsewhere"
  git -C "$REPO" init -q
  printf -- '---\nname: q\ndescription: "Checks docs against reality: moved paths"\n---\n' > "$REPO/skills/q/SKILL.md"
  printf -- "---\nname: s\ndescription: 'Use when: single-quoted'\n---\n" > "$REPO/skills/s/SKILL.md"
  git -C "$REPO" add skills
  gate "git -C $REPO commit -m x"
  [ "$status" -eq 0 ]
  has "PASS: Skill descriptions clean"
}

@test "pre-commit-gate: an unterminated quoted description containing ': ' still fails (exit 2)" {
  REPO="$TMP/repo"; mkdir -p "$REPO/skills/u" "$TMP/elsewhere"
  git -C "$REPO" init -q
  printf -- '---\nname: u\ndescription: "Use when: the quote never closes\n---\n' > "$REPO/skills/u/SKILL.md"
  git -C "$REPO" add skills
  gate "git -C $REPO commit -m x"
  [ "$status" -eq 2 ]
  has "colon-space"
  printf -- "---\nname: u\ndescription: 'Use when: closed' # note\n---\n" > "$REPO/skills/u/SKILL.md"
  git -C "$REPO" add skills
  gate "git -C $REPO commit -m x"
  [ "$status" -eq 0 ]
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

# A command named like a skill hides the skill's description, so each command must carry its skill's
# trigger text verbatim and point at the skill file.
@test "commands: each shares its skill's description and loads that skill's SKILL.md" {
  command -v python3 >/dev/null || skip "python3 required"
  run python3 -c '
import pathlib, re, sys
root = pathlib.Path(sys.argv[1])
bad = []
for cmd in sorted((root / "commands").glob("*.md")):
    skill = root / "skills" / cmd.stem / "SKILL.md"
    if not skill.exists():
        bad.append(cmd.name + ": missing matching skill " + str(skill.relative_to(root)))
        continue
    d = lambda t: re.search(r"^description:[ ]*(.*)$", t, re.M).group(1)
    text = cmd.read_text()
    if d(text) != d(skill.read_text()):
        bad.append(cmd.name + ": description differs from " + str(skill.relative_to(root)))
    if "${CLAUDE_PLUGIN_ROOT}/skills/%s/SKILL.md" % cmd.stem not in text:
        bad.append(cmd.name + ": does not load its SKILL.md")
print("\n".join(bad) or "ok")' "$HOOKS/.."
  [ "$status" -eq 0 ]
  [ "$output" = "ok" ]
}

@test "reply-shape-context: prints the rules without frontmatter; CKLPH_REPLY_SHAPE=off disables it" {
  run env CLAUDE_PLUGIN_ROOT="$HOOKS/.." bash "$HOOKS/reply-shape-context.sh"
  [ "$status" -eq 0 ]
  has "First line = the answer"
  hasnt "description:"
  hasnt "name: reply-shape"
  [[ "${lines[0]}" != "---" ]] || return 1
  run env CKLPH_REPLY_SHAPE=off CLAUDE_PLUGIN_ROOT="$HOOKS/.." bash "$HOOKS/reply-shape-context.sh"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}
