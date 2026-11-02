#!/usr/bin/env bash
# sast.sh — static-analysis recall for the security lens. Wraps Semgrep (with the
# security-audit + owasp-top-ten rulesets, plus a language ruleset when asked) and CodeQL (see below).
# Emits JSON lines on stdout. Degrades gracefully. Exits 0 ALWAYS.
# A scanner that fails, or whose output cannot be parsed, is reported on stderr: zero findings
# on stdout then means "did not scan", never "clean".
# Usage: sast.sh <root> [language]
#   <language>: optional — ts|js|py|go|java|php|rb|rs (adds that language's Semgrep ruleset)
# Output schema per line: { tool, rule, severity, file, line, cwe, snippet, rationale }
set -uo pipefail
ARG="${1:-.}"
SEMGREP_LANG="${2:-}"
# Resolve the target ONCE to an absolute path, so a relative root is not re-resolved after cd.
if ! TARGET="$(cd -- "$ARG" 2>/dev/null && pwd)"; then
  echo "sast.sh: target not found: $ARG — nothing scanned." >&2
  exit 0
fi
cd "$TARGET" || exit 0

# Private scratch dir (0700), removed on any exit.
WORK="$(mktemp -d "${TMPDIR:-/tmp}/cklph-sast.XXXXXX")" || { echo "sast.sh: mktemp failed — nothing scanned." >&2; exit 0; }
CURRENT_LOCK=""
HEARTBEAT_PID=""
# INT/TERM exit through here too, so a killed run never leaves a CodeQL build lock behind.
trap 'rm -rf "$WORK"; [ -n "$HEARTBEAT_PID" ] && kill "$HEARTBEAT_PID" 2>/dev/null; [ -n "$CURRENT_LOCK" ] && rmdir "$CURRENT_LOCK" 2>/dev/null' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# ── Semgrep ──────────────────────────────────────────────────────────────────
if command -v semgrep >/dev/null 2>&1; then
  CONFIGS="--config p/security-audit --config p/owasp-top-ten"
  case "$SEMGREP_LANG" in
    "") ;;
    ts) CONFIGS="$CONFIGS --config p/typescript" ;;
    js) CONFIGS="$CONFIGS --config p/javascript" ;;
    py) CONFIGS="$CONFIGS --config p/python" ;;
    go) CONFIGS="$CONFIGS --config p/golang" ;;
    java) CONFIGS="$CONFIGS --config p/java" ;;
    php) CONFIGS="$CONFIGS --config p/php" ;;
    rb) CONFIGS="$CONFIGS --config p/ruby" ;;
    rs) CONFIGS="$CONFIGS --config p/rust" ;;
    *) echo "sast.sh: unknown language '$SEMGREP_LANG' (want ts|js|py|go|java|php|rb|rs) — using the default rulesets only." >&2 ;;
  esac
  REPORT="$WORK/semgrep.json"
  # shellcheck disable=SC2086  # CONFIGS is a list of flags
  semgrep --json --quiet --disable-version-check $CONFIGS "$TARGET" > "$REPORT" 2> "$WORK/semgrep.err"
  RC=$?
  if [ ! -s "$REPORT" ]; then
    echo "sast.sh: semgrep failed (exit $RC, no output): $(head -c 300 "$WORK/semgrep.err") — zero semgrep findings means the scan did not run, not that the code is clean." >&2
  elif command -v node >/dev/null 2>&1; then
    # 0 = ran, 1 = findings with --error; anything else is a failure even when JSON was written
    [ "$RC" -le 1 ] || echo "sast.sh: semgrep exited $RC but wrote output: $(head -c 300 "$WORK/semgrep.err") — semgrep findings may be incomplete; zero findings does not mean clean." >&2
    node -e '
      let r;
      try { r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); }
      catch (e) { process.stderr.write("sast.sh: semgrep output is not valid JSON (" + e.message + ") — semgrep findings NOT collected; zero findings means the scan failed, not that the code is clean.\n"); process.exit(0); }
      const errs = (r.errors || []).filter(e => e.level === "error");
      if (errs.length) process.stderr.write("sast.sh: semgrep reported " + errs.length + " error(s), first: " + String(errs[0].message || errs[0].type || "").slice(0, 300) + " — findings may be incomplete.\n");
      if (!Array.isArray(r.results)) { process.stderr.write("sast.sh: semgrep output has no results array — semgrep findings NOT collected.\n"); process.exit(0); }
      for (const res of r.results) {
        const extra = res.extra || {};
        const m = extra.metadata || {};
        const cwe = Array.isArray(m.cwe) ? m.cwe.join(",") : (m.cwe || "");
        const sev = String(m.impact || extra.severity || "medium").toLowerCase();
        const snippet = String(extra.lines || "").trim().substring(0, 300);
        process.stdout.write(JSON.stringify({
          tool: "semgrep", rule: res.check_id || "semgrep",
          severity: sev, file: res.path || "", line: res.start ? res.start.line : 0,
          cwe, snippet,
          rationale: "Semgrep candidate — verify the sink is reachable with attacker-controlled input"
        }) + "\n");
      }' "$REPORT"
  else
    echo "sast.sh: node not found — cannot parse semgrep output; semgrep findings NOT collected." >&2
  fi
else
  echo "tool not installed: semgrep ('brew install semgrep'). Reviewer should fall back to grepping for injection/authz patterns." >&2
fi

# ── CodeQL ───────────────────────────────────────────────────────────────────
# CODEQL_DATABASE: an existing database, analyzed as given (CODEQL_QUERIES: optional pack/suite).
# Otherwise, when codeql is installed and the target is in a git repo, the repo is extracted once
# per commit (javascript-typescript / python, the languages that need no build) and analyzed with
# the security-extended suite. Database and SARIF are cached under $CKLPH_CODEQL_CACHE (default
# ~/.cache/cklph-audit/codeql) keyed by repo, commit and working-tree state, behind a lock, so
# parallel reviewers share one build. Each call reports only results under its own target.
# CODEQL_AUTO=0 turns the automatic build off.
parse_codeql() { # $1 = SARIF path, $2 = repo-relative prefix to keep ("" = everything)
  node -e '
    let r;
    try { r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); }
    catch (e) { process.stderr.write("sast.sh: codeql SARIF is not valid JSON (" + e.message + ") — codeql findings NOT collected.\n"); process.exit(0); }
    const prefix = process.argv[2] || "";
    const sevOf = (s) => { const n = parseFloat(s); if (isNaN(n)) return ""; return n >= 9 ? "critical" : n >= 7 ? "high" : n >= 4 ? "medium" : "low"; };
    const lvl = { error: "high", warning: "medium", note: "low" };
    if (!r || !Array.isArray(r.runs)) { process.stderr.write("sast.sh: codeql SARIF has no runs array (unexpected shape) — codeql findings NOT collected.\n"); process.exit(0); }
    for (const run of r.runs) {
      const rules = new Map();
      const tool = run.tool || {};
      for (const ru of ((tool.driver && tool.driver.rules) || [])) rules.set(ru.id, ru);
      for (const ext of (tool.extensions || [])) for (const ru of (ext.rules || [])) rules.set(ru.id, ru);
      for (const res of (run.results || [])) {
        const ru = rules.get(res.ruleId) || {};
        const props = ru.properties || {};
        const loc = (((res.locations || [])[0] || {}).physicalLocation) || {};
        const file = (loc.artifactLocation && loc.artifactLocation.uri) || "";
        if (prefix && file !== prefix && !file.startsWith(prefix + "/")) continue;
        process.stdout.write(JSON.stringify({
          tool: "codeql", rule: res.ruleId || "codeql",
          severity: sevOf(props["security-severity"]) || lvl[res.level] || "medium",
          file,
          line: (loc.region && loc.region.startLine) || 0,
          cwe: (props.tags || []).filter(t => /cwe/i.test(t)).join(","),
          snippet: ((res.message && res.message.text) || "").substring(0, 300),
          rationale: "CodeQL candidate — verify reachability with attacker input"
        }) + "\n");
      }
    }' "$1" "$2"
}

run_codeql_db() { # $1 = database, $2 = SARIF out, rest = query args. 0 = clean, 2 = partial SARIF, 1 = none
  local db="$1" out="$2"; shift 2
  # shellcheck disable=SC2068  # query args may be empty or several packs
  codeql database analyze "$db" $@ --format=sarif-latest --output="$out" > /dev/null 2> "$WORK/codeql.err"
  local rc=$?
  if [ ! -s "$out" ]; then
    echo "sast.sh: codeql failed (exit $rc, no SARIF): $(head -c 300 "$WORK/codeql.err") — zero codeql findings means it did not run." >&2
    return 1
  fi
  if [ "$rc" -ne 0 ]; then
    echo "sast.sh: codeql exited $rc but wrote SARIF: $(head -c 300 "$WORK/codeql.err") — codeql findings may be incomplete." >&2
    return 2
  fi
  return 0
}

# The target's path relative to its git root, compared as physical paths (macOS /tmp is a
# symlink to /private/tmp, and git reports the physical root).
TARGET_P="$(pwd -P)"
ROOT="$(git -C "$TARGET" rev-parse --show-toplevel 2>/dev/null)"
[ -n "$ROOT" ] && ROOT="$(cd "$ROOT" && pwd -P)"
PREFIX=""
if [ -n "$ROOT" ]; then
  case "$TARGET_P" in "$ROOT"/*) PREFIX="${TARGET_P#"$ROOT"/}" ;; esac
fi

if ! command -v codeql >/dev/null 2>&1; then
  echo "tool not installed: codeql ('brew install --cask codeql') — no dataflow SAST pass; zero codeql findings means it did not run." >&2
elif ! command -v node >/dev/null 2>&1; then
  echo "sast.sh: node not found — cannot parse the codeql SARIF; codeql findings NOT collected." >&2
elif [ -n "${CODEQL_DATABASE:-}" ]; then
  # shellcheck disable=SC2086
  run_codeql_db "$CODEQL_DATABASE" "$WORK/codeql.sarif" ${CODEQL_QUERIES:-}
  [ $? -ne 1 ] && parse_codeql "$WORK/codeql.sarif" "$PREFIX"
elif [ "${CODEQL_AUTO:-1}" != "0" ]; then
  CACHE_BASE="${CKLPH_CODEQL_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/cklph-audit/codeql}"
  if [ -z "$ROOT" ]; then
    echo "sast.sh: target is not in a git repo and CODEQL_DATABASE is unset — codeql NOT run." >&2
  elif ! mkdir -p "$CACHE_BASE" 2>/dev/null || ! { mkdir "$CACHE_BASE/.probe.$$" 2>/dev/null && rmdir "$CACHE_BASE/.probe.$$"; }; then
    echo "sast.sh: codeql cache dir $CACHE_BASE is not writable (set CKLPH_CODEQL_CACHE) — codeql NOT run." >&2
  else
    FILES="$( { git -C "$ROOT" ls-files -- "${PREFIX:-.}"; git -C "$ROOT" ls-files --others --exclude-standard -- "${PREFIX:-.}"; } 2>/dev/null)"
    LANGS=()
    grep -qE '\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$' <<<"$FILES" && LANGS+=(javascript-typescript)
    grep -qE '\.py$' <<<"$FILES" && LANGS+=(python)
    if [ "${#LANGS[@]}" -eq 0 ]; then
      echo "sast.sh: no JS/TS or Python sources under the target — codeql auto mode skipped (other languages need CODEQL_DATABASE)." >&2
    else
      HEAD_SHA="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo nohead)"
      # Uncommitted edits and new source files change the key; logs and other untracked files don't.
      DIRTY="$( { git -C "$ROOT" diff HEAD 2>/dev/null; git -C "$ROOT" ls-files --others --exclude-standard 2>/dev/null | grep -E '\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py)$' | while IFS= read -r f; do cksum "$ROOT/$f" 2>/dev/null; done; } | cksum | cut -d' ' -f1)"
      REPO_KEY="$(printf '%s' "$ROOT" | cksum | cut -d' ' -f1)"
      for CQ_LANG in "${LANGS[@]}"; do
        case "$CQ_LANG" in javascript-typescript) PACK=javascript ;; *) PACK="$CQ_LANG" ;; esac
        DIR="$CACHE_BASE/$REPO_KEY-${HEAD_SHA:0:12}-$DIRTY-$CQ_LANG"
        LOCK="$DIR.lock"
        waited=0
        LOCKED=0
        while :; do
          if mkdir "$LOCK" 2>/dev/null; then LOCKED=1; CURRENT_LOCK="$LOCK"; break; fi
          # A live build touches its lock every minute, so one untouched for 10 minutes is dead.
          if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +10 2>/dev/null)" ] && rmdir "$LOCK" 2>/dev/null; then continue; fi
          [ "$waited" -ge "${CODEQL_LOCK_WAIT:-1800}" ] && break
          sleep 5; waited=$((waited + 5))
        done
        if [ "$LOCKED" != "1" ]; then
          echo "sast.sh: timed out waiting for another codeql build of this repo ($LOCK) — codeql NOT run." >&2
          continue
        fi
        SARIF="$DIR/results.sarif"
        if [ ! -s "$SARIF" ]; then
          # Heartbeat: keeps the lock fresh while the build runs. It detaches from stdout/stderr
          # (so callers waiting on those pipes aren't held open) and stops once this script or
          # the lock is gone.
          OWNER=$$
          ( trap 'kill $! 2>/dev/null; exit 0' TERM
            while :; do
              sleep 60 & wait $!
              kill -0 "$OWNER" 2>/dev/null && [ -d "$LOCK" ] || exit 0
              touch "$LOCK"
            done ) </dev/null >/dev/null 2>&1 &
          HEARTBEAT_PID=$!
          mkdir -p "$DIR"
          echo "sast.sh: building a codeql $CQ_LANG database for $ROOT (once per commit; cached in $DIR)." >&2
          if codeql database create "$DIR/db" --language="$CQ_LANG" --source-root="$ROOT" --overwrite --threads=0 > "$DIR/create.log" 2>&1; then
            run_codeql_db "$DIR/db" "$DIR/results.sarif.tmp" "codeql/$PACK-queries:codeql-suites/$PACK-security-extended.qls" --download --threads=0
            case $? in
              0) mv "$DIR/results.sarif.tmp" "$SARIF" ;;
              2) SARIF="$WORK/codeql-partial-$CQ_LANG.sarif"; mv "$DIR/results.sarif.tmp" "$SARIF" ;; # used now, never cached
            esac
          else
            echo "sast.sh: codeql database create failed for $CQ_LANG: $(tail -c 300 "$DIR/create.log") — codeql NOT run." >&2
          fi
          kill "$HEARTBEAT_PID" 2>/dev/null; HEARTBEAT_PID=""
        fi
        rmdir "$LOCK" 2>/dev/null
        CURRENT_LOCK=""
        [ -s "$SARIF" ] && parse_codeql "$SARIF" "$PREFIX"
      done
    fi
  fi
fi
exit 0
