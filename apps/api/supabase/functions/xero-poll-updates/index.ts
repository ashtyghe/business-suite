import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  getAdminClient,
  corsPreflightOrMethodCheck,
  json,
  verifyAuth,
  xeroFetch,
  logSync,
} from "../_shared/xero-client.ts";

/**
 * Polls Xero for payment status updates on synced invoices and bills.
 * Called on-demand from the Settings Xero tab ("Check for updates" button).
 * Can also be triggered by Supabase pg_cron for automated polling.
 */

const XERO_STATUS_TO_INVOICE: Record<string, string> = {
  PAID: "paid",
  VOIDED: "void",
};

Deno.serve(async (req: Request) => {
  const preflight = corsPreflightOrMethodCheck(req);
  if (preflight) return preflight;

  const user = await verifyAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const admin = getAdminClient();

  try {
    let invoicesUpdated = 0;
    let billsUpdated = 0;
    let invoicesChecked = 0;
    let billsChecked = 0;

    // ── Pull invoice payment status ───────────────────────────────────────
    const { data: invoices } = await admin
      .from("invoices")
      .select("id, xero_invoice_id, status")
      .not("xero_invoice_id", "is", null)
      .not("status", "in", "(paid,void)"); // Only check unpaid invoices

    for (const inv of invoices || []) {
      try {
        const res = await xeroFetch(`/Invoices/${inv.xero_invoice_id}`);
        if (!res.ok) continue;
        invoicesChecked++;

        const xeroData = await res.json();
        const xeroInv = xeroData.Invoices?.[0];
        if (!xeroInv) continue;

        const newStatus = XERO_STATUS_TO_INVOICE[xeroInv.Status];
        if (newStatus && newStatus !== inv.status) {
          await admin
            .from("invoices")
            .update({
              status: newStatus,
              xero_sync_status: "synced",
              xero_last_synced_at: new Date().toISOString(),
            })
            .eq("id", inv.id);
          await logSync("invoice", inv.id, "pull", "success", inv.xero_invoice_id);
          invoicesUpdated++;
        }
      } catch {
        // Skip individual failures
      }
    }

    // ── Pull bill payment status ──────────────────────────────────────────
    const { data: bills } = await admin
      .from("bills")
      .select("id, xero_bill_id, status")
      .not("xero_bill_id", "is", null)
      .not("status", "eq", "posted"); // Only check non-posted bills

    for (const bill of bills || []) {
      try {
        const res = await xeroFetch(`/Invoices/${bill.xero_bill_id}`);
        if (!res.ok) continue;
        billsChecked++;

        const xeroData = await res.json();
        const xeroBill = xeroData.Invoices?.[0];
        if (!xeroBill) continue;

        if (xeroBill.Status === "PAID" && bill.status !== "posted") {
          await admin
            .from("bills")
            .update({
              status: "posted",
              xero_sync_status: "synced",
              xero_last_synced_at: new Date().toISOString(),
            })
            .eq("id", bill.id);
          await logSync("bill", bill.id, "pull", "success", bill.xero_bill_id);
          billsUpdated++;
        }
      } catch {
        // Skip individual failures
      }
    }

    return json({
      invoices: { checked: invoicesChecked, updated: invoicesUpdated },
      bills: { checked: billsChecked, updated: billsUpdated },
      polledAt: new Date().toISOString(),
    });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});
