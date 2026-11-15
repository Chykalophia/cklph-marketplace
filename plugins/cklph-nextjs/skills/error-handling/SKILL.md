---
name: error-handling
description: Peter's user-surface vs log-only error discipline for use cases, repositories, routes, actions, and observability. Use when writing try/catch blocks, ServiceError returns, route error responses, or Sentry capture sites.
---

# error-handling — surface vs log, never both

Two audiences: the **user** (needs an actionable message) and the **logs** (need the full cause). Different content. Mixing them leaks internals.

## The boundary rule

Each layer has one job with errors, and nothing crosses a boundary in raw form:

1. **Domain** throws or returns domain errors (`RuleLimitExceeded`, an invalid value object). No HTTP, no Supabase.
2. **Repository** (`infrastructure/`) translates DB and vendor errors into a `failure(...)` and logs the cause. A `PostgrestError` never leaves it.
3. **Use case** (`application/`) returns `ServiceResult<DTO>`, turning domain errors into codes (`FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND`).
4. **Action / route** maps the result to UI state (action) or an HTTP status (route), and is the capture point for anything unexpected.

The client never sees a stack trace or raw DB error text.

## Use cases return ServiceResult for expected failures

Expected failures (bad input, not found, forbidden, a rule broken) come back as `failure(...)`. Unexpected ones (a bug, a dead network) are not caught here: they throw to the action or route, which captures them.

```ts
// application/use-cases/get-rule.ts
type GetRuleCtx = { user: AuthedUser; rules: RuleRepository }; // the slice this use case needs

export async function getRule(ctx: GetRuleCtx, ruleId: string): Promise<ServiceResult<RuleDTO>> {
  if (!validateUUID(ruleId)) return failure("INVALID_ID", "Invalid rule ID");
  const found = await ctx.rules.findOwned(ctx.user.id, ruleId);
  if (!found.success) return found; // already translated and logged by the repository
  if (!found.data) return failure("NOT_FOUND", "Rule not found");
  if (!canViewRule(ctx.user, found.data)) return failure("FORBIDDEN", "You can't view this rule"); // application/policies.ts
  return success(toRuleDTO(found.data));
}

// infrastructure/supabase-rule.repository.ts
async findOwned(userId: string, ruleId: string): Promise<ServiceResult<Rule | null>> {
  const { data, error } = await this.sb.from("rules")
    .select("id, user_id, name, conditions").eq("id", ruleId).eq("user_id", userId)
    .maybeSingle(); // zero rows -> data: null, not an error
  if (error) {
    logger.error("rule_fetch_failed", { errorId: "RULE_FETCH", userId, ruleId, cause: error.message });
    return failure("DATABASE_ERROR", "Could not load rule");
  }
  return success(data ? toRule(data) : null);
}
```

`ServiceError` carries `code` (route picks status), `message` (user sees), optional `details`, optional `cause` (chained for logs).

## User-surface text is actionable, nothing more

✅ "Email already in use, try logging in." ❌ raw PostgrestError text, stack traces, SQL fragments. If the user can't act on it, it's a log line, not a surface message.

## Logging at the boundary

The **route handler or server action** is the catch point. Use a scoped logger. Include path, method, status, `userId`, a stable `errorId` for Sentry grouping, and the chained `cause`. Never log secrets, tokens, password hashes, full email bodies, or PII.

## Observability — capture at the boundary, breadcrumb in use cases

Sentry capture lives in the route's or action's catch block. Use cases capturing too means double-counting.

```ts
// use case: breadcrumb only
Sentry.addBreadcrumb({ category: "rule", data: { ruleId } });
// route: capture once
Sentry.captureException(err, { tags: { errorId: "RULE_EXECUTE" } });
```

## Recoverable vs non-recoverable

Encode in the `code` so retry logic works. **Recoverable** — `RATE_LIMITED`, `EXTERNAL_TIMEOUT` — caller backs off and retries. **Non-recoverable** — `VALIDATION_ERROR`, `NOT_FOUND`, `FORBIDDEN` — dead-letter it.

## Anti-patterns

- Logging the user-surface message instead of the underlying cause.
- A use case that `throw`s an expected failure when it should `failure(…)`.
- A repository that lets a `PostgrestError` escape instead of translating it.
- Sending stack traces or PostgREST text to the client.
- Logging secrets, tokens, or PII in error context.
- Capturing the same error in both use case and route.

Legacy repos on `lib/`: `lib/services/` plays the use-case role and usually the repository role too; the same rules apply.

Pair with **api-routes** for translating `ServiceResult` into HTTP, **architecture** for where catch blocks belong.
