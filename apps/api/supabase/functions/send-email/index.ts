import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") || "FieldOps <notifications@c8c.com.au>";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://fieldops.netlify.app";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
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

// HTML-escape a value, returning empty string for null/undefined
function esc(val: unknown): string {
  const s = val == null ? "" : String(val);
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Reusable HTML building blocks (table-based for email clients) ──────────

function emailLayout(accentColor: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
      <!-- Header -->
      <tr>
        <td style="background:${accentColor};padding:24px 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.05em;">FIELDOPS</span>
                <span style="color:rgba(255,255,255,0.7);font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;padding-left:12px;">Job Management</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <!-- Body -->
      <tr>
        <td style="padding:32px 32px 24px 32px;">
          ${content}
        </td>
      </tr>
      <!-- Footer -->
      <tr>
        <td style="padding:20px 32px;border-top:1px solid #eeeeee;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size:11px;color:#999999;text-align:center;line-height:1.5;">
                FieldOps &middot; Job Management<br>
                This is an automated notification
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function greeting(name: string): string {
  return `<p style="margin:0 0 16px 0;font-size:15px;color:#333333;line-height:1.5;">Hi ${esc(name)},</p>`;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px 0;font-size:14px;color:#555555;line-height:1.6;">${text}</p>`;
}

function detailsBox(rows: [string, string][]): string {
  const rowsHtml = rows
    .filter(([, val]) => val && val.trim())
    .map(([label, value]) =>
      `<tr>
        <td style="padding:8px 12px;font-size:12px;font-weight:700;color:#888888;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap;vertical-align:top;width:140px;">${esc(label)}</td>
        <td style="padding:8px 12px;font-size:14px;color:#333333;font-weight:600;">${esc(value)}</td>
      </tr>`)
    .join("\n");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin:16px 0 20px 0;">
    ${rowsHtml}
  </table>`;
}

function amountHighlight(label: string, amount: string, color: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${color};border-radius:6px;margin:0 0 20px 0;">
    <tr>
      <td style="padding:16px 20px;">
        <span style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.8);text-transform:uppercase;letter-spacing:0.08em;">${esc(label)}</span><br>
        <span style="font-size:24px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">${esc(amount)}</span>
      </td>
    </tr>
  </table>`;
}

function closing(): string {
  return `<p style="margin:24px 0 0 0;font-size:14px;color:#555555;line-height:1.6;">Kind regards,<br><strong style="color:#333333;">FieldOps</strong></p>`;
}

function divider(): string {
  return `<hr style="border:none;border-top:1px solid #eeeeee;margin:20px 0;">`;
}

function acceptButton(label: string, url: string, color: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background:${color};border-radius:8px;">
              <a href="${url}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.02em;">${label}</a>
            </td>
          </tr>
        </table>
        <p style="margin:8px 0 0 0;font-size:11px;color:#999999;">or copy this link: <a href="${url}" style="color:#999999;word-break:break-all;">${url}</a></p>
      </td>
    </tr>
  </table>`;
}

function noticeBox(text: string, bgColor = "#fffbeb", borderColor = "#fbbf24", textColor = "#92400e"): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
    <tr><td style="background:${bgColor};border:1px solid ${borderColor};border-radius:6px;padding:12px 16px;font-size:13px;color:${textColor};line-height:1.5;">
      ${text}
    </td></tr>
  </table>`;
}

// ── Build email subject & HTML for each type ───────────────────────────────

function buildEmail(
  type: string,
  data: Record<string, unknown>
): { subject: string; html: string } | null {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === "string") vars[k] = v;
    else if (typeof v === "number") vars[k] = String(v);
  }

  // If custom emailBody is provided, wrap it in the branded layout
  function customBodyEmail(accentColor: string, subject: string): { subject: string; html: string } {
    const renderedBody = render(data.emailBody as string, vars);
    const lines = esc(renderedBody).split("\n").map(l => l === "" ? "<br>" : `<p style="margin:0 0 8px 0;font-size:14px;color:#555555;line-height:1.6;">${l}</p>`).join("\n");
    return { subject, html: emailLayout(accentColor, lines) };
  }

  switch (type) {
    case "quote": {
      const total = formatCurrency(data.total as number);
      vars.total = total;
      const subject = data.emailSubject
        ? render(data.emailSubject as string, vars)
        : `Quote ${vars.number || ""} from FieldOps`;
      if (data.emailBody) return customBodyEmail("#111111", subject);

      const contentParts = [
        greeting(vars.clientName || "there"),
        paragraph(`Please find attached your quote for <strong style="color:#333333;">${esc(vars.jobTitle || "your project")}</strong>.`),
        detailsBox([
          ["Quote", vars.number || ""],
          ["Job", vars.jobTitle || ""],
          ["Reference", vars.jobReference || ""],
        ]),
        amountHighlight("Total (inc. GST)", total, "#111111"),
      ];
      if (data.acceptUrl) {
        contentParts.push(acceptButton("Accept Quote", data.acceptUrl as string, "#111111"));
      }
      contentParts.push(
        paragraph("If you have any questions or would like to discuss the scope of work, please don't hesitate to get in touch."),
        paragraph("This quote is valid for 30 days from the date of issue."),
        closing(),
      );
      return { subject, html: emailLayout("#111111", contentParts.join("\n")) };
    }

    case "invoice": {
      const total = formatCurrency(data.total as number);
      vars.total = total;
      const subject = data.emailSubject
        ? render(data.emailSubject as string, vars)
        : `Invoice ${vars.number || ""} from FieldOps`;
      if (data.emailBody) return customBodyEmail("#4f46e5", subject);

      const content = [
        greeting(vars.clientName || "there"),
        paragraph(`Please find attached your invoice for <strong style="color:#333333;">${esc(vars.jobTitle || "your project")}</strong>.`),
        detailsBox([
          ["Invoice", vars.number || ""],
          ["Job", vars.jobTitle || ""],
          ["Due Date", vars.dueDate || "On receipt"],
        ]),
        amountHighlight("Amount Due (inc. GST)", total, "#4f46e5"),
        paragraph("Please ensure payment is made by the due date. If you have any questions regarding this invoice, feel free to get in touch."),
        closing(),
      ].join("\n");
      return { subject, html: emailLayout("#4f46e5", content) };
    }

    case "work_order": {
      const recipient = vars.contractorName || vars.clientName || "there";
      const subject = data.emailSubject
        ? render(data.emailSubject as string, vars)
        : `Work Order ${vars.number || ""} from FieldOps`;
      if (data.emailBody) return customBodyEmail("#2563eb", subject);

      const contentParts = [
        greeting(recipient),
        paragraph(`We have a new work order for you${vars.jobTitle ? ` regarding <strong style="color:#333333;">${esc(vars.jobTitle)}</strong>` : ""}.`),
        detailsBox([
          ["Work Order", vars.number || ""],
          ["Job", vars.jobTitle || ""],
        ]),
        paragraph("The full scope of work and pricing details are included in the attached document."),
      ];
      if (data.acceptUrl) {
        contentParts.push(acceptButton("Accept Work Order", data.acceptUrl as string, "#2563eb"));
      } else {
        contentParts.push(paragraph("<strong style='color:#333333;'>Please confirm your acceptance</strong> at your earliest convenience so we can schedule the works accordingly."));
      }
      contentParts.push(closing());
      return { subject, html: emailLayout("#2563eb", contentParts.join("\n")) };
    }

    case "purchase_order": {
      const recipient = vars.supplierName || vars.clientName || "there";
      const subject = data.emailSubject
        ? render(data.emailSubject as string, vars)
        : `Purchase Order ${vars.number || ""} from FieldOps`;
      if (data.emailBody) return customBodyEmail("#059669", subject);

      const contentParts = [
        greeting(recipient),
        paragraph("Please find attached our purchase order for your review."),
        detailsBox([
          ["PO Number", vars.number || ""],
          ["Job", vars.jobTitle || ""],
        ]),
      ];
      if (data.acceptUrl) {
        contentParts.push(acceptButton("Accept Purchase Order", data.acceptUrl as string, "#059669"));
      } else {
        contentParts.push(paragraph("Please confirm receipt and provide an <strong style='color:#333333;'>expected delivery date</strong> at your earliest convenience."));
      }
      contentParts.push(closing());
      return { subject, html: emailLayout("#059669", contentParts.join("\n")) };
    }

    case "payment_reminder": {
      const amount = formatCurrency(data.amount as number);
      const overdue = data.daysOverdue ? `${data.daysOverdue} days` : "overdue";
      const subject = `Payment Reminder \u2014 Invoice ${vars.invoiceRef || ""}`;

      const content = [
        greeting(vars.clientName || "there"),
        paragraph("This is a friendly reminder regarding an outstanding invoice."),
        detailsBox([
          ["Invoice", vars.invoiceRef || ""],
          ["Amount Due", amount],
          ["Due Date", vars.dueDate || "N/A"],
          ["Overdue By", overdue],
        ]),
        amountHighlight("Outstanding Balance", amount, "#dc2626"),
        paragraph("We would appreciate prompt payment to keep your account up to date."),
        noticeBox("If payment has already been made, please disregard this reminder. It may take a few days for payments to be reflected in our system.", "#fef2f2", "#fca5a5", "#991b1b"),
        paragraph("If you have any questions about this invoice, please don't hesitate to get in touch."),
        closing(),
      ].join("\n");
      return { subject, html: emailLayout("#dc2626", content) };
    }

    case "compliance_expiry": {
      const subject = `Compliance Document Expiring \u2014 ${vars.docType || "Document"}`;
      const daysText = vars.daysUntil ? `${vars.daysUntil} days` : "soon";

      const content = [
        greeting(vars.contractorName || "there"),
        paragraph("This is a reminder that one of your compliance documents is approaching its expiry date."),
        detailsBox([
          ["Document Type", vars.docType || ""],
          ["Expiry Date", vars.expiryDate || "N/A"],
          ["Expires In", daysText],
        ]),
        noticeBox(`<strong>Action required:</strong> Please upload an updated <strong>${esc(vars.docType || "document")}</strong> at your earliest convenience to avoid any disruption to scheduled work.`),
        paragraph("You can reply to this email with your updated document or upload it directly through the system."),
        closing(),
      ].join("\n");
      return { subject, html: emailLayout("#d97706", content) };
    }

    case "invite": {
      const roleText = vars.role === "admin" ? "an Admin" : "a Team Member";
      const subject = "You've been invited to FieldOps";

      const content = [
        greeting(vars.fullName || "there"),
        paragraph(`You've been invited to join <strong style="color:#333333;">FieldOps</strong> as <strong style="color:#333333;">${roleText}</strong>.`),
        paragraph("Here are your login details:"),
        detailsBox([
          ["Email", vars.email || ""],
          ["Temporary Password", vars.temporaryPassword || ""],
          ["Role", vars.role === "admin" ? "Admin" : "Staff"],
        ]),
        noticeBox("<strong>Important:</strong> Please change your password after your first login to keep your account secure.", "#eff6ff", "#93c5fd", "#1e40af"),
        closing(),
      ].join("\n");
      return { subject, html: emailLayout("#111111", content) };
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

  // Verify the caller is authenticated by checking their JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Missing Authorization header" }, 401);
  }

  const anonClient = createClient(
    SUPABASE_URL,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const {
    data: { user: caller },
  } = await anonClient.auth.getUser();
  if (!caller) {
    return json({ error: "Invalid or expired token" }, 401);
  }

  if (!RESEND_API_KEY) {
    return json({ error: "RESEND_API_KEY not configured" }, 500);
  }

  let body: { type: string; to: string; cc?: string; data: Record<string, unknown>; attachments?: { filename: string; content: string }[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { type, to, cc, data, attachments } = body;
  if (!type || !to) {
    return json({ error: "type and to are required" }, 400);
  }

  const email = buildEmail(type, data || {});
  if (!email) {
    return json({ error: `Unknown email type: ${type}` }, 400);
  }

  // Build Resend payload
  const resendPayload: Record<string, unknown> = {
    from: FROM_EMAIL,
    to: [to],
    subject: email.subject,
    html: email.html,
  };
  if (cc) resendPayload.cc = [cc];
  if (attachments && attachments.length > 0) {
    resendPayload.attachments = attachments.map(a => ({
      filename: a.filename,
      content: a.content,  // base64 encoded
    }));
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify(resendPayload),
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
