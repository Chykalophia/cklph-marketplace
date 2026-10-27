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
# Timing limits are tuned on an Apple-silicon Mac. Slower or loaded runners (shared CI) can scale
# them: GATE_TIME_SCALE=3 triples every limit. Whole numbers only.
TS="${GATE_TIME_SCALE:-1}"
case "$TS" in ''|*[!0-9]*|0) TS=1 ;; esac
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
block "env -S'rm -rf /'"
block "env --split-string='rm -rf /'"
block "env -S 'git reset --hard'"
block "npx --call='git reset --hard'"
allow "env -S'npm test'"
allow "env --split-string='ls -la'"
block 'nice -n 10 git reset --hard'
block 'time -o /tmp/t git push -f origin main'
block "npx -c 'git reset --hard'"
block 'chmod 00777 file'
block 'chmod -R 0777 dir'
block "psql -c 'DR'\"OP TABLE users\""
block "psql -c TRUN'CATE' users"
block "bash -c \"bash -c 'bash -c \\\"bash -c \\\\\\\"echo hi\\\\\\\"\\\"'\""
block 'wp --allow-root db reset --yes'
block 'wp @production db drop --yes'
block "wp --path=/var/www db query 'DROP TABLE wp_posts'"
block 'timeout 60 git reset --hard'
block 'timeout -s KILL 5m rm -rf /'
allow 'wp --allow-root db export backup.sql'
allow 'timeout 60 npm test'
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

# Every section below "dangerous"/"safe" was written BEFORE its fix. How many of each fail against
# the original gate and against main's gate is measured in docs/proof/destructive-command-gate/.
echo "== review bypasses (PR #24 comments)"
block 'rm -rf .*'
block 'rm -rf .[!.]*'
block 'rm -rf ./.*'
allow 'rm -rf .cache'
block "psql -c 'DR'\"OP TABLE users\""
block "mysql -e 'TRUNC'\"ATE sessions\""
allow 'psql -c "select 1"'
block 'sudo -u root rm -rf /'
block 'sudo -nu root rm -rf /'
block 'doas -u root rm -rf /'
block 'env -u HOME rm -rf /'
block 'env -S "git reset --hard"'
block 'nice -n 10 git reset --hard'
block 'timeout 30 git push --force'
block 'timeout -s KILL 30 rm -rf ~'
allow 'sudo -u www-data ls /var/www'
allow 'timeout 30 npm test'
block 'chmod 00777 shared.txt'
block 'chmod a=rwx shared.txt'
block 'r""m -rf /'
block "g''it reset --hard"
block 'git push --mirror origin'
allow 'eval eval eval ls'
block 'eval eval eval eval ls'
block "bash -c \"bash -c 'bash -c \\\"bash -c ls\\\"'\""

echo "== two-reviewer gate, round 1"
block 'rm -rf ~/.*'
block 'rm -rf $HOME/.*'
block 'rm -rf /.*'
block 'rm -rf "$CLAUDE_PROJECT_DIR"/.*'
allow 'rm -rf ~/.cache/pip'
block 'env -iS "git reset --hard"'
block 'env -vS "git reset --hard"'
block "env -S '-i git reset --hard'"
block "env -S '-u HOME git reset --hard'"
block 'env -S -- git reset --hard'
block 'env -P /usr/bin git reset --hard'
block 'env --split "git reset --hard"'
allow 'env -S "echo hi" git reset --hard'
allow 'env -S "node --inspect" app.js'
expect 2 'block: line continuation inside a command name' "$(printf 'g\\\nit reset --hard')"
expect 2 'block: line continuation inside bash -c' "$(printf "bash -c 'g\\\\\nit reset --hard'")"
block 'sudo --us root git reset --hard'
block 'timeout --sig KILL 30 git reset --hard'
block 'nice --adj 10 git reset --hard'
block 'env --un HOME git reset --hard'
block 'doas -a bsdauth git reset --hard'
block 'npx -c "git reset --hard"'
block 'npx --call "git reset --hard"'
block 'npm exec -c "git reset --hard"'
block 'npm exec -- git reset --hard'
allow 'npm exec -- vitest run'
block "echo 'DR'\"OP TABLE users\" | psql"
block "printf '%s' 'TRUNC''ATE t' | mysql db"
allow 'echo "select 1" | psql'
block 'chmod 1777 shared'
block 'chmod 4777 shared'
block 'chmod 666 shared.txt'
block 'chmod u=rwx,go=rwx shared'
block 'chmod a+wrx shared'
block 'chmod o+w shared'
allow 'chmod 0755 bin'
allow 'chmod 7770 dir'
allow 'chmod u+w,go-w file'
allow 'chmod +w file'
block 'GIT reset --hard'
block 'Rm -rf /'
block 'su -c "git reset --hard"'
block 'su root -c "git reset --hard"'
block 'builtin eval "git reset --hard"'
block 'stdbuf -oL git reset --hard'
block 'stdbuf -o L git reset --hard'
block 'ionice -c 3 git reset --hard'
block 'chrt -r 10 git reset --hard'
block 'setsid git reset --hard'
block 'caffeinate -t 60 git reset --hard'
block 'watch -n 2 git reset --hard'
block 'git push --prune origin'
allow 'git fetch --prune'
allow 'su - deploy'

echo "== two-reviewer gate, round 2"
# Regressions round 1 introduced: an escaped backslash ends the line, it does not continue it.
expect 2 'block: escaped backslash before a newline, then a destructive line' "$(printf 'echo done \\\\\ngit reset --hard')"
expect 2 'block: quoted heredoc whose last line ends in a backslash' "$(printf "cat <<'EOF'\nfoo \\\\\nEOF\ngit reset --hard")"
expect 2 'block: line continuation inside double quotes' "$(printf 'bash -c "g\\\nit reset --hard"')"
# Shell grammar in front of the command.
block 'for d in a b; do git reset --hard; done'
block 'if true; then git push -f; fi'
block '{ git reset --hard; }'
block '! git reset --hard'
block 'while true; do git clean -fd; done'
block 'if git diff --quiet; then :; else git checkout .; fi'
block 'until false; do git clean -fd; done'
block 'if git reset --hard; then echo ok; fi'
allow 'if git diff --quiet; then echo ok; fi'
allow 'for f in *.ts; do echo "$f"; done'
block '>/dev/null git reset --hard'
block '2>&1 git push --force'
block '> out.log git reset --hard'
block 'git reset --hard>/dev/null'
block 'git checkout .>/dev/null'
allow 'git status >/dev/null 2>&1'
# git's own abbreviations and short clusters.
block 'git reset --har'
block 'git push --mirr origin'
block 'git push --pru origin'
block 'git commit --no-veri -m x'
block 'git clean --forc'
block 'git commit -nm wip'
block 'git commit -anm wip'
allow 'git commit -am "fix: n+1 query"'
allow 'git clean -fdx -e.env -n'
block 'git clean -fdx -e.env'
# -p . is blocked too: `yes | git checkout -p .` answers every prompt (round 3 found it).
block 'git checkout -p .'
allow 'git push --force-with-lease origin feat/x'
# --no-verify only means something to git.
allow 'rg -n -- "--no-verify" plugins/'
allow 'echo "--no-verify"'
block 'git push --no-verify'
# wp-cli global flags before the subcommand.
block 'wp --allow-root db reset --yes'
block 'wp --path=/var/www db drop --yes'
block 'wp @staging db reset --yes'
block 'wp --allow-root db query "DROP TABLE wp_posts"'
allow 'wp --allow-root db export backup.sql'
# rm targets.
block 'rm -rf */'
block 'rm -rf **'
block 'rm -rf ./**'
block 'rm -rf .?*'
block 'rm -rf {.,}*'
# Command strings in more places.
block 'bash -Ec "git reset --hard"'
block 'su -lc "git reset --hard"'
block 'docker exec db /usr/bin/psql -c "DROP TABLE x"'
block 'docker exec db sh -c "git reset --hard"'
block 'kubectl exec -it pod -- bash -c "git reset --hard"'
# chmod: short octal, and the net effect of every clause.
block 'chmod 2 shared'
block 'chmod 22 shared'
block 'chmod o-x+w shared'
allow 'chmod a+rwx,o-w shared'
allow 'chmod 664 notes.txt'
allow 'chmod g+w shared'
# publish only as the package manager's own subcommand.
allow 'npm run publish'
allow 'yarn run publish:docs'
block 'yarn npm publish'
block 'pnpm --filter web publish'
# Header claims that had no test.
block 'rm -rf ..'
block 'rm -rf *'
block 'rm -rf $PWD'
block 'rm -rf $(pwd)'
allow 'git clean -fd --dry-run'
block 'psql -c "DROP SCHEMA public CASCADE"'
block 'sqlite3 app.db "DROP TABLE users"'
block 'mariadb -e "TRUNCATE t"'
block 'podman exec db psql -c "DROP TABLE x"'
block 'kubectl exec db -- psql -c "DROP TABLE x"'
block 'wp db drop --yes'
block 'podman system prune -af'
block 'yarn publish'
block 'bun publish'
block 'zsh -c "git reset --hard"'
block 'dash -c "git reset --hard"'
block 'time git reset --hard'
block 'exec git reset --hard'
block 'command git reset --hard'
block 'nohup git reset --hard'
block 'bunx -p x git reset --hard'
block 'pnpm exec git reset --hard'
block 'yarn dlx git reset --hard'
block 'bun x git reset --hard'
block 'chmod 0002 shared'

echo "== round 3 (scoped, after the final reviewers)"
# Regression from round 2: an option's VALUE was read as a flag cluster.
allow 'git commit -m "Title" -m "- Add new feature"'
allow 'git commit -m "- fix n+1 query"'
allow 'git commit --message "- new thing"'
allow 'git commit -am "- n"'
allow "git commit -m '-n is now supported'"
allow 'git commit -F - --author "Dev <dev@example.com>"'
allow 'git push -o ci.skip origin feat/x'
allow 'git clean -n -e -fdx'
# git's real minimum prefixes (checked against git 2.55).
block 'git reset --h'
block 'git clean --f'
block 'git push --m origin'
block 'git restore --staged --w .'
# Options between -c and the script; eval --.
block 'bash -c -- "git reset --hard"'
block 'bash -c -x "git reset --hard"'
block 'sh -c -e "git reset --hard"'
block 'docker exec db sh -c -e "git reset --hard"'
# Shell options before -c inside exec, as at the top level.
block 'docker exec db bash -x -c "git reset --hard"'
block 'kubectl exec pod -- sh -e -c "git reset --hard"'
block "docker exec db bash -o pipefail -c \"psql -c 'DROP TABLE x'\""
block 'docker exec db bash -eo pipefail -c "git reset --hard"'
block 'docker exec db sh -euxo pipefail -c "git reset --hard"'
block 'docker exec db bash -xO extglob -c "git reset --hard"'
block 'docker exec db bash --rcfile /dev/null -c "git reset --hard"'
block 'docker exec db bash --init-file x -c "git reset --hard"'
block 'docker exec db bash --norc -c "git reset --hard"'
block "docker run --name bash -c 256 alpine bash -c 'git reset --hard'"
block "docker run -c 256 --entrypoint sh alpine -c 'git reset --hard'"
block "docker exec db sh -c 'echo ok' && docker exec db bash -c 'git reset --hard'"
allow 'docker run -c 256 --entrypoint sh alpine -c "ls -la"'
allow "kubectl exec pod -c app -- sh -c 'ls -la'"
# Only the SQL client sits inside the nested string; the DROP is outside it. A 0.12.2 draft's
# early exit in check_string let all of these through.
block "echo 'DROP TABLE users;' | bash -c 'psql mydb'"
block "echo 'DROP TABLE users;' | sh -c psql"
block "echo 'DROP TABLE users;' | eval psql mydb"
block "echo 'truncate users' | env -S 'mysql app'"
block "echo 'drop table users' | su postgres -c 'psql app'"
block "echo 'drop table users' | eval kubectl exec pg -- psql app"
allow 'docker exec db bash -o pipefail script.sh -c x'
allow 'docker exec db bash -x deploy.sh'
block 'su -c -- "git reset --hard"'
block 'eval -- "git reset --hard"'
# Arithmetic << is a shift, not a heredoc; a leading here-string is a redirection.
expect 2 'block: $((1<<2)) then a destructive line' "$(printf 'echo $((1<<2))\ngit reset --hard')"
expect 2 'block: (( x = 1<<3 )) then a destructive line' "$(printf '(( x = 1<<3 ))\ngit reset --hard')"
block '<<< x git reset --hard'
block '>|out.log git reset --hard'
# Control bytes in the input cannot split or hide words.
expect 2 'block: \037 inside a word' "$(printf 'git -c core.pager=cat\037 reset --hard')"
expect 2 'block: \036 then a comment' "$(printf 'true x\036# ; git reset --hard')"
# Cheap tail items.
block 'git --config-env a.b=HOME reset --hard'
block 'git --attr-source HEAD reset --hard'
block 'supabase db reset --linked=true'
block 'psql -c "DROP/**/TABLE users"'
block "bun exec 'git reset --hard'"
block 'yes | git checkout -p .'
block 'npm run -s publish --tag x && npm publish'
allow 'npm run -s publish'
allow 'npm run --silent publish'
allow 'npm publish --dry-run=true'
allow 'chmod 644 2'
allow 'docker logs mysql 2>&1 | tail; truncate -s 0 app.log'
block 'docker exec -i mysql mysql -e "DROP TABLE t"'

echo "== round 3 review: regressions in round 3's own code"
# The canonical Claude Code commit idiom: a heredoc inside $( ). An apostrophe in the body must not
# swallow the rest of the call.
expect 2 'block: commit heredoc in $( ) with an apostrophe, then git push --force' "git commit -m \"\$(cat <<'EOF'
fix: don't drop the cache
EOF
)\" && git push --force origin main"
expect 2 'block: x=$(cat <<EOF) with an apostrophe, then git push -f' "$(printf "x=\$(cat <<EOF\nit's\nEOF\n)\ngit push -f")"
expect 2 'block: commit heredoc with an unbalanced ( then git reset --hard' "git commit -m \"\$(cat <<'EOF'
wip (part 1
EOF
)\"
git reset --hard HEAD~1"
expect 0 'allow: commit heredoc in $( ) with an apostrophe' "git commit -m \"\$(cat <<'EOF'
fix: don't drop the cache
EOF
)\""
block 'git commit -S --no-verify -m x'
block 'git commit -u --no-verify -m x'
block 'git commit -u -n -m x'
block 'git commit -S -nm x'
allow 'git commit -S -m "signed"'
expect 0 'allow: (( opening nested subshells, then a heredoc mentioning reset --hard' "$(printf '((cd a && make) || echo fail)\ncat > NOTES.md <<EOF\ngit reset --hard is forbidden\nEOF')"
expect 2 'block: (( nested subshells, heredoc with apostrophe, then git push --force' "$(printf "((cd a && make) || true)\ncat <<EOF\ndon't\nEOF\ngit push --force")"
block "bash -c -o pipefail 'git reset --hard'"
block "bash -O extglob -c 'git reset --hard'"
allow 'docker run -e MYSQL_ROOT_PASSWORD=x -d mysql; echo "truncate log"'
allow 'docker run --name mysql -d mysql:8 && echo "DROP TABLE is bad"'
block 'docker run --rm postgres psql -h db -c "DROP TABLE x"'
block 'kubectl exec -n prod db-0 -c pg -- psql -c "DROP TABLE x"'
allow 'mysql -e "select truncate(1.234, 1)"'

echo "== follow-up on main: the last review's open findings"
expect 2 'block: heredoc closed by EOF) inside $( ), then git push --force' "$(printf 'git commit -m "$(cat <<EOF\nmsg\nEOF)" && git push --force')"
expect 2 'block: x=$(cat <<EOF ... EOF) then git reset --hard' "$(printf 'x=$(cat <<EOF\nhi\nEOF)\ngit reset --hard')"
expect 0 'allow: heredoc closed by EOF) inside $( )' "$(printf 'git commit -m "$(cat <<EOF\nmsg\nEOF)"')"
expect 2 'block: $[1<<2] then a destructive line' "$(printf 'echo $[1<<2]\ngit reset --hard')"
expect 2 'block: ${x:-<<EOF} then a destructive line' "$(printf 'echo ${x:-<<EOF}\ngit reset --hard')"
block 'git push -- origin +main'
block 'git push origin -- +main'
block 'git am --no-v'
block 'git commit --no-verif -m x'
block 'podman exec -l psql -c "DROP TABLE x"'
allow 'docker run -l app=web -d mysql'

echo "== two-reviewer gate on the main port"
# A quoted } inside ${ } must not end it (the JSON-default idiom).
expect 2 'block: ${BODY:-'"'"'{}'"'"'} then git push --force' "$(printf "BODY=\${BODY:-'{}'}\ngit push --force origin main")"
expect 2 'block: ${BODY:-"{}"} then git reset --hard' "$(printf 'BODY=${BODY:-"{}"}\ngit reset --hard')"
block 'echo ${x:-"}"}; git reset --hard'
block "echo \${x:-'}'}; git reset --hard"
allow "BODY=\${BODY:-'{}'}"
allow 'echo "${x:-$(date)}"'
# -u and -S take only an ATTACHED value: the letters after them are that value, not flags.
allow 'git commit -uno -m x'
allow 'git commit -unormal -m x'
allow 'git commit -Snm x'
allow 'git commit -Sjohn@x.com -m x'
block 'git commit -S -nm x'
# zsh does not end a heredoc at EOF); a later exact EOF line means zsh reads on. Block if either reading blocks.
expect 2 'block: EOF) body line under the zsh reading, then git reset --hard' "$(printf 'git commit -m "$(cat <<'"'"'EOF'"'"'\nEOF)" note don'"'"'t\nEOF\n)" && git reset --hard')"
block "bash -co pipefail 'git reset --hard'"
block "bash -ceo pipefail 'git reset --hard'"
allow 'git grep -n -e "--no-verify"'
allow 'git grep -e --no-verify -- docs'
allow 'git log -S "--no-verify"'
allow 'git log --grep "--no-verify"'
block 'xargs git commit --no-verify -m x'
block 'xargs GIT commit --no-verify -m x'
block 'xargs /usr/bin/Git commit --no-verify -m x'
block 'find . -name x -exec git commit --no-verify -m x \;'
block 'docker run --rm --entrypoint sh alpine -c "git reset --hard"'
allow 'docker run --restart always -d mysql && echo "DROP TABLE is bad"'
block 'rm --recur -f ~'
allow 'npm run -w pkg publish'
allow 'npm run --workspace pkg publish'
block 'x+=1 git reset --hard'

echo "== large commands stay fast (a quadratic substitution once made 41 KB take 164 s)"
BIG="git add"; for k in $(seq 1 1600); do BIG="$BIG src/components/feature-$k/index.ts"; done
BIGP=$(payload "$BIG && psql -c 'select 1'")
TIMEFORMAT=%R
bsecs=$( { time (printf '%s' "$BIGP" | "$BASH_BIN" "$GATE" >/dev/null 2>&1) ; } 2>&1 )
bms=$(awk -v s="$bsecs" 'BEGIN { printf "%d", s * 1000 }')
if [ "$bms" -lt $((2000 * TS)) ]; then pass=$((pass + 1)); echo "PASS  ${#BIG}-byte command in ${bms} ms (limit $((2000 * TS)) ms)"
else fail=$((fail + 1)); echo "FAIL  ${#BIG}-byte command took ${bms} ms (limit $((2000 * TS)) ms)"; fi
# Shapes the first timing case missed: many SQL-client segments, many capitalised commands.
# Linear code does 2000 in a few seconds; the quadratic versions took ~13-27 s.
# execopt is ONE exec segment, `docker exec db bash -o bash -o …`: every shell word is also an
# option value, which made the exec shell scan quadratic (47 s) in a 0.12.2 draft. execc and
# entryc repeat `-c 1` (docker's CPU-shares form, which the scan skips) 2000 times in one
# segment: a word-array copy per -c made that quadratic (41-51 s) in another draft. execrm
# repeats a real script: only the first is tokenized (checking every one took 76 s).
for shape in sql upper execopt execc entryc execrm; do
    case "$shape" in execopt|execc|execrm) BIG="docker exec db" ;; entryc) BIG="docker run --entrypoint sh img" ;; *) BIG="" ;; esac
    for k in $(seq 1 2000); do
        case "$shape" in sql) BIG="$BIG psql -c \"select $k\";" ;; upper) BIG="$BIG NODE_ENV=test Rscript run$k.R && GIT Status;" ;;
            execopt) BIG="$BIG bash -o" ;; execc) BIG="$BIG bash -c 1" ;; entryc) BIG="$BIG -c 1" ;; execrm) BIG="$BIG bash -c 'echo rm'" ;; esac
    done
    BIGP=$(payload "$BIG")
    bsecs=$( { time (printf '%s' "$BIGP" | "$BASH_BIN" "$GATE" >/dev/null 2>&1) ; } 2>&1 )
    bms=$(awk -v s="$bsecs" 'BEGIN { printf "%d", s * 1000 }')
    if [ "$bms" -lt $((8000 * TS)) ]; then pass=$((pass + 1)); echo "PASS  2000 $shape segments (${#BIG} bytes) in ${bms} ms (limit $((8000 * TS)) ms)"
    else fail=$((fail + 1)); echo "FAIL  2000 $shape segments (${#BIG} bytes) took ${bms} ms (limit $((8000 * TS)) ms)"; fi
done

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

echo "== prose copies mirror the gate (STANDARD.md one-owner exception)"
# Desktop reads security-hardening and the web reads the repo's AGENTS.md; neither loads this hook.
# A rule the gate blocks but a copy omits is a rule those surfaces silently lose.
# One entry per BLOCKS line in the hook header; add a row here when the header gains one.
RULES=('`rm -r`' 'rm -rf' '`$HOME`' '`..`' '`/*`' '`.*`' 'git push --force' '+branch' '--force-with-lease' '--mirror' '--prune' 'git reset --hard' 'git checkout .'
    'git restore .' 'git clean -f' '--no-verify' 'git commit -n' 'DROP TABLE' 'DROP DATABASE'
    'DROP SCHEMA' 'TRUNCATE' 'wp db drop' 'wp db reset' 'docker system prune' 'docker volume prune'
    'podman' 'chmod 777' 'world-writable' 'a+rwx' 'o+w' 'pnpm' 'publish' 'supabase db reset'
    'CKLPH_ALLOW_DESTRUCTIVE=1' 'sudo' 'bash -c')
if [ -n "${MIRROR_DOCS:-}" ]; then IFS=: read -r -a docs <<< "$MIRROR_DOCS"   # colon-separated override
else docs=("$REPO_ROOT/plugins/cklph-os/skills/security-hardening/SKILL.md" "$REPO_ROOT/templates/AGENTS.md"); fi
for d in "${docs[@]}"; do
    if [ ! -f "$d" ]; then fail=$((fail + 1)); echo "FAIL  mirror doc not found: $d"; continue; fi
    missing=""
    for r in "${RULES[@]}"; do grep -qF -- "$r" "$d" || missing="$missing [$r]"; done
    if [ -z "$missing" ]; then pass=$((pass + 1)); echo "PASS  ${d#"$REPO_ROOT"/} lists every gate rule"
    else fail=$((fail + 1)); echo "FAIL  ${d#"$REPO_ROOT"/} is missing:$missing"; fi
done

echo "== timing"
P=$(payload 'git commit -m "feat: thing" && git push -u origin feat/x')
TIMEFORMAT=%R
secs=$( { time (for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do printf '%s' "$P" | "$BASH_BIN" "$GATE" >/dev/null 2>&1; done) ; } 2>&1 )
ms=$(awk -v s="$secs" 'BEGIN { printf "%d", s * 1000 / 20 }')
if [ "$ms" -lt $((100 * TS)) ]; then pass=$((pass + 1)); echo "PASS  average ${ms} ms per call (limit $((100 * TS)) ms)"
else fail=$((fail + 1)); echo "FAIL  average ${ms} ms per call (limit $((100 * TS)) ms)"; fi

echo "--- destructive-command-gate: $pass passed, $fail failed ($("$BASH_BIN" --version | head -1))"
[ "$fail" -eq 0 ]
