---
name: economic-lens
description: The economic lens (Tier 3) — value-bearing flows (money, entitlements, credits, quotas, tokens). Traces the full path from value creation to consumption and looks for manipulation, double-spend, bypass, or inflation. Pure-reasoning lens; the reviewer maps the value flow and finds integrity gaps. Loaded by audit-reviewer when auditing through the economic lens.
---

# economic-lens — value-flow integrity judgment (pure reasoning)

You are the **judgment layer**. This lens has **no deterministic tool** — value-flow integrity is a business-logic concern no scanner catches. You reason over the code's value-bearing paths and find integrity gaps. Anchor every finding to `file:line` + quoted code, ship labeled `source: "reasoning"`.

## Checklist (the judgment layer)

Map every finding to a `economic:*` rule and CWE where applicable.

- **Price/amount from client** — the price, amount, or quantity comes from the request body instead of the DB. A client can set the price to 0 or a negative number. (CWE-472, `economic:client-price`, CRITICAL.)
- **Double-spend / non-idempotent charge** — a payment or credit operation that can be called twice (no idempotency key, no dedup). (CWE-668, `economic:double-spend`.)
- **Entitlement bypass** — a feature/tier check that can be bypassed (e.g. checking `user.tier` from the request body instead of the session/DB). (`economic:entitlement-bypass`.)
- **Quota bypass** — rate limits or usage quotas that can be bypassed (e.g. checking per-session instead of per-user, or not atomically). (`economic:quota-bypass`.)
- **Negative values** — allowing negative quantities, amounts, or credits that can be used to inflate a balance. (`economic:negative-value`.)
- **Rounding/truncation abuse** — floating-point money handling that can be abused (e.g. fractional cents accumulation). (`economic:rounding-abuse`.)
- **Webhook without signature verification** — a payment webhook that doesn't verify the signature; an attacker can forge webhook calls to credit accounts. (CWE-347, `economic:webhook-no-sig`.)
- **Race in balance update** — concurrent operations that read a balance, compute, and write back non-atomically. (CWE-362, `economic:balance-race`.)

## How to work

1. Identify value-bearing flows in the unit (payments, credits, quotas, entitlements, tokens, subscriptions).
2. Trace each flow from input to persistence: where does the value come from? Where is it stored? Where is it consumed?
3. At each step, ask: can this be manipulated, doubled, bypassed, or raced?
4. Anchor every finding to `file:line` + quoted code.

## Compose with the repo's own rules

Load the repo's business-logic/economic rules from `CLAUDE.md` / `AGENTS.md` (e.g. "prices always from DB, never from client"). Return a ruleCheck for every rule handed.
