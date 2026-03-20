import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  getAdminClient,
  corsPreflightOrMethodCheck,
  json,
  verifyAuth,
  xeroFetch,
} from "../_shared/xero-client.ts";

Deno.serve(async (req: Request) => {
  const preflight = corsPreflightOrMethodCheck(req);
  if (preflight) return preflight;

  const user = await verifyAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  let body: { action: string; mappings?: Array<{ entity_type: string; category: string; xero_account_code: string; xero_account_name: string }> };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const admin = getAdminClient();
  const { action } = body;

  try {
    // ── PULL: Fetch Chart of Accounts from Xero ───────────────────────────
    if (action === "pull") {
      const res = await xeroFetch("/Accounts");
      if (!res.ok) {
        const err = await res.text();
        return json({ error: "Failed to fetch accounts from Xero", details: err }, 502);
      }

      const data = await res.json();
      const accounts = (data.Accounts || [])
        .filter((a: any) => a.Type === "REVENUE" || a.Type === "EXPENSE")
        .map((a: any) => ({
          code: a.Code,
          name: a.Name,
          type: a.Type,
          status: a.Status,
          taxType: a.TaxType,
        }))
        .filter((a: any) => a.status === "ACTIVE")
        .sort((a: any, b: any) => {
          const codeA = parseInt(a.code, 10);
          const codeB = parseInt(b.code, 10);
          if (!isNaN(codeA) && !isNaN(codeB)) return codeA - codeB;
          return a.code.localeCompare(b.code);
        });

      return json({ accounts });
    }

    // ── GET MAPPINGS: Read current account mappings ────────────────────────
    if (action === "getMappings") {
      const { data: mappings, error } = await admin
        .from("xero_account_mappings")
        .select("*")
        .order("entity_type")
        .order("category");

      if (error) {
        return json({ error: "Failed to read mappings", details: error.message }, 500);
      }

      return json({ mappings: mappings || [] });
    }

    // ── SAVE MAPPINGS: Upsert account mappings ────────────────────────────
    if (action === "saveMappings") {
      const { mappings } = body;
      if (!mappings || !Array.isArray(mappings)) {
        return json({ error: "mappings array required" }, 400);
      }

      // Validate each mapping
      for (const m of mappings) {
        if (!m.entity_type || !m.xero_account_code || !m.xero_account_name) {
          return json({ error: "Each mapping requires entity_type, xero_account_code, and xero_account_name" }, 400);
        }
        if (m.entity_type !== "invoice" && m.entity_type !== "bill") {
          return json({ error: "entity_type must be 'invoice' or 'bill'" }, 400);
        }
      }

      // Upsert each mapping (entity_type + category is the unique key)
      for (const m of mappings) {
        const { error } = await admin
          .from("xero_account_mappings")
          .upsert(
            {
              entity_type: m.entity_type,
              category: m.category || "",
              xero_account_code: m.xero_account_code,
              xero_account_name: m.xero_account_name,
            },
            { onConflict: "entity_type,category" }
          );

        if (error) {
          return json({ error: "Failed to save mapping", details: error.message }, 500);
        }
      }

      return json({ success: true, saved: mappings.length });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});
