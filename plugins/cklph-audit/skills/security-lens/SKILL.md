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

- **SAST (injection, SSRF, XSS, deserialization, path traversal):** run `${CLAUDE_PLUGIN_ROOT}/tools/sast.sh <path> [ts|js|py|go|java|php|rb|rs]` on the unit's globs FIRST (the optional language adds that language's Semgrep ruleset). This wraps Semgrep (with the security-audit + owasp-top-ten rulesets) and optionally CodeQL. It enumerates injection sinks, SSRF patterns, XSS sinks, deserialization calls, and path traversal candidates exhaustively. Your job is to judge which candidates are real (reachable with attacker input) vs false positives (guarded upstream). This is your primary recall pass for code-level security flaws.
- **Secrets:** run `${CLAUDE_PLUGIN_ROOT}/tools/secrets.sh` (gitleaks / detect-secrets) on the unit's globs. This is your recall pass for hardcoded credentials; the linter is near-exact, so your job is only real-secret-vs-test-fixture judgment.
- **CPG reachability (if available):** run `${CLAUDE_PLUGIN_ROOT}/tools/cpg.sh <root> callers <function-name>` to find all callers of a suspicious function, or `cpg.sh <root> sinks <pattern>` to enumerate all sinks matching a pattern. `cpg.sh <root> reachable <sink-call>` needs Joern (`joern-parse` + a `joern-query` wrapper on PATH) and has no grep fallback; without Joern it prints that on stderr and returns nothing. This fixes context-window blindness on cross-file bugs. Falls back to grep-based approximation if Joern isn't installed.
- **N+1 / query / Supabase patterns:** prefer the repo's own Semgrep rules (e.g. `supabase-query-analyzer`) when present (loaded via repo rules below).
- **Everything else** (authz/authn logic, money/state, fail-direction, business-logic) has **no good deterministic tool** — that's pure reasoning. Anchor every such finding to `file:line` + quoted code; ship it labeled honestly (`source: "reasoning"`, treat as candidate-for-human-review). No speculation without a code anchor.

## Checklist (the judgment layer)

Judge each unit against these. Map every finding to a **CWE** and/or **ASVS** id (e.g. `CWE-862` missing authorization, `CWE-89` SQLi, `CWE-918` SSRF, `CWE-798` hardcoded creds, `ASVS-4.2.2` access-control, `ASVS-2.x` authn).

- **Authz / authn** — every mutation gated; correct identity source (e.g. `getUser()`, never `getSession()`); admin paths behind an explicit admin check; **no privilege self-escalation** (column grants, RLS `WITH CHECK` letting a user write their own role/tier/entitlement). (CWE-862/863/269, ASVS-4.)
- **Injection & I/O** — SQL/NoSQL/command/template injection; **SSRF** on outbound fetch built from user input; path traversal; unsafe deserialization; XSS in rendered/`dangerouslySetInnerHTML` content. (CWE-89/78/79/918/502/22.)
- **Secrets & data** — hardcoded secrets (tool); secrets leaked into logs / exports / error bodies; PII handling; encryption at rest for credentials/tokens (e.g. ciphertext, not plaintext, in GDPR data exports). (CWE-798/312/532, ASVS-6/7.)
- **Money & state** — payment/webhook **signature verification**; **idempotency** on charge paths; tier/entitlement integrity (price from DB, not client); no live side-effects triggered by untrusted input. (CWE-345/347, ASVS-9.)
- **Surface controls** — rate-limit + **CSRF** on state-changing routes; **fail-closed** defaults (auth/cron bypass must not fail-open). (CWE-352/307/636, ASVS-2.2/13.)

## Compose with the repo's own rules

Before judging, **load the repo's security rules**: `CLAUDE.md` / `AGENTS.md` (its critical-rules list) and any repo Semgrep rules. These encode project-specific musts (e.g. "`getUser()` not `getSession()`", "compose middleware on all mutations", "service-role only after `isAdmin()`", "prices from DB").

- **On conflict, prefer the repo's rule** over the generic lens — it knows this codebase's conventions and accepted trade-offs.
- Treat **documented/accepted exceptions** (in the baseline or the repo's learnings) as **non-findings**, not violations.
- When you flag something the repo's own rule already names, cite that rule id alongside the CWE/ASVS so the fix is unambiguous.
- **Rulebook compliance:** these same rules also reach you pre-parsed as this lens's RULEBOOK subset in your prompt. Return a ruleCheck for **every** rule handed (`violation` | `verified-safe` | `not-applicable`); `verified-safe`/`not-applicable` need a one-line citation/reason. A skipped rule renders **NOT CHECKED** in the coverage matrix — never skip silently.
