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
    (AT, "test/attack-tests.bats", 'if [ -n "$EXPECT" ] && ', 'if false && ', "lock ignores --expect"),
    (AT, "test/attack-tests.bats", '[ "$actual" = "$expected" ] ||', 'true ||', "lock ignores a dirty tree"),
    (AT, "test/attack-tests.bats", 'if ! git diff --quiet "$c" -- "$p" 2>/dev/null ||', 'if false ||', "check ignores test edits"),
    (AT, "test/attack-tests.bats", 'grep=\'^Attack-Tests: \' "$base"..HEAD', "grep='^Attack-Tests: ' HEAD", "list/check unscoped"),
    (AT, "test/attack-tests.bats", 'grep -qxF -- "$p" <<< "$unlocked" ||', 'false ||', "unlock trailer ignored"),
    (AT, "test/attack-tests.bats", '        if [ "$RC" -ne 0 ]; then', '        if false; then', "check never runs the test"),
    (MK, "test/marker.bats", 'fence = f; next }', 'next }', "fences ignored"),
    (MK, "test/marker.bats", 'if (distinct > 1)', 'if (0)', "conflicts not detected"),
    (MK, "test/marker.bats", 'k == "plain" && s == b', 'k == "plain" && index(s, b) == 1', "suffix allowed on plain markers"),
    (MK, "test/marker.bats", 'length(f) >= length(fence)', '1', "shorter fence closes a longer one"),
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
