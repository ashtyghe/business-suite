import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  getAdminClient,
  corsPreflightOrMethodCheck,
  json,
  verifyAuth,
  xeroFetch,
  logSync,
  mapContactToXero,
} from "../_shared/xero-client.ts";

Deno.serve(async (req: Request) => {
  const preflight = corsPreflightOrMethodCheck(req);
  if (preflight) return preflight;

  const user = await verifyAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  let body: { action: string; entityType?: string; entityId?: string; matches?: any[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const admin = getAdminClient();
  const { action } = body;

  try {
    // ── MATCH: Fuzzy-match FieldOps contacts against Xero contacts ──────
    if (action === "match") {
      // Fetch all Xero contacts
      const res = await xeroFetch("/Contacts?page=1&includeArchived=false");
      if (!res.ok) {
        const err = await res.text();
        return json({ error: "Failed to fetch Xero contacts", details: err }, 502);
      }
      const xeroData = await res.json();
      const xeroContacts: Array<{ ContactID: string; Name: string; EmailAddress?: string }> =
        xeroData.Contacts || [];

      // Fetch FieldOps customers and suppliers
      const { data: customers } = await admin.from("customers").select("id, name, email, xero_contact_id");
      const { data: suppliers } = await admin.from("suppliers").select("id, name, email, xero_contact_id");

      // Build match suggestions
      const matches: any[] = [];

      for (const c of customers || []) {
        if (c.xero_contact_id) continue; // Already linked
        const match = findBestMatch(c, xeroContacts);
        matches.push({
          entityType: "customer",
          entityId: c.id,
          name: c.name,
          email: c.email,
          xeroMatch: match,
        });
      }

      for (const s of suppliers || []) {
        if (s.xero_contact_id) continue;
        const match = findBestMatch(s, xeroContacts);
        matches.push({
          entityType: "supplier",
          entityId: s.id,
          name: s.name,
          email: s.email,
          xeroMatch: match,
        });
      }

      return json({ matches, xeroContactCount: xeroContacts.length });
    }

    // ── CONFIRM MATCHES: Link FieldOps contacts to existing Xero contacts ─
    if (action === "confirmMatches") {
      const { matches } = body;
      if (!matches?.length) return json({ error: "matches array required" }, 400);

      let linked = 0;
      for (const m of matches) {
        if (!m.xeroContactId || !m.entityId || !m.entityType) continue;
        const table = m.entityType === "customer" ? "customers" : "suppliers";
        await admin
          .from(table)
          .update({ xero_contact_id: m.xeroContactId })
          .eq("id", m.entityId);
        linked++;
      }

      return json({ linked });
    }

    // ── PUSH: Sync a single contact to Xero ─────────────────────────────
    if (action === "push") {
      const { entityType, entityId } = body;
      if (!entityType || !entityId) {
        return json({ error: "entityType and entityId required" }, 400);
      }

      const table = entityType === "customer" ? "customers" : "suppliers";
      const { data: record, error: fetchErr } = await admin
        .from(table)
        .select("*")
        .eq("id", entityId)
        .single();

      if (fetchErr || !record) {
        return json({ error: `${entityType} not found` }, 404);
      }

      const isCustomer = entityType === "customer";
      const xeroContact = mapContactToXero(record, isCustomer);

      let res: Response;
      let xeroId: string;

      if (record.xero_contact_id) {
        // Update existing
        res = await xeroFetch(`/Contacts/${record.xero_contact_id}`, {
          method: "POST",
          body: JSON.stringify({ ...xeroContact, ContactID: record.xero_contact_id }),
        });
      } else {
        // Create new
        res = await xeroFetch("/Contacts", {
          method: "POST",
          body: JSON.stringify(xeroContact),
        });
      }

      if (!res.ok) {
        const err = await res.text();
        await logSync("contact", entityId, "push", "error", undefined, err);
        return json({ error: "Xero API error", details: err }, 502);
      }

      const result = await res.json();
      xeroId = result.Contacts?.[0]?.ContactID;

      if (xeroId) {
        await admin
          .from(table)
          .update({ xero_contact_id: xeroId })
          .eq("id", entityId);
        await logSync("contact", entityId, "push", "success", xeroId);
      }

      return json({ success: true, xeroContactId: xeroId });
    }

    // ── BULK PUSH: Sync all unlinked contacts ───────────────────────────
    if (action === "bulkPush") {
      const { data: customers } = await admin
        .from("customers")
        .select("id")
        .is("xero_contact_id", null);
      const { data: suppliers } = await admin
        .from("suppliers")
        .select("id")
        .is("xero_contact_id", null);

      let synced = 0;
      let errors = 0;

      const all = [
        ...(customers || []).map((c) => ({ entityType: "customer", entityId: c.id })),
        ...(suppliers || []).map((s) => ({ entityType: "supplier", entityId: s.id })),
      ];

      for (const item of all) {
        try {
          // Re-use push logic inline to avoid recursive HTTP calls
          const table = item.entityType === "customer" ? "customers" : "suppliers";
          const { data: record } = await admin.from(table).select("*").eq("id", item.entityId).single();
          if (!record) continue;

          const xeroContact = mapContactToXero(record, item.entityType === "customer");
          const res = await xeroFetch("/Contacts", {
            method: "POST",
            body: JSON.stringify(xeroContact),
          });

          if (res.ok) {
            const result = await res.json();
            const xeroId = result.Contacts?.[0]?.ContactID;
            if (xeroId) {
              await admin.from(table).update({ xero_contact_id: xeroId }).eq("id", item.entityId);
              await logSync("contact", item.entityId, "push", "success", xeroId);
              synced++;
            }
          } else {
            errors++;
            await logSync("contact", item.entityId, "push", "error", undefined, await res.text());
          }
        } catch (err) {
          errors++;
        }
      }

      return json({ synced, errors, total: all.length });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});

// ── Fuzzy matching ──────────────────────────────────────────────────────────

function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/pty\s*ltd\.?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findBestMatch(
  local: { name: string; email?: string },
  xeroContacts: Array<{ ContactID: string; Name: string; EmailAddress?: string }>
): { contactId: string; name: string; confidence: "exact" | "high" | "low" } | null {
  const localName = normalize(local.name);
  const localEmail = (local.email || "").toLowerCase();

  let best: { contactId: string; name: string; confidence: "exact" | "high" | "low" } | null = null;
  let bestScore = 0;

  for (const xc of xeroContacts) {
    const xName = normalize(xc.Name);
    const xEmail = (xc.EmailAddress || "").toLowerCase();

    // Exact name match
    if (localName === xName) {
      return { contactId: xc.ContactID, name: xc.Name, confidence: "exact" };
    }

    // Email match
    if (localEmail && xEmail && localEmail === xEmail) {
      return { contactId: xc.ContactID, name: xc.Name, confidence: "exact" };
    }

    // One name contains the other
    if (localName && xName && (localName.includes(xName) || xName.includes(localName))) {
      const score = Math.min(localName.length, xName.length) / Math.max(localName.length, xName.length);
      if (score > bestScore && score > 0.5) {
        best = { contactId: xc.ContactID, name: xc.Name, confidence: score > 0.8 ? "high" : "low" };
        bestScore = score;
      }
    }
  }

  return best;
}
