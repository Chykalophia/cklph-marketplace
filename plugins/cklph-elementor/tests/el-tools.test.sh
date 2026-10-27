#!/bin/bash
# Fixture checks for scripts/el-tools.py add-style. Run from anywhere:
#   bash plugins/cklph-elementor/tests/el-tools.test.sh
# Needs python3. Exit 0 = all pass.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
EL="$HERE/../scripts/el-tools.py"
FX="$HERE/fixtures"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0
# want <label> <got> <expected>
want() {
    if [ "$2" = "$3" ]; then pass=$((pass + 1)); printf 'PASS  %s\n' "$1"
    else fail=$((fail + 1)); printf 'FAIL  %s (got %s, want %s)\n' "$1" "$2" "$3"; fi
}

# count <file> <id> [widgetType]: how many nodes in the tree have that id (and widgetType, if given)
count() {
    python3 -I - "$@" <<'PY'
import json, sys
def walk(ns):
    for n in ns:
        yield n
        yield from walk(n.get("elements", []))
f, eid = sys.argv[1], sys.argv[2]
wt = sys.argv[3] if len(sys.argv) > 3 else None
print(sum(1 for n in walk(json.load(open(f)))
          if n.get("id") == eid and (wt is None or n.get("widgetType") == wt)))
PY
}

# 1. Re-run replaces the earlier style widget wherever it was (idempotent, no duplicate).
python3 -I "$EL" add-style "$FX/stale-style.json" "$TMP/a.json" '@root' '.x{gap:1px}' >/dev/null
want "first run exits 0" "$?" 0
python3 -I "$EL" add-style "$TMP/a.json" "$TMP/b.json" '@id:inner01' '.x{gap:2px}' >/dev/null
want "second run (moved target) exits 0" "$?" 0
want "style widget appears exactly once after two runs" "$(count "$TMP/b.json" elcss01 html)" 1
want "other elements kept" "$(count "$TMP/b.json" heading1)" 1

# 2. A non-style element that uses the id survives: add-style refuses and writes nothing
#    (the injected display:none on .elementor-element-elcss01 would otherwise hide it).
python3 -I "$EL" add-style "$FX/id-clash.json" "$TMP/c.json" '@root' '.x{gap:1px}' >"$TMP/c.out"
want "refuses when a non-style element uses id elcss01" "$?" 1
want "nothing written on id clash" "$([ -e "$TMP/c.json" ] && echo written || echo none)" none
want "clashing heading still in the input" "$(count "$FX/id-clash.json" elcss01 heading)" 1
printf '      message: %s\n' "$(cat "$TMP/c.out")"

echo "passed=$pass failed=$fail"
[ "$fail" = 0 ]
