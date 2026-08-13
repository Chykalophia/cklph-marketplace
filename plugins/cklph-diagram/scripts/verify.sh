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
echo " 3. Accessibility lint"
echo "=============================================="
for slug in $(live_brands); do
  for mode in light dark; do
    # build-examples.py names files with slug.strip('_'), so _default -> default
    fslug="${slug#_}"
    files=("$OUT"/*-"$fslug"-"$mode".html)
    [ -e "${files[0]}" ] || { echo "no output for $slug/$mode"; fail=1; continue; }
    python3 scripts/lint-a11y.py "${files[@]}" --brand "$slug" --mode "$mode" || fail=1
  done
done

echo
echo "=============================================="
echo " 4. Refusal path (the client-safety guardrail)"
echo "=============================================="
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
