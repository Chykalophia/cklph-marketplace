#!/usr/bin/env bats
# Tests for cklph-os quality-gate hooks.  Run:  bats test/

HOOKS="${BATS_TEST_DIRNAME}/../plugins/cklph-os/hooks"

setup() {
  TMP="$(mktemp -d)"
}

teardown() {
  rm -rf "$TMP"
}

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
  [[ "$output" == *"Security Check:"* ]]
}

@test "security-check: detects an AWS access key (exit 0, advisory)" {
  printf 'const k = "AKIAIOSFODNN7EXAMPLE";\n' > "$TMP/secret.ts"
  run bash "$HOOKS/security-check.sh" <<< "{\"tool_input\":{\"file_path\":\"$TMP/secret.ts\"}}"
  [ "$status" -eq 0 ]
  [[ "$output" == *"AKIA"* ]]
}

@test "pre-commit-gate: skips non-commit Bash commands (exit 0)" {
  run bash "$HOOKS/pre-commit-gate.sh" <<< "{\"tool_input\":{\"command\":\"ls -la\"}}"
  [ "$status" -eq 0 ]
}
