import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  getAdminClient,
  corsPreflightOrMethodCheck,
  json,
  verifyAuth,
  xeroFetch,
  logSync,
  mapInvoiceToXero,
  mapContactToXero,
  getAccountCode,
} from "../_shared/xero-client.ts";

// Xero → FieldOps status mapping (pull only — payment status)
const XERO_STATUS_PULL_MAP: Record<string, string> = {
  PAID: "paid",
  VOIDED: "void",
};

Deno.serve(async (req: Request) => {
  const preflight = corsPreflightOrMethodCheck(req);
  if (preflight) return preflight;

  const user = await verifyAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  let body: { action: string; invoiceId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const admin = getAdminClient();
  const { action } = body;

  try {
    // ── PUSH: Sync a single invoice to Xero ─────────────────────────────
    if (action === "push") {
      const { invoiceId } = body;
      if (!invoiceId) return json({ error: "invoiceId required" }, 400);

      const result = await pushInvoice(admin, invoiceId);
      return json(result, result.error ? 502 : 200);
    }

    // ── DRY RUN: Preview what would sync ────────────────────────────────
    if (action === "dry_run") {
      const { data: invoices } = await admin
        .from("invoices")
        .select("id, invoice_number, status, job_id, xero_invoice_id, xero_skip, xero_sync_status")
        .or("xero_sync_status.is.null,xero_sync_status.eq.error")
        .eq("xero_skip", false);

      const items = invoices || [];
      const warnings: string[] = [];

      // Check for invoices without a linked customer
      for (const inv of items) {
        if (!inv.job_id) {
          warnings.push(`Invoice ${inv.invoice_number}: no job linked`);
        }
      }

      return json({
        wouldSync: items.length,
        invoices: items.map((i) => ({
          id: i.id,
          number: i.invoice_number,
          status: i.status,
          alreadyInXero: !!i.xero_invoice_id,
        })),
        warnings,
      });
    }

    // ── BULK PUSH: Sync all un-synced invoices ──────────────────────────
    if (action === "bulk_push") {
      const { data: invoices } = await admin
        .from("invoices")
        .select("id")
        .or("xero_sync_status.is.null,xero_sync_status.eq.error")
        .eq("xero_skip", false);

      let synced = 0;
      let errors = 0;

      for (const inv of invoices || []) {
        const result = await pushInvoice(admin, inv.id);
        if (result.error) {
          errors++;
        } else {
          synced++;
        }
      }

      return json({ synced, errors, total: (invoices || []).length });
    }

    // ── PULL: Fetch payment status updates from Xero ────────────────────
    if (action === "pull") {
      const { invoiceId } = body;

      if (invoiceId) {
        // Pull a single invoice
        const { data: inv } = await admin
          .from("invoices")
          .select("xero_invoice_id")
          .eq("id", invoiceId)
          .single();

        if (!inv?.xero_invoice_id) {
          return json({ error: "Invoice not synced to Xero" }, 400);
        }

        const res = await xeroFetch(`/Invoices/${inv.xero_invoice_id}`);
        if (!res.ok) return json({ error: "Xero fetch failed" }, 502);

        const xeroData = await res.json();
        const xeroInv = xeroData.Invoices?.[0];
        if (!xeroInv) return json({ updated: false });

        const newStatus = XERO_STATUS_PULL_MAP[xeroInv.Status];
        if (newStatus) {
          await admin
            .from("invoices")
            .update({
              status: newStatus,
              xero_sync_status: "synced",
              xero_last_synced_at: new Date().toISOString(),
            })
            .eq("id", invoiceId);
          await logSync("invoice", invoiceId, "pull", "success", inv.xero_invoice_id);
          return json({ updated: true, newStatus });
        }

        return json({ updated: false, xeroStatus: xeroInv.Status });
      }

      // Pull all synced invoices
      const { data: invoices } = await admin
        .from("invoices")
        .select("id, xero_invoice_id, status")
        .not("xero_invoice_id", "is", null);

      let updated = 0;
      for (const inv of invoices || []) {
        try {
          const res = await xeroFetch(`/Invoices/${inv.xero_invoice_id}`);
          if (!res.ok) continue;
          const xeroData = await res.json();
          const xeroInv = xeroData.Invoices?.[0];
          if (!xeroInv) continue;

          const newStatus = XERO_STATUS_PULL_MAP[xeroInv.Status];
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
            updated++;
          }
        } catch {
          // Skip individual failures in bulk pull
        }
      }

      return json({ updated, checked: (invoices || []).length });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});

// ── Push a single invoice to Xero ───────────────────────────────────────────

async function pushInvoice(admin: any, invoiceId: string) {
  // Load invoice
  const { data: invoice, error: invErr } = await admin
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();

  if (invErr || !invoice) {
    return { error: "Invoice not found" };
  }

  // Load line items
  const { data: lineItems } = await admin
    .from("line_items")
    .select("description, quantity, unit_price")
    .eq("invoice_id", invoiceId);

  if (!lineItems?.length) {
    await logSync("invoice", invoiceId, "push", "error", undefined, "No line items");
    return { error: "Invoice has no line items" };
  }

  // Get the job's customer
  const { data: job } = await admin
    .from("jobs")
    .select("customer_id")
    .eq("id", invoice.job_id)
    .single();

  if (!job?.customer_id) {
    await logSync("invoice", invoiceId, "push", "error", undefined, "No customer linked");
    return { error: "Invoice job has no customer" };
  }

  // Ensure customer is synced to Xero
  const { data: customer } = await admin
    .from("customers")
    .select("*")
    .eq("id", job.customer_id)
    .single();

  if (!customer) {
    return { error: "Customer not found" };
  }

  let xeroContactId = customer.xero_contact_id;
  if (!xeroContactId) {
    // Auto-sync customer to Xero
    const contactPayload = mapContactToXero(customer, true);
    const contactRes = await xeroFetch("/Contacts", {
      method: "POST",
      body: JSON.stringify(contactPayload),
    });

    if (!contactRes.ok) {
      const err = await contactRes.text();
      return { error: "Failed to sync customer to Xero", details: err };
    }

    const contactResult = await contactRes.json();
    xeroContactId = contactResult.Contacts?.[0]?.ContactID;
    if (xeroContactId) {
      await admin.from("customers").update({ xero_contact_id: xeroContactId }).eq("id", customer.id);
    }
  }

  if (!xeroContactId) {
    return { error: "Could not resolve Xero contact" };
  }

  // Get account code
  const accountCode = await getAccountCode("invoice");

  // Map to Xero
  const xeroInvoice = mapInvoiceToXero(invoice, lineItems, xeroContactId, accountCode);

  // Create or update
  let res: Response;
  if (invoice.xero_invoice_id) {
    res = await xeroFetch(`/Invoices/${invoice.xero_invoice_id}`, {
      method: "POST",
      body: JSON.stringify(xeroInvoice),
    });
  } else {
    res = await xeroFetch("/Invoices", {
      method: "POST",
      body: JSON.stringify(xeroInvoice),
    });
  }

  if (!res.ok) {
    const err = await res.text();
    await admin.from("invoices").update({ xero_sync_status: "error" }).eq("id", invoiceId);
    await logSync("invoice", invoiceId, "push", "error", undefined, err);
    return { error: "Xero API error", details: err };
  }

  const result = await res.json();
  const xeroId = result.Invoices?.[0]?.InvoiceID;

  await admin
    .from("invoices")
    .update({
      xero_invoice_id: xeroId,
      xero_sync_status: "synced",
      xero_last_synced_at: new Date().toISOString(),
    })
    .eq("id", invoiceId);

  await logSync("invoice", invoiceId, "push", "success", xeroId);

  return { success: true, xeroInvoiceId: xeroId };
}
