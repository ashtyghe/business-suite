import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  getAdminClient,
  corsPreflightOrMethodCheck,
  json,
  verifyAuth,
  xeroFetch,
  logSync,
  mapBillToXero,
  mapContactToXero,
  getAccountCode,
} from "../_shared/xero-client.ts";

Deno.serve(async (req: Request) => {
  const preflight = corsPreflightOrMethodCheck(req);
  if (preflight) return preflight;

  const user = await verifyAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  let body: { action: string; billId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const admin = getAdminClient();
  const { action } = body;

  try {
    // ── PUSH: Sync a single bill to Xero ────────────────────────────────
    if (action === "push") {
      const { billId } = body;
      if (!billId) return json({ error: "billId required" }, 400);

      const result = await pushBill(admin, billId);
      return json(result, result.error ? 502 : 200);
    }

    // ── DRY RUN: Preview what would sync ────────────────────────────────
    if (action === "dry_run") {
      const { data: bills } = await admin
        .from("bills")
        .select("id, invoice_number, supplier_name, status, total, category, xero_bill_id, xero_skip, xero_sync_status")
        .or("xero_sync_status.is.null,xero_sync_status.eq.error")
        .eq("xero_skip", false);

      const items = bills || [];
      const warnings: string[] = [];

      for (const bill of items) {
        if (!bill.supplier_name) {
          warnings.push(`Bill ${bill.invoice_number || bill.id}: no supplier name`);
        }
      }

      return json({
        wouldSync: items.length,
        bills: items.map((b) => ({
          id: b.id,
          invoiceNo: b.invoice_number,
          supplier: b.supplier_name,
          amount: b.total,
          status: b.status,
          alreadyInXero: !!b.xero_bill_id,
        })),
        warnings,
      });
    }

    // ── BULK PUSH: Sync all un-synced bills ─────────────────────────────
    if (action === "bulk_push") {
      const { data: bills } = await admin
        .from("bills")
        .select("id")
        .or("xero_sync_status.is.null,xero_sync_status.eq.error")
        .eq("xero_skip", false);

      let synced = 0;
      let errors = 0;

      for (const bill of bills || []) {
        const result = await pushBill(admin, bill.id);
        if (result.error) {
          errors++;
        } else {
          synced++;
        }
      }

      return json({ synced, errors, total: (bills || []).length });
    }

    // ── PULL: Fetch payment status from Xero ────────────────────────────
    if (action === "pull") {
      const { data: bills } = await admin
        .from("bills")
        .select("id, xero_bill_id, status")
        .not("xero_bill_id", "is", null);

      let updated = 0;
      for (const bill of bills || []) {
        try {
          const res = await xeroFetch(`/Invoices/${bill.xero_bill_id}`);
          if (!res.ok) continue;
          const xeroData = await res.json();
          const xeroBill = xeroData.Invoices?.[0];
          if (!xeroBill) continue;

          // Only pull payment status back
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
            updated++;
          }
        } catch {
          // Skip individual failures
        }
      }

      return json({ updated, checked: (bills || []).length });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});

// ── Push a single bill to Xero ──────────────────────────────────────────────

async function pushBill(admin: any, billId: string) {
  // Load bill
  const { data: bill, error: billErr } = await admin
    .from("bills")
    .select("*")
    .eq("id", billId)
    .single();

  if (billErr || !bill) {
    return { error: "Bill not found" };
  }

  // Resolve or create supplier as Xero contact
  let xeroContactId: string | null = null;

  // Check if there's a linked supplier with a xero_contact_id
  if (bill.supplier_id) {
    const { data: supplier } = await admin
      .from("suppliers")
      .select("*")
      .eq("id", bill.supplier_id)
      .single();

    if (supplier?.xero_contact_id) {
      xeroContactId = supplier.xero_contact_id;
    } else if (supplier) {
      // Auto-sync supplier to Xero
      const contactPayload = mapContactToXero(supplier, false);
      const contactRes = await xeroFetch("/Contacts", {
        method: "POST",
        body: JSON.stringify(contactPayload),
      });

      if (contactRes.ok) {
        const contactResult = await contactRes.json();
        xeroContactId = contactResult.Contacts?.[0]?.ContactID || null;
        if (xeroContactId) {
          await admin.from("suppliers").update({ xero_contact_id: xeroContactId }).eq("id", supplier.id);
        }
      }
    }
  }

  // If no linked supplier, create a contact from supplier_name
  if (!xeroContactId && bill.supplier_name) {
    const contactPayload = mapContactToXero({ name: bill.supplier_name }, false);
    const contactRes = await xeroFetch("/Contacts", {
      method: "POST",
      body: JSON.stringify(contactPayload),
    });

    if (contactRes.ok) {
      const contactResult = await contactRes.json();
      xeroContactId = contactResult.Contacts?.[0]?.ContactID || null;
    }
  }

  if (!xeroContactId) {
    await logSync("bill", billId, "push", "error", undefined, "Could not resolve supplier contact");
    return { error: "Could not resolve supplier as Xero contact" };
  }

  // Get account code based on bill category
  const accountCode = await getAccountCode("bill", bill.category || "");

  // Map to Xero
  const xeroBill = mapBillToXero(bill, xeroContactId, accountCode);

  // Create or update
  let res: Response;
  if (bill.xero_bill_id) {
    res = await xeroFetch(`/Invoices/${bill.xero_bill_id}`, {
      method: "POST",
      body: JSON.stringify(xeroBill),
    });
  } else {
    res = await xeroFetch("/Invoices", {
      method: "POST",
      body: JSON.stringify(xeroBill),
    });
  }

  if (!res.ok) {
    const err = await res.text();
    await admin.from("bills").update({ xero_sync_status: "error" }).eq("id", billId);
    await logSync("bill", billId, "push", "error", undefined, err);
    return { error: "Xero API error", details: err };
  }

  const result = await res.json();
  const xeroId = result.Invoices?.[0]?.InvoiceID;

  await admin
    .from("bills")
    .update({
      xero_bill_id: xeroId,
      xero_sync_status: "synced",
      xero_last_synced_at: new Date().toISOString(),
    })
    .eq("id", billId);

  await logSync("bill", billId, "push", "success", xeroId);

  return { success: true, xeroBillId: xeroId };
}
