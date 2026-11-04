#!/usr/bin/env bats
# Tests for plugins/cklph-os/scripts/attack-tests.sh (lock / check / list review attack tests).
# Each case builds a throwaway repo: src.sh is "the code", tests are shell scripts run as `bash "$1"`.
# Run:  bats test/

AT="${BATS_TEST_DIRNAME}/../plugins/cklph-os/scripts/attack-tests.sh"
RUN='bash "$1"'
EXP='want 2'
T=tests/attack_test.sh

has()   { [[ "$output" == *"$1"* ]] || { echo "expected output to contain: $1" >&2; return 1; }; }
hasnt() { [[ "$output" != *"$1"* ]] || { echo "expected output NOT to contain: $1" >&2; return 1; }; }
commits() { git rev-list --count HEAD; }
lock()  { bash "$AT" lock --run "$RUN" --expect "$EXP" "$@"; }
check() { run bash "$AT" check "$BASE" "$@"; }

setup() {
  TMP="$(mktemp -d)"; cd "$TMP"
  git init -q -b main . && git config user.email t@t && git config user.name t && git config commit.gpgsign false
  printf 'echo 1\n' > src.sh                     # buggy: the attack test wants 2
  git add src.sh && git commit -qm base
  git checkout -qb feat
  BASE=$(git merge-base main HEAD)
  mkdir -p tests
  # An attack test that fails on the current code: expects src.sh to print 2.
  printf '[ "$(bash src.sh)" = 2 ] || { echo "want 2, got $(bash src.sh)"; exit 1; }\n' > "$T"
}
teardown() { cd /; rm -rf "$TMP"; }
fix_bug() { printf 'echo 2\n' > src.sh; git commit -qam "fix"; }

# ---- lock ----------------------------------------------------------------------------------------

@test "lock: commits a failing test with path, command and expectation trailers, and a lock ref" {
  run lock "$T"
  [ "$status" -eq 0 ]
  c="$output"
  run git log -1 --format=%B
  has "Attack-Tests: $T"
  has "Attack-Tests-Run: $RUN"
  has "Attack-Tests-Expect: $EXP"
  has "exit 1; matched: want 2, got 1"
  [ "$(git rev-parse "refs/attack-tests/feat/$c")" = "$c" ]
  [ -z "$(git status --porcelain)" ]
}

@test "lock: keeps raw test output out of the commit, beyond the one matched line" {
  printf 'echo "DATABASE_URL=postgres://u:secret@db"; echo "want 2"; exit 1\n' > "$T"
  lock "$T" >/dev/null
  run git log -1 --format=%B
  hasnt "secret@db"
}

@test "lock: refuses a test that already passes, and commits nothing" {
  printf 'echo want 2; exit 0\n' > "$T"
  before=$(commits)
  run lock "$T"
  [ "$status" -eq 1 ]
  has "passes on the current code"
  [ "$(commits)" -eq "$before" ]
}

@test "lock: --expect is required, and a different failure is refused" {
  run bash "$AT" lock --run "$RUN" "$T"
  [ "$status" -eq 2 ]
  run bash "$AT" lock --run "$RUN" --expect 'TypeError' "$T"
  [ "$status" -eq 1 ]
  has "not with the expected failure"
}

@test "lock: exit 126/127 means the test never ran, so it's refused" {
  run bash "$AT" lock --run 'no-such-runner "$1"' --expect '.' "$T"
  [ "$status" -eq 1 ]
  has "didn't run"
}

@test "lock: refuses when anything else in the tree changed" {
  printf 'echo 2\n' > src.sh
  run lock "$T"
  [ "$status" -eq 1 ]
  has "other changes"
}

@test "lock: refuses tracked files, unsafe names, dot paths, ./ paths, symlinks and non-test locations" {
  git add "$T" && git commit -qm "already here"
  run lock "$T"
  [ "$status" -eq 1 ]; has "already tracked"
  printf 'exit 1\n' > 'tests/a b.sh'
  run lock 'tests/a b.sh'
  [ "$status" -eq 1 ]; has "unsafe path"
  mkdir -p .github/workflows tests/.hidden src
  printf 'want 2\n' > .github/workflows/x_test.sh
  run lock .github/workflows/x_test.sh
  [ "$status" -eq 1 ]; has "unsafe path"
  printf 'echo want 2; exit 1\n' > tests/.hidden/x.sh
  run lock tests/.hidden/x.sh
  [ "$status" -eq 1 ]; has "unsafe path"
  printf 'echo want 2; exit 1\n' > tests/new.sh
  run lock ./tests/new.sh
  [ "$status" -eq 1 ]; has "leading ./"
  ln -s ../src.sh tests/link_test.sh
  run lock tests/link_test.sh
  [ "$status" -eq 1 ]; has "symlink"
  printf 'echo want 2; exit 1\n' > src/helper.sh
  run lock src/helper.sh
  [ "$status" -eq 1 ]; has "not a test location"
}

@test "lock: an option missing its value is a usage error, not a hang" {
  run perl -e 'alarm 10; exec @ARGV' bash "$AT" check --run
  [ "$status" -eq 2 ]
  run perl -e 'alarm 10; exec @ARGV' bash "$AT" lock --expect
  [ "$status" -eq 2 ]
}

# ---- check ---------------------------------------------------------------------------------------

@test "check: passes once the code is fixed and the test is untouched" {
  lock "$T" >/dev/null
  fix_bug
  check
  [ "$status" -eq 0 ]
  has "PASS  $T"
}

@test "check: fails while the locked test still fails" {
  lock "$T" >/dev/null
  check
  [ "$status" -eq 1 ]
  has "still fails"
}

@test "check: uses the command recorded at lock time; --run is refused" {
  lock "$T" >/dev/null
  check --run 'true'
  [ "$status" -eq 1 ]
  has "don't pass --run"
}

@test "check: fails when the test is edited (working tree, committed, or edited then restored)" {
  lock "$T" >/dev/null
  fix_bug
  orig=$(cat "$T")
  printf 'exit 0\n' > "$T"
  check
  [ "$status" -eq 1 ]; has "edited in the working tree"
  git commit -qam "weaken the test"
  check
  [ "$status" -eq 1 ]; has "changed after its lock"
  printf '%s\n' "$orig" > "$T"; git commit -qam "restore it"
  [ -z "$(git diff "$(git log --format=%H -1 --grep='^Attack-Tests: ')" -- "$T")" ]
  check
  [ "$status" -eq 1 ]; has "changed after its lock"
}

@test "check: fails when the locked test is deleted" {
  lock "$T" >/dev/null
  git rm -q "$T" && git commit -qm "drop it"
  check
  [ "$status" -eq 1 ]; has "changed after its lock"
}

@test "check: fails when history is rewritten to drop the lock commit" {
  lock "$T" >/dev/null
  git commit -q --amend -m "test: just a test"   # same tree, trailer gone
  fix_bug
  check
  [ "$status" -eq 1 ]
  has "no longer on feat"
}

@test "check and list: a bad, missing or non-ancestor base fails closed" {
  lock "$T" >/dev/null
  run bash "$AT" check mian
  [ "$status" -eq 1 ]; has "not a commit"
  run bash "$AT" check ""
  [ "$status" -eq 1 ]
  run bash "$AT" list mian
  [ "$status" -eq 1 ]
  git checkout -q main && printf 'x\n' > other && git add other && git commit -qm other && git checkout -q feat
  run bash "$AT" check main
  [ "$status" -eq 1 ]; has "not an ancestor"
}

@test "check and list: scoped to <base>..HEAD, so tests merged earlier don't lock later work" {
  lock "$T" >/dev/null
  fix_bug
  git checkout -q main && git merge -q --no-ff feat -m "merge feat" && git checkout -qb feat2
  run bash "$AT" list "$(git merge-base main HEAD)"
  [ -z "$output" ]
  run bash "$AT" check "$(git merge-base main HEAD)"
  [ "$status" -eq 0 ]
  has "no attack tests locked"
}

@test "check: an unlock is printed and fails unless a human allows that path" {
  printf '[ -f nope ] || { echo want 2; exit 1; }\n' > tests/other_test.sh
  lock "$T" tests/other_test.sh >/dev/null
  git rm -q tests/other_test.sh && git commit -qm $'drop disputed test\n\nAttack-Tests-Unlocked: tests/other_test.sh wrong premise'
  fix_bug
  run bash "$AT" list "$BASE"
  [ "$output" = "$T" ]
  check
  [ "$status" -eq 1 ]
  has "UNLOCKED without --allow-unlocked  tests/other_test.sh"
  has "wrong premise"
  check --allow-unlocked tests/other_test.sh
  [ "$status" -eq 0 ]
  has "UNLOCKED (allowed)"
}

@test "check: a test re-locked after an unlock is locked again" {
  lock "$T" >/dev/null
  git rm -q "$T" && git commit -qm $'drop\n\nAttack-Tests-Unlocked: tests/attack_test.sh disputed'
  mkdir -p tests
  printf '[ "$(bash src.sh)" = 2 ] || { echo "want 2 again"; exit 1; }\n' > "$T"
  lock "$T" >/dev/null
  run bash "$AT" list "$BASE"
  [ "$output" = "$T" ]
  check --allow-unlocked "$T"
  [ "$status" -eq 1 ]; has "still fails"
  fix_bug
  check --allow-unlocked "$T"
  [ "$status" -eq 0 ]; has "PASS  $T"
}

@test "list: trailer paths are never glob-expanded" {
  printf 'x\n' > tests/a1_test.sh; printf 'x\n' > tests/a2_test.sh
  git add tests && git commit -qm $'sneaky\n\nAttack-Tests: tests/a*_test.sh\nAttack-Tests-Run: bash "$1"'
  run bash "$AT" list "$BASE"
  hasnt "a1_test.sh"
}

@test "attack-tests: must run from the repository root" {
  cd tests
  run bash "$AT" list "$BASE"
  [ "$status" -eq 1 ]
  has "repository root"
}
