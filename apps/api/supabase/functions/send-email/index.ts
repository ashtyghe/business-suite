import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") || "FieldOps <notifications@c8c.com.au>";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-client-info",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Simple {{variable}} template rendering
function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

// Format dollar amounts
function formatCurrency(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "$0.00";
  return "$" + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Convert plain text body to simple HTML email
function textToHtml(text: string, accentColor = "#111111"): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const lines = escaped.split("\n").map((l) => (l === "" ? "<br>" : `<p style="margin:0 0 4px 0;">${l}</p>`)).join("\n");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Open Sans',Arial,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:${accentColor};padding:20px 28px;">
      <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:0.03em;">FIELDOPS</span>
    </div>
    <div style="padding:28px;font-size:14px;line-height:1.6;color:#333;">
      ${lines}
    </div>
    <div style="padding:16px 28px;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center;">
      Sent via FieldOps
    </div>
  </div>
</body>
</html>`;
}

// Build email subject & body for each type
function buildEmail(
  type: string,
  data: Record<string, unknown>
): { subject: string; html: string } | null {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === "string") vars[k] = v;
    else if (typeof v === "number") vars[k] = String(v);
  }

  switch (type) {
    case "quote": {
      const total = formatCurrency(data.total as number);
      vars.total = total;
      const subject =
        data.emailSubject
          ? render(data.emailSubject as string, vars)
          : `Quote ${vars.number || ""} from FieldOps`;
      const body =
        data.emailBody
          ? render(data.emailBody as string, vars)
          : `Hi ${vars.clientName || ""},\n\nPlease find attached quote ${vars.number || ""} for ${vars.jobTitle || "your project"}.\n\nTotal: ${total} (inc. GST)\n\nIf you have any questions, please don't hesitate to get in touch.\n\nKind regards,\nFieldOps`;
      return { subject, html: textToHtml(body, "#111111") };
    }

    case "invoice": {
      const total = formatCurrency(data.total as number);
      vars.total = total;
      const subject =
        data.emailSubject
          ? render(data.emailSubject as string, vars)
          : `Invoice ${vars.number || ""} from FieldOps`;
      const body =
        data.emailBody
          ? render(data.emailBody as string, vars)
          : `Hi ${vars.clientName || ""},\n\nPlease find attached invoice ${vars.number || ""} for ${vars.jobTitle || "your project"}.\n\nTotal: ${total} (inc. GST)\nDue: ${vars.dueDate || "On receipt"}\n\nKind regards,\nFieldOps`;
      return { subject, html: textToHtml(body, "#4f46e5") };
    }

    case "work_order": {
      const subject =
        data.emailSubject
          ? render(data.emailSubject as string, vars)
          : `Work Order ${vars.number || ""} from FieldOps`;
      const body =
        data.emailBody
          ? render(data.emailBody as string, vars)
          : `Hi ${vars.contractorName || vars.clientName || ""},\n\nPlease find attached work order ${vars.number || ""} for ${vars.jobTitle || "your project"}.\n\nScope and pricing details are included in the attached document.\n\nPlease confirm your acceptance at your earliest convenience.\n\nKind regards,\nFieldOps`;
      return { subject, html: textToHtml(body, "#2563eb") };
    }

    case "purchase_order": {
      const subject =
        data.emailSubject
          ? render(data.emailSubject as string, vars)
          : `Purchase Order ${vars.number || ""} from FieldOps`;
      const body =
        data.emailBody
          ? render(data.emailBody as string, vars)
          : `Hi ${vars.supplierName || vars.clientName || ""},\n\nPlease find attached purchase order ${vars.number || ""}.\n\nPlease confirm receipt and expected delivery date.\n\nKind regards,\nFieldOps`;
      return { subject, html: textToHtml(body, "#059669") };
    }

    case "payment_reminder": {
      const amount = formatCurrency(data.amount as number);
      const overdue = data.daysOverdue ? `${data.daysOverdue} days overdue` : "overdue";
      const subject = `Payment Reminder — Invoice ${vars.invoiceRef || ""}`;
      const body = `Hi ${vars.clientName || ""},\n\nThis is a friendly reminder that invoice ${vars.invoiceRef || ""} for ${amount} was due on ${vars.dueDate || "N/A"} and is now ${overdue}.\n\nIf payment has already been made, please disregard this reminder.\n\nIf you have any questions about this invoice, please don't hesitate to get in touch.\n\nKind regards,\nFieldOps`;
      return { subject, html: textToHtml(body, "#dc2626") };
    }

    case "compliance_expiry": {
      const subject = `Compliance Document Expiring — ${vars.docType || "Document"}`;
      const body = `Hi ${vars.contractorName || ""},\n\nThis is a reminder that your ${vars.docType || "compliance document"} is expiring on ${vars.expiryDate || "N/A"} (${vars.daysUntil || "soon"} days from now).\n\nPlease upload an updated document at your earliest convenience to avoid any disruption to scheduled work.\n\nKind regards,\nFieldOps`;
      return { subject, html: textToHtml(body, "#d97706") };
    }

    case "invite": {
      const subject = `You've been invited to FieldOps`;
      const body = `Hi ${vars.fullName || ""},\n\nYou've been invited to FieldOps as ${vars.role === "admin" ? "an Admin" : "a Staff member"}.\n\nHere are your login details:\n\nEmail: ${vars.email || ""}\nTemporary Password: ${vars.temporaryPassword || ""}\n\nPlease log in and change your password as soon as possible.\n\nKind regards,\nFieldOps`;
      return { subject, html: textToHtml(body, "#111111") };
    }

    default:
      return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!RESEND_API_KEY) {
    return json({ error: "RESEND_API_KEY not configured" }, 500);
  }

  let body: { type: string; to: string; data: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { type, to, data } = body;
  if (!type || !to) {
    return json({ error: "type and to are required" }, 400);
  }

  const email = buildEmail(type, data || {});
  if (!email) {
    return json({ error: `Unknown email type: ${type}` }, 400);
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        subject: email.subject,
        html: email.html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return json(
        { error: `Resend API error: ${res.status}`, details: err },
        502
      );
    }

    const result = await res.json();
    return json({ success: true, id: result.id });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
