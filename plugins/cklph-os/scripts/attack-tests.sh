#!/bin/bash
# Lock and check review attack tests (cklph-os flow → "Hand-offs", review → "Attack tests").
#
# A reviewer proposes an attack test: a NEW test file that should fail on the current code, with the
# failure it expects. The orchestrator reads it (it is untrusted code), writes it to disk, then:
#
#   attack-tests.sh lock --run '<cmd>' --expect '<ERE>' <path>...
#       Refuses unless: every path is a new, untracked, non-symlink file at a test location (see
#       is_test_path); the working tree has no other change; and each test FAILS when run, with an
#       exit code other than 126/127 (not runnable), and output matching <ERE>. Then commits only
#       those paths with trailers recording the paths, the command and the expectation, and records
#       the lock commit under refs/attack-tests/<branch>/ so a history rewrite can't hide it.
#
#   attack-tests.sh check <base> [--allow-unlocked <path>]...
#       Replays <base>..HEAD oldest first: a lock commit locks its paths, an
#       "Attack-Tests-Unlocked: <path> <reason>" trailer releases a path locked before it, a later
#       lock re-locks it. Then FAILS if: a recorded lock commit is no longer on this branch; any
#       locked test changed in any commit after its lock, or in the working tree; is missing or a
#       symlink; or doesn't PASS under the command recorded at lock time. Every unlock is printed and
#       FAILS unless --allow-unlocked names that path; only a human decides to pass that flag.
#
#   attack-tests.sh list <base>
#       Prints the currently locked paths in <base>..HEAD, one per line (build's OUT OF SCOPE).
#
# <base> is the commit the feature branch started from: `git merge-base <default-branch> HEAD`.
# It must be a commit and an ancestor of HEAD. <cmd> runs under bash with the test path as "$1",
# e.g. --run 'bats "$1"'. Run from the repository root. Exit 1 = refused/failed, 2 = usage.

set -uo pipefail
set -f   # trailer words are paths, never globs

die()   { echo "attack-tests: $*" >&2; exit 1; }
usage() { sed -n '2,30p' "${BASH_SOURCE[0]}" >&2; exit 2; }
safe()  { [[ "$1" =~ ^[A-Za-z0-9_][A-Za-z0-9._/-]*$ ]] && [[ "$1" != *..* ]] && [[ "$1" != */.* ]]; }
is_test_path() {  # a tests/test/__tests__/spec directory, or a test-named file
    [[ "$1" =~ (^|/)(tests?|__tests__|specs?)/ ]] || [[ "$1" =~ (^|/)test_[^/]+$ ]] ||
    [[ "$1" =~ [._-](test|spec)\.[A-Za-z0-9]+$ ]] || [[ "$1" =~ \.bats$ ]]
}
run_test() { OUT=$(bash -c "$1" attack-test "$2" 2>&1); RC=$?; }

valid_base() {
    git rev-parse --verify --quiet "$1^{commit}" >/dev/null || die "base is not a commit: '$1'"
    git merge-base --is-ancestor "$1" HEAD || die "base '$1' is not an ancestor of HEAD"
}
branch() { git symbolic-ref --quiet --short HEAD || die "detached HEAD; check out the feature branch"; }

# Replay <base>..HEAD → global arrays: LOCK_C[path]=commit, LOCK_RUN[path]=cmd, UNLOCKS (lines).
replay() {
    local base="$1" c p body run
    LOCK_PATHS=(); UNLOCKS=()
    while read -r c; do
        [ -n "$c" ] || continue
        body=$(git show -s --format=%B "$c")
        run=$(sed -n 's/^Attack-Tests-Run: //p' <<< "$body" | head -n1)
        for p in $(sed -n 's/^Attack-Tests-Unlocked: \([^ ]*\).*/\1/p' <<< "$body"); do
            if idx=$(find_lock "$p"); then
                unset 'LOCK_PATHS[idx]'; LOCK_PATHS=("${LOCK_PATHS[@]+"${LOCK_PATHS[@]}"}")
                UNLOCKS+=("$p ${c:0:7} $(git show -s --format='%an <%ae>' "$c"): $(sed -n "s|^Attack-Tests-Unlocked: $p ||p" <<< "$body" | head -n1)")
            fi
        done
        for p in $(sed -n 's/^Attack-Tests: //p' <<< "$body"); do
            safe "$p" || { echo "attack-tests: ignoring unsafe path in ${c:0:7}'s trailer: $p" >&2; continue; }
            [ -n "$run" ] || { echo "attack-tests: ${c:0:7} has no Attack-Tests-Run trailer" >&2; LOCK_PATHS+=("$p|$c|"); continue; }
            if idx=$(find_lock "$p"); then unset 'LOCK_PATHS[idx]'; LOCK_PATHS=("${LOCK_PATHS[@]+"${LOCK_PATHS[@]}"}"); fi
            LOCK_PATHS+=("$p|$c|$run")
        done
    done <<< "$(git rev-list --reverse --topo-order "$base"..HEAD)"
}
find_lock() { local i; for i in "${!LOCK_PATHS[@]}"; do [ "${LOCK_PATHS[i]%%|*}" = "$1" ] && { echo "$i"; return 0; }; done; return 1; }

cmd="${1:-}"; [ $# -gt 0 ] && shift
RUN=""; EXPECT=""; ALLOW=()
ARGS=()
while [ $# -gt 0 ]; do
    case "$1" in
        --run)            [ $# -ge 2 ] || usage; RUN="$2"; shift 2 ;;
        --expect)         [ $# -ge 2 ] || usage; EXPECT="$2"; shift 2 ;;
        --allow-unlocked) [ $# -ge 2 ] || usage; ALLOW+=("$2"); shift 2 ;;
        --) shift; ARGS+=("$@"); break ;;
        -*) usage ;;
        *) ARGS+=("$1"); shift ;;
    esac
done
git rev-parse --git-dir >/dev/null 2>&1 || die "not inside a git repository"
[ "$(pwd -P)" = "$(cd "$(git rev-parse --show-toplevel)" && pwd -P)" ] || die "run from the repository root (paths are root-relative)"

case "$cmd" in
lock)
    [ -n "$RUN" ] && [ -n "$EXPECT" ] && [ ${#ARGS[@]} -gt 0 ] || usage
    b=$(branch) || exit 1
    for p in "${ARGS[@]}"; do
        [[ "$p" == ./* ]] && die "write the path without a leading ./: $p"
        safe "$p" || die "unsafe path (letters, digits, . _ / -; no '..', no dot-directories or dot-files): $p"
        is_test_path "$p" || die "not a test location (tests/, test/, __tests__/, spec/, test_*, *.test.*, *.spec.*, *.bats): $p"
        [ -L "$p" ] && die "symlink, not a file: $p"
        [ -f "$p" ] || die "not a file: $p"
        git ls-files --error-unmatch -- "$p" >/dev/null 2>&1 && die "already tracked; an attack test must be a new file: $p"
    done
    expected=$(printf '?? %s\n' "${ARGS[@]}" | sort)
    actual=$(git status --porcelain --untracked-files=all | sort)
    [ "$actual" = "$expected" ] || die "working tree has other changes; commit or stash them first:
$actual"
    body=""
    for p in "${ARGS[@]}"; do
        run_test "$RUN" "$p"
        [ "$RC" -ne 0 ] || die "passes on the current code, so it proves nothing; not locked: $p"
        [ "$RC" -ne 126 ] && [ "$RC" -ne 127 ] || die "exit $RC means the test didn't run (command not found or not executable): $p"
        hit=$(grep -E -m1 -- "$EXPECT" <<< "$OUT") || die "fails (exit $RC), but not with the expected failure /$EXPECT/; send it back to the reviewer: $p"
        body="$body
- $p: exit $RC; matched: ${hit:0:200}"
    done
    msg=$(mktemp); trap 'rm -f "$msg"' EXIT
    printf 'test: lock review attack tests\n\nEach fails on the parent commit with the expected failure:%s\n\nAttack-Tests: %s\nAttack-Tests-Run: %s\nAttack-Tests-Expect: %s\n' \
        "$body" "${ARGS[*]}" "$RUN" "$EXPECT" > "$msg"
    git add -- "${ARGS[@]}" && git commit -q -F "$msg" -- "${ARGS[@]}" || die "commit failed"
    c=$(git rev-parse HEAD)
    git update-ref "refs/attack-tests/$b/$c" "$c" || die "couldn't record the lock ref"
    echo "$c"
    ;;
check)
    [ -z "$RUN" ] || die "check runs each test with the command recorded at lock time; don't pass --run"
    [ ${#ARGS[@]} -eq 1 ] || usage
    base="${ARGS[0]}"; valid_base "$base"; b=$(branch) || exit 1
    fail=0
    for ref in $(git for-each-ref --format='%(refname)' "refs/attack-tests/$b/"); do
        c=$(git rev-parse "$ref")
        git merge-base --is-ancestor "$c" HEAD || { echo "FAIL  lock commit ${c:0:7} is no longer on $b (history rewritten?)"; fail=1; }
    done
    replay "$base"
    for u in "${UNLOCKS[@]+"${UNLOCKS[@]}"}"; do
        p="${u%% *}"; ok=0
        for a in "${ALLOW[@]+"${ALLOW[@]}"}"; do [ "$a" = "$p" ] && ok=1; done
        if [ "$ok" = 1 ]; then echo "UNLOCKED (allowed)  $u"; else echo "FAIL  UNLOCKED without --allow-unlocked  $u"; fail=1; fi
    done
    n=0
    for entry in "${LOCK_PATHS[@]+"${LOCK_PATHS[@]}"}"; do
        p="${entry%%|*}"; rest="${entry#*|}"; c="${rest%%|*}"; run="${rest#*|}"; n=$((n + 1))
        later=$(git rev-list "$c"..HEAD -- "$p" | head -n1)
        if [ -n "$later" ]; then echo "FAIL  $p  changed after its lock, in ${later:0:7}"; fail=1; continue; fi
        if [ -L "$p" ] || [ ! -f "$p" ] || ! git diff --quiet HEAD -- "$p" 2>/dev/null; then
            echo "FAIL  $p  missing, a symlink, or edited in the working tree"; fail=1; continue
        fi
        [ -n "$run" ] || { echo "FAIL  $p  lock commit ${c:0:7} recorded no command"; fail=1; continue; }
        run_test "$run" "$p"
        if [ "$RC" -ne 0 ]; then echo "FAIL  $p  still fails (exit $RC)"; fail=1; else echo "PASS  $p"; fi
    done
    [ "$n" -gt 0 ] || [ ${#UNLOCKS[@]} -gt 0 ] || echo "no attack tests locked in $base..HEAD"
    exit "$fail"
    ;;
list)
    [ ${#ARGS[@]} -eq 1 ] || usage
    valid_base "${ARGS[0]}"
    replay "${ARGS[0]}"
    for entry in "${LOCK_PATHS[@]+"${LOCK_PATHS[@]}"}"; do echo "${entry%%|*}"; done | sort -u
    ;;
*) usage ;;
esac
