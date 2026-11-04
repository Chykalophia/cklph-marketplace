#!/usr/bin/env bats
# Tests for plugins/cklph-os/scripts/attack-tests.sh (lock / check / list review attack tests).
# Each case builds a throwaway repo: src.sh is "the code", tests are shell scripts run as `bash "$1"`.
# Run:  bats test/

AT="${BATS_TEST_DIRNAME}/../plugins/cklph-os/scripts/attack-tests.sh"
RUN='bash "$1"'

has()   { [[ "$output" == *"$1"* ]] || { echo "expected output to contain: $1" >&2; return 1; }; }
hasnt() { [[ "$output" != *"$1"* ]] || { echo "expected output NOT to contain: $1" >&2; return 1; }; }
commits() { git rev-list --count HEAD; }

setup() {
  TMP="$(mktemp -d)"; cd "$TMP"
  git init -q -b main . && git config user.email t@t && git config user.name t && git config commit.gpgsign false
  printf 'echo 1\n' > src.sh                     # buggy: the attack test wants 2
  git add src.sh && git commit -qm base
  git checkout -qb feat
  mkdir -p t
  # An attack test that fails on the current code: expects src.sh to print 2.
  printf '[ "$(bash src.sh)" = 2 ] || { echo "want 2, got $(bash src.sh)"; exit 1; }\n' > t/attack.sh
}
teardown() { cd /; rm -rf "$TMP"; }

fix_bug() { printf 'echo 2\n' > src.sh; git commit -qam "fix"; }

@test "lock: commits a failing attack test with the trailer and the failure output" {
  run bash "$AT" lock --run "$RUN" t/attack.sh
  [ "$status" -eq 0 ]
  run git log -1 --format=%B
  has "Attack-Tests: t/attack.sh"
  has "want 2, got 1"
  [ -z "$(git status --porcelain)" ]
}

@test "lock: refuses a test that already passes, and commits nothing" {
  printf 'exit 0\n' > t/attack.sh
  before=$(commits)
  run bash "$AT" lock --run "$RUN" t/attack.sh
  [ "$status" -eq 1 ]
  has "passes on the current code"
  [ "$(commits)" -eq "$before" ]
}

@test "lock: refuses when the failure doesn't match --expect" {
  run bash "$AT" lock --run "$RUN" --expect 'TypeError' t/attack.sh
  [ "$status" -eq 1 ]
  has "not with the expected failure"
  run bash "$AT" lock --run "$RUN" --expect 'want 2' t/attack.sh
  [ "$status" -eq 0 ]
}

@test "lock: refuses when anything else in the tree changed" {
  printf 'echo 2\n' > src.sh
  run bash "$AT" lock --run "$RUN" t/attack.sh
  [ "$status" -eq 1 ]
  has "other changes"
}

@test "lock: refuses an existing tracked file and an unsafe path" {
  git add t/attack.sh && git commit -qm "already here"
  run bash "$AT" lock --run "$RUN" t/attack.sh
  [ "$status" -eq 1 ]
  has "already tracked"
  printf 'exit 1\n' > 't/a b.sh'
  run bash "$AT" lock --run "$RUN" 't/a b.sh'
  [ "$status" -eq 1 ]
  has "unsafe path"
}

@test "check: passes once the code is fixed and the test is untouched" {
  bash "$AT" lock --run "$RUN" t/attack.sh >/dev/null
  fix_bug
  run bash "$AT" check --run "$RUN" main
  [ "$status" -eq 0 ]
  has "PASS  t/attack.sh"
}

@test "check: fails while the locked test still fails" {
  bash "$AT" lock --run "$RUN" t/attack.sh >/dev/null
  run bash "$AT" check --run "$RUN" main
  [ "$status" -eq 1 ]
  has "still fails"
}

@test "check: fails when the fix wave edits the test instead of the code (committed or not)" {
  bash "$AT" lock --run "$RUN" t/attack.sh >/dev/null
  printf 'exit 0\n' > t/attack.sh
  run bash "$AT" check --run "$RUN" main
  [ "$status" -eq 1 ]
  has "changed or deleted"
  git commit -qam "weaken the test"
  run bash "$AT" check --run "$RUN" main
  [ "$status" -eq 1 ]
  has "changed or deleted"
}

@test "check: fails when the locked test is deleted" {
  bash "$AT" lock --run "$RUN" t/attack.sh >/dev/null
  git rm -q t/attack.sh && git commit -qm "drop it"
  run bash "$AT" check --run "$RUN" main
  [ "$status" -eq 1 ]
  has "changed or deleted"
}

@test "check and list: scoped to <base>..HEAD, so tests merged earlier don't lock later work" {
  bash "$AT" lock --run "$RUN" t/attack.sh >/dev/null
  fix_bug
  git checkout -q main && git merge -q --no-ff feat -m "merge feat" && git checkout -qb feat2
  run bash "$AT" list main
  [ -z "$output" ]
  run bash "$AT" check --run "$RUN" main
  [ "$status" -eq 0 ]
  has "no attack tests locked"
}

@test "check and list: an Attack-Tests-Unlocked trailer releases that path only" {
  printf '[ -f nope ] || exit 1\n' > t/other.sh
  bash "$AT" lock --run "$RUN" t/attack.sh t/other.sh >/dev/null
  run bash "$AT" list main
  has "t/attack.sh"; has "t/other.sh"
  git rm -q t/other.sh && git commit -qm $'drop disputed test\n\nAttack-Tests-Unlocked: t/other.sh wrong premise, per review'
  fix_bug
  run bash "$AT" list main
  [ "$output" = "t/attack.sh" ]
  run bash "$AT" check --run "$RUN" main
  [ "$status" -eq 0 ]
  hasnt "t/other.sh"
}

@test "attack-tests: must run from the repository root" {
  cd t
  run bash "$AT" list main
  [ "$status" -eq 1 ]
  has "repository root"
}
