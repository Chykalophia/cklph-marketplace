// FIXTURE — omission lens · should-not-flag (PRECISION)
// Clean look-alike: SAME shape as the should-flag case (read external input → write to DB),
// but every negative space is FILLED — the input is schema-validated, the write is wrapped in
// try/catch, and on failure the transaction is rolled back, the error is logged, and it is
// rethrown (not swallowed). A naive scanner sees "req.body + db write" and is tempted to flag
// it; the guards are all present in-window.
// Expected verdict: DO NOT FLAG. The verifier refutes any omission finding by citing the guard:
//   validation → safeParse; error-path → try/catch + throw; rollback → tx.rollback(); logging → logger.error.

import { z } from "zod";

const InvoiceInput = z.object({
  amount: z.number().positive(),
  customerId: z.string().uuid(),
});

export async function createInvoice(req: any, res: any) {
  const parsed = InvoiceInput.safeParse(req.body); // input validated at the boundary
  if (!parsed.success) {
    res.status(400).json({ error: "invalid input" }); // error path for bad input
    return;
  }

  const tx = await db.begin();
  try {
    await tx.query(
      "INSERT INTO invoices (customer_id, amount) VALUES ($1, $2)",
      [parsed.data.customerId, parsed.data.amount],
    );
    await tx.commit();
    res.json({ ok: true });
  } catch (err) {
    await tx.rollback();                       // rollback present
    logger.error({ err }, "createInvoice failed"); // logged
    throw err;                                  // rethrown, not swallowed
  }
}

// stubs so the fixture type-checks in isolation; not part of the clean pattern.
declare const db: any;
declare const logger: { error: (o: unknown, m: string) => void };
