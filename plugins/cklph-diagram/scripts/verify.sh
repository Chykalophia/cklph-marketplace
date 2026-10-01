#!/usr/bin/env bash
# The whole gate, in one command. CI runs exactly this — nothing extra lives in
# the workflow file, so a green CI badge means the same thing as a green local
# run.
#
#   ./scripts/verify.sh
#
# For every brand marked `live` in the registry: audit its tokens in both modes,
# render the proof diagrams, and lint the output. Then confirm that every brand
# marked `stub` is still correctly refused.
set -euo pipefail

cd "$(dirname "$0")/.."

# Keep the tree clean: a verification run should not leave __pycache__ behind.
export PYTHONDONTWRITEBYTECODE=1

BRANDS_DIR="skills/cklph-diagram/references/brands"
OUT="${OUT:-out}"
fail=0

live_brands() {
  for f in "$BRANDS_DIR"/*.md; do
    slug="$(basename "$f" .md)"
    [ "$slug" = "_template" ] && continue
    if grep -qE '^status:[[:space:]]*live[[:space:]]*$' "$f"; then echo "$slug"; fi
  done
}

stub_brands() {
  for f in "$BRANDS_DIR"/*.md; do
    slug="$(basename "$f" .md)"
    [ "$slug" = "_template" ] && continue
    if grep -qE '^status:[[:space:]]*stub[[:space:]]*$' "$f"; then echo "$slug"; fi
  done
}

echo "=============================================="
echo " 1. Brand token audit (WCAG AA, both modes)"
echo "=============================================="
for slug in $(live_brands); do
  for mode in light dark; do
    if ! python3 scripts/brand-tokens.py "$slug" --check --mode "$mode"; then
      fail=1
    fi
  done
done

echo
echo "=============================================="
echo " 2. Render proof diagrams"
echo "=============================================="
mkdir -p "$OUT"
for slug in $(live_brands); do
  for mode in light dark; do
    python3 scripts/build-examples.py --brand "$slug" --mode "$mode" --out "$OUT" >/dev/null \
      || { echo "FAILED to render $slug/$mode"; fail=1; }
  done
  echo "rendered $slug (light + dark)"
done

echo
echo "=============================================="
echo " 3. Full check of every rendered diagram"
echo "=============================================="
# check.py is the gate an author runs on one diagram: source -> embed -> match
# -> a11y -> safety -> browser. The browser gate needs Chrome; a run without it
# fails unless ALLOW_NO_BROWSER=1 says so on purpose -- a skipped gate is never
# reported as a pass.
browser_flag=""
if [ "${ALLOW_NO_BROWSER:-0}" = "1" ]; then browser_flag="--no-browser"; fi
for f in "$OUT"/*.html; do
  if python3 scripts/check.py "$f" $browser_flag >"$OUT/.check.log" 2>&1; then
    echo "ok   $(basename "$f")"
  else
    cat "$OUT/.check.log"; fail=1
  fi
done
rm -f "$OUT/.check.log"

echo
echo "=============================================="
echo " 4. SVG export of rendered output"
echo "=============================================="
# verify-export.py asserts that a standalone SVG keeps the brand's tokens and
# fonts once it leaves the HTML.
python3 scripts/verify-export.py "$OUT"/*.html | tail -1
python3 scripts/verify-export.py "$OUT"/*.html >/dev/null || fail=1

echo
echo "=============================================="
echo " 4b. The checker has teeth (planted defects)"
echo "=============================================="
# Every defect class check.py claims to catch, planted one at a time into a
# passing fixture, must fail at the right gate; the clean fixture must pass.
test_flag=""
if [ "${ALLOW_NO_BROWSER:-0}" = "1" ]; then test_flag="--static"; fi
python3 scripts/test-check.py $test_flag | tail -1
python3 scripts/test-check.py $test_flag >/dev/null || fail=1

echo
echo "=============================================="
echo " 4c. Authoring tools: scaffold, layout, export"
echo "=============================================="
# Each tool asserted by what it produces or refuses: scaffold keeps a drawing
# across re-runs, layout reproduces a hand layout, export writes the right
# PNG size and a GIF/MP4 that actually animates.
python3 scripts/test-tools.py $test_flag | tail -1
python3 scripts/test-tools.py $test_flag >/dev/null || fail=1

echo
echo "=============================================="
echo " 5. Shipped templates and inherited examples"
echo "=============================================="
ASSETS="skills/cklph-diagram/assets"
# The templates are the copy path for every new diagram, so they must lint clean
# in the brand they ship with. template-full.html is excluded: its baked-in
# sample diagram is the Phase 2 backlog (FORK-NOTES.md), and SKILL.md §10 says
# to replace its SVG body wholesale. template-terminal.html is not tokenized by
# design.
python3 scripts/lint-a11y.py "$ASSETS/template.html" "$ASSETS/template-motion.html" --brand _default --mode light | tail -1 || fail=1
python3 scripts/lint-a11y.py "$ASSETS/template.html" "$ASSETS/template-motion.html" --brand _default --mode light >/dev/null || fail=1
python3 scripts/lint-a11y.py "$ASSETS/template-dark.html" --brand _default --mode dark >/dev/null || { echo "template-dark.html fails lint"; fail=1; }
python3 scripts/self_check.py "$ASSETS"/template*.html >/dev/null || { echo "a template fails self-check"; fail=1; }
python3 scripts/verify-motion.py --shipped >/dev/null || { echo "motion contract failed"; fail=1; }
python3 scripts/verify-geometry.py --all | tail -1
python3 scripts/verify-geometry.py --all >/dev/null || fail=1
# Upstream's per-type verifiers. They check the data contracts (running totals,
# area-not-radius, rank permutations, conserved flow) of the inherited examples,
# which are still in upstream's skin -- several hardcode its palette, so they do
# not apply to brand-rendered output until Phase 2 re-renders those examples.
for v in beeswarm bubble bump marimekko polar ridgeline sankey slopegraph streamgraph treemap waterfall block-registry; do
  # verify-polar checks its shipped files by default and has no --all flag.
  flag="--all"; [ "$v" = polar ] && flag=""
  python3 "scripts/verify-$v.py" $flag >/dev/null 2>&1 || { echo "FAIL verify-$v"; fail=1; continue; }
  echo "ok   verify-$v"
done
for v in dumbbell heatmap; do
  python3 "scripts/verify-$v.py" >/dev/null 2>&1 || { echo "FAIL verify-$v"; fail=1; continue; }
  echo "ok   verify-$v"
done

echo
echo "=============================================="
echo " 6. Refusal path (the client-safety guardrail)"
echo "=============================================="
# A project marker (.cklph-diagram) that is malformed, hostile, or names a stub
# must refuse too -- never fall back to the house brand.
python3 scripts/test-brand-marker.py | tail -1
python3 scripts/test-brand-marker.py >/dev/null || { python3 scripts/test-brand-marker.py | grep '^FAIL'; fail=1; }
# A stub brand MUST refuse. If one ever renders, a client deliverable is one
# command away from shipping in house colours — that is a hard failure, and it
# is why this check asserts the non-zero exit rather than trusting the message.
for slug in $(stub_brands); do
  if python3 scripts/build-examples.py --brand "$slug" --out "$OUT" >/dev/null 2>&1; then
    echo "FAIL: stub brand '$slug' rendered instead of refusing"
    fail=1
  else
    echo "ok   '$slug' correctly refused"
  fi
done

echo
if [ "$fail" -ne 0 ]; then
  echo "VERIFY FAILED"
  exit 1
fi
echo "VERIFY PASSED"
