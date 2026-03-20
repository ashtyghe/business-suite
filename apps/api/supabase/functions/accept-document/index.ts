import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://fieldops.netlify.app";

// Service-role client so we can update records without auth
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ── Branded HTML response page ─────────────────────────────────────────────
function htmlPage(title: string, message: string, accent: string, success: boolean): Response {
  const icon = success
    ? `<div style="width:64px;height:64px;border-radius:50%;background:${accent};display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
         <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
       </div>`
    : `<div style="width:64px;height:64px;border-radius:50%;background:#fef2f2;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
         <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
       </div>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} — FieldOps</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f4f5; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { background: #fff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); max-width: 480px; width: 100%; padding: 48px 32px; text-align: center; }
    .brand { font-size: 14px; font-weight: 800; letter-spacing: 0.1em; color: ${accent}; margin-bottom: 32px; text-transform: uppercase; }
    h1 { font-size: 22px; font-weight: 700; color: #111; margin-bottom: 12px; }
    p { font-size: 14px; color: #666; line-height: 1.6; margin-bottom: 8px; }
    .footer { margin-top: 32px; font-size: 11px; color: #bbb; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">FieldOps</div>
    ${icon}
    <h1>${title}</h1>
    <p>${message}</p>
    <div class="footer">FieldOps · Job Management</div>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: success ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// ── Table and label config per document type ───────────────────────────────
const DOC_TYPES: Record<string, { table: string; refCol: string; label: string; accent: string; acceptedStatus: string }> = {
  quote: { table: "quotes", refCol: "number", label: "Quote", accent: "#111111", acceptedStatus: "accepted" },
  work_order: { table: "work_orders", refCol: "ref", label: "Work Order", accent: "#2563eb", acceptedStatus: "Accepted" },
  purchase_order: { table: "purchase_orders", refCol: "ref", label: "Purchase Order", accent: "#059669", acceptedStatus: "Accepted" },
};

Deno.serve(async (req: Request) => {
  // Only allow GET (link clicks from email/PDF)
  if (req.method !== "GET") {
    return htmlPage("Method Not Allowed", "This link should be opened in your browser.", "#111", false);
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const type = url.searchParams.get("type");

  if (!token || !type || !DOC_TYPES[type]) {
    return htmlPage("Invalid Link", "This acceptance link is not valid. Please contact the sender.", "#111", false);
  }

  const config = DOC_TYPES[type];

  try {
    // Look up the document by token
    const { data: doc, error: lookupErr } = await supabase
      .from(config.table)
      .select(`id, ${config.refCol}, status, accept_token, accepted_at`)
      .eq("accept_token", token)
      .single();

    if (lookupErr || !doc) {
      return htmlPage("Link Not Found", "This acceptance link has expired or is not valid. Please contact the sender for a new link.", config.accent, false);
    }

    const docRef = doc[config.refCol] || doc.id;

    // Already accepted?
    if (doc.accepted_at) {
      const acceptedDate = new Date(doc.accepted_at).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
      return htmlPage(
        `Already Accepted`,
        `${config.label} <strong>${docRef}</strong> was already accepted on ${acceptedDate}. No further action is needed.`,
        config.accent,
        true
      );
    }

    // Update the document: set status to Accepted, record timestamp
    const now = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from(config.table)
      .update({
        status: config.acceptedStatus,
        accepted_at: now,
        accepted_by: "Accepted via link",
      })
      .eq("id", doc.id);

    if (updateErr) {
      console.error("Update error:", updateErr);
      return htmlPage("Something Went Wrong", "We couldn't process your acceptance. Please try again or contact the sender.", config.accent, false);
    }

    return htmlPage(
      `${config.label} Accepted`,
      `Thank you! <strong>${config.label} ${docRef}</strong> has been accepted on ${new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}. The sender has been notified.`,
      config.accent,
      true
    );
  } catch (err) {
    console.error("Accept error:", err);
    return htmlPage("Something Went Wrong", "An unexpected error occurred. Please try again or contact the sender.", config.accent, false);
  }
});
