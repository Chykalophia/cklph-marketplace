#!/bin/bash
# Tests for hooks/destructive-command-gate.sh. Run from anywhere:
#   bash plugins/cklph-os/hooks/tests/destructive-command-gate.test.sh
# Feeds realistic PreToolUse payloads ({"tool_name":"Bash","tool_input":{"command":"..."}})
# and asserts the exit code: 2 = blocked, 0 = allowed. Needs jq or python3 to build payloads.
# Exit 0 = all pass.

set -o pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
GATE="$HERE/../destructive-command-gate.sh"
BASH_BIN="${GATE_BASH:-$(command -v bash)}"
REPO_ROOT=$(git -C "$HERE" rev-parse --show-toplevel 2>/dev/null)
pass=0; fail=0

payload() {
    if command -v jq >/dev/null 2>&1; then
        jq -cn --arg c "$1" '{tool_name:"Bash",tool_input:{command:$c}}'
    else
        python3 -I -c 'import json,sys; print(json.dumps({"tool_name":"Bash","tool_input":{"command":sys.argv[1]}}))' "$1"
    fi
}

# expect <want-exit> <label> <command> [env/PATH override handled by caller via RUN_ENV]
expect() {
    local want="$1" label="$2" cmd="$3" got
    payload "$cmd" | (cd "$REPO_ROOT" && env ${RUN_ENV:-} "$BASH_BIN" "$GATE") >/dev/null 2>&1
    got=$?
    if [ "$got" = "$want" ]; then
        pass=$((pass + 1)); printf 'PASS  exit=%s  %s\n' "$got" "$label"
    else
        fail=$((fail + 1)); printf 'FAIL  want=%s got=%s  %s\n' "$want" "$got" "$label"
    fi
}
block() { expect 2 "block: $1" "$1"; }
allow() { expect 0 "allow: $1" "$1"; }

echo "== dangerous (must block, exit 2)"
block 'rm -rf /'
block 'rm -rf ~'
# cubic review of #24: dot-globs, wrapper option values, chmod zeros, quote concatenation, nesting
block 'rm -rf .*'
block 'rm -rf ./.*'
block "rm -rf '.[!.]*'"
block 'sudo -u root rm -rf /'
block 'sudo --user=root -n rm -rf /'
block 'env -u HOME rm -rf /'
block 'nice -n 10 git reset --hard'
block 'time -o /tmp/t git push -f origin main'
block "npx -c 'git reset --hard'"
block 'chmod 00777 file'
block 'chmod -R 0777 dir'
block "psql -c 'DR'\"OP TABLE users\""
block "psql -c TRUN'CATE' users"
block "bash -c \"bash -c 'bash -c \\\"bash -c \\\\\\\"echo hi\\\\\\\"\\\"'\""
allow 'rm -rf .cache'
allow 'rm -rf ./.next'
allow 'sudo -u www-data ls /var/www'
allow 'nice -n 10 npm test'
allow 'chmod 0755 script.sh'
allow "psql -c 'select 1'"
allow "bash -c 'echo hi'"
block 'rm -rf ~/'
block 'sudo rm -rf "$HOME"'
block 'rm -fr /*'
block 'rm -rf .'
block 'rm -r ./*'
expect 2 'block: rm -rf <repo root, absolute>' "rm -rf $REPO_ROOT"
block 'rm -rf "$CLAUDE_PROJECT_DIR"'
block 'cd /tmp && rm -rf /'
block 'git push --force origin main'
block 'git push -f'
block 'git push -uf origin feat/x'
block 'git push origin +main'
block 'git status && git push --force-with-lease --force'
block 'git reset --hard HEAD~1'
block 'git -C packages/web reset --hard'
block 'git checkout .'
block 'git checkout -- .'
block 'git restore .'
block 'git clean -fd'
block 'git clean -fdx'
block 'git commit --no-verify -m "wip"'
block 'git commit -n -m "wip"'
block 'git push --no-verify'
block 'psql "$DATABASE_URL" -c "DROP TABLE users;"'
block "psql -c 'drop database app'"
block 'mysql -e "TRUNCATE orders"'
block 'docker exec -it db psql -U postgres -c "DROP DATABASE app"'
expect 2 'block: psql with a heredoc containing drop table' "psql \"\$DATABASE_URL\" <<'SQL'
drop table if exists sessions;
SQL"
block 'wp db query "DROP TABLE wp_posts"'
block 'wp db reset --yes'
block 'docker system prune -af'
block 'docker volume prune -f'
block 'chmod -R 777 storage'
block 'npm publish'
block 'pnpm publish --access public'
block 'supabase db reset --linked'
block 'npx supabase db reset --db-url postgresql://postgres@db.example.com:5432/postgres'
block 'supabase db reset --project-ref abcdefghij'
block 'bash -c "git reset --hard"'
block 'sh -c "rm -rf ~"'
block 'eval git push -f'
block 'export CKLPH_ALLOW_DESTRUCTIVE=1; git push -f'
RUN_ENV="CKLPH_ALLOW_DESTRUCTIVE=1" expect 2 'block: git push -f (CKLPH_ALLOW_DESTRUCTIVE=1 exported session-wide)' 'git push -f'

echo "== safe (must allow, exit 0)"
allow 'rm -rf node_modules'
allow 'rm -rf ./dist'
allow 'rm -rf .next build coverage'
allow 'rm -rf ~/tmp/scratch-build'
allow 'rm -f ./*.log'
allow 'git push --force-with-lease'
allow 'git push --force-with-lease origin feat/x'
allow 'git push -u origin feat/x'
allow 'git checkout -- file.ts'
allow 'git checkout main'
allow 'git checkout -b feat/new'
allow 'git restore --staged .'
allow 'git restore src/app/page.tsx'
allow 'git reset --soft HEAD~1'
allow 'git reset HEAD file.ts'
allow 'git clean -n'
allow 'git clean -fdn'
allow 'supabase db reset'
allow 'supabase db push --linked'
allow 'grep "DROP TABLE" migrations/'
allow 'grep -rn TRUNCATE supabase/migrations'
allow 'rg -i "drop database" .'
allow 'echo "git reset --hard"'
allow "echo 'psql -c \"DROP TABLE x\"'"
allow 'git log --oneline --grep="reset --hard"'
allow 'git commit -m "docs: explain why we never use --no-verify or git push --force"'
expect 0 'allow: git commit with a heredoc message mentioning rm -rf /, reset --hard, DROP TABLE' "git commit -m \"\$(cat <<'EOF'
fix: don't run rm -rf / or git reset --hard in setup.sh

Also never DROP TABLE from psql in CI. Use --force-with-lease.
EOF
)\""
allow 'npm publish --dry-run'
allow 'npm run build'
allow 'chmod 755 scripts/deploy.sh'
allow 'chmod +x scripts/deploy.sh'
allow 'docker image prune -f'
allow 'docker compose ps'
allow 'psql "$DATABASE_URL" -c "select count(*) from users"'
allow 'ls -la  # rm -rf /'
allow 'wp db export backup.sql'
allow 'CKLPH_ALLOW_DESTRUCTIVE=1 git push --force origin feat/x'
allow 'CKLPH_ALLOW_DESTRUCTIVE=1 rm -rf ./build/*'

echo "== parser fallbacks and fail-open"
# Restricted PATH: everything the gate needs except the JSON parser under test.
BIN=$(mktemp -d)
BIN2=$(mktemp -d)
trap 'rm -rf "$BIN" "$BIN2"' EXIT
for t in cat awk git; do ln -s "$(command -v $t)" "$BIN/$t"; done
for t in cat awk git; do ln -s "$(command -v $t)" "$BIN2/$t"; done
if command -v python3 >/dev/null 2>&1; then
    ln -s "$(command -v python3)" "$BIN/python3"
    RUN_ENV="PATH=$BIN" expect 2 'python3 fallback (no jq): block git push -f' 'git push -f'
    RUN_ENV="PATH=$BIN" expect 0 'python3 fallback (no jq): allow rm -rf node_modules' 'rm -rf node_modules'
fi
RUN_ENV="PATH=$BIN2" expect 0 'no jq and no python3: fail open on git push -f' 'git push -f'
out=$(payload 'git push -f' | env PATH="$BIN2" "$BASH_BIN" "$GATE" 2>&1)
case "$out" in
    *"neither jq nor python3"*) pass=$((pass + 1)); echo "PASS  no-parser path prints a one-line warning" ;;
    *) fail=$((fail + 1)); echo "FAIL  no-parser path printed no warning" ;;
esac
printf 'not json' | "$BASH_BIN" "$GATE" >/dev/null 2>&1 && { pass=$((pass + 1)); echo "PASS  exit=0  malformed payload fails open"; } \
    || { fail=$((fail + 1)); echo "FAIL  malformed payload did not fail open"; }

echo "== block message names a safer alternative"
msg=$(payload 'git push --force' | "$BASH_BIN" "$GATE" 2>&1 >/dev/null)
case "$msg" in
    *"--force-with-lease"*"CKLPH_ALLOW_DESTRUCTIVE=1"*) pass=$((pass + 1)); echo "PASS  message names --force-with-lease and the escape hatch" ;;
    *) fail=$((fail + 1)); echo "FAIL  message: $msg" ;;
esac

echo "== timing"
P=$(payload 'git commit -m "feat: thing" && git push -u origin feat/x')
TIMEFORMAT=%R
secs=$( { time (for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do printf '%s' "$P" | "$BASH_BIN" "$GATE" >/dev/null 2>&1; done) ; } 2>&1 )
ms=$(awk -v s="$secs" 'BEGIN { printf "%d", s * 1000 / 20 }')
if [ "$ms" -lt 100 ]; then pass=$((pass + 1)); echo "PASS  average ${ms} ms per call (limit 100 ms)"
else fail=$((fail + 1)); echo "FAIL  average ${ms} ms per call (limit 100 ms)"; fi

echo "--- destructive-command-gate: $pass passed, $fail failed ($("$BASH_BIN" --version | head -1))"
[ "$fail" -eq 0 ]
