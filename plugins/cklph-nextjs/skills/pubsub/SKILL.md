---
name: pubsub
description: Peter's pattern for Google Cloud Pub/Sub webhooks in Next.js. Use when handling Gmail push notifications, writing a Pub/Sub subscriber, or anything mentioning historyId, OAuth2Client JWT verification, or Gmail watch renewal.
---

# pubsub — webhooks that don't retry-storm

Google Cloud Pub/Sub pushes notifications to your webhook. Three rules keep it healthy — always return 200, verify the JWT, dedupe atomically.

## Always return 200 (yes, even on errors)

```ts
export async function POST(request: NextRequest) {
  try {
    // ... verify, parse, dedupe, process ...
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error("pubsub_error", { error: err.message });
    return NextResponse.json({ acknowledged: true, error: err.message });
    // 200, not 500 — 5xx tells Pub/Sub to retry forever, exponentially.
  }
}
```

A 5xx is how a one-line bug becomes a runaway retry storm that eats your Vercel quota in an hour.

## JWT verification via OAuth2Client

```ts
const ticket = await new OAuth2Client().verifyIdToken({
  idToken: bearerToken,
  audience: expectedWebhookUrl, // must match THIS endpoint
});
const payload = ticket.getPayload();
if (payload.iss !== "https://accounts.google.com") throw new Error("bad issuer");
if (!payload.email?.endsWith(".gserviceaccount.com")) throw new Error("not Google");
```

Verify **audience**, **issuer**, **email**. Skipping any one means anyone with a token can POST your webhook.

## Atomic deduplication with optimistic locking

Pub/Sub delivers at-least-once. Two pods can receive the same message simultaneously. One SQL statement that both checks and claims:

```ts
const claim = await supabase
  .from("gmail_accounts")
  .update({ watch_history_id: incomingId })
  .eq("id", accountId)
  .eq("watch_history_id", storedId) // optimistic lock — only if unchanged
  .select("id");

if (!claim.data?.length) return acknowledged("already claimed");
```

If `storedId` is NULL, use `.is("watch_history_id", null)` instead of `.eq(...)`.

## BigInt for historyId

```ts
const incoming = BigInt(historyId);
const stored = storedHistoryId ? BigInt(storedHistoryId) : 0n;
if (stored && incoming <= stored) return acknowledged("already processed");
```

Gmail's `historyId` exceeds `Number.MAX_SAFE_INTEGER` (2^53). `Number(historyId)` silently loses precision. Always `BigInt`.

## Watch renewal

Gmail watches expire in 7 days. Run a cron at the 6-day mark per user. A missed renewal is a silent feature break — no errors, just no notifications.

## Anti-patterns

- 500 on processing error — Pub/Sub retries until your quota dies.
- `Number(historyId)` — precision loss above 2^53.
- Skipping JWT verification — your endpoint is public; anyone can spoof Google.
- Processing without dedup — duplicates corrupt counters and re-trigger downstream work.
- Cookie-based Supabase client in the webhook — no cookies; use the service-role client.
- Forgetting watch renewal — feature dies silently in 7 days.

Pair with **api-routes** for the webhook shape and **qstash** for queueing the heavy work this webhook fans out to.
