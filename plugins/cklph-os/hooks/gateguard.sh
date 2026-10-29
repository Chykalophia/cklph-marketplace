#!/bin/bash
# GateGuard: fact-forcing gate for Claude Code (cklph-os). PreToolUse hook,
# matcher: Write|Edit|MultiEdit|NotebookEdit. OFF unless CKLPH_GATEGUARD is set.
#
# The first edit or write to each file in a session is DENIED with a short list of facts to go
# and gather (who imports it, what data it reads, the user's instruction quoted word for word).
# The denial marks the file, so the retry, made once the facts are on the table, goes through.
# Asking "are you sure?" gets "yes". Asking "list every importer" makes the agent run the search,
# and the search is what changes the edit.
#
# MODES (env CKLPH_GATEGUARD; set it per project under "env" in .claude/settings.local.json)
#   unset / off / 0   do nothing (the default)
#   sensitive         gate only sensitive targets (list below): money, auth, migrations, secrets
#   all / on / 1      gate every file inside the project
#
# WHAT IS NEVER GATED
#   - Files outside the project root ($CLAUDE_PROJECT_DIR, else the payload cwd): scratchpad,
#     /tmp, memory files. ~/.claude is never gated, even when the project root is $HOME.
#   - Paths matching CKLPH_GATEGUARD_EXEMPT: colon-separated shell globs on the project-relative
#     path, e.g. "docs/*:*.md". Exemptions win over everything, sensitive targets included.
#   - Subagent calls (payload carries agent_id), except sensitive targets: the parent session
#     already did the investigation for ordinary files.
#   - .claude/settings.json and .claude/settings.local.json.
#   - A file already gated once this session. A subagent's retry on a sensitive file unlocks it
#     for the parent too (one state file per session).
#
# SENSITIVE TARGETS (case-insensitive, project-relative; the path as written OR its real location)
#   file name .env, .env.*, .netrc, .pgpass, *.pem, *.key, *.p12, *.pfx, id_rsa*, id_ed25519*,
#   id_ecdsa*, id_dsa*, credentials*, secrets.*; file stem auth, stripe, billing, payment(s),
#   checkout, middleware, proxy (any extension); any whole path segment auth, authn, authz, security,
#   secrets, payment, payments, billing, checkout, stripe, migrations, (auth); anything under a
#   .github/workflows/ directory at any depth.
#
# QUESTIONS depend on the target's class: instruction (CLAUDE.md, AGENTS.md, SKILL.md, .md under
# skills/agents/commands/hooks/rules/.claude), test, prose, config, code. Every class ends with
# "quote the user's instruction verbatim".
#
# OUTPUT AND FAILURE
#   Exit 2 + reason on stderr = deny (same convention as the other cklph-os gates). Exit 0 = allow.
#   Fails OPEN, with a one-line warning, when there is no jq or python3, no session id, or the
#   state file cannot be written, so a broken gate can never loop an agent forever.
#   State: one gateguard-<session>.list per session under ${CKLPH_GATEGUARD_STATE:-
#   ~/.claude/cklph-gateguard}; set it to an absolute path (a relative one resolves against
#   the hook's working directory). Session ids are reduced to [A-Za-z0-9_-] for the file name. Only those files, at that level, are pruned after about 3 days
#   (find -maxdepth 1 -mtime +2). Each denial appends one line to
#   ~/.claude/cklph-usage/gateguard.jsonl (time,
#   tool, class, sensitive, repo directory name, session id; never paths; CKLPH_USAGE_DIR moves it,
#   as for skill-usage-log), so the weekly review
#   can judge whether the gate earns its friction.
#
# KNOWN LIMITS
#   - Parallel batches: hooks see calls one at a time. When several edits to an untouched file go
#     out together, the first is denied and the rest may already be applied. The denial says so.
#   - No transcript scan: an agent that already searched still gets asked once per file.
#   - Directory links and ".." are resolved through the nearest existing directory; a symlinked
#     FILE is judged by its own name, and ".." inside a path that does not exist yet is not
#     collapsed. Exempt globs are split on ':' exactly: a space after a colon is part of the glob.
#   - Bash is not gated here. destructive-command-gate.sh covers destructive commands, but a write
#     through the shell (`cat >> f`, `sed -i`, a script) skips this gate entirely. In the 2026-10-29
#     proof run the agent tried a heredoc append first; only the permission prompt stopped it.
#
# Adapted from ECC skills/gateguard (MIT); see NOTICE-gateguard.md. bash 3.2 compatible.

mode=$(printf '%s' "${CKLPH_GATEGUARD:-off}" | tr '[:upper:]' '[:lower:]')
case "$mode" in
    all|on|1|true|yes) mode=all ;;
    sensitive) ;;
    *) exit 0 ;;
esac

payload=$(cat)

# Prints tool, file path, session id, cwd, agent id: one per line. If any field holds a newline
# (or carriage return), nothing is printed, so the call fails open below instead of shifting fields.
if command -v jq >/dev/null 2>&1; then
    fields=$(printf '%s' "$payload" | jq -r '
        [ .tool_name // "",
          (.tool_input.file_path // .tool_input.notebook_path // .tool_input.edits[0]?.file_path // ""),
          .session_id // "",
          .cwd // "",
          .agent_id // "" ]
        | map(if type == "string" then . else "" end)
        | if any(.[]; test("[\n\r]")) then empty else .[] end' 2>/dev/null)
elif command -v python3 >/dev/null 2>&1; then
    fields=$(printf '%s' "$payload" | python3 -I -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
t = d.get("tool_input") or {}
edits = t.get("edits") if isinstance(t.get("edits"), list) else []
first = edits[0].get("file_path") if edits and isinstance(edits[0], dict) else None
vals = [v if isinstance(v, str) else "" for v in (d.get("tool_name"),
        t.get("file_path") or t.get("notebook_path") or first,
        d.get("session_id"), d.get("cwd"), d.get("agent_id"))]
if any("\n" in v or "\r" in v for v in vals):
    sys.exit(0)
print("\n".join(vals))
' 2>/dev/null)
else
    echo "gateguard: no jq or python3, gate skipped" >&2
    exit 0
fi

tool=$(printf '%s\n' "$fields" | sed -n 1p)
file=$(printf '%s\n' "$fields" | sed -n 2p)
session=$(printf '%s\n' "$fields" | sed -n 3p)
cwd=$(printf '%s\n' "$fields" | sed -n 4p)
agent=$(printf '%s\n' "$fields" | sed -n 5p)

[ -n "$file" ] || exit 0
if [ -z "$session" ]; then
    echo "gateguard: no session id in payload, gate skipped" >&2
    exit 0
fi

root="${CLAUDE_PROJECT_DIR:-${cwd:-$PWD}}"
root="${root%/}"
case "$file" in
    /*) abs="$file" ;;
    *) abs="${cwd:-$PWD}/$file" ;;
esac
# A relative cwd in the payload would leave abs relative: anchor it, so the walk below ends.
case "$abs" in /*) ;; *) abs="$PWD/$abs" ;; esac
# The path as written, relative to the root as written: sensitivity is judged on this AND on the
# real location, so a symlink named auth/ and a link into auth/ both count (as upstream).
case "$abs" in "$root"/*) wrel="${abs#"$root"/}" ;; *) wrel="" ;; esac
# Canonicalize the root and the target's nearest existing directory (pwd -P), so /tmp vs
# /private/tmp, a symlinked project dir, "..", and a directory link into auth/ all compare
# by where the file really lives.
root_c=$(cd "$root" 2>/dev/null && pwd -P) && root="${root_c%/}"
dir="${abs%/*}"
while [ -n "$dir" ] && [ ! -d "$dir" ]; do
    case "$dir" in */*) dir="${dir%/*}" ;; *) dir="" ;; esac
done
if [ -n "$dir" ] && dir_c=$(cd "$dir" 2>/dev/null && pwd -P); then
    abs="${dir_c%/}${abs#"$dir"}"
fi
# Collapse "/./" left in the not-yet-existing tail of the path.
while :; do
    case "$abs" in */./*) abs="${abs%%/./*}/${abs#*/./}" ;; *) break ;; esac
done
case "$abs" in
    "$root"/*) rel="${abs#"$root"/}" ;;
    *) exit 0 ;;
esac
# Claude's own config dir is never gated, even when the project root is $HOME.
home_c=$(cd "$HOME" 2>/dev/null && pwd -P) || home_c="$HOME"
case "$abs" in "${home_c%/}"/.claude/*|"${HOME%/}"/.claude/*) exit 0 ;; esac
lrel=$(printf '%s' "$rel" | tr '[:upper:]' '[:lower:]')
lwrel=$(printf '%s' "$wrel" | tr '[:upper:]' '[:lower:]')

# Claude Code's own settings are never gated (as upstream).
case "$lrel" in .claude/settings.json|.claude/settings.local.json) exit 0 ;; esac

if [ -n "${CKLPH_GATEGUARD_EXEMPT:-}" ]; then
    # set -f: split on ':' without expanding the globs against the current directory.
    old_ifs=$IFS; IFS=:; set -f
    for glob in $CKLPH_GATEGUARD_EXEMPT; do
        [ -n "$glob" ] || continue
        # shellcheck disable=SC2254
        case "$rel" in $glob) exit 0 ;; esac
    done
    IFS=$old_ifs; set +f
fi

base="${lrel##*/}"
sensitive=0
for p in "$lrel" "$lwrel"; do
    [ -n "$p" ] || continue
    case "${p##*/}" in
        .env|.env.*|.netrc|.pgpass|*.pem|*.key|*.p12|*.pfx|id_rsa*|id_ed25519*|id_ecdsa*|id_dsa*|credentials*|secrets.*)
            sensitive=1 ;;
        auth.*|stripe.*|billing.*|payment.*|payments.*|checkout.*|middleware.*|proxy.*)
            sensitive=1 ;;
    esac
    case "/$p" in
        */auth/*|*/\(auth\)/*|*/authn/*|*/authz/*|*/security/*|*/secrets/*|*/payment/*|*/payments/*|*/billing/*|*/checkout/*|*/stripe/*|*/migrations/*|*/.github/workflows/*)
            sensitive=1 ;;
    esac
done

[ "$mode" = sensitive ] && [ "$sensitive" = 0 ] && exit 0
[ -n "$agent" ] && [ "$sensitive" = 0 ] && exit 0

state_dir="${CKLPH_GATEGUARD_STATE:-$HOME/.claude/cklph-gateguard}"
safe_session=$(printf '%s' "$session" | tr -c 'A-Za-z0-9_-' '_')
state="$state_dir/gateguard-$safe_session.list"
if [ -e "$state" ]; then
    grep -Fxq -- "$abs" "$state" 2>/dev/null
    case $? in
        0) exit 0 ;;
        1) ;;
        *) echo "gateguard: cannot read $state, gate skipped for this call" >&2; exit 0 ;;
    esac
fi
if ! { mkdir -p "$state_dir" 2>/dev/null && printf '%s\n' "$abs" >> "$state"; } 2>/dev/null; then
    echo "gateguard: cannot write $state_dir, gate skipped for this call" >&2
    exit 0
fi
# Prune only this hook's own files, at the top level: never recurse into a user-chosen dir.
find "$state_dir" -maxdepth 1 -type f -name 'gateguard-*.list' -mtime +2 -delete 2>/dev/null

# Classify: first match wins.
class=code
case "$base" in
    claude.md|agents.md|agent.md|gemini.md|skill.md|copilot-instructions.md|.cursorrules|.windsurfrules|*.mdc)
        class=instruction ;;
esac
if [ "$class" = code ]; then
    case "/$lrel" in
        */.claude/*.md|*/.claude/*.txt|*/agents/*.md|*/commands/*.md|*/skills/*.md|*/skills/*.txt|*/rules/*.md|*/hooks/*.md)
            class=instruction ;;
    esac
fi
if [ "$class" = code ]; then
    case "$base" in
        *.test.*|*.spec.*|test_*.py|*_test.py|*_test.go) class="test" ;;
    esac
    case "/$lrel" in */tests/*|*/test/*|*/__tests__/*) class="test" ;; esac
fi
if [ "$class" = code ]; then
    case "$base" in
        *.md|*.mdx|*.txt|*.rst|*.adoc) class=prose ;;
        *.json|*.jsonc|*.yaml|*.yml|*.toml|*.ini|.env|.env.*) class=config ;;
    esac
fi

verb=editing
[ "$tool" = Write ] && [ ! -e "$abs" ] && verb=creating

case "$class:$verb" in
    instruction:*) q="1. Name the tool that loads this file (Claude Code, Codex, Cursor...) and when it loads it.
2. Describe what agent behaviour changes as a result.
3. Confirm no existing instruction, skill or agent file already covers this (search the tree)." ;;
    test:*) q="1. Name the behaviour under test and the module or function it exercises.
2. Name the existing test files for that module, or confirm there are none (search the tree)." ;;
    prose:creating) q="1. Name any existing doc this supersedes or duplicates (search the tree).
2. Say where it will be linked from.
3. Say why a new file rather than an edit to an existing one." ;;
    prose:*) q="1. List the docs or code that reference the section being changed (search the tree).
2. Say what the change corrects or adds." ;;
    config:*) q="1. Name the process or tool that reads this file, and when.
2. Describe the effect of the change.
3. Confirm no secret or credential is being written in plain text." ;;
    code:creating) q="1. Name the files and lines that will call this new file.
2. Confirm no existing file serves the same purpose (search the tree).
3. If it reads or writes data, show the field names, structure and date format, using redacted or synthetic values." ;;
    *) q="1. List every file that imports or calls this one (search the tree).
2. List the public functions, types or exports this change affects.
3. If it reads or writes data, show the field names, structure and date format, using redacted or synthetic values." ;;
esac
n=$(printf '%s\n' "$q" | wc -l | tr -d ' ')
q="$q
$((n + 1)). Quote the user's current instruction verbatim."

extra=""
[ "$sensitive" = 1 ] && extra="
Sensitive target (money, auth, migrations, secrets or CI): get these facts right, not fast."

# Control characters (ANSI escapes) in a crafted file name never reach the model's context.
shown=$(printf '%s' "$rel" | tr -d '\000-\037\177')
cat >&2 <<EOF
GateGuard: before $verb $shown, present these facts in your reply:

$q
$extra
Then retry the same call; it will go through. If other edits to this file were sent in the same
parallel batch, they may already be applied: re-read the file before building on them, and send
dependent edits to an untouched file one at a time.
EOF

log_dir="${CKLPH_USAGE_DIR:-$HOME/.claude/cklph-usage}"
if mkdir -p "$log_dir" 2>/dev/null; then
    repo="${root##*/}"
    ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    printf '{"ts":"%s","tool":"%s","class":"%s","sensitive":%s,"repo":"%s","session":"%s"}\n' \
        "$ts" "$(printf '%s' "$tool" | tr -dc 'A-Za-z')" "$class" "$sensitive" \
        "$(printf '%s' "$repo" | tr -c 'A-Za-z0-9._-' '_')" "$safe_session" \
        >> "$log_dir/gateguard.jsonl" 2>/dev/null
fi
exit 2
