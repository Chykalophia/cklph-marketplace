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
    (AT, "test/attack-tests.bats", '[ "$actual" = "$expected" ] ||', 'true ||', "lock ignores a dirty tree"),
    (AT, "test/attack-tests.bats", '[ "$RC" -ne 126 ] && [ "$RC" -ne 127 ] || die', 'true || die', "lock accepts a test that never ran"),
    (AT, "test/attack-tests.bats", 'is_test_path "$p" || die', 'true || die', "lock accepts non-test paths"),
    (AT, "test/attack-tests.bats", '[ -L "$p" ] && die "symlink', 'false && die "symlink', "lock accepts symlinks"),
    (AT, "test/attack-tests.bats", 'matched: ${hit:0:200}', 'matched: $OUT', "raw output in the commit"),
    (AT, "test/attack-tests.bats", '--run)            [ $# -ge 2 ] || usage; ', '--run)            ', "missing option value hangs"),
    (AT, "test/attack-tests.bats", 'if [ -n "$later" ]; then', 'if false; then', "check misses later commits to the test"),
    (AT, "test/attack-tests.bats", '! git diff --quiet HEAD -- "$p" 2>/dev/null', 'false', "check misses working-tree edits"),
    (AT, "test/attack-tests.bats", 'git merge-base --is-ancestor "$c" HEAD || {', 'true || {', "check misses rewritten history"),
    (AT, "test/attack-tests.bats", 'git rev-parse --verify --quiet "$1^{commit}" >/dev/null || die', 'true || die', "bad base accepted"),
    (AT, "test/attack-tests.bats", 'if [ "$ok" = 1 ]; then echo "UNLOCKED (allowed)', 'if true; then echo "UNLOCKED (allowed)', "unlock passes without a human"),
    (AT, "test/attack-tests.bats", 'git rev-list --reverse --topo-order', 'git rev-list --topo-order', "replay order ignored (relock lost)"),
    (AT, "test/attack-tests.bats", '[ -z "$RUN" ] || die "check runs', 'true || die "check runs', "check accepts a substitute --run"),
    (AT, "test/attack-tests.bats", 'set -f   #', '#set -f  #', "trailer globs expand"),
    (MK, "test/marker.bats", 'fence = f; next }', 'next }', "fences ignored"),
    (MK, "test/marker.bats", 'if (distinct > 1 ||', 'if (0 ||', "conflicts not detected"),
    (MK, "test/marker.bats", 'if (key == "") for (b in kinds)', 'if (0) for (b in kinds)', "near-misses not detected"),
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
