#!/usr/bin/env bats
# Tests for plugins/cklph-os/scripts/marker.sh, the reference parser for skills/flow/markers.md.
# Run:  bats test/

M="${BATS_TEST_DIRNAME}/../plugins/cklph-os/scripts/marker.sh"
TABLE="${BATS_TEST_DIRNAME}/../plugins/cklph-os/skills/flow/markers.md"

has()   { [[ "$output" == *"$1"* ]] || { echo "expected output to contain: $1" >&2; return 1; }; }
parse() { run bash "$M" <<< "$1"; }

@test "marker: a single verdict is printed (exit 0)" {
  parse $'Review done.\n\n## REVIEW CLEAN'
  [ "$status" -eq 0 ]
  [ "$output" = "## REVIEW CLEAN" ]
}

@test "marker: the payload may follow the marker (exit 0)" {
  parse $'## ISSUES FOUND\n1. High: x.ts:3 off by one\n2. Low: y.ts:9 naming'
  [ "$status" -eq 0 ]
  [ "$output" = "## ISSUES FOUND" ]
}

@test "marker: no marker means the step failed (exit 1)" {
  parse $'All good, looks fine to me.'
  [ "$status" -eq 1 ]
}

@test "marker: a marker inside a code fence never counts (exit 1)" {
  parse $'Template:\n```\n## TASK READY\n```\nno verdict yet'
  [ "$status" -eq 1 ]
}

@test "marker: a four-backtick fence holding a three-backtick fence hides both markers" {
  parse $'````text\n```\n## REVIEW CLEAN\n```\n## REVIEW CLEAN\n````\n## ISSUES FOUND\n1. x'
  [ "$status" -eq 0 ]
  [ "$output" = "## ISSUES FOUND" ]
}

@test "marker: two different markers outside code fail closed (exit 2)" {
  parse $'## ISSUES FOUND\n1. High: a clean review ends with\n## REVIEW CLEAN'
  [ "$status" -eq 2 ]
  has "conflicting or malformed markers"
}

@test "marker: the same marker twice is one verdict (exit 0)" {
  parse $'## GAPS FOUND\n- gap one\n## GAPS FOUND'
  [ "$status" -eq 0 ]
  [ "$output" = "## GAPS FOUND" ]
}

@test "marker: an inline mention or a bare prefix is not a marker (exit 1)" {
  parse $'End with `## REVIEW CLEAN` when done.'
  [ "$status" -eq 1 ]
  parse $'## TASK'
  [ "$status" -eq 1 ]
  parse $'### REVIEW CLEAN'
  [ "$status" -eq 1 ]
}

@test "marker: a near-miss verdict fails closed (exit 2), alone or after a valid marker" {
  parse $'## REVIEW CLEAN.'
  [ "$status" -eq 2 ]
  parse $'## REVIEW CLEAN\nwait, no:\n## ISSUES FOUND:\n1. High x'
  [ "$status" -eq 2 ]
  has "malformed"
}

@test "marker: suffixes only where the table allows them" {
  parse $'## TASK BLOCKED: no database access'
  [ "$status" -eq 0 ]; [ "$output" = "## TASK BLOCKED: no database access" ]
  parse $'## CLICK-PATH FINDINGS (3)'
  [ "$status" -eq 0 ]
  parse $'## ROOT CAUSE: stale cache key'
  [ "$status" -eq 0 ]
  parse $'## TASK BLOCKED'
  [ "$status" -eq 2 ]
  parse $'## TASK READY: trivial'
  [ "$status" -eq 2 ]
  parse $'## ISSUES FOUND (4)'
  [ "$status" -eq 2 ]
}

@test "marker: only rows under the table's Markers heading are markers" {
  T="$(mktemp)"
  printf '# x\n## Examples\n| a | `## SHIPPED` |\n## Markers\n| x | `## REVIEW CLEAN` | y |\n## Notes\n| a | `## LATER` |\n' > "$T"
  run env CKLPH_MARKERS_FILE="$T" bash "$M" <<< "## SHIPPED"
  [ "$status" -eq 1 ]
  run env CKLPH_MARKERS_FILE="$T" bash "$M" <<< "## LATER"
  [ "$status" -eq 1 ]
  run env CKLPH_MARKERS_FILE="$T" bash "$M" <<< "## REVIEW CLEAN"
  [ "$status" -eq 0 ]
  rm -f "$T"
}

@test "marker: an indented fence (up to 3 spaces) still hides its contents" {
  parse $'   ```\n## REVIEW CLEAN\n   ```\n## ISSUES FOUND'
  [ "$status" -eq 0 ]
  [ "$output" = "## ISSUES FOUND" ]
}

@test "marker: every row of markers.md parses as itself (the table is the list)" {
  command -v python3 >/dev/null || skip "python3 required"
  rows=$(python3 -c '
import re, sys
for m in re.findall(r"^\|[^|]+\| `## ([^`]+)`", open(sys.argv[1]).read(), re.M):
    print("## " + m.replace(": <reason>", ": x").replace(": <one line>", ": x").replace("(<n>)", "(2)"))' "$TABLE")
  [ "$(wc -l <<< "$rows")" -ge 19 ]
  while IFS= read -r r; do
    parse "$r"
    [ "$status" -eq 0 ] || { echo "row did not parse: $r" >&2; return 1; }
    [ "$output" = "$r" ] || { echo "row parsed as '$output', not '$r'" >&2; return 1; }
  done <<< "$rows"
}

@test "marker: an unreadable table exits 3" {
  run env CKLPH_MARKERS_FILE=/nonexistent bash "$M" <<< "## REVIEW CLEAN"
  [ "$status" -eq 3 ]
}
