---
name: qstash
description: Peter's pattern for Upstash QStash background jobs in Next.js. Use when queueing async work, writing a QStash webhook handler, or anything mentioning verifySignatureAppRouter or @upstash/qstash.
---

# qstash — background jobs that don't retry-storm

QStash replaces Redis queues on serverless. Vercel cron enqueues; QStash pushes to a webhook; the webhook does the heavy work inside the 300s budget. Two things keep it sane — signature verification at the boundary, idempotency in the database.

## The webhook shape

```ts
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";

async function handler(request: NextRequest) {
  let jobId: string | undefined;
  try {
    const job = await request.json();          // read body ONCE, inside the wrapper
    jobId = job.jobId;

    const claimed = await markJobAsProcessing(jobId); // atomic pending → processing
    if (!claimed) return NextResponse.json({ ok: true, message: "already processed" });

    await doTheWork(job);
    await updateJobStatus(jobId, "completed");
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (jobId) await updateJobStatus(jobId, "failed", err.message); // never leave stuck
    if (isPermanent(err)) return NextResponse.json({ ok: false, error: err.message });
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export const POST = verifySignatureAppRouter(handler);
```

`verifySignatureAppRouter` checks QStash's HMAC header before your code runs. Read the body **inside** the wrapped handler — the wrapper consumes the stream to verify.

## Idempotency: deterministic IDs + a state table

A `jobs` row tracks every job: `pending → processing → completed | failed`. The job ID is deterministic — `process-email-${workspaceId}-${emailId}`, not `Date.now()`. `markJobAsProcessing` does `UPDATE … WHERE status = 'pending'` and returns whether a row changed. If not, replay — return 200.

## State machine rule (NEVER violate)

If the `try` sets `processing`, the `catch` MUST set `failed`. A job stuck in `processing` forever blocks recovery cron and looks like a slow job.

## Return-code policy

| Outcome                          | Status | Why                                |
| -------------------------------- | ------ | ---------------------------------- |
| Success / replay                 | 200    | Stop retries.                      |
| Permanent failure (bad input)    | 200    | Retrying won't help; mark `failed`. |
| Transient failure (network)      | 500    | QStash retries with backoff.       |

Cron handlers finish in 2–3 seconds — they enqueue and return. The QStash webhook does the slow work with up to 300s.

## Anti-patterns

- Forgetting `verifySignatureAppRouter` — anyone can POST your worker.
- Reading the request body before the wrapper — verification fails.
- Non-deterministic job IDs (`Date.now()`) — every replay creates a new job.
- 500 on permanent failure — infinite retry storm.
- `catch` without setting `failed` — jobs stuck in `processing` forever.

Pair with **api-routes** for the cron handler shape and **pubsub** for real-time webhooks.
