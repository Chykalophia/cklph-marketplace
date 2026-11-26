---
name: fallback-lens
description: The fallback audit lens (opt-in): failures turned into plausible results. Per catch, promise .catch and default laid over an awaited call, decide whether the failure stays visible to a caller, a log, a test or the user, and report the ones that hide it, layered over the repo's own rules. The partner to omission-lens. Loaded by audit-reviewer when auditing a unit through the fallback lens.
---

# fallback-lens: guards that hide failures

`omission-lens` asks which guard is missing. Run alone, it pushes a codebase toward more guards,
and an agent's favourite guard is a fallback: catch, log, return `[]`. This lens asks the opposite
question: which guard turns a broken path into a result that looks fine? An empty list, a zero
total, `false` from a check, a "saved" state over a failed write. Nobody fixes what nobody sees.

The pipeline is the same three layers as every lens:

1. **Deterministic tool, for recall.** Run the tool first. It lists every site where a failure can
   become a default.
2. **You, for judgment.** For each site, decide whether the failure stays visible and whether the
   default is a requirement or a hiding place. Add what the tool can't see (a status set to
   `done` after a failed step, a retry loop that ends in "success"), labeled `source: "reasoning"`.
3. **Verifier, for precision.** `audit-verifier` tries to refute every finding: it hunts the
   caller that checks the result, the test that pins the failure, the comment or spec that asks for
   the default. Only claim a hidden failure you looked for and didn't find made visible.

This lens is **opt-in**: it runs only when `fallback` is in the run's `lenses`. Like every lens it
is held to the fixture gate before you trust it (`fixtures/fallback/should-flag` for recall,
`should-not-flag` for the visible look-alikes). Run it with `omission` so the two pull against each
other.

## TOOL

Run `${CLAUDE_PLUGIN_ROOT}/tools/fallbacks.sh <root> [glob...]` on the unit's globs. It strips
comments, reads JS/TS and Python, skips tests and scripts unless a glob names them, and prints
`[{ file, line, kind, signal }]`:

- `catch-default`: a catch whose last word is a default (`return []`, `null`, `false`, `None`).
- `catch-log-continue`: a catch that logs and carries on, with no rethrow and no failure returned.
- `swallowed`: an empty catch, or `except: pass`.
- `promise-default`: `.catch(() => null)`, `.catch(() => [])`, `.catch(() => {})`.
- `default-over-failure`: `(await x()) ?? []`, a default laid on the awaited call itself.

A catch that rethrows, returns `failure(...)`, sends a 4xx or 5xx, calls `setError` or a toast, or
throws a new error is not listed. Body parsing (`res.json().catch(...)`) is not listed, since it is
normally validated next. More than 500 sites is cut and says so on stderr (`FALLBACKS_MAX`).

The `kind` is the site class, not the verdict. Most sites are fine. On one real Next.js app the tool
listed about 420 production sites; most were best effort on purpose (a cache delete, a logout ping),
and the few that mattered sat on auth and data paths. Read those first.

## Checklist (the judgment layer)

For each site, ask in order. Rule id is `fallback:<kind>`.

1. **Who would notice?** Follow the default to its caller. If the caller can tell the fallback from
   a real answer (a `Result`, a status field, an `error` alongside the data), the failure is visible:
   not a finding.
2. **Is the default a requirement?** A spec, a comment that names the reason, a product rule ("a
   failed avatar load shows initials"), or best-effort work whose loss is harmless (analytics, cache
   warm, a logout ping). Then it isn't a finding. Cite where the requirement lives.
3. **What does it hide, on which path?** A fail-open on auth, MFA, permission or rate-limit checks,
   a money path (a total, a charge state), a data write that reports success, or a security check
   that stops applying (a password-reuse check returning "not reused" when the lookup fails). These
   are the findings.
4. **Is anything logged?** A default with no log is worse than one with a log: the failure is
   invisible to the user and to the operator. Say which.
5. **Closed justification loop.** A fallback plus a test written only to exercise that fallback
   justify nothing on their own. Trace the pair to a requirement or a caller, or report both.

**Severity by real impact.** A silent fail-open on an auth or permission check is `high` (critical
when an attacker can trigger the failure). A charge or a write reported as succeeded when it failed
is `high`. A wrong-but-empty list in an admin view is `low`. A best-effort cache or analytics
fallback is not a finding. Classify context (surface, runtime, gated) before severity, and give every
finding a `rootCause` (why the failure was hidden), the `invariant` it breaks, `confidence`,
`validationSteps` (what you checked to find no visible signal) and `remediationBucket`. The fix is
usually to let it fail, or to return a typed failure the caller must handle; a fix that only adds a
log line to a fail-open security check is not a fix.

## Compose with the repo's own rules

Load `CLAUDE.md` / `AGENTS.md` and any lint rules first. Many repos already rule on this ("catch
only to recover, translate or clean up", "use cases return `ServiceResult`", "never `catch { return [] }`").

- **On conflict, prefer the repo's rule.** It decides which defaults are allowed and where.
- A fallback the repo documents as deliberate (a comment naming the reason, a baseline entry) is a
  non-finding. Cite it.
- Cite the repo rule id alongside `fallback:<kind>` when a finding maps to one.
- **Rulebook compliance:** the same rules reach you as this lens's RULEBOOK subset. Return a
  ruleCheck for every rule handed (`violation` | `verified-safe` | `not-applicable`), each
  `verified-safe` or `not-applicable` with a one-line reason. A skipped rule renders NOT CHECKED.

Adapted from the fail-visible bias and closed justification loops in MrZoyo/deslop-GPT (MIT) and
the swallowed-error checks in peteromallet/desloppify; the tool and the wording are our own.
