---
name: trust-precedents
description: Shared trust assumptions and not-a-finding rules for cklph-audit reviewers and verifiers on a Next.js, TypeScript and Supabase stack. Each precedent names the lenses it binds and its exceptions, so it never silences a whole lens. Loaded by audit-reviewer and audit-verifier.
---

# trust-precedents: what a reviewer may assume, and what is never a finding

These are settled calls, so reviewers stop re-arguing them and verifiers apply them the same way every run. Each one says which lenses it binds; a lens not listed is not bound. A precedent never overrides a lens that exists to hunt that class: `availability` still owns denial of service, `llm` still owns user content in prompts, `sca` still owns outdated packages. When the repo's own rules disagree, the repo wins.

## Trusted inputs

| Precedent | Binds | Exceptions |
|---|---|---|
| Environment variables and CLI flags set by whoever deploys the app are trusted. Reading one is not an unvalidated-input finding. | all | Values a CI workflow sets from event data (`env: X: ${{ github.event.* }}`, `github.head_ref`, PR titles, bodies, branch names) and env set from request data at runtime are attacker-controlled. The fallback when a variable is missing is in scope: a hardcoded default secret, a fail-open switch, an empty string accepted as a key. A `NEXT_PUBLIC_*` value is public, not secret. |
| A random UUIDv4 (or other 122-bit random id) cannot be guessed. | security, data-isolation, web-auth | Ids from `Math.random`, timestamps, or sequences are guessable. An unguessable id that leaks in a URL, log, referrer, or another user's response is still a leak. An unguessable id is never the only access check on another user's private data. |
| React escapes text it renders. | security, client-side, llm | Sinks remain: `dangerouslySetInnerHTML`, `href`/`src` from user input (`javascript:`), raw-HTML Markdown renderers (`rehype-raw`), `innerHTML` in effects, server-built HTML strings. |
| A check that runs only in the browser is UX, not a control. | all | The finding is the server path that lacks its own check, filed under the owning lens, never the client check itself. |
| Server-side request forgery needs control of the scheme, host, or port (or a redirect the server follows to one). | security, messaging | Path-only means the URL is built with `new URL(path, fixedBase)` and the resulting origin is checked. A string-concatenated URL (`` `https://api.example.com${p}` ``) lets `@evil.example`, a leading `//` or `\`, or a missing leading `/` change the host, so it is SSRF-capable. A path on an internal service that reaches privileged endpoints is in scope too. |
| Logging a URL, route, or status is fine. | security, compliance | Logging a token, session id, password, API key, full request headers, or personal data is in scope. A URL that carries a token in its query string counts as a token. |

## Never a finding

| Not a finding | Binds | Never applies to |
|---|---|---|
| Code that only runs in tests, fixtures, stories, or seed scripts. | security, data-isolation, web-auth, client-side, messaging, llm, availability | Code that ships in the production bundle or runs in CI with secrets. `supplychain:test-weakening` and any rule whose subject is the test itself. |
| Commented-out code, and placeholder or mock values (`example.com`, `sk_test_...` in docs, `changeme` in an `.env.example`). | all except agent-config | A real credential anywhere, including in a comment or an example file, is a secret. agent-config: comments and hidden HTML in instruction docs are read by the agent, so they are in scope. |
| Generated files (`@generated`, `database.types.ts`). | all except supply-chain and sca | Lockfiles, which supply-chain and sca read on purpose. |
| A defect that cannot be fixed in this repo: it lives entirely in a dependency or a provider. Route it instead: a dependency defect to `sca`, a provider setting to a `needs-owner-input` note naming the setting. | all except sca | `sca`, whose subject is dependency defects. |
| Behaviour a unit is designed to allow: an `intendedUse` entry from the threat model, with its doc, test, config or ADR evidence, within its stated limit. | all | A caller reaching it who is outside the stated audience. Reaching private networks or another tenant's data. Any critical or high finding: intended use alone never refutes one. |
| A crash, unhandled rejection, or `undefined` access with no security effect. | security, data-isolation, web-auth, client-side, messaging, llm | `correctness`, `omission` (`omission:error-path`), `state-machine`, `concurrency`, and `availability` when one request can crash a shared process. |

## How to use this

Reviewers: before filing, check the finding against this page for your lens. If a precedent binds your lens, covers the finding, and no exception applies, drop it. Verifiers: refute a finding that a binding precedent covers, and name the precedent in `reason`. If an exception applies, say which one.

Ideas from Anthropic's claude-code-security-review (MIT), Google's gemini-cli security extension (Apache-2.0), and GitHub Security Lab's seclab-taskflows (MIT); see the plugin's `NOTICE.md`.
