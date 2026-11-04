#!/bin/bash
# Lock and check review attack tests (cklph-os flow → "Hand-offs", review → "Attack tests").
#
# A reviewer proposes an attack test (a NEW test file that should fail on the current code). The
# orchestrator writes it to disk, then:
#
#   attack-tests.sh lock --run '<cmd>' [--expect '<ERE>'] <path>...
#       Refuses unless: every path is a new, untracked file with a safe name; the working tree has
#       no other change; and each test FAILS when run (and, with --expect, its output matches the
#       ERE). Then commits only those paths with the trailer "Attack-Tests: <path> <path>…" and the
#       tail of each failing run in the body. A test that passes on the current code proves nothing
#       and is never locked.
#
#   attack-tests.sh check --run '<cmd>' <base>
#       For every attack-test commit in <base>..HEAD: each locked path is unchanged since its lock
#       commit (committed and uncommitted), still exists, and PASSES when run by path. Exit 1 on any
#       failure. Paths released by an "Attack-Tests-Unlocked: <path> <reason>" trailer in
#       <base>..HEAD are skipped (a human writes that trailer; the orchestrator never does).
#
#   attack-tests.sh list <base>
#       Prints the locked, not-unlocked paths in <base>..HEAD, one per line (build's OUT OF SCOPE).
#
# <cmd> runs under bash with the test path as "$1", e.g.  --run 'bats "$1"'  or
# --run 'npx vitest run "$1"'. Run from the repository root. Exit 2 = usage error.

set -uo pipefail

die()   { echo "attack-tests: $*" >&2; exit 1; }
usage() { sed -n '2,26p' "${BASH_SOURCE[0]}" >&2; exit 2; }
safe()  { [[ "$1" =~ ^[A-Za-z0-9._][A-Za-z0-9._/-]*$ ]] && [[ "$1" != *..* ]]; }

run_test() {  # run_test <cmd> <path> → sets OUT, RC
    OUT=$(bash -c "$1" attack-test "$2" 2>&1); RC=$?
}

locked_paths() {  # locked_paths <base> → "<commit> <path>" lines, unlocked ones removed
    local base="$1" c p unlocked
    unlocked=$(git log --format=%B "$base"..HEAD 2>/dev/null | sed -n 's/^Attack-Tests-Unlocked: \([^ ]*\).*/\1/p' | sort -u)
    git log --format=%H --grep='^Attack-Tests: ' "$base"..HEAD | while read -r c; do
        for p in $(git show -s --format=%B "$c" | sed -n 's/^Attack-Tests: //p'); do
            safe "$p" || { echo "attack-tests: ignoring unsafe path in ${c:0:7}'s trailer: $p" >&2; continue; }
            grep -qxF -- "$p" <<< "$unlocked" || echo "$c $p"
        done
    done
}

cmd="${1:-}"; shift || true
RUN=""; EXPECT=""
while [ $# -gt 0 ]; do
    case "$1" in
        --run)    RUN="${2:-}"; shift 2 ;;
        --expect) EXPECT="${2:-}"; shift 2 ;;
        --) shift; break ;;
        -*) usage ;;
        *) break ;;
    esac
done
git rev-parse --git-dir >/dev/null 2>&1 || die "not inside a git repository"
[ "$(pwd -P)" = "$(cd "$(git rev-parse --show-toplevel)" && pwd -P)" ] || die "run from the repository root (paths are root-relative)"

case "$cmd" in
lock)
    [ -n "$RUN" ] && [ $# -gt 0 ] || usage
    for p in "$@"; do
        safe "$p" || die "unsafe path (letters, digits, . _ / - only; no '..'): $p"
        [ -f "$p" ] || die "not a file: $p"
        git ls-files --error-unmatch -- "$p" >/dev/null 2>&1 && die "already tracked; an attack test must be a new file: $p"
    done
    expected=$(printf '?? %s\n' "$@" | sort)
    actual=$(git status --porcelain --untracked-files=all | sort)
    [ "$actual" = "$expected" ] || die "working tree has other changes; commit or stash them first:
$actual"
    body=""
    for p in "$@"; do
        run_test "$RUN" "$p"
        [ "$RC" -ne 0 ] || die "passes on the current code, so it proves nothing; not locked: $p"
        if [ -n "$EXPECT" ] && ! grep -Eq -- "$EXPECT" <<< "$OUT"; then
            die "fails, but not with the expected failure /$EXPECT/; send it back to the reviewer: $p"
        fi
        body="$body
$p (exit $RC):
$(tail -n 15 <<< "$OUT" | sed 's/^/    /')
"
    done
    msg=$(mktemp); trap 'rm -f "$msg"' EXIT
    printf 'test: lock review attack tests\n\nEach fails on the parent commit:\n%s\nAttack-Tests: %s\n' "$body" "$*" > "$msg"
    git add -- "$@" && git commit -q -F "$msg" -- "$@" || die "commit failed"
    git rev-parse HEAD
    ;;
check)
    [ -n "$RUN" ] && [ $# -eq 1 ] || usage
    base="$1"; fail=0; n=0
    while read -r c p; do
        [ -n "$c" ] || continue
        n=$((n + 1))
        if ! git diff --quiet "$c" -- "$p" 2>/dev/null || [ ! -f "$p" ]; then
            echo "FAIL  $p  changed or deleted since its lock commit ${c:0:7}"; fail=1; continue
        fi
        run_test "$RUN" "$p"
        if [ "$RC" -ne 0 ]; then
            echo "FAIL  $p  still fails (exit $RC)"; tail -n 15 <<< "$OUT" | sed 's/^/    /'; fail=1
        else
            echo "PASS  $p"
        fi
    done <<< "$(locked_paths "$base")"
    [ "$n" -gt 0 ] || echo "no attack tests locked in $base..HEAD"
    exit "$fail"
    ;;
list)
    [ $# -eq 1 ] || usage
    locked_paths "$1" | cut -d' ' -f2- | sort -u
    ;;
*) usage ;;
esac
