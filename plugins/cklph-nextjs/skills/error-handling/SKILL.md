---
name: error-handling
description: Peter's user-surface vs log-only error discipline for services, routes, and observability. Use when writing try/catch blocks, ServiceError returns, route error responses, or Sentry capture sites.
---

# error-handling — surface vs log, never both

Two audiences: the **user** (needs an actionable message) and the **logs** (need the full cause). Different content. Mixing them leaks internals.

## Services return ServiceResult — never throw to callers

```ts
export async function getRule(userId: string, ruleId: string): Promise<ServiceResult<Rule>> {
  if (!validateUUID(ruleId)) return failure("INVALID_ID", "Invalid rule ID");
  const { data, error } = await supabase.from("rules")
    .select("*").eq("id", ruleId).eq("user_id", userId).single();
  if (error) {
    logger.error("rule_fetch_failed", { errorId: "RULE_FETCH", userId, ruleId, cause: error.message });
    return failure("DATABASE_ERROR", "Could not load rule");
  }
  if (!data) return failure("NOT_FOUND", "Rule not found");
  return success(data);
}
```

`ServiceError` carries `code` (route picks status), `message` (user sees), optional `details`, optional `cause` (chained for logs).

## User-surface text is actionable, nothing more

✅ "Email already in use, try logging in." ❌ raw PostgrestError text, stack traces, SQL fragments. If the user can't act on it, it's a log line, not a surface message.

## Logging at the boundary

The **route handler** is the catch point. Use a scoped logger. Include path, method, status, `userId`, a stable `errorId` for Sentry grouping, and the chained `cause`. Never log secrets, tokens, password hashes, full email bodies, or PII.

## Observability — capture at the boundary, breadcrumb in services

Sentry capture lives in the route's catch block. Services capturing too means double-counting.

```ts
// service: breadcrumb only
Sentry.addBreadcrumb({ category: "rule", data: { ruleId } });
// route: capture once
Sentry.captureException(err, { tags: { errorId: "RULE_EXECUTE" } });
```

## Recoverable vs non-recoverable

Encode in the `code` so retry logic works. **Recoverable** — `RATE_LIMITED`, `EXTERNAL_TIMEOUT` — caller backs off and retries. **Non-recoverable** — `VALIDATION_ERROR`, `NOT_FOUND`, `FORBIDDEN` — dead-letter it.

## Anti-patterns

- Logging the user-surface message instead of the underlying cause.
- A service that `throw`s when it should `failure(…)`.
- Sending stack traces or PostgREST text to the client.
- Logging secrets, tokens, or PII in error context.
- Capturing the same error in both service and route.

Pair with **api-routes** for translating `ServiceResult` into HTTP, **architecture** for where catch blocks belong.
