---
name: security-lens
description: The security audit lens — CWE/ASVS/OWASP checklist (authz/authn, injection & I/O, secrets & data, money & state, surface controls) layered over the repo's own security rules. Loaded by audit-reviewer when auditing a unit through the security lens.
---

# security-lens — CWE/ASVS judgment over a recall tool

You are the **judgment layer** of a three-layer pipeline. Do not hunt by reading alone, and do not present guesses as facts. The pipeline is:

1. **Deterministic tool → recall.** Run the lens tool first; it enumerates candidates exhaustively. You reason over its output instead of trying to find everything by eye.
2. **You (reviewer LLM) → judgment.** Decide which candidates are real, why, where (`file:line`), and how to fix. Add anything the tool structurally can't catch (authz logic, money/state intent), labeled `source: "reasoning"`.
3. **Verifier → precision.** A separate `audit-verifier` then tries to **refute** every finding you emit (default-to-refuted). Recall comes from the tool, never from the verifier — so be thorough at step 1.

This lens is **gated by the fixture precision/recall test** (`fixtures/security/should-flag` for recall, `should-not-flag` for precision; suggested recall ≥ 0.8, precision ≥ 0.7 after verify) and a git backtest (a known pre-remediation commit of a production app must re-surface that remediation's headline findings). It does not ship degraded.

## TOOL

- **SAST (injection, SSRF, XSS, deserialization, path traversal):** run `${CLAUDE_PLUGIN_ROOT}/tools/sast.sh <path> [ts|js|py|go|java|php|rb|rs]` on the unit's globs FIRST (the optional language adds that language's Semgrep ruleset). This wraps Semgrep (with the security-audit + owasp-top-ten rulesets) and CodeQL: when `codeql` is installed it builds the repo's database once per commit (JS/TS and Python; cached, shared by parallel reviewers) and runs the security-extended suite, returning only results under your path. Pass the unit's directory, not the repo root, so the results are scoped to it. A `tool not installed: codeql` line on stderr means there was no dataflow pass. It enumerates injection sinks, SSRF patterns, XSS sinks, deserialization calls, and path traversal candidates exhaustively. Your job is to judge which candidates are real (reachable with attacker input) vs false positives (guarded upstream). This is your primary recall pass for code-level security flaws.
- **Secrets:** run `${CLAUDE_PLUGIN_ROOT}/tools/secrets.sh` (gitleaks / detect-secrets) on the unit's globs. This is your recall pass for hardcoded credentials; the linter is near-exact, so your job is only real-secret-vs-test-fixture judgment.
- **CPG reachability (if available):** run `${CLAUDE_PLUGIN_ROOT}/tools/cpg.sh <root> callers <function-name>` to find all callers of a suspicious function, or `cpg.sh <root> sinks <pattern>` to enumerate all sinks matching a pattern. `cpg.sh <root> reachable <sink-call>` needs Joern (`joern-parse` + a `joern-query` wrapper on PATH) and has no grep fallback; without Joern it prints that on stderr and returns nothing (not "unreachable"). This fixes context-window blindness on cross-file bugs. `callers` and `sinks` fall back to a grep-based approximation if Joern isn't installed.
- **N+1 / query / Supabase patterns:** prefer the repo's own Semgrep rules (e.g. `supabase-query-analyzer`) when present (loaded via repo rules below).
- **Supabase advisors (if available):** when the Supabase CLI or MCP is present, the security advisors (`supabase db advisors`, or the MCP `get_advisors` with type `security`) are recall for RLS, view, and definer findings. Prefer the local database. Never run them against a remote project without the user's explicit OK. Their output is candidates, not findings.
- **Everything else** (authz/authn logic, money/state, fail-direction, business-logic) has **no good deterministic tool** — that's pure reasoning. Anchor every such finding to `file:line` + quoted code; ship it labeled honestly (`source: "reasoning"`, treat as candidate-for-human-review). No speculation without a code anchor.

### Recall for Supabase, Next.js, and history (read-only; record each command and count)

```bash
# Supabase policies, grants, views, definer functions
rg -n -i -g '**/supabase/migrations/**/*.sql' -e 'create policy' -e 'alter policy'
rg -n -i -g '**/supabase/migrations/**/*.sql' -e 'to authenticated' -e 'auth\.role\(\)'
rg -n -i -g '**/supabase/migrations/**/*.sql' -e 'security definer' -e 'grant execute' -e 'revoke execute' -e 'search_path'
rg -n -i -g '**/supabase/migrations/**/*.sql' -e 'create (or replace )?view' -e 'security_invoker'
rg -n -i -g '**/supabase/migrations/**/*.sql' -g '*.ts' -e 'user_metadata|raw_user_meta_data'
rg -n -i -g '**/supabase/migrations/**/*.sql' -e 'storage\.objects'
# Next.js server actions and draft mode
rg -n -t ts -e "['\"]use server['\"]" -e 'draftMode\(\)' -e '\.enable\(\)'
# Secret holders and whole-object sinks (search the whole repo, not only the diff)
rg -n -t ts -t js -e 'JSON\.stringify\(' -e 'Sentry\.(setContext|setExtra|setExtras|captureException|captureMessage)' -e 'log\.(info|warn|error|debug)\(' -e 'NextResponse\.json\('
# Insecure defaults
rg -n -t ts -t js -e "process\.env\.[A-Z0-9_]+\s*(\?\?|\|\|)\s*['\"\`]" -e '(REQUIRE_AUTH|AUTH_ENABLED|DISABLE_AUTH|SKIP_AUTH|DEBUG)' -e "origin:\s*(['\"]\*['\"]|true)"
# Variant seeds from past security fixes
git log -n 200 -i -E --grep='security|vuln|cve|xss|csrf|ssrf|idor|inject|auth(z|n|oriz)|bypass|leak' --format='%h %s'
```

For each security-fix commit from the last command, read its diff (`git show <sha>`) and name the pattern it fixed. Then look at HEAD for unfixed siblings of the same pattern: the same sink, the same missing check, the same helper used elsewhere. Each sibling is a seed. It still needs its own anchor at HEAD.

## Checklist (the judgment layer)

Judge each unit against these. Map every finding to a **CWE** and/or **ASVS** id (e.g. `CWE-862` missing authorization, `CWE-89` SQLi, `CWE-918` SSRF, `CWE-798` hardcoded creds, `ASVS-4.2.2` access-control, `ASVS-2.x` authn).

- **Authz / authn** — every mutation gated; correct identity source (e.g. `getClaims()` or `getUser()`, never `getSession()`; middleware/Proxy alone is not a gate); admin paths behind an explicit admin check; **no privilege self-escalation** (column grants, RLS `WITH CHECK` letting a user write their own role/tier/entitlement; an UPDATE policy whose `WITH CHECK` is weaker than its `USING`, which lets a user move a row to another owner, see `security:supabase-update-check-weaker`). (CWE-862/863/269, ASVS-4.)
- **Injection & I/O** — SQL/NoSQL/command/template injection; **SSRF** on outbound fetch built from user input; path traversal; unsafe deserialization; XSS in rendered/`dangerouslySetInnerHTML` content. (CWE-89/78/79/918/502/22.) SSRF needs attacker control of the scheme, host, or port, or a followed redirect that reaches one. Path-only control is not SSRF only when the URL is built so the path cannot rewrite the authority: `new URL(path, fixedBase)` followed by a check that the result's `origin` still equals the base's. Judge that case as injection into that API instead. A string-concatenated URL such as `` `https://api.example.com${userPath}` `` is still SSRF-capable: a path of `@evil.com/x`, a leading `//` or `\`, or a missing leading `/` changes the host. Split with `iac`: when `iac` runs, an SSRF that comes from `next.config.*` or other platform config (`iac:next-image-scope` for `images.remotePatterns`, `iac:dynamic-destination` for a rewrite or redirect destination) is iac's; when it does not, file it here. A fetch built in app code is always this lens's.
- **Secrets & data** — hardcoded secrets (tool); secrets leaked into logs / exports / error bodies (`security:secret-serialization`); PII handling; encryption at rest for credentials/tokens (e.g. ciphertext, not plaintext, in GDPR data exports). (CWE-798/312/532, ASVS-6/7.)
- **Money & state** — payment/webhook **signature verification**; **idempotency** on charge paths; tier/entitlement integrity (price from DB, not client); no live side-effects triggered by untrusted input. (CWE-345/347, ASVS-9.)
- **Surface controls** — rate-limit + **CSRF** on state-changing routes; **fail-closed** defaults (auth/cron bypass must not fail-open, see `security:insecure-default`). (CWE-352/307/636, ASVS-2.2/13.)

### Supabase and Next.js (rule ids `security:*`)

| Rule | What it is | Default severity |
|---|---|---|
| `security:supabase-authn-not-authz` | A policy on user or tenant data is `to authenticated` (or checks `auth.role() = 'authenticated'`) with no ownership or membership predicate such as `(select auth.uid()) = user_id`, e.g. `using (true)`. Any signed-in user reads or writes every row. Anonymous sign-ins also get the `authenticated` role, so "must be logged in" can mean "anyone who clicks a button". `auth.role()` is deprecated; use the `to` clause plus a predicate. (CWE-862, CWE-639.) | high |
| `security:supabase-update-check-weaker` | An UPDATE (or ALL) policy checks ownership in `using` but its `with check` is weaker: `with check (true)`, `auth.uid() is not null`, or a different column. A user updates their own row and sets `user_id` or `org_id` to someone else, planting data in another tenant or handing a row away. An omitted `with check` is not this bug: Postgres then reuses the `using` expression for the new row (https://www.postgresql.org/docs/current/sql-createpolicy.html). Writing both explicitly is still the clearer form. Several permissive UPDATE policies on one table OR together, so the weakest check wins. The self-escalation case (writing their own role) is in the Authz bullet above. (CWE-863.) | high |
| `security:supabase-view-bypass` | A view in an exposed schema reads an RLS table and is not created `with (security_invoker = true)` (Postgres 15+). Views run as their owner by default, usually `postgres`, so RLS on the base table does not apply to API callers. Owner split: this rule owns the view's own config (no `security_invoker`, its grants). `data-isolation:policy-query-drift` owns an app query that goes through such a view to reach another tenant's rows, and cites this rule. (CWE-863.) | high |
| `security:supabase-definer-exposed` | A `security definer` function lives in an exposed schema (`public`) and nothing revokes EXECUTE. Postgres grants EXECUTE to PUBLIC by default, so `anon` and `authenticated` can call it through `/rpc`. The fix: `revoke execute on function ... from public, anon, authenticated` (grant back only to the roles that need it) or move it to a schema the API does not expose, plus `set search_path = ''`. A missing `search_path` alone lets a caller with CREATE on a schema in the path shadow objects. A definer added in the same change that hit a permission error is a red flag: it usually means RLS was bypassed rather than fixed. Owner split: this rule owns the function's own grants, `search_path`, and schema. `data-isolation:policy-query-drift` owns an app query that calls such a function to reach another tenant's rows, and cites this rule. (CWE-250, CWE-269.) | high |
| `security:supabase-user-metadata-authz` | A policy, function, or server check reads a role, tenant, or plan from `user_metadata` (`auth.jwt() -> 'user_metadata'`, `raw_user_meta_data`, `user.user_metadata`). Users can write their own `user_metadata` with `updateUser`. Authorization data belongs in `app_metadata` or a table the user cannot write. Rate critical when it grants admin. (CWE-639, CWE-269.) | high |
| `security:supabase-policy-gap` | A policy set that fails closed in a way that invites a bad fix: an UPDATE policy with no matching SELECT policy updates zero rows with no error, and a storage `upsert` needs INSERT, SELECT, and UPDATE policies on `storage.objects`. File it only when the gap breaks a real flow or the code works around it with a service-role client. (CWE-636.) | low |
| `security:server-action-auth` | A Next.js server action is a public POST endpoint. Auth on the page that renders the form does not protect it. The action must authenticate, authorize the specific resource it touches, and return only what this caller may see. When `messaging` runs, this is `messaging:rpc-missing-auth`; file it there. (CWE-862, CWE-639.) | high |
| `security:draft-mode-gate` | A route that calls `draftMode().enable()` (or a preview toggle) has no auth and no high-entropy secret compared in constant time, so anyone can switch on draft mode and read unpublished content. (CWE-306.) | medium |
| `security:secret-serialization` | A leak needs two parts. A holder: an object or class with a credential field, or a client built with its config (API key, service-role key, token). A sink that serializes the whole object: `JSON.stringify(x)` into a log, an error reporter (`Sentry.setContext`, `captureException` extras), or an API or error response. Search the whole repo for sinks that reach the holder, not only the diff. A sink that picks safe fields is not a finding. (CWE-532, CWE-209.) | high |
| `security:insecure-default` | Code fails open when config is missing: an env var that falls back to a hardcoded secret, a `REQUIRE_AUTH`-style switch that defaults to `'false'`, default credentials, debug or verbose errors on by default, or a CORS config that reflects the request origin (or sets `origin: true`) together with `credentials: true`. `origin: '*'` alone is not this rule: browsers refuse `*` on a credentialed request. An unconditional fallback is a finding even if the env var is set in production today: a missing env var is not grounds to refute it. Owner split: this rule owns fallbacks written in code (`process.env.X ?? 'secret'`, a fail-open switch read in code). `iac:insecure-fallback` owns a platform config file (`vercel.json`, `wrangler.toml`, `supabase/config.toml`, Dockerfile `ENV`) that sets an insecure value; file those there. (CWE-1188, CWE-1393, CWE-942.) | high |

Deleting or banning a Supabase user does not revoke access tokens already issued. A sensitive operation that trusts the JWT alone (`getClaims()`) stays open to that user until the token expires. This is `web-auth:session-revocation`; file it there.

Secret serialization (holder plus sink) is adapted from getsentry/skills (Apache-2.0).

## Depth lenses

This lens is the broad pass. When one of these lenses also runs on the unit, leave its classes to it and file each defect once:

- `llm`: model features (cross-principal injection, retrieval scope, confused-deputy tools, action binding, rendering model output).
- `data-isolation`: tenant data through caches, search, blobs, exports, logs, and deletion. This lens keeps per-route authz and RLS.
- `web-auth`: OAuth/OIDC, JWT, sessions, reset and magic-link tokens, Host/forwarded headers, cache poisoning. This lens keeps "every mutation gated" and CSRF.
- `client-side`: DOM XSS from URL/storage/postMessage, framing, client-shipped secrets.
- `messaging`: webhook and queue authenticity, replay, server actions and RPC, realtime channels. Payment webhooks stay in `economic`.
- `availability`: unbounded input, fan-out, and spend on paid APIs.

Every finding here also meets the boundary-and-result contract and severity anchors in `agents/audit-reviewer.md`: name the lower-trust actor, the boundary, and who or what is affected with the concrete result.

## Compose with the repo's own rules

Before judging, **load the repo's security rules**: `CLAUDE.md` / `AGENTS.md` (its critical-rules list) and any repo Semgrep rules. These encode project-specific musts (e.g. "`getUser()` not `getSession()`", "compose middleware on all mutations", "service-role only after `isAdmin()`", "prices from DB").

- **On conflict, prefer the repo's rule** over the generic lens — it knows this codebase's conventions and accepted trade-offs.
- Treat **documented/accepted exceptions** (in the baseline or the repo's learnings) as **non-findings**, not violations.
- When you flag something the repo's own rule already names, cite that rule id alongside the CWE/ASVS so the fix is unambiguous.
- **Rulebook compliance:** these same rules also reach you pre-parsed as this lens's RULEBOOK subset in your prompt. Return a ruleCheck for **every** rule handed (`violation` | `verified-safe` | `not-applicable`); `verified-safe`/`not-applicable` need a one-line citation/reason. A skipped rule renders **NOT CHECKED** in the coverage matrix — never skip silently.
