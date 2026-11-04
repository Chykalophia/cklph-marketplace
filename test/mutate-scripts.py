"""Prove the script tests have teeth: reinject one bug at a time into scripts/marker.sh and
scripts/attack-tests.sh; each must turn at least one bats test red. Restores every file after.

Run from the repo root:  python3 test/mutate-scripts.py .     (BATS="npx --yes bats@1.13.0" if bats is missing)
"""
import os, pathlib, shlex, subprocess, sys

ROOT = pathlib.Path(sys.argv[1])
AT = ROOT / "plugins/cklph-os/scripts/attack-tests.sh"
MK = ROOT / "plugins/cklph-os/scripts/marker.sh"
MUTS = [
    (AT, "test/attack-tests.bats", 'die "passes on the current code', 'echo "passes on the current code', "lock accepts a passing test"),
    (AT, "test/attack-tests.bats", '<<< "$OUT") || die', '<<< "$OUT") || echo', "lock ignores --expect mismatch"),
    (AT, "test/attack-tests.bats", '= "$expected" ] || die "working tree has other changes', '= "$expected" ] || echo "working tree has other changes', "lock ignores a dirty tree"),
    (AT, "test/attack-tests.bats", '= "$expected" ] || die "running the tests changed', '= "$expected" ] || echo "running the tests changed', "lock ignores a test that dirties the tree"),
    (AT, "test/attack-tests.bats", '[ "$RC" -ne 126 ] && [ "$RC" -ne 127 ] || die', 'true || die', "lock accepts a test that never ran"),
    (AT, "test/attack-tests.bats", 'is_test_path "$p" || die', 'true || die', "lock accepts non-test paths"),
    (AT, "test/attack-tests.bats", '[ -L "$p" ] && die "symlink', 'false && die "symlink', "lock accepts symlinks"),
    (AT, "test/attack-tests.bats", 'matched: ${hit:0:200}', 'matched: $OUT', "raw output in the commit"),
    (AT, "test/attack-tests.bats", '--run)            [ $# -ge 2 ] || usage; ', '--run)            ', "missing option value hangs"),
    (AT, "test/attack-tests.bats", 'if [ -n "$later" ]; then', 'if false; then', "check misses later commits to the test"),
    (AT, "test/attack-tests.bats", '[ "$(git hash-object -- "$p")" != "$want" ]', 'false', "check misses working-tree / index-flag edits"),
    (AT, "test/attack-tests.bats", 'if ! git merge-base --is-ancestor "$c" HEAD; then', 'if false; then', "check misses rewritten history"),
    (AT, "test/attack-tests.bats", 'elif git merge-base --is-ancestor "$c" "$base"; then', 'elif false; then', "base excluding the locks accepted"),
    (AT, "test/attack-tests.bats", 'if has_lock "$p"; then ERRORS+=', 'if false; then ERRORS+=', "re-lock while locked accepted"),
    (AT, "test/attack-tests.bats", 'if [ "$added" != "$listed" ] || [ -z "$run" ]; then', 'if false; then', "forged lock trailers accepted"),
    (AT, "test/attack-tests.bats", 'has_lock "$r" || {', 'true || {', "--require ignored"),
    (AT, "test/attack-tests.bats", '[[ "$c" == "$as"* ]] && ok=1', 'ok=1', "one allowance covers every unlock"),
    (AT, "test/attack-tests.bats", '= "$before" ] || die', '= "$before" ] || true', "self-modifying test locked"),
    (AT, "test/attack-tests.bats", "[[ \"$RUN\" == *'$1'* ]] || die", 'true || die', "run command ignoring $1 accepted"),
    (AT, "test/attack-tests.bats", 'git rev-parse --verify --quiet "$1^{commit}" >/dev/null || die', 'true || die', "bad base accepted"),
    (AT, "test/attack-tests.bats", 'if [ "$ok" = 1 ]; then echo "UNLOCKED (allowed)', 'if true; then echo "UNLOCKED (allowed)', "unlock passes without a human"),
    (AT, "test/attack-tests.bats", 'git rev-list --reverse --topo-order', 'git rev-list --topo-order', "replay order ignored (relock lost)"),
    (AT, "test/attack-tests.bats", '[ -z "$RUN" ] || die "check runs', 'true || die "check runs', "check accepts a substitute --run"),
    (AT, "test/attack-tests.bats", 'set -f   #', '#set -f  #', "trailer globs expand"),
    (MK, "test/marker.bats", 'fence = f; next }', 'next }', "fences ignored"),
    (MK, "test/marker.bats", 'if (distinct > 1 ||', 'if (0 ||', "conflicts not detected"),
    (MK, "test/marker.bats", 'index(v, b ": ") == 1) { key = "near-miss: " s; break }', 'index(v, b ": ") == 1) { break }', "case/spacing near-misses not detected"),
    (MK, "test/marker.bats", 'if (index(s, b) == 1) { key = "near-miss: " s; break }', 'if (0) { key = "near-miss: " s; break }', "prefix near-misses not detected"),
    (MK, "test/marker.bats", '{ key = "near-miss: " line; break }', '{ break }', "formatting variants not detected"),
    (MK, "test/marker.bats", 'sub(/\\r$/, "", line)', 'line = line', "CRLF breaks parsing"),
    (MK, "test/marker.bats", 'if (!(substr(f, 1, 1) == "`" && index(rest, "`") > 0))', 'if (1)', "inline code span opens a fence"),
    (MK, "test/marker.bats", '/^[1-9][0-9]*\\)$/', '/^[0-9]+\\)$/', "count of zero accepted"),
    (MK, "test/marker.bats", 'if (key != "" && !(key in own))', 'if (0)', "--emitter ignored"),
    (MK, "test/marker.bats", '(k == "plain" && s == b)', '(k == "plain" && index(s, b) == 1)', "suffix allowed on plain markers"),
    (MK, "test/marker.bats", 'length(f) >= length(fence)', '1', "shorter fence closes a longer one"),
    (MK, "test/marker.bats", 'intable = ($0 ~ /^## Markers[ \\t]*$/)', 'intable = 1', "every table in markers.md counts"),
    (MK, "test/marker.bats", 'match(line, /^ ? ? ?(```+|~~~+)/)', 'match(line, /^(```+|~~~+)/)', "indented fences ignored"),
]
bad = 0
for path, suite, old, new, label in MUTS:
    src = path.read_text()
    assert src.count(old) == 1, (label, src.count(old))
    path.write_text(src.replace(old, new))
    try:
        r = subprocess.run(shlex.split(os.environ.get("BATS", "bats")) + [suite], cwd=ROOT, capture_output=True, text=True)
        red = [l for l in r.stdout.splitlines() if l.startswith("not ok")]
        print(("CAUGHT " if red else "MISSED ") + label + (f"  ({len(red)} red, e.g. {red[0][7:60]})" if red else ""))
        bad += 0 if red else 1
    finally:
        path.write_text(src)
print(f"{len(MUTS) - bad}/{len(MUTS)} mutations caught")
sys.exit(1 if bad else 0)
