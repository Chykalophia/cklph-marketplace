#!/bin/bash
# Destructive-command gate for Claude Code (cklph-os). PreToolUse hook, matcher: Bash.
#
# Blocks a Bash tool call that would destroy work or data, and names a safer alternative.
# Exit 2 + reason on stderr = block (same convention as pre-commit-gate.sh). Exit 0 = allow.
#
# BLOCKS
#   rm -r / rm -rf          against /, ~, $HOME, ., .., *, $PWD, the repo root (also with /*)
#   git push --force / -f   and +refspec pushes. --force-with-lease alone is allowed.
#   git reset --hard
#   git checkout .          (and `git checkout -- .`, `git restore .` without --staged)
#   git clean -f            any forced clean (-f, -fd, -fdx) unless -n / --dry-run is present
#   --no-verify             on any command; also `git commit -n`
#   DROP TABLE / DROP DATABASE / DROP SCHEMA / TRUNCATE
#                           when a SQL client (psql, mysql, mariadb, sqlite3, `wp db query`, or one
#                           of those inside docker/podman/kubectl exec) is a command in the call
#   wp db drop / wp db reset
#   docker system prune / docker volume prune   (podman too)
#   chmod 777 / 0777 / a+rwx
#   npm|pnpm|yarn|bun publish   unless --dry-run
#   supabase db reset       with --linked, --db-url or --project-ref (remote). Plain reset is local.
#   bash -c / sh -c / zsh -c / eval strings are unpacked and checked the same way.
#
# ESCAPE HATCH
#   A command that starts with the literal prefix `CKLPH_ALLOW_DESTRUCTIVE=1 ` is allowed. The
#   bypass is visible in the transcript and covers that one tool call only. The variable is never
#   read from the environment, so exporting it does nothing. Ask the user before using it.
#
# DOES NOT CATCH (a guard rail, not a sandbox)
#   - Anything hidden from the command text: scripts (`./wipe.sh`, `npm run nuke`), aliases,
#     SQL in a file (`psql -f drop.sql`), commands assembled from variables (`$CMD`).
#   - Commands inside $(...) or backticks, and xargs/find -exec/-delete targets.
#   - rm against other important paths (/etc, ~/.ssh, a sibling repo). Only the roots above.
#   - Other destructive git: branch -D, stash drop/clear, push --delete/--mirror, checkout -f,
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
#   Heredoc bodies are skipped for command detection. Runs in ~15-40 ms; bash 3.2 compatible.

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

# Escape hatch: literal prefix on this one command (leading whitespace ignored).
TRIMMED="${CMD#"${CMD%%[![:space:]]*}"}"
case "$TRIMMED" in
    "CKLPH_ALLOW_DESTRUCTIVE=1 "*) exit 0 ;;
esac

# Fast path: nothing that any rule could match.
shopt -s nocasematch
if ! [[ $CMD =~ (rm|git|docker|podman|chmod|publish|supabase|wp|no-verify|drop|truncate|eval|-c) ]]; then
    shopt -u nocasematch
    exit 0
fi
shopt -u nocasematch

# Quote-aware tokenizer. Prints one line per simple command; words joined by \037.
# Separators: ; | & ( ) newline. Quoted text and $(...)/`...` stay inside one word.
# Heredoc bodies are skipped. A # starting a word begins a comment.
read -r -d '' TOKENIZER <<'AWK'
BEGIN { US = sprintf("%c", 31); SQ = sprintf("%c", 39); st = 0; sp = 0; word = ""; inw = 0; seg = ""; hd = ""; hds = 0; phd = ""; phds = 0 }
function endword() { if (inw) seg = (seg == "" ? word : seg US word); word = ""; inw = 0 }
function endseg() { endword(); if (seg != "") print seg; seg = "" }
{
    line = $0
    if (hd != "") { t = line; if (hds) sub(/^\t+/, "", t); if (t == hd) hd = ""; next }
    n = length(line); i = 1; cont = 0
    while (i <= n) {
        c = substr(line, i, 1)
        if (st == 1) { if (c == SQ) st = 0; else word = word c; i++; continue }
        if (st == 2) {
            if (c == "\\" && i < n) { word = word substr(line, i + 1, 1); i += 2; continue }
            if (c == "$" && substr(line, i + 1, 1) == "(") { sp++; stk[sp] = 2; pd[sp] = 0; st = 0; word = word "$("; i += 2; continue }
            if (c == "\"") st = 0; else word = word c
            i++; continue
        }
        if (c == "\\") { if (i < n) { word = word substr(line, i + 1, 1); inw = 1 } else cont = 1; i += 2; continue }
        if (c == SQ) { st = 1; inw = 1; i++; continue }
        if (c == "\"") { st = 2; inw = 1; i++; continue }
        if (c == "$" && substr(line, i + 1, 1) == "(") { sp++; stk[sp] = 0; pd[sp] = 0; word = word "$("; inw = 1; i += 2; continue }
        if (c == "`") {
            j = index(substr(line, i + 1), "`")
            if (j == 0) { word = word substr(line, i); i = n + 1 } else { word = word substr(line, i, j + 1); i += j + 1 }
            inw = 1; continue
        }
        if (c == "<" && substr(line, i, 3) == "<<<") { if (sp == 0) endword(); else word = word "<<<"; i += 3; continue }
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
        if (c == ";" || c == "|" || c == "&" || c == "(" || c == ")") { endseg(); i++; continue }
        if (c == "#" && !inw) break
        word = word c; inw = 1; i++
    }
    if (phd != "") { hd = phd; hds = phds; phd = "" }
    if (st != 0 || sp > 0 || cont) { if (!cont) word = word " "; next }
    endseg()
}
END { endseg() }
AWK

US=$'\037'
REPO_ROOT=""; REPO_ROOT_DONE=0

block() {
    {
        echo "destructive-command-gate: BLOCKED ($1)."
        echo "Safer: $2"
        echo "If the user explicitly wants this exact command, ask them first, then rerun it with the prefix CKLPH_ALLOW_DESTRUCTIVE=1 (covers that one command only)."
    } >&2
    exit 2
}

# Is an rm target one of the roots we refuse to delete recursively?
is_root_target() {
    local t="$1"
    [ "$t" = "*" ] && return 0
    case "$t" in */\*) t="${t%/\*}"; [ -z "$t" ] && return 0 ;; esac
    while [ "${#t}" -gt 1 ] && [ "${t%/}" != "$t" ]; do t="${t%/}"; done
    case "$t" in
        /|"~"|.|..|'$HOME'|'${HOME}'|'$PWD'|'${PWD}'|'$CLAUDE_PROJECT_DIR'|'${CLAUDE_PROJECT_DIR}'|'$(pwd)'|'`pwd`'|'$(git rev-parse --show-toplevel)') return 0 ;;
    esac
    case "$t" in /*) ;; *) return 1 ;; esac
    [ -n "${HOME:-}" ] && [ "$t" = "${HOME%/}" ] && return 0
    [ -n "${CLAUDE_PROJECT_DIR:-}" ] && [ "$t" = "${CLAUDE_PROJECT_DIR%/}" ] && return 0
    if [ "$REPO_ROOT_DONE" = 0 ]; then
        REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true); REPO_ROOT_DONE=1
    fi
    [ -n "$REPO_ROOT" ] && [ "$t" = "$REPO_ROOT" ] && return 0
    return 1
}

check_segment() {   # $1 = one simple command (words joined by \037), $2 = recursion depth
    local seg="$1" depth="$2"
    local -a w
    IFS="$US" read -r -a w <<< "$seg"
    local n=${#w[@]} i=0 j a cmd sub

    # --no-verify anywhere skips the repo's own hooks.
    for ((j = 0; j < n; j++)); do
        [ "${w[$j]}" = "--no-verify" ] && block "--no-verify skips the repo's git hooks" \
            "fix what the hook reports and commit normally. If the hook itself is broken, say so and ask the user."
    done

    # Skip wrappers and env assignments to reach the real command.
    while [ "$i" -lt "$n" ]; do
        a="${w[$i]}"
        case "$a" in
            sudo|doas|command|exec|time|nohup|nice|env|npx|bunx)
                i=$((i + 1))
                while [ "$i" -lt "$n" ] && [[ ${w[$i]} == -* ]]; do i=$((i + 1)); done
                continue ;;
        esac
        if [[ $a =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then i=$((i + 1)); continue; fi
        break
    done
    [ "$i" -ge "$n" ] && return 0
    cmd="${w[$i]##*/}"
    if [[ $cmd =~ ^(pnpm|yarn|bun)$ ]] && [[ ${w[$((i + 1))]:-} =~ ^(exec|dlx|x)$ ]]; then
        i=$((i + 2)); cmd="${w[$i]##*/}"
    fi

    case "$cmd" in
        bash|sh|zsh|dash)
            for ((j = i + 1; j < n - 1; j++)); do
                if [[ ${w[$j]} =~ ^-[a-z]*c[a-z]*$ ]]; then check_string "${w[$((j + 1))]}" $((depth + 1)); break; fi
            done ;;
        eval)
            local rest=""
            for ((j = i + 1; j < n; j++)); do rest="$rest ${w[$j]}"; done
            check_string "$rest" $((depth + 1)) ;;
        rm)
            local rec=0 endopts=0 hit=""
            for ((j = i + 1; j < n; j++)); do
                a="${w[$j]}"
                if [ "$endopts" = 0 ]; then
                    case "$a" in
                        --) endopts=1; continue ;;
                        --recursive) rec=1; continue ;;
                        --*) continue ;;
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
                    -C|-c|--git-dir|--work-tree|--namespace|--exec-path) j=$((j + 2)) ;;
                    -*) j=$((j + 1)) ;;
                    *) break ;;
                esac
            done
            sub="${w[$j]:-}"
            local k force=0 hard=0 dot=0 staged=0 worktree=0 dry=0 nflag=0
            for ((k = j + 1; k < n; k++)); do
                a="${w[$k]}"
                case "$sub:$a" in
                    push:--force|push:--mirror) force=1 ;;
                    push:--*) ;;
                    push:-*) [[ $a == *f* ]] && force=1 ;;
                    push:+*) force=1 ;;
                    reset:--hard) hard=1 ;;
                    checkout:.|checkout:./|checkout:\*|checkout::/|restore:.|restore:./|restore:\*|restore::/) dot=1 ;;
                    restore:--staged|restore:-S) staged=1 ;;
                    restore:--worktree|restore:-W) worktree=1 ;;
                    clean:--force) force=1 ;;
                    clean:--dry-run) dry=1 ;;
                    clean:--*) ;;
                    clean:-*) [[ $a == *f* ]] && force=1; [[ $a == *n* ]] && dry=1 ;;
                    commit:-n) nflag=1 ;;
                esac
            done
            case "$sub" in
                push) [ "$force" = 1 ] && block "git push --force overwrites the remote branch" \
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
        docker|podman)
            for ((j = i + 1; j < n - 1; j++)); do
                if [[ ${w[$j]} =~ ^(system|volume)$ ]] && [ "${w[$((j + 1))]}" = "prune" ]; then
                    block "$cmd ${w[$j]} prune deletes every unused image, container, network or volume" \
                        "remove the specific thing (docker image prune, docker rm <name>), and check docker system df first. Volumes hold database data."
                fi
            done ;;
        chmod)
            for ((j = i + 1; j < n; j++)); do
                [[ ${w[$j]} =~ ^(0?777|a\+rwx|ugo\+rwx)$ ]] && block "chmod 777 makes it world-writable" \
                    "chmod 755 for directories or 644 for files, or grant the one user or group that needs it (chown, chmod g+w)."
            done ;;
        npm|pnpm|yarn|bun)
            local pub=0 dryrun=0
            for ((j = i + 1; j < n; j++)); do
                case "${w[$j]}" in publish) pub=1 ;; --dry-run) dryrun=1 ;; esac
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
                    --linked|--db-url|--db-url=*|--project-ref|--project-ref=*) remote=1 ;;
                esac
            done
            [ "$reset" = 1 ] && [ "$remote" = 1 ] && block "supabase db reset against a remote project wipes its data" \
                "plain supabase db reset resets the LOCAL stack only. For a remote, write a migration and supabase db push, or use a Supabase branch."
            ;;
        wp)
            if [ "${w[$((i + 1))]:-}" = "db" ] && [[ ${w[$((i + 2))]:-} =~ ^(drop|reset)$ ]]; then
                block "wp db ${w[$((i + 2))]} deletes the WordPress database" \
                    "wp db export backup.sql first, and do it on staging, not the live site."
            fi ;;
    esac

    # SQL: a client is a command here AND the call contains DROP/TRUNCATE (heredoc bodies included).
    local sql=0
    case "$cmd" in
        psql|mysql|mariadb|sqlite3) sql=1 ;;
        wp) [ "${w[$((i + 1))]:-}" = "db" ] && [ "${w[$((i + 2))]:-}" = "query" ] && sql=1 ;;
        docker|podman|kubectl)
            for ((j = i + 1; j < n; j++)); do [[ ${w[$j]} =~ ^(psql|mysql|mariadb|sqlite3)$ ]] && sql=1; done ;;
    esac
    if [ "$sql" = 1 ]; then
        shopt -s nocasematch
        if [[ $CMD =~ (^|[^a-z_])(drop[[:space:]]+(table|database|schema)|truncate)([^a-z_]|$) ]]; then
            shopt -u nocasematch
            block "DROP/TRUNCATE through a SQL client destroys data" \
                "write it as a reviewed migration, take a backup first (pg_dump / wp db export), or run it against a local database (supabase start, then supabase db reset)."
        fi
        shopt -u nocasematch
    fi
    return 0
}

check_string() {   # $1 = command text, $2 = recursion depth
    [ "${2:-0}" -gt 3 ] && return 0
    local segs line
    segs=$(printf '%s\n' "$1" | awk "$TOKENIZER")
    while IFS= read -r line; do
        [ -n "$line" ] && check_segment "$line" "${2:-0}"
    done <<< "$segs"
    return 0
}

check_string "$CMD" 0
exit 0
