#!/bin/bash
# Destructive-command gate for Claude Code (cklph-os). PreToolUse hook, matcher: Bash.
#
# Blocks a Bash tool call that would destroy work or data, and names a safer alternative.
# Exit 2 + reason on stderr = block (same convention as pre-commit-gate.sh). Exit 0 = allow.
#
# BLOCKS
#   rm -r / rm -rf          against /, ~, $HOME, ., .., *, $PWD, the repo root (also with /*),
#                           and .* globs, which take .git (also under a root: ~/.*, /.*)
#   git push --force / -f   and +refspec pushes. --force-with-lease alone is allowed.
#   git push --mirror       overwrites AND deletes remote refs to match local
#   git push --prune        deletes remote branches that have no local counterpart
#   git reset --hard
#   git checkout .          (and `git checkout -- .`, `-p .`, `git restore .` without --staged)
#   git clean -f            any forced clean (-f, -fd, -fdx) unless -n / --dry-run is present
#   --no-verify             on any git command; also `git commit -n`
#   DROP TABLE / DROP DATABASE / DROP SCHEMA / TRUNCATE
#                           when a SQL client (psql, mysql, mariadb, sqlite3, `wp db query`, or one
#                           of those as the command inside docker/podman/kubectl exec or run) is a
#                           command in the call
#   wp db drop / wp db reset
#   docker system prune / docker volume prune   (podman too)
#   chmod that makes it world-writable: octal with others' write bit (777, 666, 1777, 0002) or a
#                           symbolic a/o write (a+rwx, go=rwx, o+w)
#   npm|pnpm|yarn|bun publish   unless --dry-run
#   supabase db reset       with --linked, --db-url or --project-ref (remote). Plain reset is local.
#   Command strings are unpacked and checked the same way, up to 3 levels deep: bash/sh/zsh/dash -c
#   (options and -- after -c are skipped, as the shell does), eval, su -c, env -S (also clustered:
#   -iS), npx/npm exec -c, bun exec, watch. Deeper nesting is BLOCKED.
#   Wrappers are seen through, including option values and GNU long-option prefixes: sudo, doas,
#   env, nice, timeout, time, exec, command, builtin, nohup, npx/bunx, npm|pnpm|yarn|bun exec,
#   stdbuf, ionice, chrt, setsid, caffeinate; and shells inside docker/podman/kubectl exec.
#   Shell grammar and redirections in front of a command are skipped (`do git …`, `if …; then …`,
#   `{ …; }`, `! …`, `>/dev/null git …`, `<<< x git …`). git options match by the shortest prefix
#   git accepts (`--h` for reset, `--m` for push), short clusters are read (`commit -nm`) and option
#   VALUES are skipped (`commit -m "- fix"` is not `-n`); wp-cli global flags may come first.
#   Command names match case-insensitively (macOS file systems are, so `GIT reset --hard` runs
#   git), and line continuations are followed the way the shell does.
#
# ESCAPE HATCH
#   A command that starts with the literal prefix `CKLPH_ALLOW_DESTRUCTIVE=1 ` is allowed. The
#   bypass is visible in the transcript and covers the whole Bash call: everything chained after
#   it with && ; | is exempt too, so never chain other commands onto it. The variable is never
#   read from the environment, so exporting it does nothing. Ask the user before using it.
#
# DOES NOT CATCH (a guard rail, not a sandbox)
#   - Anything hidden from the command text: scripts (`./wipe.sh`, `npm run nuke`), aliases,
#     SQL in a file (`psql -f drop.sql`), commands assembled from variables (`$CMD`).
#   - Commands inside $(...) or backticks, and xargs/find -exec/-delete targets.
#   - Names built with ANSI-C quoting ($'\x72m') or parameter expansion. Plain quote-splitting
#     (r""m, g''it, and 'DR'"OP TABLE" anywhere in a call that runs a SQL client) IS caught.
#   - Wrappers not listed above (xargs, parallel, flock, nsenter, ssh host '...'), and option forms
#     no real tool accepts the same way everywhere (`sudo -h host`).
#   - Commands fed to a shell on stdin: `echo '…' | bash`, `bash <<< '…'`, `bash <<'EOF'`.
#   - Brace-expanded command names ({git,reset,--hard}); `coproc`; `{fd}>file` redirections; git
#     aliases defined inline (`git -c alias.n="reset --hard" n`); ANSI-C strings with an escaped
#     quote ($'don\'t') desynchronise quoting for the rest of the call; `docker run` options that
#     take a value but are not in the gate's list may be read as the image; `sudo -h host`.
#   - rm glob spellings beyond those above ({*,.*}, ?*, */*, **/*); chmod modes copied from
#     another class (o=u); SQL hidden by comments other than /* */; npm command abbreviations
#     (`npm publ`); a heredoc delimiter containing a space (`<<"END OF"`) hides what follows it.
#   - `case` arms, functions defined and called in the same call, and hooks skipped through
#     `git -c core.hooksPath=…`.
#   - rm against other important paths (/etc, ~/.ssh, a sibling repo). Only the roots above.
#   - Other destructive git: branch -D, stash drop/clear, push --delete, checkout -f,
#     update-ref, filter-branch. Other data loss: docker compose down -v, kubectl delete,
#     dropdb, DELETE without WHERE, hooks skipped via HUSKY=0 or core.hooksPath.
#   - Non-Bash tools (Write/Edit can still overwrite files; MCP tools can still run SQL).
#   It catches the common accidental forms. The prose rule in security-hardening and AGENTS.md
#   covers the rest, and still applies on surfaces where hooks do not run.
#
# PARSING
#   The payload is JSON with quotes and escapes in it, so it is read with jq, else python3 (stdlib
#   json). If neither exists the gate fails OPEN with a one-line warning, matching pre-commit-gate.
#   The command is then tokenized quote-aware (awk): quoted text stays inside its word, so
#   `echo "git reset --hard"` and `grep "DROP TABLE" migrations/` are not commands and pass.
#   Heredoc bodies are skipped for command detection. bash 3.2 compatible. Speed: ~25-50 ms for a
#   normal call; ~0.4 s for a 58 KB one; ~3 s for 2000 chained commands. Not linear in every shape:
#   each bash -c / eval / env -S string costs one more tokenizer run (~5 ms), so 1000 of them in one
#   call take several seconds; one word of 100 KB+ or tens of thousands of backticks take 10 s+.
#   Past Claude Code's hook timeout a hook does not block. Never use ${var//…} on the whole command here (quadratic in
#   bash 3.2; a 41 KB command once took 164 s), and never fork per word.

set -o pipefail

INPUT=$(cat 2>/dev/null || true)
[ -z "$INPUT" ] && exit 0

if command -v jq >/dev/null 2>&1; then
    CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null) || CMD=""
elif command -v python3 >/dev/null 2>&1; then
    CMD=$(printf '%s' "$INPUT" | python3 -I -c '
import json, sys
try:
    d = json.load(sys.stdin)
    c = (d.get("tool_input") or {}).get("command") or ""
    sys.stdout.write(c if isinstance(c, str) else "")
except Exception:
    pass
' 2>/dev/null) || CMD=""
else
    echo "destructive-command-gate: neither jq nor python3 found; skipping destructive-command check" >&2
    exit 0
fi
[ -z "$CMD" ] && exit 0
# The tokenizer uses \036 and \037 as separators, so input may not contain them.
case "$CMD" in *$'\036'*|*$'\037'*) CMD=$(printf '%s' "$CMD" | tr '\036\037' '__') ;; esac

# Escape hatch: a literal prefix, exempting the whole Bash call (leading whitespace ignored).
TRIMMED="${CMD#"${CMD%%[![:space:]]*}"}"
case "$TRIMMED" in
    "CKLPH_ALLOW_DESTRUCTIVE=1 "*) exit 0 ;;
esac

# Fast path: nothing that any rule could match. Matched with quotes, backslashes and newlines
# removed, so a quote-split name (r""m) or a continuation (g\<newline>it) cannot skip the tokenizer,
# which rejoins them. One tr, only when the text has a quote or backslash: bash 3.2's ${var//…} is
# quadratic and took minutes on a 40 KB command.
STRIPPED="$CMD"
case "$CMD" in *[\"\'\\]*) STRIPPED=$(printf '%s' "$CMD" | tr -d '\042\047\134\012') ;; esac
shopt -s nocasematch
if ! [[ $STRIPPED =~ (rm|git|docker|podman|chmod|publish|supabase|wp|no-verify|drop|truncate|eval|-c|-S) ]]; then
    shopt -u nocasematch
    exit 0
fi
shopt -u nocasematch

# Quote-aware tokenizer. Prints one line per simple command; words joined by \037.
# Separators: ; | & ( ) newline. Quoted text and $(...)/`...` stay inside one word.
# Heredoc bodies are skipped. A # starting a word begins a comment.
read -r -d '' TOKENIZER <<'AWK'
BEGIN { US = sprintf("%c", 31); NL = sprintf("%c", 30); SQ = sprintf("%c", 39); st = 0; sp = 0; word = ""; inw = 0; seg = ""; hd = ""; hds = 0; phd = ""; phds = 0 }
function endword() { if (inw) seg = (seg == "" ? word : seg US word); word = ""; inw = 0 }
function endseg() { endword(); if (seg != "") print seg; seg = "" }
# Index of the } closing a ${ at k (k = first char inside), skipping quotes and nested ${ }; 0 if none.
function bend(line, k, n,    d, q, ch) {
    d = 1; q = 0
    for (; k <= n; k++) {
        ch = substr(line, k, 1)
        if (q == 1) { if (ch == SQ) q = 0; continue }
        if (q == 2) { if (ch == "\\") { k++; continue }; if (ch == "\"") q = 0; continue }
        if (ch == "\\") { k++; continue }
        if (ch == SQ) q = 1
        else if (ch == "\"") q = 2
        else if (ch == "$" && substr(line, k + 1, 1) == "{") { d++; k++ }
        else if (ch == "}") { d--; if (d == 0) return k }
    }
    return 0
}
{
    line = $0
    if (hd != "") {
        t = line; if (hds) sub(/^\t+/, "", t)
        if (t == hd) { hd = ""; next }
        # bash also ends a heredoc opened inside $( ) at `EOF)`; the rest of that line is code.
        # zsh does not (ZR=1 is that reading; check_string runs both and blocks if either blocks).
        if (!ZR && sp > 0 && substr(t, 1, length(hd) + 1) == hd ")") { line = substr(t, length(hd) + 1); hd = "" }
        else next
    }
    n = length(line); i = 1; cont = 0
    while (i <= n) {
        c = substr(line, i, 1)
        if (st == 1) { if (c == SQ) st = 0; else word = word c; i++; continue }
        if (st == 2) {
            if (c == "\\" && i < n) { word = word substr(line, i + 1, 1); i += 2; continue }
            if (c == "\\") { cont = 1; i++; continue }
            if (c == "$" && substr(line, i + 1, 1) == "(") { sp++; stk[sp] = 2; pd[sp] = 0; ari[sp] = (substr(line, i + 2, 1) == "("); st = 0; word = word "$("; i += 2; continue }
            if (c == "\"") st = 0; else word = word c
            i++; continue
        }
        if (c == "\\") { if (i < n) { word = word substr(line, i + 1, 1); inw = 1 } else cont = 1; i += 2; continue }
        if (c == SQ) { st = 1; inw = 1; i++; continue }
        if (c == "\"") { st = 2; inw = 1; i++; continue }
        # $[ … ] (old arithmetic) and ${ … } are copied whole, so a << inside is never a heredoc. The
        # closing } is found past quotes and nested ${ } (${BODY:-'{}'}); a ${ cmd; } (bash 5.3
        # funsub) or a span with no closer is tokenized normally instead.
        if (c == "$" && substr(line, i + 1, 1) == "[") {
            j = index(substr(line, i + 2), "]")
            if (j > 0 && substr(line, i, j + 2) !~ /["'\\]/) { word = word substr(line, i, j + 2); inw = 1; i += j + 2; continue }
        }
        if (c == "$" && substr(line, i + 1, 1) == "{" && substr(line, i + 2, 1) !~ /[ \t|]/) {
            j = bend(line, i + 2, n)
            if (j > 0) { word = word substr(line, i, j - i + 1); inw = 1; i = j + 1; continue }
        }
        if (c == "$" && substr(line, i + 1, 1) == "(") { sp++; stk[sp] = 0; pd[sp] = 0; ari[sp] = (substr(line, i + 2, 1) == "("); word = word "$("; inw = 1; i += 2; continue }
        if (c == "`") {
            j = index(substr(line, i + 1), "`")
            if (j == 0) { word = word substr(line, i); i = n + 1 } else { word = word substr(line, i, j + 1); i += j + 1 }
            inw = 1; continue
        }
        if (c == "<" && substr(line, i, 3) == "<<<") { if (sp == 0) { endword(); word = "<<<"; inw = 1 } else word = word "<<<"; i += 3; continue }
        # Inside $(( )) or (( )) a << is a shift, not a heredoc. A plain $( ) is NOT arithmetic: the
        # commit idiom git commit -m "$(cat <<'EOF' … EOF)" must still register its heredoc.
        if (c == "(" && substr(line, i + 1, 1) == "(" && sp == 0) { ar++; endseg(); i += 2; continue }
        if (c == ")" && substr(line, i + 1, 1) == ")" && ar > 0 && sp == 0) { ar--; endseg(); i += 2; continue }
        if (c == "<" && substr(line, i + 1, 1) == "<" && (ar > 0 || (sp > 0 && ari[sp]))) { word = word "<<"; inw = 1; i += 2; continue }
        if (c == "<" && substr(line, i + 1, 1) == "<") {
            if (sp == 0) endword()
            j = i + 2; s = 0
            if (substr(line, j, 1) == "-") { s = 1; j++ }
            while (substr(line, j, 1) == " ") j++
            d = ""
            while (j <= n) {
                ch = substr(line, j, 1)
                if (ch == " " || ch == ";" || ch == "|" || ch == "&" || ch == ")" || ch == "<" || ch == ">") break
                if (ch != SQ && ch != "\"" && ch != "\\") d = d ch
                j++
            }
            if (d != "") { phd = d; phds = s }
            i = j; continue
        }
        if (sp > 0) {
            if (c == "(") pd[sp]++
            else if (c == ")") { if (pd[sp] > 0) pd[sp]--; else { st = stk[sp]; sp-- } }
            word = word c; inw = 1; i++; continue
        }
        if (c == " " || c == "\t") { endword(); i++; continue }
        if (c == ">" || c == "<") { if (inw && word !~ /^[0-9]+$/ && word !~ /[<>]$/) endword(); word = word c; inw = 1; i++; continue }
        if ((c == "&" || c == "|") && word ~ /[<>]$/) { word = word c; i++; continue }
        if (c == ";" || c == "|" || c == "&" || c == "(" || c == ")") { endseg(); i++; continue }
        if (c == "#" && !inw) break
        word = word c; inw = 1; i++
    }
    if (st == 0 && sp == 0) ar = 0   # ((cd a && make) || x) closes with single ), not ))
    if (phd != "") { hd = phd; hds = phds; phd = "" }
    if (st != 0 || sp > 0 || cont) { if (!cont) word = word (sp > 0 ? " " : NL); next }
    endseg()
}
END { endseg() }
AWK

US=$'\037'
REDIR_RE='^[0-9]*[<>]'; BARE_REDIR_RE='^[0-9]*[<>]+[&|]?$'; SHELL_C_RE='^-[A-Za-z]*c[A-Za-z]*$'; ASSIGN_RE='^[A-Za-z_][A-Za-z0-9_]*\+?='
REPO_ROOT=""; REPO_ROOT_DONE=0
SQLRE='(^|[^a-z_])(drop([[:space:]]|/\*[^*]*\*/)+(table|database|schema)|truncate)([^a-z_(]|$)'
CMD_SQL=""   # whether the raw text matches SQLRE: computed once, on first need

# lc VAR TEXT: VAR = TEXT lowercased, in pure bash (a tr fork per capitalised word made 500 segments
# take seconds). TEXT over 1024 characters is returned unchanged: no command name or path we compare
# is that long, and the loop is per character.
UPPER=ABCDEFGHIJKLMNOPQRSTUVWXYZ; LOWER=abcdefghijklmnopqrstuvwxyz
lc() {
    local s="$2" out="" ch k pre
    if [[ $s =~ [A-Z] ]] && [ "${#s}" -le 1024 ]; then
        for ((k = 0; k < ${#s}; k++)); do
            ch="${s:$k:1}"
            # An explicit set, not [A-Z]: in many locales that range also matches lowercase.
            case "$ch" in [ABCDEFGHIJKLMNOPQRSTUVWXYZ]) pre="${UPPER%%"$ch"*}"; ch="${LOWER:${#pre}:1}" ;; esac
            out="$out$ch"
        done
        s="$out"
    fi
    printf -v "$1" '%s' "$s"
}

block() {
    {
        echo "destructive-command-gate: BLOCKED ($1)."
        echo "Safer: $2"
        echo "If the user explicitly wants this exact command, ask them first, then rerun it with the prefix CKLPH_ALLOW_DESTRUCTIVE=1. The prefix exempts the WHOLE tool call, so run the approved command on its own, with nothing chained to it."
    } >&2
    exit 2
}

# Paths compare case-insensitively on macOS, whose file systems are (/users/x is /Users/x).
same_path() {
    [ "$1" = "$2" ] && return 0
    case "${OSTYPE:-}" in darwin*) ;; *) return 1 ;; esac
    local x y; lc x "$1"; lc y "$2"; [ "$x" = "$y" ]
}

# script_after J WORDS...: sets SCRIPT to what a shell runs for `-c` at index J. Shells skip
# options and `--` after -c (`bash -c -- '…'`, `bash -c -x '…'`), and -o/-O take a value
# (`bash -c -o pipefail '…'`). Sets a variable rather than echoing: a $( ) fork per -c was slow.
script_after() {
    local cix=$1 j=$(( $1 + 1 )); shift
    local -a ws=("$@")
    # Each o/O inside the -c cluster takes a value word first (bash -co pipefail '…').
    local cw="${ws[$cix]}" oo
    case "$cw" in -[!-]*) oo="${cw//[!oO]/}"; j=$((j + ${#oo})) ;; esac
    SCRIPT=""
    while [ "$j" -lt "${#ws[@]}" ]; do
        case "${ws[$j]}" in
            --) SCRIPT="${ws[$((j + 1))]:-}"; return ;;
            [-+]o|[-+]O|[-+]*[oO]) j=$((j + 2)) ;;
            -*|+*) j=$((j + 1)) ;;
            *) SCRIPT="${ws[$j]}"; return ;;
        esac
    done
}

# git accepts any unique prefix of a long option: pfx WORD FULL MIN is true when WORD is at least
# MIN characters and FULL starts with it (pfx --har --hard 4).
pfx() { [ "${#1}" -ge "$3" ] && [[ $2 == "$1"* ]]; }

# Is an rm target one of the roots we refuse to delete recursively?
is_root_target() {
    local t="$1"
    case "$t" in ./?*) t="${t#./}" ;; esac
    while [ "${#t}" -gt 1 ] && [ "${t%/}" != "$t" ]; do t="${t%/}"; done     # */ is *
    while [[ $t == *'**'* ]]; do t="${t/\*\*/*}"; done                          # ** is * (zsh: recursive)
    # A dotfile glob under a directory (~/.*, $HOME/.*, /.*) counts as that directory.
    case "$t" in */'.*'|*/'.[!.]*'|*/'.[^.]*'|*/'..?*'|*/'.??*'|*/'.?*'|*/'{.,}*'|*/'{,.}*') t="${t%/*}"; [ -z "$t" ] && return 0 ;; esac
    [ "$t" = "*" ] && return 0
    case "$t" in */\*) t="${t%/\*}"; [ -z "$t" ] && return 0 ;; esac
    while [ "${#t}" -gt 1 ] && [ "${t%/}" != "$t" ]; do t="${t%/}"; done
    case "$t" in
        # Dotfile globs: they take .git and every other hidden file with them.
        '.*'|'.[!.]*'|'.[^.]*'|'..?*'|'.??*'|'.?*'|'{.,}*'|'{,.}*') return 0 ;;
        /|"~"|.|..|'$HOME'|'${HOME}'|'$PWD'|'${PWD}'|'$CLAUDE_PROJECT_DIR'|'${CLAUDE_PROJECT_DIR}'|'$(pwd)'|'`pwd`'|'$(git rev-parse --show-toplevel)') return 0 ;;
    esac
    case "$t" in /*) ;; *) return 1 ;; esac
    [ -n "${HOME:-}" ] && same_path "$t" "${HOME%/}" && return 0
    [ -n "${CLAUDE_PROJECT_DIR:-}" ] && same_path "$t" "${CLAUDE_PROJECT_DIR%/}" && return 0
    if [ "$REPO_ROOT_DONE" = 0 ]; then
        REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true); REPO_ROOT_DONE=1
    fi
    [ -n "$REPO_ROOT" ] && same_path "$t" "$REPO_ROOT" && return 0
    return 1
}

check_segment() {   # $1 = one simple command (words joined by \037), $2 = recursion depth
    local seg="$1" depth="$2"
    local -a w
    IFS="$US" read -r -a w <<< "$seg"
    local n=${#w[@]} i=0 j a cmd sub wj=0

    # Skip wrappers and env assignments to reach the real command. Options that take a value
    # consume it too, or `sudo -u root rm -rf /` would read `root` as the command and pass.
    #   shortv / longv  options whose value is the next word (long ones match by GNU-style prefix)
    #   strv / strl     options whose value IS a command line (env -S, npx -c): checked like bash -c
    local wrap shortv longv strv strl o ol k2 c2 sv al
    while [ "$i" -lt "$n" ]; do
        a="${w[$i]}"
        if [[ $a =~ $ASSIGN_RE ]]; then i=$((i + 1)); continue; fi
        lc al "${a##*/}"
        # Shell grammar in front of the real command: `do git …`, `then …`, `{ …`, `! …`.
        case "$al" in
            if|then|else|elif|do|while|until|'!'|'{'|'}') i=$((i + 1)); continue ;;
        esac
        # Redirections in front of it: `>/dev/null git …`, `2>&1 git …`, `> out.log git …`.
        if [[ $a =~ $REDIR_RE ]]; then
            [[ $a =~ $BARE_REDIR_RE ]] && i=$((i + 1))   # a bare operator's target is the next word
            i=$((i + 1)); continue
        fi
        # npm / pnpm / yarn / bun exec|dlx|x run a command, the same way npx does.
        if [[ $al =~ ^(npm|pnpm|yarn|bun)$ ]] && [[ ${w[$((i + 1))]:-} =~ ^(exec|dlx|x)$ ]]; then
            # bun exec takes a shell SCRIPT, not a command: check its words as a command line.
            if [ "$al" = bun ] && [ "${w[$((i + 1))]}" = exec ]; then
                sv=""; for ((j = i + 2; j < n; j++)); do sv="$sv ${w[$j]}"; done
                check_string "$sv" $((depth + 1)); return 0
            fi
            i=$((i + 1)); al=npx
        fi
        case "$al" in
            sudo|doas|command|builtin|exec|time|nohup|nice|env|npx|bunx|timeout|stdbuf|ionice|chrt|setsid|caffeinate|watch)
                wrap="$al"; shortv=""; longv=""; strv=""; strl=""
                case "$wrap" in
                    sudo) shortv="ugpCDrtUTR"; longv="--user|--group|--prompt|--close-from|--chdir|--role|--type|--other-user|--command-timeout|--chroot|--host" ;;
                    doas) shortv="uCa" ;;
                    env) shortv="uCPLU"; longv="--unset|--chdir"; strv="S"; strl="--split-string" ;;
                    nice) shortv="n"; longv="--adjustment" ;;
                    time) shortv="fo"; longv="--format|--output" ;;
                    exec) shortv="a" ;;
                    npx|bunx) shortv="p"; longv="--package"; strv="c"; strl="--call" ;;
                    timeout) shortv="sk"; longv="--signal|--kill-after" ;;
                    stdbuf) shortv="ioe"; longv="--input|--output|--error" ;;
                    ionice) shortv="cnpPu"; longv="--class|--classdata|--pid|--pgid|--uid" ;;
                    chrt) shortv="TPD"; longv="--sched-runtime|--sched-period|--sched-deadline" ;;
                    caffeinate) shortv="tw" ;;
                    watch) shortv="n"; longv="--interval" ;;
                esac
                i=$((i + 1))
                while [ "$i" -lt "$n" ] && [[ ${w[$i]} == -* ]]; do
                    o="${w[$i]}"; i=$((i + 1))
                    [ "$o" = "--" ] && break
                    sv=""; ol=0
                    case "$o" in
                        --*=*) [ -n "$strl" ] && [[ "|$strl|" == *"|${o%%=*}"* ]] && { sv="${o#*=}"; ol=1; } ;;
                        --*) if [ -n "$strl" ] && [[ "|$strl|" == *"|$o"* ]]; then sv="${w[$i]:-}"; i=$((i + 1)); ol=1
                             elif [ -n "$longv" ] && [[ "|$longv|" == *"|$o"* ]]; then i=$((i + 1)); fi ;;
                        # Short cluster: a value letter at the END takes the next word
                        # (sudo -nu root); anywhere else the value is attached (nice -n10).
                        *) for ((k2 = 1; k2 < ${#o}; k2++)); do
                               c2="${o:$k2:1}"
                               if [ -n "$strv" ] && [ "$c2" = "$strv" ]; then
                                   if [ "$k2" -eq $((${#o} - 1)) ]; then sv="${w[$i]:-}"; i=$((i + 1)); else sv="${o:$((k2 + 1))}"; fi
                                   ol=1; break
                               fi
                               if [[ $shortv == *"$c2"* ]]; then
                                   [ "$k2" -eq $((${#o} - 1)) ] && i=$((i + 1))
                                   break
                               fi
                           done ;;
                    esac
                    if [ "$ol" = 1 ]; then
                        # env splits the string into more env ARGUMENTS (`env -S '-i cmd'`), so
                        # it goes back through env; npx -c hands it to a shell.
                        [ "$wrap" = env ] && sv="env $sv"
                        for ((j = i; j < n; j++)); do sv="$sv ${w[$j]}"; done
                        check_string "$sv" $((depth + 1)); return 0
                    fi
                done
                case "$wrap" in
                    # The first operand is a duration (timeout) or a priority (chrt).
                    timeout|chrt) i=$((i + 1)) ;;
                    # watch runs the rest through sh -c, quoted or not.
                    watch) sv=""; for ((j = i; j < n; j++)); do sv="$sv ${w[$j]}"; done
                           check_string "$sv" $((depth + 1)); return 0 ;;
                esac
                continue ;;
        esac
        if [[ $a =~ $ASSIGN_RE ]]; then i=$((i + 1)); continue; fi
        break
    done
    [ "$i" -ge "$n" ] && return 0
    # Lowercased: macOS file systems are case-insensitive, so `GIT reset --hard` runs git.
    lc cmd "${w[$i]##*/}"
    # git run by another command (xargs git commit --no-verify, find … -exec git … --no-verify).
    if [ "$cmd" != git ]; then
        local sawgit=0
        for ((j = i + 1; j < n; j++)); do
            # Case-insensitive, as above (xargs GIT commit runs git); a glob, not lc, to stay fork- and loop-free.
            [[ ${w[$j]##*/} == [Gg][Ii][Tt] ]] && sawgit=1
            [ "$sawgit" = 1 ] && pfx "${w[$j]}" --no-verify 6 && block "--no-verify skips the repo's git hooks" \
                "fix what the hook reports and commit normally. If the hook itself is broken, say so and ask the user."
        done
    fi

    case "$cmd" in
        su)
            for ((j = i + 1; j < n; j++)); do
                case "${w[$j]}" in
                    -c|-[A-Za-z]*c|--command|--session-command) script_after "$j" "${w[@]}"; check_string "$SCRIPT" $((depth + 1)); break ;;
                    --command=*|--session-command=*) check_string "${w[$j]#*=}" $((depth + 1)); break ;;
                esac
            done ;;
        bash|sh|zsh|dash)
            for ((j = i + 1; j < n - 1; j++)); do
                if [[ ${w[$j]} =~ $SHELL_C_RE ]]; then script_after "$j" "${w[@]}"; check_string "$SCRIPT" $((depth + 1)); break; fi
            done ;;
        eval)
            local rest=""
            j=$((i + 1)); [ "${w[$j]:-}" = "--" ] && j=$((j + 1))
            for ((; j < n; j++)); do rest="$rest ${w[$j]}"; done
            check_string "$rest" $((depth + 1)) ;;
        rm)
            local rec=0 endopts=0 hit=""
            for ((j = i + 1; j < n; j++)); do
                a="${w[$j]}"
                if [ "$endopts" = 0 ]; then
                    case "$a" in
                        --) endopts=1; continue ;;
                        --*) pfx "$a" --recursive 3 && rec=1; continue ;;   # GNU rm takes --recur
                        -*) [[ $a == *[rR]* ]] && rec=1; continue ;;
                    esac
                fi
                [ -z "$hit" ] && is_root_target "$a" && hit="$a"
            done
            [ "$rec" = 1 ] && [ -n "$hit" ] && block "recursive rm of '$hit', a root, home or repo directory" \
                "name the exact directory to remove (rm -rf ./dist, rm -rf node_modules). To start over in a repo, git stash push -u -m \"...\" keeps it recoverable."
            ;;
        git)
            j=$((i + 1))
            while [ "$j" -lt "$n" ]; do
                case "${w[$j]}" in
                    -C|-c|--git-dir|--work-tree|--namespace|--exec-path|--config-env|--attr-source|--super-prefix|--list-cmds) j=$((j + 2)) ;;
                    -*) j=$((j + 1)) ;;
                    *) break ;;
                esac
            done
            sub="${w[$j]:-}"
            # Value-taking options per subcommand: their value is skipped, never read as flags, so
            # `git commit -m "- fix n+1"` is not `-n`. Short letters (cluster END takes the next word),
            # then long names, matched by prefix of at least 4 characters.
            local k q force=0 mirror=0 prune=0 hard=0 dot=0 staged=0 worktree=0 dry=0 nflag=0 nover=0 stop vlong
            case "$sub" in
                push) stop=o; vlong="--push-option|--receive-pack|--exec|--repo" ;;
                commit) stop=mFCct; vlong="--message|--file|--author|--date|--template|--reuse-message|--reedit-message|--fixup|--squash|--trailer|--cleanup|--pathspec-from-file" ;;
                clean) stop=e; vlong="--exclude" ;;
                grep) stop=efABCm; vlong="--regexp|--file|--max-count|--after-context|--before-context|--context" ;;
                log) stop=SGn; vlong="--grep|--author|--committer|--since|--until|--after|--before|--format|--pretty|--max-count" ;;
                *) stop=""; vlong="" ;;
            esac
            local eo=0
            for ((k = j + 1; k < n; k++)); do
                a="${w[$k]}"
                # After `--` every word is a path: only the `.` check below applies.
                if [ "$eo" = 1 ]; then
                    [ "$sub" = push ] && [[ $a == +* ]] && force=1   # git push -- origin +main still forces
                    case "$sub:$a" in checkout:.|checkout:./|checkout:\*|checkout::/|restore:.|restore:./|restore:\*|restore::/) dot=1 ;; esac
                    continue
                fi
                # Long options by unique prefix, the way git parses them; the minimums are the
                # shortest forms git 2.55 accepts (--h is --hard for reset, --m is --mirror for push).
                case "$a" in
                    --*=*) ;;
                    --) eo=1; continue ;;
                    --*) pfx "$a" --no-verify 6 && nover=1   # git am takes --no-v
                         [ "${#a}" -ge 4 ] && [ -n "$vlong" ] && [[ "|$vlong|" == *"|$a"* ]] && { k=$((k + 1)); continue; }
                         case "$sub" in
                             push) [ "$a" = --force ] && force=1; pfx "$a" --mirror 3 && mirror=1; pfx "$a" --prune 5 && prune=1 ;;
                             reset) pfx "$a" --hard 3 && hard=1 ;;
                             restore) pfx "$a" --staged 4 && staged=1; pfx "$a" --worktree 3 && worktree=1 ;;
                             clean) pfx "$a" --force 3 && force=1; pfx "$a" --dry-run 3 && dry=1 ;;
                         esac ;;
                    # Short clusters: read letters until one that takes a value (its value is the rest).
                    -?*) case "$sub" in
                             push) stop=o ;; commit) stop=mFCct ;; clean) stop=e ;; grep) stop=efABCm ;; log) stop=SGn ;; *) stop="" ;;
                         esac
                         for ((q = 1; q < ${#a}; q++)); do
                             c2="${a:$q:1}"
                             # commit -u<mode> / -S<keyid>: an attached value only, never the next word.
                             [ "$sub" = commit ] && [[ $c2 == [uS] ]] && break
                             if [ -n "$stop" ] && [[ $stop == *"$c2"* ]]; then
                                 [ "$q" -eq $((${#a} - 1)) ] && k=$((k + 1))   # value is the next word
                                 break
                             fi
                             case "$sub:$c2" in
                                 push:f|clean:f) force=1 ;;
                                 clean:n) dry=1 ;;
                                 commit:n) nflag=1 ;;
                                 restore:S) staged=1 ;;
                                 restore:W) worktree=1 ;;
                             esac
                         done ;;
                    +*) [ "$sub" = push ] && force=1 ;;
                esac
                case "$sub:$a" in
                    checkout:.|checkout:./|checkout:\*|checkout::/|restore:.|restore:./|restore:\*|restore::/) dot=1 ;;
                esac
            done
            [ "$nover" = 1 ] && block "--no-verify skips the repo's git hooks" \
                "fix what the hook reports and commit normally. If the hook itself is broken, say so and ask the user."
            case "$sub" in
                push) [ "$prune" = 1 ] && block "git push --prune deletes every remote branch that has no local counterpart" \
                    "delete the one remote branch by name (git push origin --delete <branch>) after checking it is merged."
                    [ "$mirror" = 1 ] && block "git push --mirror overwrites and deletes remote refs to match local" \
                    "push the specific branch (git push origin <branch>); delete a remote branch by name if that is the intent."
                    [ "$force" = 1 ] && block "git push --force overwrites the remote branch" \
                    "git fetch, then git push --force-with-lease, which refuses if someone else pushed since your fetch." ;;
                reset) [ "$hard" = 1 ] && block "git reset --hard discards uncommitted work" \
                    "git stash push -m \"before reset\" first (git stash pop brings it back), or git reset --keep, which refuses to drop local changes." ;;
                checkout) [ "$dot" = 1 ] && block "git checkout . discards every uncommitted change" \
                    "git restore <path> for the specific files, or git stash push -m \"...\" to keep the changes recoverable." ;;
                restore) [ "$dot" = 1 ] && { [ "$staged" = 0 ] || [ "$worktree" = 1 ]; } && block "git restore . discards every uncommitted change" \
                    "git restore <path> for the specific files, or git stash push -m \"...\" to keep the changes recoverable." ;;
                clean) [ "$force" = 1 ] && [ "$dry" = 0 ] && block "git clean -f deletes untracked files for good" \
                    "git clean -n (dry run) to list what would go, then delete the named paths, or git stash push -u -m \"...\" to keep them recoverable." ;;
                commit) [ "$nflag" = 1 ] && block "git commit -n skips the repo's git hooks" \
                    "fix what the hook reports and commit normally. If the hook itself is broken, say so and ask the user." ;;
            esac ;;
        docker|podman|kubectl)
            # --entrypoint sh makes the image's arguments a shell's: docker run --entrypoint sh img -c "…".
            local ep=""
            for ((j = i + 1; j < n; j++)); do
                case "${w[$j]}" in --entrypoint) ep="${w[$((j + 1))]:-}" ;; --entrypoint=*) ep="${w[$j]#*=}" ;; esac
            done
            if [[ ${ep##*/} =~ ^(bash|sh|zsh|dash)$ ]]; then
                for ((j = i + 1; j < n - 1; j++)); do
                    if [[ ${w[$j]} =~ $SHELL_C_RE ]]; then script_after "$j" "${w[@]}"; check_string "$SCRIPT" $((depth + 1)); break; fi
                done
            fi
            # A shell inside exec runs its -c string: docker exec db sh -c "…", including after other
            # shell options (bash -x -c "…", bash -o pipefail -c "…"); -o/-O take a value word.
            local sk
            for ((j = i + 1; j < n - 1; j++)); do
                [[ ${w[$j]##*/} =~ ^(bash|sh|zsh|dash)$ ]] || continue
                for ((sk = j + 1; sk < n; sk++)); do
                    if [[ ${w[$sk]} =~ $SHELL_C_RE ]]; then
                        script_after "$sk" "${w[@]}"; check_string "$SCRIPT" $((depth + 1)); break 2
                    fi
                    case "${w[$sk]}" in
                        [-+]o|[-+]O) sk=$((sk + 1)) ;;
                        -*|+*) ;;
                        *) break ;;
                    esac
                done
            done
            for ((j = i + 1; j < n - 1; j++)); do
                if [[ ${w[$j]} =~ ^(system|volume)$ ]] && [ "${w[$((j + 1))]}" = "prune" ]; then
                    block "$cmd ${w[$j]} prune deletes every unused image, container, network or volume" \
                        "remove the specific thing (docker image prune, docker rm <name>), and check docker system df first. Volumes hold database data."
                fi
            done ;;
        chmod)
            # World-writable = OTHERS get write: octal whose last digit has the 2 bit (777, 666,
            # 1777, 0002), or a symbolic clause giving a/o write (a+rwx, go=rwx, o+w).
            # Symbolic modes are applied clause by clause, so the NET effect on others' write decides
            # (a+rwx,o-w is fine; o-x+w is not).
            local m cl who rest op perms ww
            local -a cls
            # Only the MODE (first word after the options) is a mode; `chmod 644 2` names a file "2".
            j=$((i + 1))
            while [ "$j" -lt "$n" ] && [[ ${w[$j]} =~ ^(-[RfvhHLPc]+|--.*)$ ]]; do j=$((j + 1)); done
            if [ "$j" -lt "$n" ]; then
                m="${w[$j]}"; ww=0
                if [[ $m =~ ^0*[0-7]?[0-7]?[0-7]?[2367]$ ]]; then ww=1
                elif [[ $m =~ ^[ugoarwxXst,+=-]+$ ]]; then
                    IFS=, read -r -a cls <<< "$m"
                    for cl in "${cls[@]}"; do
                        who="${cl%%[+=-]*}"; rest="${cl#"$who"}"
                        while [ -n "$rest" ]; do
                            op="${rest:0:1}"; rest="${rest:1}"; perms="${rest%%[+=-]*}"; rest="${rest#"$perms"}"
                            [[ $who == *[ao]* ]] || continue
                            case "$op" in
                                +) [[ $perms == *w* ]] && ww=1 ;;
                                -) [[ $perms == *w* ]] && ww=0 ;;
                                =) if [[ $perms == *w* ]]; then ww=1; else ww=0; fi ;;
                            esac
                        done
                    done
                fi
                [ "$ww" = 1 ] && block "chmod $m makes it world-writable" \
                    "chmod 755 for directories or 644 for files, or grant the one user or group that needs it (chown, chmod g+w)."
            fi ;;
        npm|pnpm|yarn|bun)
            # `publish` as the package manager's own subcommand, not a script name (npm run publish).
            local pub=0 dryrun=0 prev=""
            for ((j = i + 1; j < n; j++)); do
                case "${w[$j]}" in
                    --) break ;;
                    -w|--workspace) j=$((j + 1)); continue ;;
                    publish) [[ $prev =~ ^(run|run-script)$ ]] || pub=1 ;;
                    --dry-run|--dry-run=true) dryrun=1 ;;
                esac
                [[ ${w[$j]} == -* ]] || prev="${w[$j]}"
            done
            [ "$pub" = 1 ] && [ "$dryrun" = 0 ] && block "$cmd publish is public and permanent for that version" \
                "$cmd publish --dry-run (or npm pack) to inspect exactly what would ship, then hand the real publish to the user."
            ;;
        supabase)
            local db=0 reset=0 remote=0
            for ((j = i + 1; j < n; j++)); do
                case "${w[$j]}" in
                    db) db=1 ;;
                    reset) [ "$db" = 1 ] && reset=1 ;;
                    --linked|--linked=*|--db-url|--db-url=*|--project-ref|--project-ref=*) remote=1 ;;
                esac
            done
            [ "$reset" = 1 ] && [ "$remote" = 1 ] && block "supabase db reset against a remote project wipes its data" \
                "plain supabase db reset resets the LOCAL stack only. For a remote, write a migration and supabase db push, or use a Supabase branch."
            ;;
        wp)
            # Global flags and @aliases may come first: wp --allow-root db reset, wp @staging db drop.
            wj=$((i + 1))
            while [ "$wj" -lt "$n" ] && [[ ${w[$wj]} == --* || ${w[$wj]} == @* ]]; do wj=$((wj + 1)); done
            if [ "${w[$wj]:-}" = "db" ] && [[ ${w[$((wj + 1))]:-} =~ ^(drop|reset)$ ]]; then
                block "wp db ${w[$((wj + 1))]} deletes the WordPress database" \
                    "wp db export backup.sql first, and do it on staging, not the live site."
            fi ;;
    esac

    # SQL: a client is a command here AND the call contains DROP/TRUNCATE. Checked twice: on the raw
    # text (the only place heredoc bodies survive) and on this command's de-quoted words, so
    # quote concatenation ('DR'"OP TABLE") is seen the way the shell will run it.
    local sql=0
    case "$cmd" in
        psql|mysql|mariadb|sqlite3) sql=1 ;;
        wp) [ "${w[$wj]:-}" = "db" ] && [ "${w[$((wj + 1))]:-}" = "query" ] && sql=1 ;;
        docker|podman|kubectl)
            # Only the command run inside exec/run counts. The first word after their options is the
            # container, image or pod (`docker run -d mysql`, `docker logs mysql` name things, not
            # clients); options that take a value skip it (`--name mysql`).
            local ex=0 tgt=0 exw=
            for ((j = i + 1; j < n; j++)); do
                if [ "$ex" = 0 ]; then [[ ${w[$j]} =~ ^(exec|run)$ ]] && { ex=1; exw="${w[$j]}"; }; continue; fi
                if [ "$tgt" = 0 ]; then
                    case "${w[$j]}" in
                        --) tgt=1 ;;
                        # -l is --label (takes a value) for run; for podman exec it is --latest: there is
                        # then no container word, so the next non-option word is already the command.
                        -l|--label|--latest) if [ "$exw" = run ]; then j=$((j + 1)); else tgt=1; fi ;;
                        -e|--env|--env-file|-u|--user|-w|--workdir|--name|-v|--volume|-p|--publish|--network|-h|--hostname|--entrypoint|--platform|-c|--container|-n|--namespace|--mount|--add-host|--restart|-m|--memory|--cpus|--pull|--log-driver|--log-opt|--cpu-shares|--ulimit|--device|--cap-add|--cap-drop|--dns|--ipc|--pid|--security-opt|--stop-signal|--tmpfs|--gpus) j=$((j + 1)) ;;
                        -*) ;;
                        *) tgt=1 ;;
                    esac
                    continue
                fi
                [[ ${w[$j]##*/} =~ ^(psql|mysql|mariadb|sqlite3)$ ]] && sql=1
            done ;;
    esac
    if [ "$sql" = 1 ]; then
        [ -z "$SEGWORDS" ] && SEGWORDS=$(printf '%s' "$SEGS" | tr '\036\037' '\n ')
        shopt -s nocasematch
        # Both matches are cached: re-scanning the whole call per psql segment was quadratic.
        if [ -z "$CMD_SQL" ]; then CMD_SQL=0; [[ $CMD =~ $SQLRE ]] && CMD_SQL=1; fi
        if [ -z "$SEG_SQL" ]; then SEG_SQL=0; [[ $SEGWORDS =~ $SQLRE ]] && SEG_SQL=1; fi
        if [ "$CMD_SQL" = 1 ] || [ "$SEG_SQL" = 1 ]; then
            shopt -u nocasematch
            block "DROP/TRUNCATE through a SQL client destroys data" \
                "write it as a reviewed migration, take a backup first (pg_dump / wp db export), or run it against a local database (supabase start, then supabase db reset)."
        fi
        shopt -u nocasematch
    fi
    return 0
}

check_string() {   # $1 = command text, $2 = recursion depth
    # Fail CLOSED on depth: silently allowing would let four layers of bash -c hide anything.
    [ "${2:-0}" -gt 3 ] && block "command nested more than 3 levels deep (bash -c / eval / env -S) cannot be checked" \
        "run the inner command directly, so it can be read."
    local segs line text="$1" SEGS SEGWORDS="" SEG_SQL=""
    # A newline inside quotes reaches here as \036; a nested shell needs it back to see its own
    # line continuations (bash -c 'g\<newline>it …').
    case "$text" in *$'\036'*) text=$(printf '%s' "$text" | tr '\036' '\n') ;; esac
    segs=$(printf '%s\n' "$text" | awk "$TOKENIZER")
    # A heredoc inside $( ) can end at `EOF)` in bash but not in zsh: check both readings.
    case "$text" in *'$('*'<<'*) segs="$segs"$'\n'"$(printf '%s\n' "$text" | awk -v ZR=1 "$TOKENIZER")" ;; esac
    # Every command's de-quoted words, for the SQL check: `echo 'DR''OP TABLE x' | psql` only reads
    # as DROP once the quotes are gone, and the SQL sits in the segment BEFORE the client. Built
    # lazily (tr, never ${var//…}: quadratic in bash 3.2) and only when a SQL client is present.
    # bash scopes `local` dynamically, so check_segment sees this string's copies.
    SEGS="$segs"
    while IFS= read -r line; do
        [ -n "$line" ] && check_segment "$line" "${2:-0}"
    done <<< "$segs"
    return 0
}

check_string "$CMD" 0
exit 0
