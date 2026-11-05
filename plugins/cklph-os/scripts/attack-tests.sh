#!/bin/bash
# Lock and check review attack tests (cklph-os flow → "Hand-offs", review → "Attack tests").
#
# WHAT THIS GUARDS AGAINST: an honest agent taking a shortcut or making a mistake: editing or
# deleting a locked test, weakening it, swapping its command, pointing check at the wrong base,
# rewriting history over it, or "unlocking" it without a human. It is NOT a security boundary: an
# agent with a shell on this clone can forge any local state (refs, trailers, flags). Real
# enforcement is CI running `check` from a clean clone with --require listing the expected tests.
#
# A reviewer proposes an attack test: a NEW test file that should fail on the current code, with the
# failure it expects. The orchestrator reads it (untrusted code), writes it to disk, then:
#
#   attack-tests.sh lock --run '<cmd>' (--expect '<ERE>' | --expect-file <file>) [--manifest <file>] [--no-verify] <path>...
#       Refuses unless every path is a new, untracked, non-symlink file at a test location; the
#       working tree has no other change before and after the runs; <cmd> uses "$1"; <ERE> has no
#       space at either end (write [ ] for one); and each test FAILS (exit not 0/126/127, not timed
#       out) with output matching <ERE>, without modifying itself. Commits only those paths, with
#       trailers (paths, command, expectation) as the last lines of the message, and records the lock
#       commit as refs/attack-tests/<branch>/<sha>. --manifest appends the paths to <file> (e.g.
#       docs/flow/<task-slug>/attack-tests.txt) in a second commit, the source for check --require-file.
#       Commits normally, so the repo's git hooks run. If a hook changes a test, adds or leaves any
#       other change, or rewrites or follows the trailers, the lock is undone. A pre-commit hook that
#       runs the test suite always rejects an attack test (it fails by design); pass --no-verify only
#       when a human approves skipping hooks for this one lock.
#
#   attack-tests.sh check <base> [--require <path>]... [--require-file <file>] [--clean]
#                     [--allow-unlocked <sha>:<path>]... [--branch <name>]
#       Replays <base>..HEAD oldest first and FAILS on: any uncommitted change, tracked or untracked
#       (it judges the committed code); a commit with lock trailers that isn't a real lock (it must
#       only Add exactly the paths it names); a second lock of a path still locked; a recorded lock
#       ref that is no longer on the branch, outside <base>..HEAD (wrong base), or not a valid lock
#       commit; a --require path (or a line of --require-file) that isn't locked; a locked test
#       touched by any later non-merge commit or changed by a merge (even if restored), or whose bytes
#       differ from the lock commit's (working tree, index flags), that is missing or a symlink, or
#       that doesn't PASS under its recorded command within the time limit; and any unlock not
#       allowed by --allow-unlocked <unlock-commit-sha>:<path> (only a human decides to pass that).
#       --clean runs the tests in a fresh checkout of HEAD, so a fix that lives only in a gitignored
#       file fails too (without --clean, ignored files are invisible to git); use it when the test
#       command doesn't need ignored files such as node_modules, and rely on CI otherwise.
#       Prints NOTE lines for other files changed since a test's lock in its directory, in any test
#       location, or in test-runner config (package.json, *.config.*, pytest.ini, ...): review them.
#
#   attack-tests.sh list <base>
#       Prints the currently locked paths in <base>..HEAD, one per line (build's OUT OF SCOPE).
#
#   attack-tests.sh prune [--branch <name>]
#       Deletes lock refs whose branch no longer exists, or all refs of --branch <name> once that
#       branch is merged (never the checked-out branch). Prints what it deleted.
#
# <base> is `git merge-base <default-branch> HEAD` (cklph-os flow → Hand-offs). <cmd> is one line and
# runs under bash with the test path as "$1", e.g. --run 'bats "$1"'. Run from the repository root.
# Each test run is stopped after CKLPH_ATTACK_TIMEOUT seconds (default 600).
# After a legitimate rebase the lock commits get new SHAs: point a ref at each rebased lock commit
# (git update-ref refs/attack-tests/<branch>/<new> <new>) and delete the old refs. Don't just delete
# them: the wrong-base guard needs them.
# Exit 1 = refused/failed, 2 = usage.

set -uo pipefail
set -f   # trailer words are paths, never globs

die()   { echo "attack-tests: $*" >&2; exit 1; }
usage() { sed -n "2,$(grep -n -m1 '^# Exit 1' "${BASH_SOURCE[0]}" | cut -d: -f1)p" "${BASH_SOURCE[0]}" >&2; exit 2; }
safe()  { [[ "$1" =~ ^[A-Za-z0-9_][A-Za-z0-9._/-]*$ ]] && [[ "$1" != *..* ]] && [[ "$1" != */.* ]]; }
is_test_path() {  # a tests/test/__tests__/spec directory, or a test-named file
    [[ "$1" =~ (^|/)(tests?|__tests__|specs?)/ ]] || [[ "$1" =~ (^|/)test_[^/]+$ ]] ||
    [[ "$1" =~ [._-](test|spec)\.[A-Za-z0-9]+$ ]] || [[ "$1" =~ \.bats$ ]]
}
TIMEOUT="${CKLPH_ATTACK_TIMEOUT:-600}"
[[ "$TIMEOUT" =~ ^[1-9][0-9]*$ ]] || die "CKLPH_ATTACK_TIMEOUT must be a whole number of seconds"
# Run one test with a time limit. Sets OUT, RC (124 = timed out). The test and the watchdog each get
# their own process group (set -m), so a timeout stops the whole test, children included.
run_test() {
    local out flag pid dog
    out=$(mktemp); flag=$(mktemp); rm -f "$flag"
    set -m
    bash -c "$1" attack-test "$2" > "$out" 2>&1 < /dev/null & pid=$!
    { sleep "$TIMEOUT"; : > "$flag"; kill -TERM -- -"$pid"; sleep 2; kill -KILL -- -"$pid"; } > /dev/null 2>&1 < /dev/null & dog=$!
    set +m
    wait "$pid"; RC=$?
    kill -TERM -- -"$dog" > /dev/null 2>&1; wait "$dog" 2>/dev/null
    OUT=$(cat "$out"); rm -f "$out"
    if [ -e "$flag" ]; then rm -f "$flag"; RC=124; OUT="$OUT
attack-tests: timed out after ${TIMEOUT}s"; fi
}
is_runner_config() {  # files that change how tests run, wherever they are
    case "${1##*/}" in
        package.json|*.config.*|.mocharc*|pytest.ini|pyproject.toml|setup.cfg|tox.ini|conftest.py|phpunit.xml*|Makefile|.bats*|go.mod|Cargo.toml|Gemfile|.rspec) return 0 ;;
    esac
    return 1
}
blob_at()  { git rev-parse --verify --quiet "$1:$2" 2>/dev/null; }
valid_base() {
    git rev-parse --verify --quiet "$1^{commit}" >/dev/null || die "base is not a commit: '$1'"
    git merge-base --is-ancestor "$1" HEAD || die "base '$1' is not an ancestor of HEAD"
}
cur_branch() {
    [ -n "$BRANCH" ] && { echo "$BRANCH"; return; }
    git symbolic-ref --quiet --short HEAD || die "detached HEAD; pass --branch <name>"
}

# Replay <base>..HEAD oldest first. Sets LOCKS ("path|commit|cmd"), UNLOCKS ("path|commit|who: reason"),
# ERRORS (lines). Pure function of the commit range.
replay() {
    local base="$1" c p body run listed added
    LOCKS=(); UNLOCKS=(); ERRORS=(); LOCKCOMMITS=" "
    while read -r c; do
        [ -n "$c" ] || continue
        body=$(git show -s --format=%B "$c")
        for p in $(sed -n 's/^Attack-Tests-Unlocked: \([^ ]*\).*/\1/p' <<< "$body"); do
            if drop_lock "$p"; then
                UNLOCKS+=("$p|$c|$(git show -s --format='%an <%ae>' "$c"): $(grep -m1 "^Attack-Tests-Unlocked: " <<< "$body" | cut -d' ' -f3-)")
            fi
        done
        listed=$(sed -n 's/^Attack-Tests: //p' <<< "$body" | tr ' ' '\n' | sed '/^$/d' | sort -u)
        [ -n "$listed" ] || continue
        run=$(sed -n 's/^Attack-Tests-Run: //p' <<< "$body")
        [ "$(grep -c '^Attack-Tests-Run: ' <<< "$body")" -le 1 ] || run=""
        added=$(git diff-tree --no-commit-id --root -r --name-status "$c" | awk -F'\t' '$1=="A"{print $2; next} {print "!" $2}' | sort -u)
        if [ "$added" != "$listed" ] || [ -z "$run" ]; then
            ERRORS+=("${c:0:7} carries Attack-Tests trailers but isn't a lock commit (it must only add exactly the listed files, and record a command)")
            continue
        fi
        for p in $listed; do
            safe "$p" || { ERRORS+=("${c:0:7} names an unsafe path: $p"); continue; }
            if has_lock "$p"; then ERRORS+=("${c:0:7} locks $p again while it is still locked (unlock it first)"); continue; fi
            LOCKS+=("$p|$c|$run"); LOCKCOMMITS="$LOCKCOMMITS$c "
        done
    done <<< "$(git rev-list --reverse --topo-order "$base"..HEAD)"
}
has_lock()  { local e; for e in "${LOCKS[@]+"${LOCKS[@]}"}"; do [ "${e%%|*}" = "$1" ] && return 0; done; return 1; }
drop_lock() {
    local e out=() hit=1
    for e in "${LOCKS[@]+"${LOCKS[@]}"}"; do if [ "${e%%|*}" = "$1" ]; then hit=0; else out+=("$e"); fi; done
    LOCKS=("${out[@]+"${out[@]}"}"); return $hit
}

cmd="${1:-}"; [ $# -gt 0 ] && shift
RUN=""; EXPECT=""; BRANCH=""; NOVERIFY=""; MANIFEST=""; CLEAN=""; ALLOW=(); REQUIRE=(); ARGS=()
while [ $# -gt 0 ]; do
    case "$1" in
        --run)            [ $# -ge 2 ] || usage; RUN="$2"; shift 2 ;;
        --expect)         [ $# -ge 2 ] || usage; EXPECT="$2"; shift 2 ;;
        --expect-file)    [ $# -ge 2 ] || usage; [ -r "$2" ] || die "can't read $2"
                          EXPECT=$(awk '{ sub(/\r$/, "") } length($0) { n++; l = $0 } END { if (n != 1) exit 1; print l }' "$2") ||
                              die "--expect-file must hold exactly one non-empty line: $2"
                          shift 2 ;;
        --no-verify)      NOVERIFY=--no-verify; shift ;;
        --allow-unlocked) [ $# -ge 2 ] || usage; ALLOW+=("$2"); shift 2 ;;
        --require)        [ $# -ge 2 ] || usage; REQUIRE+=("$2"); shift 2 ;;
        --require-file)   [ $# -ge 2 ] || usage; [ -r "$2" ] || die "can't read $2"
                          while IFS= read -r line || [ -n "$line" ]; do
                              line="${line%$'\r'}"; case "$line" in ''|'#'*) continue ;; esac; REQUIRE+=("$line")
                          done < "$2"; shift 2 ;;
        --manifest)       [ $# -ge 2 ] || usage; MANIFEST="$2"; shift 2 ;;
        --clean)          CLEAN=1; shift ;;
        --branch)         [ $# -ge 2 ] || usage; BRANCH="$2"; shift 2 ;;
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
    [[ "$RUN" == *'$1'* ]] || die "--run must pass the test path as \"\$1\", or it isn't running the test"
    case "$RUN$EXPECT" in *$'\n'*|*$'\r'*) die "--run and --expect must be one line each" ;; esac
    RUN=$(sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' <<< "$RUN")   # edge spaces mean nothing to bash
    case "$EXPECT" in [[:space:]]*|*[[:space:]]) die "--expect starts or ends with a space, which git hooks may trim from the trailer; write [ ] for a literal space" ;; esac
    if [ -n "$MANIFEST" ]; then
        safe "$MANIFEST" || die "unsafe --manifest path: $MANIFEST"
        for p in "${ARGS[@]}"; do [ "$p" != "$MANIFEST" ] || die "--manifest can't be one of the tests"; done
    fi
    b=$(cur_branch) || exit 1
    prev=$(git rev-parse --verify --quiet HEAD) || die "no commits yet; lock needs a parent commit to fail on"
    for p in "${ARGS[@]}"; do
        [[ "$p" == ./* ]] && die "write the path without a leading ./: $p"
        safe "$p" || die "unsafe path (letters, digits, . _ / -; no '..', no dot-directories or dot-files): $p"
        is_test_path "$p" || die "not a test location (tests/, test/, __tests__/, spec/, test_*, *.test.*, *.spec.*, *.bats): $p"
        [ -L "$p" ] && die "symlink, not a file: $p"
        [ -f "$p" ] || die "not a file: $p"
        git ls-files --error-unmatch -- "$p" >/dev/null 2>&1 && die "already tracked; an attack test must be a new file: $p"
    done
    expected=$(printf '?? %s\n' "${ARGS[@]}" | sort)
    [ "$(git status --porcelain --untracked-files=all | sort)" = "$expected" ] || die "working tree has other changes; commit or stash them first:
$(git status --porcelain --untracked-files=all)"
    body=""; RANLIST=""
    for p in "${ARGS[@]}"; do
        before=$(git hash-object -- "$p"); RANLIST="$RANLIST$p $before"$'\n'
        run_test "$RUN" "$p"
        [ "$(git hash-object -- "$p" 2>/dev/null)" = "$before" ] || die "the test modified itself while running: $p"
        [ "$RC" -ne 124 ] || [[ "$OUT" != *"attack-tests: timed out"* ]] || die "timed out after ${TIMEOUT}s, so it proves nothing (set CKLPH_ATTACK_TIMEOUT if it needs longer): $p"
        [ "$RC" -ne 0 ] || die "passes on the current code, so it proves nothing; not locked: $p"
        [ "$RC" -ne 126 ] && [ "$RC" -ne 127 ] || die "exit $RC means the test didn't run (command not found or not executable): $p"
        hit=$(grep -E -m1 -- "$EXPECT" <<< "$OUT") || die "fails (exit $RC), but not with the expected failure /$EXPECT/; send it back to the reviewer: $p"
        body="$body
- $p: exit $RC
  matched: ${hit:0:60}"
    done
    [ "$(git status --porcelain --untracked-files=all | sort)" = "$expected" ] || die "running the tests changed the working tree; not locked"
    msg=$(mktemp); trap 'rm -f "$msg"' EXIT
    printf 'test: lock review attack tests\n\nEach fails on the parent commit with the expected failure:%s\n\nAttack-Tests: %s\nAttack-Tests-Run: %s\nAttack-Tests-Expect: %s\n' \
        "$body" "${ARGS[*]}" "$RUN" "$EXPECT" > "$msg"
    git add -- "${ARGS[@]}" && git commit -q $NOVERIFY --cleanup=verbatim -F "$msg" -- "${ARGS[@]}" ||
        { git reset -q -- "${ARGS[@]}"; die "commit failed (the tests are unstaged again). If a git hook rejected it: a hook that runs the test suite always rejects an attack test, and a commit-message linter may reject the trailer lines. Fix the hook, or ask the user: re-run lock with --no-verify only if they approve it in so many words."; }
    # The commit must be exactly the lock we built: hooks may have changed, added or rewritten things.
    undo() { git reset -q --soft "$prev"; git reset -q; die "$1; not locked (the commit is undone; the hook's changes are left in the working tree)"; }
    for p in "${ARGS[@]}"; do
        [ "$(git rev-parse HEAD:"$p")" = "$(awk -v p="$p" '$1 == p { print $2 }' <<< "$RANLIST")" ] ||
            undo "a commit hook changed $p after it ran"
    done
    [ "$(git diff-tree --no-commit-id --root -r --name-status HEAD | sort)" = "$(printf 'A\t%s\n' "${ARGS[@]}" | sort)" ] ||
        undo "a commit hook added other changes to the lock commit"
    hb=$(git show -s --format=%B HEAD)
    [ "$(grep -c '^Attack-Tests' <<< "$hb")" -eq 3 ] && [ "$(sed -n 's/^Attack-Tests: //p' <<< "$hb")" = "${ARGS[*]}" ] &&
        [ "$(sed -n 's/^Attack-Tests-Run: //p' <<< "$hb")" = "$RUN" ] && [ "$(sed -n 's/^Attack-Tests-Expect: //p' <<< "$hb")" = "$EXPECT" ] ||
        undo "a commit hook rewrote the lock trailers"
    [ "$(awk '{ a[NR] = $0 } NF { n = NR } END { for (i = n - 2; i <= n; i++) print a[i] }' <<< "$hb")" = \
      "$(printf 'Attack-Tests: %s\nAttack-Tests-Run: %s\nAttack-Tests-Expect: %s' "${ARGS[*]}" "$RUN" "$EXPECT")" ] ||
        undo "a commit hook added lines after the lock trailers (they must end the message)"
    [ -z "$(git status --porcelain --untracked-files=all)" ] || undo "a commit hook left changes in the working tree"
    c=$(git rev-parse HEAD)
    git update-ref "refs/attack-tests/$b/$c" "$c" || die "couldn't record the lock ref"
    if [ -n "$MANIFEST" ]; then
        mkdir -p "$(dirname "$MANIFEST")" && printf '%s\n' "${ARGS[@]}" >> "$MANIFEST" &&
        git add -- "$MANIFEST" && git commit -q $NOVERIFY -m "test: record locked attack tests in $MANIFEST" -- "$MANIFEST" ||
            die "locked in $c, but couldn't commit $MANIFEST; add these paths to it and commit it yourself: ${ARGS[*]}"
    fi
    echo "$c"
    ;;
check)
    [ -z "$RUN" ] || die "check runs each test with the command recorded at lock time; don't pass --run"
    [ ${#ARGS[@]} -eq 1 ] || usage
    base="${ARGS[0]}"; valid_base "$base"; b=$(cur_branch) || exit 1
    fail=0
    if [ -n "$(git status --porcelain --untracked-files=normal)" ]; then
        echo "FAIL  uncommitted changes (tracked or untracked); check judges the committed code. Commit the fix; set other files aside with 'git stash push --include-untracked' (don't delete what you didn't create, and never commit a refused attack test):"
        git status --porcelain --untracked-files=normal | sed 's/^/      /'; fail=1
    fi
    replay "$base"
    root=$(pwd -P)
    if [ -n "$CLEAN" ]; then
        wt=$(mktemp -d); rmdir "$wt"
        git worktree add -q --detach "$wt" HEAD || die "couldn't make a clean checkout for --clean"
        trap 'cd "$root"; git worktree remove --force "$wt" >/dev/null 2>&1; git worktree prune >/dev/null 2>&1' EXIT
    fi
    for ref in $(git for-each-ref --format='%(refname)' "refs/attack-tests/$b/"); do
        c=$(git rev-parse "$ref")
        if ! git merge-base --is-ancestor "$c" HEAD; then echo "FAIL  lock commit ${c:0:7} is no longer on $b (history rewritten? see the header on rebases)"; fail=1
        elif git merge-base --is-ancestor "$c" "$base"; then echo "FAIL  lock commit ${c:0:7} is outside $base..HEAD; the base is wrong"; fail=1
        elif [[ "$LOCKCOMMITS" != *" $c "* ]]; then echo "FAIL  lock ref points at ${c:0:7}, which isn't a valid lock commit (its trailers or contents are wrong)"; fail=1; fi
    done
    for e in "${ERRORS[@]+"${ERRORS[@]}"}"; do echo "FAIL  $e"; fail=1; done
    for u in "${UNLOCKS[@]+"${UNLOCKS[@]}"}"; do
        p="${u%%|*}"; rest="${u#*|}"; c="${rest%%|*}"; who="${rest#*|}"; ok=0
        for a in "${ALLOW[@]+"${ALLOW[@]}"}"; do
            as="${a%%:*}"; ap="${a#*:}"
            [ "$ap" = "$p" ] && [ ${#as} -ge 7 ] && [[ "$c" == "$as"* ]] && ok=1
        done
        if [ "$ok" = 1 ]; then echo "UNLOCKED (allowed)  $p in ${c:0:7} by $who"
        else echo "FAIL  UNLOCKED without --allow-unlocked ${c:0:7}:$p  ($who)"; fail=1; fi
    done
    for r in "${REQUIRE[@]+"${REQUIRE[@]}"}"; do has_lock "$r" || { echo "FAIL  required attack test is not locked: $r"; fail=1; }; done
    n=0
    for entry in "${LOCKS[@]+"${LOCKS[@]}"}"; do
        p="${entry%%|*}"; rest="${entry#*|}"; c="${rest%%|*}"; run="${rest#*|}"; n=$((n + 1))
        want=$(blob_at "$c" "$p")
        later=$(git rev-list --full-history --no-merges "$c"..HEAD -- "$p" | head -n1)
        if [ -z "$later" ]; then  # a merge that brings in the lock but records other bytes for the test
            for m in $(git rev-list --merges "$c"..HEAD); do
                git merge-base --is-ancestor "$c" "$m" && [ "$(blob_at "$m" "$p")" != "$want" ] && { later=$m; break; }
            done
        fi
        if [ -n "$later" ]; then echo "FAIL  $p  changed after its lock, in ${later:0:7} (even if restored since)"; fail=1; continue; fi
        if [ -L "$p" ] || [ ! -f "$p" ] || [ "$(git hash-object -- "$p")" != "$want" ] || [ "$(blob_at HEAD "$p")" != "$want" ]; then
            echo "FAIL  $p  differs from its lock commit ${c:0:7} (edited, deleted, or a symlink)"; fail=1; continue
        fi
        if [ -n "$CLEAN" ]; then cd "$wt"; run_test "$run" "$p"; cd "$root"; else run_test "$run" "$p"; fi
        if [ "$RC" -eq 124 ] && [[ "$OUT" == *"attack-tests: timed out"* ]]; then echo "FAIL  $p  timed out after ${TIMEOUT}s"; fail=1
        elif [ "$RC" -ne 0 ]; then echo "FAIL  $p  still fails (exit $RC)"; fail=1; else echo "PASS  $p"; fi
        d=$(dirname "$p")
        for f in $(git diff --name-only "$c" HEAD); do
            [ "$f" != "$p" ] || continue
            if [ "$(dirname "$f")" = "$d" ] || is_test_path "$f" || is_runner_config "$f"; then
                echo "NOTE  $f changed since $p was locked; review it (helpers and runner config aren't checked)"
            fi
        done
    done
    [ "$n" -gt 0 ] || [ ${#UNLOCKS[@]} -gt 0 ] || [ ${#ERRORS[@]} -gt 0 ] || echo "no attack tests locked in $base..HEAD"
    exit "$fail"
    ;;
list)
    [ ${#ARGS[@]} -eq 1 ] || usage
    valid_base "${ARGS[0]}"
    replay "${ARGS[0]}"
    for entry in "${LOCKS[@]+"${LOCKS[@]}"}"; do echo "${entry%%|*}"; done | sort -u
    ;;
prune)
    [ ${#ARGS[@]} -eq 0 ] || usage
    cur=$(git symbolic-ref --quiet --short HEAD || true)
    [ -z "$BRANCH" ] || [ "$BRANCH" != "$cur" ] || die "won't prune the checked-out branch's locks; check needs them until it's merged"
    for ref in $(git for-each-ref --format='%(refname)' refs/attack-tests/); do
        rb="${ref#refs/attack-tests/}"; rb="${rb%/*}"
        if [ -n "$BRANCH" ]; then [ "$rb" = "$BRANCH" ] || continue
        else git show-ref --verify --quiet "refs/heads/$rb" && continue; fi
        git update-ref -d "$ref" && echo "pruned $ref"
    done
    ;;
*) usage ;;
esac
