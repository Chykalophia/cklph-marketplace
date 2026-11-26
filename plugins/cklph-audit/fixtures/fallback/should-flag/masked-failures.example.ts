// FIXTURE: fallback lens, should-flag (RECALL)
// Planted defects: failures turned into plausible results. Each function fails in a way the
// caller cannot tell from a real answer, so the UI shows an empty list, a zero total or a
// "saved" state over a broken path, and nobody knows to fix it.
// Expected verdict: FLAG every site below (fallback:catch-default, fallback:catch-log-continue,
// fallback:swallowed, fallback:promise-default, fallback:default-over-failure).
// Survives verify: no caller checks for the failure, no test pins it, no spec asks for the default.

export async function listInvoices(userId: string) {
  try {
    const rows = await db.query("SELECT * FROM invoices WHERE user_id = $1", [userId]);
    return rows;
  } catch (err) {
    return [];
  }
}

export async function chargeTotal(orderId: string) {
  try {
    return await payments.total(orderId);
  } catch (err) {
    logger.error({ err, orderId }, "charge_total_failed");
  }
}

export async function saveDraft(draft: unknown) {
  try {
    await db.insert("drafts", draft);
  } catch {}
  return { saved: true };
}

export function loadPlan(accountId: string) {
  return billing.plan(accountId).catch(() => null);
}

export async function recentLeads() {
  const leads = (await crm.leads()) ?? [];
  return leads;
}

// stubs so the fixture type-checks in isolation; not part of the planted defects.
declare const db: any;
declare const payments: any;
declare const billing: any;
declare const crm: any;
declare const logger: { error: (o: unknown, m: string) => void };
