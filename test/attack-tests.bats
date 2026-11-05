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
  has "- $T: exit 1"
  has "  matched: want 2, got 1"
  [ -z "$(git log -1 --format=%B | awk 'length($0) > 72 && !/^Attack-Tests/')" ]
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

@test "lock: refuses when anything else in the tree changed, and commits nothing" {
  printf 'notes\n' > NOTES.md                      # unrelated, so the test itself still fails as expected
  before=$(commits)
  run lock "$T"
  [ "$status" -eq 1 ]
  has "other changes"
  hasnt "running the tests"                         # refused before the test ever ran
  [ "$(commits)" -eq "$before" ]
}

@test "lock: refuses a test that changes the working tree while it runs" {
  printf 'echo x > side_effect.txt; echo want 2; exit 1\n' > "$T"
  before=$(commits)
  run lock "$T"
  [ "$status" -eq 1 ]
  has "running the tests changed the working tree"
  [ "$(commits)" -eq "$before" ]
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
  [ "$status" -eq 1 ]; has "differs from its lock commit"
  git commit -qam "weaken the test"
  check
  [ "$status" -eq 1 ]; has "changed after its lock"
  printf '%s\n' "$orig" > "$T"; git commit -qam "restore it"
  [ -z "$(git diff "$(git log --format=%H -1 --grep='^Attack-Tests: ')" -- "$T")" ]
  check
  [ "$status" -eq 1 ]; has "changed after its lock"   # restoring the bytes doesn't erase the edit
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
  git checkout -q feat
  run bash "$AT" check HEAD                           # an ancestor, but it excludes the lock
  [ "$status" -eq 1 ]; has "outside"
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
  U=$(git rev-parse HEAD)
  fix_bug
  run bash "$AT" list "$BASE"
  [ "$output" = "$T" ]
  check
  [ "$status" -eq 1 ]
  has "UNLOCKED without --allow-unlocked ${U:0:7}:tests/other_test.sh"
  has "wrong premise"
  check --allow-unlocked tests/other_test.sh
  [ "$status" -eq 1 ]                              # a bare path no longer allows anything
  check --allow-unlocked "${U:0:7}:tests/other_test.sh"
  [ "$status" -eq 0 ]
  has "UNLOCKED (allowed)"
}

@test "check: a test re-locked after an unlock is locked again" {
  lock "$T" >/dev/null
  git rm -q "$T" && git commit -qm $'drop\n\nAttack-Tests-Unlocked: tests/attack_test.sh disputed'
  U=$(git rev-parse HEAD)
  mkdir -p tests
  printf '[ "$(bash src.sh)" = 2 ] || { echo "want 2 again"; exit 1; }\n' > "$T"
  lock "$T" >/dev/null
  run bash "$AT" list "$BASE"
  [ "$output" = "$T" ]
  check --allow-unlocked "$U:$T"
  [ "$status" -eq 1 ]; has "still fails"
  fix_bug
  check --allow-unlocked "$U:$T"
  [ "$status" -eq 0 ]; has "PASS  $T"
  # A second, unapproved unlock of the same path is not covered by the first allowance.
  git rm -q "$T" && git commit -qm $'flaky\n\nAttack-Tests-Unlocked: tests/attack_test.sh flaky'
  check --allow-unlocked "$U:$T"
  [ "$status" -eq 1 ]; has "UNLOCKED without --allow-unlocked"
}

# ---- round 4: forgery, base, index flags, self-modifying tests, --require ------------------------

@test "check: a commit with lock trailers that isn't a real lock fails (edit + trailer in one commit)" {
  lock "$T" >/dev/null
  printf 'exit 0\n' > "$T"
  git commit -qam $'tidy\n\nAttack-Tests: tests/attack_test.sh\nAttack-Tests-Run: true'
  check
  [ "$status" -eq 1 ]; has "isn't a lock commit"
}

@test "check: assume-unchanged or skip-worktree can't hide an edit" {
  lock "$T" >/dev/null
  fix_bug
  git update-index --assume-unchanged "$T"; printf 'exit 0\n' > "$T"
  check
  [ "$status" -eq 1 ]; has "differs from its lock commit"
  git update-index --no-assume-unchanged "$T"; git checkout -q -- "$T"
  git update-index --skip-worktree "$T"; printf 'exit 0\n' > "$T"
  check
  [ "$status" -eq 1 ]; has "differs from its lock commit"
}

@test "check: --require fails when an expected test isn't locked (refs deleted + lock rewritten)" {
  lock "$T" >/dev/null
  for r in $(git for-each-ref --format='%(refname)' refs/attack-tests/); do git update-ref -d "$r"; done
  git commit -q --amend -m "test: just a test"
  fix_bug
  check
  [ "$status" -eq 0 ]                              # without --require, nothing is known to be missing
  check --require "$T"
  [ "$status" -eq 1 ]; has "required attack test is not locked: $T"
}

@test "check: --branch works on a detached HEAD; NOTE lists changed helpers" {
  lock "$T" >/dev/null
  printf 'helper\n' > tests/lib.sh; git add tests/lib.sh; git commit -qm "helper"
  fix_bug
  git checkout -q --detach
  check
  [ "$status" -eq 1 ]; has "detached HEAD"
  check --branch feat
  [ "$status" -eq 0 ]; has "NOTE  tests/lib.sh changed"
}

@test "lock: refuses a test that rewrites itself, a run command without \$1, and reads --expect-file" {
  printf 'printf "exit 0\\n" > "$0"; echo want 2; exit 1\n' > "$T"
  run lock "$T"
  [ "$status" -eq 1 ]; has "modified itself"
  printf '[ "$(bash src.sh)" = 2 ] || { echo "want 2"; exit 1; }\n' > "$T"
  run bash "$AT" lock --run 'bash tests/attack_test.sh' --expect 'want 2' "$T"
  [ "$status" -eq 1 ]; has 'must pass the test path'
  printf "want 2\n" > "$BATS_TEST_TMPDIR/exp"
  run bash "$AT" lock --run "$RUN" --expect-file "$BATS_TEST_TMPDIR/exp" "$T"
  rm -f "$BATS_TEST_TMPDIR/exp"
  [ "$status" -eq 0 ]
}

@test "list: trailer paths are never glob-expanded (a globbed unlock releases nothing)" {
  printf '[ -f nope ] || { echo want 2; exit 1; }\n' > tests/other_test.sh
  lock "$T" tests/other_test.sh >/dev/null
  git commit -q --allow-empty -m $'sneaky\n\nAttack-Tests-Unlocked: tests/*_test.sh all of them'
  run bash "$AT" list "$BASE"
  has "$T"; has "tests/other_test.sh"
}

@test "check: a path deleted without an unlock and then re-locked is a re-lock, and fails" {
  lock "$T" >/dev/null
  git rm -q "$T" && git commit -qm "drop it quietly"
  mkdir -p tests
  printf 'echo want 2; exit 1\n' > "$T"
  lock "$T" >/dev/null
  fix_bug
  check
  [ "$status" -eq 1 ]; has "again while it is still locked"
}

@test "attack-tests: must run from the repository root" {
  cd tests
  run bash "$AT" list "$BASE"
  [ "$status" -eq 1 ]
  has "repository root"
}

# ---- after round 5 -------------------------------------------------------------------------------

@test "lock: a multi-line --run or --expect is refused" {
  run bash "$AT" lock --run $'echo running\nbash "$1"' --expect "$EXP" "$T"
  [ "$status" -eq 1 ]; has "one line"
  [ -z "$(git log --format=%H --grep='^Attack-Tests: ' main..HEAD)" ]
}

@test "check: fails on an uncommitted fix (it judges the committed code)" {
  lock "$T" >/dev/null
  printf 'echo 2\n' > src.sh
  check
  [ "$status" -eq 1 ]; has "uncommitted changes"
  git commit -qam fix
  check
  [ "$status" -eq 0 ]
}

@test "check: an edit made and restored on a merged side branch still counts" {
  lock "$T" >/dev/null
  fix_bug
  git checkout -qb side
  orig=$(cat "$T"); printf 'exit 0\n' > "$T"; git commit -qam weaken
  printf '%s\n' "$orig" > "$T"; git commit -qam restore
  git checkout -q feat && git merge -q --no-ff side -m "merge side"
  check
  [ "$status" -eq 1 ]; has "changed after its lock"
}

@test "lock: runs the repo's commit hooks; a hook that rewrites the test undoes the lock" {
  printf '#!/bin/sh\necho "# touched" >> tests/attack_test.sh\ngit add tests/attack_test.sh\n' > .git/hooks/pre-commit
  chmod +x .git/hooks/pre-commit
  before=$(commits)
  run lock "$T"
  [ "$status" -eq 1 ]; has "commit hook changed"
  [ "$(commits)" -eq "$before" ]
  [ -z "$(git for-each-ref refs/attack-tests)" ]
}

@test "lock: a failed commit leaves the test unstaged so a retry works" {
  printf '#!/bin/sh\nexit 1\n' > .git/hooks/pre-commit; chmod +x .git/hooks/pre-commit
  run lock "$T"
  [ "$status" -eq 1 ]; has "commit failed"
  [ "$(git status --porcelain -- "$T")" = "?? $T" ]
  rm .git/hooks/pre-commit
  run lock "$T"
  [ "$status" -eq 0 ]
}

# ---- after round 6 -------------------------------------------------------------------------------

@test "check: merging main (or any branch without the test) after the lock still passes" {
  lock "$T" >/dev/null
  fix_bug
  git checkout -q main && printf 'x\n' > other.txt && git add other.txt && git commit -qm "main moves"
  git checkout -q feat && git merge -q --no-ff main -m "merge main"
  check
  [ "$status" -eq 0 ]; has "PASS  $T"
  run bash "$AT" check "$(git merge-base main HEAD)"
  [ "$status" -eq 0 ]
}

@test "check: merges that change the locked test and then restore it still count" {
  lock "$T" >/dev/null
  fix_bug
  orig=$(cat "$T")
  git checkout -q main && printf 'x\n' > a.txt && git add a.txt && git commit -qm "main a"
  git checkout -q feat && git merge -q --no-ff --no-commit main
  printf 'exit 0\n' > "$T"; git add "$T"; git commit -qm "merge main (weakens the test)"
  git checkout -q main && printf 'y\n' > b.txt && git add b.txt && git commit -qm "main b"
  git checkout -q feat && git merge -q --no-ff --no-commit main
  printf '%s\n' "$orig" > "$T"; git add "$T"; git commit -qm "merge main (restores it)"
  [ -z "$(git rev-list --no-merges --full-history "$(git rev-list -n1 --grep='^Attack-Tests: ' HEAD)"..HEAD -- "$T")" ]
  check
  [ "$status" -eq 1 ]; has "changed after its lock"
}

@test "check: an untracked file the fix needs fails (it isn't in the commit)" {
  lock "$T" >/dev/null
  printf 'bash lib/feature.sh\n' > src.sh; git commit -qam "call the helper"
  mkdir -p lib && printf 'echo 2\n' > lib/feature.sh
  check
  [ "$status" -eq 1 ]; has "uncommitted changes"; has "lib/"
  git add lib && git commit -qm "add helper"
  check
  [ "$status" -eq 0 ]
}

@test "lock: a hook that stages another file, rewrites the test unstaged, or strips trailers undoes the lock" {
  before=$(commits)
  printf 'x\n' > gen.txt && git add gen.txt && git commit -qm gen && before=$(commits)
  printf '#!/bin/sh\necho y >> gen.txt\ngit add gen.txt\n' > .git/hooks/pre-commit; chmod +x .git/hooks/pre-commit
  run lock "$T"
  [ "$status" -eq 1 ]; has "added other changes"
  [ "$(commits)" -eq "$before" ]; [ -z "$(git for-each-ref refs/attack-tests)" ]
  git checkout -q -- gen.txt
  printf '#!/bin/sh\necho "# fmt" >> tests/attack_test.sh\n' > .git/hooks/pre-commit
  run lock "$T"
  [ "$status" -eq 1 ]; has "left changes in the working tree"
  [ "$(commits)" -eq "$before" ]; [ -z "$(git for-each-ref refs/attack-tests)" ]
  printf '[ "$(bash src.sh)" = 2 ] || { echo "want 2, got $(bash src.sh)"; exit 1; }\n' > "$T"
  rm .git/hooks/pre-commit
  printf '#!/bin/sh\ngrep -v "^Attack-Tests" "$1" > "$1.x"; mv "$1.x" "$1"\n' > .git/hooks/commit-msg; chmod +x .git/hooks/commit-msg
  run lock "$T"
  [ "$status" -eq 1 ]; has "rewrote the lock trailers"
  [ "$(commits)" -eq "$before" ]; [ -z "$(git for-each-ref refs/attack-tests)" ]
  [ "$(git status --porcelain --untracked-files=all)" = "?? $T" ]
}

@test "check: a lock ref pointing at a commit that isn't a valid lock fails" {
  git commit -q --allow-empty -m "not a lock"
  c=$(git rev-parse HEAD); git update-ref "refs/attack-tests/feat/$c" "$c"
  check
  [ "$status" -eq 1 ]; has "isn't a valid lock commit"
}

@test "lock: --no-verify skips a test-running hook; without it the error names the hook" {
  printf '#!/bin/sh\nfor t in tests/*.sh; do bash "$t" || exit 1; done\n' > .git/hooks/pre-commit; chmod +x .git/hooks/pre-commit
  run lock "$T"
  [ "$status" -eq 1 ]; has "hook that runs the test suite"
  run bash "$AT" lock --run "$RUN" --expect "$EXP" --no-verify "$T"
  [ "$status" -eq 0 ]
}

@test "lock: --expect-file takes one line (CRLF ok) and refuses several" {
  printf 'want 2\r\n' > "$BATS_TEST_TMPDIR/exp"
  run bash "$AT" lock --run "$RUN" --expect-file "$BATS_TEST_TMPDIR/exp" "$T"
  [ "$status" -eq 0 ]
  run git log -1 --format=%B
  has "Attack-Tests-Expect: want 2"; hasnt $'\r'
  git reset -q --hard HEAD~1; mkdir -p tests
  printf '[ "$(bash src.sh)" = 2 ] || { echo "want 2"; exit 1; }\n' > "$T"
  printf 'want 2\nexit 0\n' > "$BATS_TEST_TMPDIR/exp"
  run bash "$AT" lock --run "$RUN" --expect-file "$BATS_TEST_TMPDIR/exp" "$T"
  rm -f "$BATS_TEST_TMPDIR/exp"
  [ "$status" -eq 1 ]; has "exactly one non-empty line"
}

# ---- after round 7 -------------------------------------------------------------------------------

@test "check: an untracked fix fails even with status.showUntrackedFiles=no" {
  git config status.showUntrackedFiles no
  lock "$T" >/dev/null
  printf 'bash lib/feature.sh\n' > src.sh; git commit -qam "call the helper"
  mkdir -p lib && printf 'echo 2\n' > lib/feature.sh
  check
  [ "$status" -eq 1 ]; has "uncommitted changes"
}

@test "lock: --run is trimmed; an --expect with an edge space is refused with a hint" {
  run bash "$AT" lock --run 'bash "$1" ' --expect 'want 2, ' "$T"
  [ "$status" -eq 1 ]; has "write [ ] for a literal space"
  [ -z "$(git for-each-ref refs/attack-tests)" ]
  run bash "$AT" lock --run '  bash "$1" ' --expect 'want 2,[ ]' "$T"
  [ "$status" -eq 0 ]
  [ "$(git log -1 --format=%B | sed -n 's/^Attack-Tests-Run: //p')" = 'bash "$1"' ]
  fix_bug
  check
  [ "$status" -eq 0 ]
}

@test "lock: refuses in a repo with no commits" {
  d="$BATS_TEST_TMPDIR/empty"; mkdir -p "$d/tests"; cd "$d"
  git init -q -b main . && git config user.email t@t && git config user.name t
  printf 'echo want 2; exit 1\n' > tests/a_test.sh
  run bash "$AT" lock --run "$RUN" --expect "$EXP" tests/a_test.sh
  [ "$status" -eq 1 ]; has "no commits yet"
}

# ---- known gaps closed ---------------------------------------------------------------------------

@test "lock --manifest records the paths in a committed file; check --require-file reads it" {
  M=docs/flow/t/attack-tests.txt
  run bash "$AT" lock --run "$RUN" --expect "$EXP" --manifest "$M" "$T"
  [ "$status" -eq 0 ]
  [ "$(git show HEAD:"$M")" = "$T" ]
  [ -z "$(git status --porcelain --untracked-files=all)" ]
  fix_bug
  check --require-file "$M"
  [ "$status" -eq 0 ]
  printf '# comment\n\ntests/never_locked_test.sh\r\n' >> "$M"; git commit -qam "expect one more"
  check --require-file "$M"
  [ "$status" -eq 1 ]; has "required attack test is not locked: tests/never_locked_test.sh"
  run bash "$AT" lock --run "$RUN" --expect "$EXP" --manifest "../x.txt" "$T"
  [ "$status" -eq 1 ]; has "unsafe --manifest"
}

@test "prune: removes refs of deleted or named branches, never the checked-out one" {
  lock "$T" >/dev/null
  git checkout -qb other main && mkdir -p tests && printf 'echo want 2; exit 1\n' > tests/o_test.sh
  lock tests/o_test.sh >/dev/null
  git checkout -q feat && git branch -qD other
  run bash "$AT" prune
  [ "$status" -eq 0 ]; has "pruned refs/attack-tests/other/"
  [ -z "$(git for-each-ref refs/attack-tests/other/)" ]
  [ -n "$(git for-each-ref refs/attack-tests/feat/)" ]
  run bash "$AT" prune --branch feat
  [ "$status" -eq 1 ]; has "checked-out branch"
  git checkout -q main
  run bash "$AT" prune --branch feat
  [ "$status" -eq 0 ]; [ -z "$(git for-each-ref refs/attack-tests/)" ]
}

@test "a test that hangs is stopped: lock refuses it, check fails it, children included" {
  D="31.$(( $$ % 100000 ))"                        # short, and unique per run so parallel suites don't see each other
  printf 'sleep %s; echo want 2; exit 1\n' "$D" > "$T"
  SECONDS=0
  run env CKLPH_ATTACK_TIMEOUT=2 bash "$AT" lock --run "$RUN" --expect "$EXP" "$T"
  [ "$status" -eq 1 ]; has "timed out after 2s"
  [ "$SECONDS" -lt 15 ]
  printf '[ "$(bash src.sh)" = 2 ] || { echo "want 2"; exit 1; }\n' > "$T"
  lock "$T" >/dev/null
  printf '(sleep %s; echo late) & sleep %s; echo 2\n' "$D" "$D" > src.sh; git commit -qam "slow fix"
  SECONDS=0
  run env CKLPH_ATTACK_TIMEOUT=2 bash "$AT" check "$BASE"
  [ "$status" -eq 1 ]; has "timed out after 2s"
  [ "$SECONDS" -lt 15 ]
  ! pgrep -f "^sleep $D\$" >/dev/null || { pkill -f "^sleep $D\$"; echo "a child of the test survived the timeout" >&2; false; }
  run env CKLPH_ATTACK_TIMEOUT=x bash "$AT" check "$BASE"
  [ "$status" -eq 1 ]; has "whole number of seconds"
  run env CKLPH_ATTACK_TIMEOUT=x bash "$AT" list "$BASE"
  [ "$status" -eq 0 ]; [ "$output" = "$T" ]
}

@test "check: NOTE lists changed runner config and tests anywhere, not just the test's folder" {
  lock "$T" >/dev/null
  printf '[ "$(bash src.sh)" = 2 ] || { echo "want 2"; exit 1; }\n' > tests/second_test.sh
  lock tests/second_test.sh >/dev/null
  fix_bug
  mkdir -p web/src && printf '{}\n' > package.json && printf '{}\n' > tsconfig.base.json
  printf 'x\n' > web/src/app.spec.ts && printf 'x\n' > web/src/app.ts && printf 'x\n' > 'web/src/a"b.spec.ts'
  git add -A && git commit -qm "config, another test, app code"
  check
  [ "$status" -eq 0 ]
  has "NOTE  package.json changed"; has "NOTE  tsconfig.base.json changed"; has "NOTE  web/src/app.spec.ts changed"
  has 'NOTE  web/src/a"b.spec.ts changed'
  hasnt "NOTE  web/src/app.ts"; hasnt "NOTE  tests/second_test.sh"
}

@test "lock: a hook that adds lines after the trailers undoes the lock; commentChar can't strip them" {
  before=$(commits)
  printf '#!/bin/sh\nprintf "\\n# Please describe the change\\n" >> "$1"\n' > .git/hooks/prepare-commit-msg; chmod +x .git/hooks/prepare-commit-msg
  run lock "$T"
  [ "$status" -eq 1 ]; has "added lines after the lock trailers"
  [ "$(commits)" -eq "$before" ]; [ -z "$(git for-each-ref refs/attack-tests)" ]
  rm .git/hooks/prepare-commit-msg
  git config core.commentChar A; git config commit.cleanup strip
  run lock "$T"
  [ "$status" -eq 0 ]
  run git log -1 --format=%B
  has "Attack-Tests-Run: $RUN"
}

@test "check --clean: a fix that lives only in a gitignored file fails" {
  lock "$T" >/dev/null
  printf 'lib/local.sh\n' > .gitignore
  printf '[ -f lib/local.sh ] && bash lib/local.sh || echo 1\n' > src.sh; git add .gitignore src.sh; git commit -qm "use local"
  mkdir -p lib && printf 'echo 2\n' > lib/local.sh
  check
  [ "$status" -eq 0 ]
  check --clean
  [ "$status" -eq 1 ]; has "still fails"
  [ "$(git worktree list | wc -l)" -eq 1 ]
  rm lib/local.sh; printf 'echo 2\n' > src.sh; git commit -qam "real fix"
  check --clean
  [ "$status" -eq 0 ]; has "PASS  $T"
}

# ---- round 9 ---------------------------------------------------------------------------------------

@test "check --require-file: a missing manifest fails; flow's comment-only manifest passes with no locks" {
  M=docs/flow/t/attack-tests.txt
  mv "$T" "$BATS_TEST_TMPDIR/t.sh"
  check --require-file "$M"
  [ "$status" -eq 1 ]; has "can't read $M"
  mkdir -p docs/flow/t && printf '# attack tests locked for this task\n' > "$M" && git add "$M" && git commit -qm "start task"
  check --require-file "$M"
  [ "$status" -eq 0 ]; has "no attack tests locked"
}

@test "check --require-file: a human-approved unlock releases the manifest line too" {
  M=docs/flow/t/attack-tests.txt
  bash "$AT" lock --run "$RUN" --expect "$EXP" --manifest "$M" "$T" >/dev/null
  git rm -q "$T" && git commit -qm $'drop\n\nAttack-Tests-Unlocked: tests/attack_test.sh wrong premise'
  U=$(git rev-parse HEAD)
  check --require-file "$M" --allow-unlocked "$U:$T"
  [ "$status" -eq 0 ]; has "UNLOCKED (allowed)"
  check --require-file "$M"
  [ "$status" -eq 1 ]; has "UNLOCKED without --allow-unlocked"
}

@test "lock --manifest: adds a newline to a manifest missing one; a failed manifest commit exits 3, still locked" {
  M=docs/flow/t/attack-tests.txt
  mkdir -p docs/flow/t && printf '# locked tests' > "$M" && git add "$M" && git commit -qm "manifest"
  bash "$AT" lock --run "$RUN" --expect "$EXP" --manifest "$M" "$T" >/dev/null
  [ "$(git show HEAD:"$M")" = "$(printf '# locked tests\n%s' "$T")" ]
  printf '[ -f nope ] || { echo want 2; exit 1; }\n' > tests/b_test.sh
  printf '#!/bin/sh\ngrep -q "^test: record" "$1" && exit 1; exit 0\n' > .git/hooks/commit-msg; chmod +x .git/hooks/commit-msg
  run bash "$AT" lock --run "$RUN" --expect "$EXP" --manifest "$M" tests/b_test.sh
  [ "$status" -eq 3 ]; has "ARE locked"; has "already holds them and is staged"
  [ "$(git diff --cached --name-only)" = "$M" ]
  run bash "$AT" list "$BASE"
  has "tests/b_test.sh"
}

@test "a killed check stops its test (even one ignoring TERM) and the watchdog" {
  lock "$T" >/dev/null
  D="41.$(( $$ % 100000 ))"; W=$((1000 + $$ % 100000))   # unique per run, so parallel suites don't see each other
  printf 'trap "" TERM; sleep %s; echo 2\n' "$D" > src.sh; git commit -qam "slow fix"
  CKLPH_ATTACK_TIMEOUT=$W bash "$AT" check "$BASE" >/dev/null 2>&1 & k=$!
  for i in 1 2 3 4 5 6 7 8 9 10; do pgrep -f "^sleep $D\$" >/dev/null && break; sleep 0.5; done
  pgrep -f "^sleep $D\$" >/dev/null
  st=0; kill -TERM "$k"; wait "$k" || st=$?
  [ "$st" -eq 143 ]
  sleep 0.5
  left=$(pgrep -f "^sleep ($D|$W)\$" || true)
  [ -z "$left" ] || { pkill -f "^sleep ($D|$W)\$"; echo "left running: $left" >&2; false; }
}

@test "check --clean: a failing checkout hook doesn't stop it or leak a worktree" {
  lock "$T" >/dev/null
  fix_bug
  printf '#!/bin/sh\nexit 1\n' > .git/hooks/post-checkout; chmod +x .git/hooks/post-checkout
  check --clean
  [ "$status" -eq 0 ]; has "PASS  $T"
  [ "$(git worktree list | wc -l)" -eq 1 ]
}

# ---- round 11 --------------------------------------------------------------------------------------

@test "check --require-file from a subdirectory says 'run from the repository root', not 'wrong slug'" {
  M=docs/flow/t/attack-tests.txt
  mkdir -p docs/flow/t web && printf '# attack tests locked for this task\n' > "$M" && printf 'x\n' > web/a.txt
  git add -A "$M" web && git commit -qm "start task"
  mv "$T" "$BATS_TEST_TMPDIR/t.sh"
  cd web
  run bash "$AT" check "$BASE" --require-file "$M"
  [ "$status" -eq 1 ]; has "run from the repository root"; hasnt "can't read"
}

@test "lock --manifest: exit 3 on a gitignored manifest says it may already list the tests" {
  M=docs/flow/t/attack-tests.txt
  printf 'docs/\n' > .gitignore && git add .gitignore && git commit -qm "ignore docs"
  run bash "$AT" lock --run "$RUN" --expect "$EXP" --manifest "$M" "$T"
  [ "$status" -eq 3 ]; has "ARE locked"; has "(it may already: $T)"; has "-f if it's gitignored"
  [ "$(cat "$M")" = "$T" ]
  git add -f "$M"
  cmd="${output##*then run: }"; eval "${cmd%%$'\n'*}"   # the printed command works as printed
  [ "$(git show HEAD:"$M")" = "$T" ]; [ -z "$(git status --porcelain)" ]
}
