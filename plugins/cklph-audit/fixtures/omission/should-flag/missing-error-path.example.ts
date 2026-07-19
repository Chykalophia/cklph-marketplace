// FIXTURE — omission lens · should-flag (RECALL)
// Planted defect: MISSING ERROR PATH + MISSING VALIDATION (negative space).
// An HTTP handler reads external input and writes to the database with NO input
// validation and NO error handling — if the write throws (constraint violation,
// connection drop), the failure is invisible: no catch, no logging, no rollback,
// and the caller can be left hanging or told everything is fine.
// Expected verdict: FLAG (omission:error-path on the DB write; omission:validation on the input).
// Survives verify: there is genuinely no guard/try/catch/validation anywhere on this path,
// so a verifier cannot cite a mitigating file:line.

export async function createInvoice(req: any, res: any) {
  const amount = req.body.amount;          // external input, never validated
  const customerId = req.body.customerId;  // external input, never validated

  // no try/catch, no logging, no rollback — a thrown error here vanishes silently
  await db.query(
    "INSERT INTO invoices (customer_id, amount) VALUES ($1, $2)",
    [customerId, amount],
  );

  res.json({ ok: true });
}

// stub so the fixture type-checks in isolation; not part of the planted defect.
declare const db: { query: (sql: string, params: unknown[]) => Promise<void> };
