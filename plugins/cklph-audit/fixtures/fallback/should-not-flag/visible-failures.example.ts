// FIXTURE: fallback lens, should-not-flag (PRECISION)
// Clean look-alikes: the same shapes as the should-flag case, but every failure stays visible.
// The catch logs and rethrows, returns a typed failure the caller must handle, maps to an HTTP
// error, or cleans up and rethrows. A default that is not laid over a failure (a missing
// optional setting) is fine.
// Expected verdict: DO NOT FLAG.

export async function listInvoices(userId: string) {
  try {
    return success(await db.query("SELECT * FROM invoices WHERE user_id = $1", [userId]));
  } catch (err) {
    logger.error({ err, userId }, "invoice_list_failed");
    return failure("DATABASE_ERROR", "Could not load invoices");
  }
}

export async function chargeTotal(orderId: string) {
  try {
    return await payments.total(orderId);
  } catch (err) {
    logger.error({ err, orderId }, "charge_total_failed");
    throw err;
  }
}

export async function saveDraft(req: any, res: any) {
  try {
    await db.insert("drafts", req.body);
    res.json({ saved: true });
  } catch (err) {
    res.status(500).json({ error: "Not saved. Try again." });
  }
}

export function loadPlan(accountId: string) {
  return billing.plan(accountId).catch((err: Error) => {
    throw new PlanUnavailable(accountId, err);
  });
}

export function pageSize(settings: { pageSize?: number }) {
  return settings.pageSize ?? 20;
}

// stubs so the fixture type-checks in isolation; not part of the clean patterns.
declare const db: any;
declare const payments: any;
declare const billing: any;
declare const logger: { error: (o: unknown, m: string) => void };
declare function success<T>(v: T): { success: true; data: T };
declare function failure(code: string, message: string): { success: false };
declare class PlanUnavailable extends Error { constructor(id: string, cause: Error); }
