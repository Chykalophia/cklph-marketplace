#!/bin/bash
# Local checks for scripts/cwp. No network: a fake `ssh` on PATH logs its arguments instead of
# connecting. Run from anywhere:
#   bash plugins/cklph-wp/tests/cwp.test.sh
# Exit 0 = all pass.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
CWP="$HERE/../scripts/cwp"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin" "$TMP/proj"
LOG="$TMP/ssh.log"
# Fake ssh: log one line per call; `-O check` says "no master" so MUX mode opens one; else succeed.
cat > "$TMP/bin/ssh" <<'SH'
#!/bin/bash
printf '%s\n' "$*" >> "$FAKE_SSH_LOG"
for a in "$@"; do [ "$a" = check ] && exit 1; done
exit 0
SH
chmod +x "$TMP/bin/ssh"
pass=0; fail=0
want() {
    if [ "$2" = "$3" ]; then pass=$((pass + 1)); printf 'PASS  %s\n' "$1"
    else fail=$((fail + 1)); printf 'FAIL  %s (got %s, want %s)\n' "$1" "$2" "$3"; fi
}
# run_cwp <MUX value or "unset"> <args...>: runs cwp in an empty project dir with the fake ssh.
# PERSIST/MAXLIFE are pinned to known-valid values so a value inherited from the caller's shell
# cannot fail the MUX checks before they test what they mean to; tests that need another value
# pass it through EXTRA_ENV (e.g. EXTRA_ENV="CKLPH_WP_PERSIST=0").
run_cwp() {
    local mux="$1"; shift
    local muxenv=(CKLPH_WP_MUX="$mux")
    [ "$mux" = unset ] && muxenv=()
    : > "$LOG"
    # shellcheck disable=SC2086  # EXTRA_ENV is a deliberate list of VAR=value words
    (cd "$TMP/proj" && env -u CKLPH_WP_MUX -u CKLPH_WP_PERSIST -u CKLPH_WP_MAXLIFE \
        PATH="$TMP/bin:$PATH" FAKE_SSH_LOG="$LOG" ${muxenv[@]+"${muxenv[@]}"} \
        CKLPH_WP_HOST=fake-host CKLPH_WP_CM="$TMP/cm" CKLPH_WP_PERSIST=60 CKLPH_WP_MAXLIFE=1 \
        ${EXTRA_ENV:-} bash "$CWP" "$@")
}
cm_mode() { grep -o 'ControlMaster=[a-z]*' "$LOG" | sort -u | tr '\n' ' ' | sed 's/ $//'; }

echo "== CKLPH_WP_MUX: only exactly 1 enables multiplexing"
for v in unset "" 0 no true yes 01; do
    run_cwp "$v" wp option get siteurl >/dev/null 2>"$TMP/err"
    want "MUX=${v:-<empty>} -> per-command connection" "$(cm_mode)" "ControlMaster=no"
done
run_cwp 0 status >"$TMP/out" 2>&1
want "MUX=0 status reports no-mux" "$(grep -c 'no-mux (default)' "$TMP/out")" 1
run_cwp yes status >/dev/null 2>"$TMP/err"
want "MUX=yes warns it stays off" "$(grep -c 'multiplexing stays OFF' "$TMP/err")" 1
run_cwp 0 status >/dev/null 2>"$TMP/err"
want "MUX=0 does not warn" "$(grep -c 'stays OFF' "$TMP/err")" 0
run_cwp 1 wp option get siteurl >/dev/null 2>&1
want "MUX=1 -> bounded master" "$(cm_mode)" "ControlMaster=auto"
want "MUX=1 opened the master (-fN)" "$(grep -c -- '-fN fake-host' "$LOG")" 1
run_cwp 1 down >/dev/null 2>&1
run_cwp 1 status >/dev/null 2>&1 || true
for bad in "CKLPH_WP_MAXLIFE=5;id" CKLPH_WP_MAXLIFE=0 CKLPH_WP_PERSIST=0 CKLPH_WP_PERSIST=00 CKLPH_WP_PERSIST=-5; do
    EXTRA_ENV="$bad" run_cwp 1 up >/dev/null 2>&1
    want "$bad rejected (exit 2)" "$?" 2
    want "$bad never reached ssh" "$(wc -l < "$LOG" | tr -d ' ')" 0
done
EXTRA_ENV="CKLPH_WP_PERSIST=45" run_cwp 1 up >/dev/null 2>&1
want "PERSIST=45 accepted" "$?" 0
want "PERSIST=45 passed to ssh as ControlPersist=45" "$(grep -o 'ControlPersist=[0-9]*' "$LOG" | sort -u)" "ControlPersist=45"
run_cwp 1 down >/dev/null 2>&1

echo "== meta keys"
for k in _elementor_data my.key ns:key a-b; do
    run_cwp unset meta-read 12 "$k" >/dev/null 2>&1
    want "key '$k' accepted" "$?" 0
    want "key '$k' reached ssh quoted" "$(grep -cF "wp post meta get 12 '$k'" "$LOG")" 1
done
for k in --debug -x 'x;touch y' 'a b'; do
    run_cwp unset meta-read 12 "$k" >/dev/null 2>&1
    want "key '$k' rejected (exit 2)" "$?" 2
    want "key '$k' never reached ssh" "$(wc -l < "$LOG" | tr -d ' ')" 0
done
if run_cwp unset meta-read 12 '' >/dev/null 2>&1; then r=accepted; else r=rejected; fi
want "empty key rejected (usage error)" "$r" rejected
want "empty key never reached ssh" "$(wc -l < "$LOG" | tr -d ' ')" 0

echo "passed=$pass failed=$fail"
[ "$fail" = 0 ]
