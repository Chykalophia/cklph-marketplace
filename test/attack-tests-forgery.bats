#!/usr/bin/env bats
# Red-team round 4: check must not pass on a forged re-lock or a base that excludes the locks.
AT="${BATS_TEST_DIRNAME}/../plugins/cklph-os/scripts/attack-tests.sh"

setup() {
  TMP="$(mktemp -d)"; cd "$TMP"
  git init -q -b main . && git config user.email t@t && git config user.name t && git config commit.gpgsign false
  printf 'echo 1\n' > src.sh && git add src.sh && git commit -qm base && git checkout -qb feat
  mkdir -p tests
  printf '[ "$(bash src.sh)" = 2 ] || { echo "want 2"; exit 1; }\n' > tests/attack_test.sh
  bash "$AT" lock --run 'bash "$1"' --expect 'want 2' tests/attack_test.sh >/dev/null
  [ -n "$(git for-each-ref refs/attack-tests)" ] || { echo "setup: lock did not happen"; return 1; }
}
teardown() { cd /; rm -rf "$TMP"; }

@test "attack: a forged re-lock trailer cannot swap the recorded command" {
  git commit -q --allow-empty -m $'chore\n\nAttack-Tests: tests/attack_test.sh\nAttack-Tests-Run: true'
  run bash "$AT" check main
  [ "$status" -eq 1 ]
}

@test "attack: a base that excludes this branch's lock commits fails closed" {
  run bash "$AT" check HEAD
  [ "$status" -eq 1 ]
}
