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

function emailLayout(accentColor: string, content: string, subtitle?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
@media only screen and (max-width:480px){
.digest-kpi-table td{display:block!important;width:100%!important;box-sizing:border-box!important;}
.digest-row-2col td{display:block!important;width:100%!important;}
.mob-full{width:100%!important;display:block!important;}
.mob-pad{padding-left:16px!important;padding-right:16px!important;}
.mob-hide{display:none!important;}
}
</style>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
      <!-- Header -->
      <tr>
        <td style="background:${accentColor};padding:24px 32px;" class="mob-pad">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.05em;">FIELDOPS</span>
                <span style="color:rgba(255,255,255,0.7);font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;padding-left:12px;">${subtitle || "Job Management"}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <!-- Body -->
      <tr>
        <td style="padding:32px 32px 24px 32px;" class="mob-pad">
          ${content}
        </td>
      </tr>
      <!-- Footer -->
      <tr>
        <td style="padding:20px 32px;border-top:1px solid #eeeeee;" class="mob-pad">
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

// ── Digest email building blocks ─────────────────────────────────────────────

function sectionHeading(label: string, color: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 12px 0;">
    <tr>
      <td style="border-bottom:2px solid ${color};padding-bottom:6px;">
        <span style="font-size:13px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:0.06em;">${esc(label)}</span>
      </td>
    </tr>
  </table>`;
}

function kpiCard(label: string, value: string, color: string, sub?: string): string {
  return `<td style="padding:12px 10px;text-align:center;vertical-align:top;" class="mob-full">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:6px;border-top:3px solid ${color};">
      <tr><td style="padding:14px 8px 4px 8px;text-align:center;">
        <div style="font-size:22px;font-weight:700;color:${color};letter-spacing:-0.02em;">${esc(value)}</div>
      </td></tr>
      <tr><td style="padding:0 8px 4px 8px;text-align:center;">
        <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.06em;">${esc(label)}</div>
      </td></tr>
      ${sub ? `<tr><td style="padding:0 8px 10px 8px;text-align:center;"><div style="font-size:11px;color:#999;">${esc(sub)}</div></td></tr>` : `<tr><td style="padding:0 0 10px 0;"></td></tr>`}
    </table>
  </td>`;
}

function progressBar(label: string, value: number, max: number, color: string, suffix?: string): string {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0;">
    <tr>
      <td style="font-size:12px;color:#555;padding:2px 0;width:40%;">${esc(label)}</td>
      <td style="padding:2px 8px;width:40%;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:#eee;border-radius:3px;height:8px;">
          <div style="width:${pct}%;max-width:100%;background:${color};height:8px;border-radius:3px;"></div>
        </td></tr></table>
      </td>
      <td style="font-size:12px;font-weight:700;color:${color};text-align:right;white-space:nowrap;width:20%;">${esc(suffix || `${value}`)}</td>
    </tr>
  </table>`;
}

function listItemRow(title: string, sub: string, detail: string, severity: string): string {
  const dotColor = severity === "high" ? "#dc2626" : severity === "medium" ? "#f59e0b" : "#22c55e";
  const detailColor = severity === "high" ? "#dc2626" : "#666";
  return `<tr>
    <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;vertical-align:top;width:12px;">
      <div style="width:8px;height:8px;border-radius:50%;background:${dotColor};margin-top:4px;"></div>
    </td>
    <td style="padding:8px 8px;border-bottom:1px solid #f0f0f0;vertical-align:top;">
      <div style="font-size:13px;font-weight:600;color:#333;">${esc(title)}</div>
      ${sub ? `<div style="font-size:11px;color:#888;margin-top:1px;">${esc(sub)}</div>` : ""}
    </td>
    <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;text-align:right;vertical-align:top;white-space:nowrap;">
      <span style="font-size:11px;font-weight:600;color:${detailColor};">${esc(detail)}</span>
    </td>
  </tr>`;
}

function categoryBlock(label: string, color: string, count: number, items: { title: string; sub: string; detail: string; severity: string }[]): string {
  const rows = items.map(i => listItemRow(i.title, i.sub, i.detail, i.severity)).join("\n");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
    <tr>
      <td style="padding:10px 12px;background:${color}10;border-left:3px solid ${color};border-radius:0 4px 4px 0;">
        <span style="font-size:13px;font-weight:700;color:${color};">${esc(label)}</span>
        <span style="display:inline-block;background:${color};color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;margin-left:8px;">${count}</span>
      </td>
    </tr>
    <tr><td style="padding:0 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${rows}
      </table>
    </td></tr>
  </table>`;
}

function viewAppButton(label: string, appUrl: string, color: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 8px 0;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr><td style="background:${color};border-radius:8px;">
          <a href="${appUrl}" target="_blank" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.02em;">${label}</a>
        </td></tr>
      </table>
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

    case "dashboard_digest": {
      const d = data as Record<string, unknown>;
      const appUrl = (d.appUrl as string) || "https://fieldops.netlify.app";
      const dayLabel = (d.dayLabel as string) || "Weekly";
      const dateStr = (d.dateStr as string) || new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

      // Financial KPIs
      const totalQuoted = formatCurrency(d.totalQuoted as number || 0);
      const revenueCollected = formatCurrency(d.revenueCollected as number || 0);
      const outstandingInv = formatCurrency(d.outstandingInv as number || 0);
      const outstandingInvCount = Number(d.outstandingInvCount || 0);
      const unpostedBillsTotal = formatCurrency(d.unpostedBillsTotal as number || 0);
      const unpostedBillsCount = Number(d.unpostedBillsCount || 0);

      // Operational
      const activeJobs = Number(d.activeJobs || 0);
      const completedJobs = Number(d.completedJobs || 0);
      const overdueJobCount = Number(d.overdueJobCount || 0);
      const totalJobs = Number(d.totalJobs || 0);
      const margin = Number(d.margin || 0);
      const totalInvoiced = formatCurrency(d.totalInvoiced as number || 0);
      const totalBillsCost = formatCurrency(d.totalBillsCost as number || 0);

      // Timesheets
      const totalHours = Number(d.totalHours || 0);
      const billableHours = Number(d.billableHours || 0);
      const billableRatio = Number(d.billableRatio || 0);
      const workers = (d.workers as { name: string; total: number; billable: number }[]) || [];

      // Orders
      const activeWOs = Number(d.activeWOs || 0);
      const overdueWOs = Number(d.overdueWOs || 0);
      const woAwaitingAcceptance = Number(d.woAwaitingAcceptance || 0);
      const activePOs = Number(d.activePOs || 0);
      const overduePOs = Number(d.overduePOs || 0);

      // Quotes
      const quoteDrafts = Number(d.quoteDrafts || 0);
      const pipelineTotal = formatCurrency(d.pipelineTotal as number || 0);
      const quoteConversion = Number(d.quoteConversion || 0);

      // Schedule
      const scheduleItems = (d.scheduleItems as { title: string; date: string; time?: string }[]) || [];

      // Action items
      const actionItems = (d.actionItems as { label: string; color: string }[]) || [];

      // Jobs lists
      const overdueJobs = (d.overdueJobs as { title: string; dueDate: string }[]) || [];
      const jobsDueThisWeek = (d.jobsDueThisWeek as { title: string; dueDate: string }[]) || [];

      // Unpaid invoices
      const unpaidInvoices = (d.unpaidInvoices as { number: string; amount: string; status: string }[]) || [];

      // Jobs by status
      const jobStatuses = (d.jobStatuses as { status: string; label: string; count: number; color: string }[]) || [];

      const marginColor = margin >= 20 ? "#16a34a" : margin >= 0 ? "#d97706" : "#dc2626";
      const billableColor = billableRatio >= 80 ? "#16a34a" : billableRatio >= 50 ? "#d97706" : "#dc2626";

      const subject = `${dayLabel} Dashboard — ${dateStr}`;

      const content: string[] = [];

      // Date & greeting
      content.push(`<p style="margin:0 0 4px 0;font-size:12px;color:#999;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">${esc(dayLabel)} Business Dashboard</p>`);
      content.push(`<p style="margin:0 0 20px 0;font-size:18px;font-weight:700;color:#111;">${esc(dateStr)}</p>`);

      // Action items banner
      if (actionItems.length > 0) {
        const pills = actionItems.map(a =>
          `<span style="display:inline-block;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600;color:${a.color};background:${a.color}12;border:1px solid ${a.color}30;margin:2px 4px 2px 0;">${esc(a.label)}</span>`
        ).join("");
        content.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
          <tr><td style="background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:12px 14px;">
            <div style="font-size:11px;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Needs Attention</div>
            ${pills}
          </td></tr>
        </table>`);
      }

      // Financial KPIs (2x2 grid)
      content.push(sectionHeading("Financial Overview", "#111"));
      content.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="digest-kpi-table">
        <tr>
          ${kpiCard("Total Quoted", totalQuoted, "#111")}
          ${kpiCard("Revenue", revenueCollected, "#16a34a")}
        </tr>
        <tr>
          ${kpiCard("Outstanding", outstandingInv, outstandingInvCount > 0 ? "#dc2626" : "#16a34a", `${outstandingInvCount} invoice${outstandingInvCount !== 1 ? "s" : ""}`)}
          ${kpiCard("Unposted Bills", unpostedBillsTotal, unpostedBillsCount > 0 ? "#d97706" : "#16a34a", `${unpostedBillsCount} bill${unpostedBillsCount !== 1 ? "s" : ""}`)}
        </tr>
      </table>`);

      // Profitability
      content.push(sectionHeading("Profitability", marginColor));
      content.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:6px;border-top:3px solid ${marginColor};margin:0 0 16px 0;">
        <tr>
          <td style="padding:16px;text-align:center;width:33%;">
            <div style="font-size:28px;font-weight:700;color:${marginColor};">${margin}%</div>
            <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;">Margin</div>
          </td>
          <td style="padding:16px;border-left:1px solid #e5e7eb;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="font-size:11px;color:#888;padding:2px 0;">Revenue</td><td style="font-size:13px;font-weight:700;color:#333;text-align:right;">${esc(totalInvoiced)}</td></tr>
              <tr><td style="font-size:11px;color:#888;padding:2px 0;">Costs</td><td style="font-size:13px;font-weight:700;color:#333;text-align:right;">${esc(totalBillsCost)}</td></tr>
            </table>
          </td>
        </tr>
      </table>`);

      // Operational KPIs
      content.push(sectionHeading("Jobs & Operations", "#ea580c"));
      content.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="digest-kpi-table">
        <tr>
          ${kpiCard("Active Jobs", String(activeJobs), "#ea580c")}
          ${kpiCard("Completed", String(completedJobs), "#16a34a")}
          ${kpiCard("Overdue", String(overdueJobCount), overdueJobCount > 0 ? "#dc2626" : "#16a34a")}
        </tr>
      </table>`);

      // Jobs by status
      if (jobStatuses.length > 0) {
        const statusRows = jobStatuses.map(js =>
          progressBar(js.label, js.count, totalJobs, js.color, `${js.count}`)
        ).join("");
        content.push(statusRows);
      }

      // Overdue jobs list
      if (overdueJobs.length > 0) {
        content.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 0 0;">
          ${overdueJobs.slice(0, 5).map(j => `<tr>
            <td style="padding:4px 0;font-size:12px;color:#dc2626;"><span style="display:inline-block;width:6px;height:6px;background:#dc2626;border-radius:50%;margin-right:6px;vertical-align:middle;"></span>${esc(j.title)}</td>
            <td style="padding:4px 0;font-size:11px;color:#999;text-align:right;">Due ${esc(j.dueDate)}</td>
          </tr>`).join("")}
          ${overdueJobs.length > 5 ? `<tr><td colspan="2" style="font-size:11px;color:#999;padding:4px 0;">+${overdueJobs.length - 5} more</td></tr>` : ""}
        </table>`);
      }

      // Orders summary
      content.push(sectionHeading("Orders", "#2563eb"));
      content.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="digest-kpi-table">
        <tr>
          ${kpiCard("Work Orders", String(activeWOs), "#2563eb", overdueWOs > 0 ? `${overdueWOs} overdue` : undefined)}
          ${kpiCard("Awaiting Accept", String(woAwaitingAcceptance), woAwaitingAcceptance > 0 ? "#d97706" : "#2563eb")}
          ${kpiCard("Purchase Orders", String(activePOs), "#059669", overduePOs > 0 ? `${overduePOs} overdue` : undefined)}
        </tr>
      </table>`);

      // Timesheets
      content.push(sectionHeading("Timesheets", "#be185d"));
      content.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:6px;border-top:3px solid #be185d;margin:0 0 8px 0;">
        <tr>
          <td style="padding:14px;text-align:center;width:33%;">
            <div style="font-size:24px;font-weight:700;color:#be185d;">${totalHours}h</div>
            <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;">Total</div>
          </td>
          <td style="padding:14px;text-align:center;border-left:1px solid #e5e7eb;width:33%;">
            <div style="font-size:24px;font-weight:700;color:#333;">${billableHours}h</div>
            <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;">Billable</div>
          </td>
          <td style="padding:14px;text-align:center;border-left:1px solid #e5e7eb;width:34%;">
            <div style="font-size:24px;font-weight:700;color:${billableColor};">${billableRatio}%</div>
            <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;">Billable Rate</div>
          </td>
        </tr>
      </table>`);

      // Team utilisation bars
      if (workers.length > 0) {
        const workerRows = workers.slice(0, 6).map(w => {
          const ratio = w.total > 0 ? Math.round((w.billable / w.total) * 100) : 0;
          const wColor = ratio >= 80 ? "#16a34a" : ratio >= 50 ? "#d97706" : "#dc2626";
          return progressBar(
            `${w.name.split(" ").map((n: string) => n[0]).join("")} ${w.name}`,
            w.billable, w.total, wColor, `${w.total}h (${ratio}%)`
          );
        }).join("");
        content.push(workerRows);
      }

      // Quotes pipeline
      content.push(sectionHeading("Quotes Pipeline", "#ca8a04"));
      content.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="digest-kpi-table">
        <tr>
          ${kpiCard("Pipeline", pipelineTotal, "#ca8a04")}
          ${kpiCard("Drafts", String(quoteDrafts), quoteDrafts > 0 ? "#d97706" : "#ca8a04")}
          ${kpiCard("Conversion", `${quoteConversion}%`, "#16a34a")}
        </tr>
      </table>`);

      // Unpaid invoices
      if (unpaidInvoices.length > 0) {
        content.push(sectionHeading("Unpaid Invoices", "#4f46e5"));
        content.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px 0;">
          <tr>
            <td style="padding:6px 0;font-size:10px;font-weight:700;color:#888;text-transform:uppercase;">Invoice</td>
            <td style="padding:6px 0;font-size:10px;font-weight:700;color:#888;text-transform:uppercase;text-align:right;">Amount</td>
            <td style="padding:6px 0;font-size:10px;font-weight:700;color:#888;text-transform:uppercase;text-align:right;">Status</td>
          </tr>
          ${unpaidInvoices.slice(0, 8).map(inv => {
            const isOverdue = inv.status === "overdue";
            return `<tr>
              <td style="padding:6px 0;font-size:13px;font-weight:600;color:#333;border-bottom:1px solid #f0f0f0;">${esc(inv.number)}</td>
              <td style="padding:6px 0;font-size:13px;font-weight:600;color:#333;text-align:right;border-bottom:1px solid #f0f0f0;">${esc(inv.amount)}</td>
              <td style="padding:6px 0;text-align:right;border-bottom:1px solid #f0f0f0;">
                <span style="font-size:10px;font-weight:700;color:${isOverdue ? "#dc2626" : "#d97706"};text-transform:uppercase;">${esc(inv.status)}</span>
              </td>
            </tr>`;
          }).join("")}
          ${unpaidInvoices.length > 8 ? `<tr><td colspan="3" style="font-size:11px;color:#999;padding:6px 0;">+${unpaidInvoices.length - 8} more</td></tr>` : ""}
        </table>`);
      }

      // Schedule (upcoming)
      if (scheduleItems.length > 0) {
        content.push(sectionHeading("Upcoming Schedule", "#0891b2"));
        content.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px 0;">
          ${scheduleItems.slice(0, 7).map(s => `<tr>
            <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;width:28%;">
              <span style="font-size:11px;font-weight:700;color:#0891b2;">${esc(s.date)}</span>
              ${s.time ? `<span style="font-size:10px;color:#999;margin-left:4px;">${esc(s.time)}</span>` : ""}
            </td>
            <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#333;">${esc(s.title)}</td>
          </tr>`).join("")}
        </table>`);
      }

      // CTA
      content.push(viewAppButton("Open Dashboard", appUrl, "#111"));
      content.push(closing());

      return { subject, html: emailLayout("#111111", content.join("\n"), `${dayLabel} Dashboard`) };
    }

    case "actions_digest": {
      const d = data as Record<string, unknown>;
      const appUrl = (d.appUrl as string) || "https://fieldops.netlify.app";
      const dayLabel = (d.dayLabel as string) || "Weekly";
      const dateStr = (d.dateStr as string) || new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

      const totalCount = Number(d.totalCount || 0);
      const highCount = Number(d.highCount || 0);

      // Timesheet summary
      const totalHours = Number(d.totalHours || 0);
      const billableHours = Number(d.billableHours || 0);
      const billableRatio = Number(d.billableRatio || 0);
      const workers = (d.workers as { name: string; total: number; billable: number }[]) || [];

      // Categories
      const categories = (d.categories as {
        id: string;
        label: string;
        color: string;
        items: { title: string; sub: string; detail: string; severity: string }[];
      }[]) || [];

      const accent = "#ef4444";
      const subject = `${dayLabel} Actions — ${totalCount} item${totalCount !== 1 ? "s" : ""} need attention`;

      const content: string[] = [];

      // Date & title
      content.push(`<p style="margin:0 0 4px 0;font-size:12px;color:#999;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">${esc(dayLabel)} Actions Report</p>`);
      content.push(`<p style="margin:0 0 20px 0;font-size:18px;font-weight:700;color:#111;">${esc(dateStr)}</p>`);

      // Summary banner
      const countColor = totalCount > 0 ? accent : "#16a34a";
      content.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
        <tr><td style="background:${totalCount > 0 ? "#fef2f2" : "#f0fdf4"};border:1px solid ${totalCount > 0 ? "#fca5a5" : "#86efac"};border-radius:8px;padding:16px 20px;text-align:center;">
          <div style="font-size:36px;font-weight:700;color:${countColor};line-height:1;">${totalCount}</div>
          <div style="font-size:13px;color:#555;margin-top:4px;">${totalCount === 1 ? "item needs attention" : "items need attention"}</div>
          ${highCount > 0 ? `<div style="margin-top:8px;"><span style="display:inline-block;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:700;background:#dc2626;color:#fff;">${highCount} high priority</span></div>` : ""}
        </td></tr>
      </table>`);

      // Category badges row
      const activeCats = categories.filter(c => c.items.length > 0);
      if (activeCats.length > 0) {
        const badges = activeCats.map(c =>
          `<span style="display:inline-block;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600;color:${c.color};background:${c.color}12;border:1px solid ${c.color}30;margin:2px 4px 2px 0;">${c.items.length} ${esc(c.label)}</span>`
        ).join("");
        content.push(`<div style="margin:0 0 20px 0;">${badges}</div>`);
      }

      // Timesheet summary (always shown if data present)
      if (totalHours > 0) {
        const billableColor = billableRatio >= 80 ? "#16a34a" : billableRatio >= 50 ? "#d97706" : "#dc2626";
        content.push(sectionHeading("Timesheets", "#be185d"));
        content.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:6px;border-left:3px solid #be185d;margin:0 0 8px 0;">
          <tr>
            <td style="padding:12px 14px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:11px;color:#888;padding:2px 0;">Total Hours</td>
                  <td style="font-size:13px;font-weight:700;color:#333;text-align:right;">${totalHours}h</td>
                </tr>
                <tr>
                  <td style="font-size:11px;color:#888;padding:2px 0;">Billable</td>
                  <td style="font-size:13px;font-weight:700;color:#333;text-align:right;">${billableHours}h</td>
                </tr>
                <tr>
                  <td style="font-size:11px;color:#888;padding:2px 0;">Non-billable</td>
                  <td style="font-size:13px;font-weight:700;color:#333;text-align:right;">${totalHours - billableHours}h</td>
                </tr>
                <tr>
                  <td style="font-size:11px;color:#888;padding:2px 0;">Billable %</td>
                  <td style="font-size:13px;font-weight:700;color:${billableColor};text-align:right;">${billableRatio}%</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>`);

        // Worker breakdown bars
        if (workers.length > 0) {
          const workerRows = workers.slice(0, 5).map(w => {
            const ratio = w.total > 0 ? Math.round((w.billable / w.total) * 100) : 0;
            const wColor = ratio >= 80 ? "#16a34a" : ratio >= 50 ? "#d97706" : "#dc2626";
            return progressBar(w.name, w.billable, w.total, wColor, `${w.total}h (${ratio}%)`);
          }).join("");
          content.push(workerRows);
        }
      }

      // Each category with items
      categories.forEach(cat => {
        if (cat.items.length === 0 && cat.id !== "timesheets") return;
        if (cat.id === "timesheets") return; // already rendered above
        content.push(categoryBlock(cat.label, cat.color, cat.items.length, cat.items.slice(0, 10)));
        if (cat.items.length > 10) {
          content.push(`<p style="font-size:11px;color:#999;margin:-12px 0 16px 8px;">+${cat.items.length - 10} more items — view in app</p>`);
        }
      });

      // All clear state
      if (totalCount === 0) {
        content.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
          <tr><td style="text-align:center;padding:32px 16px;">
            <div style="font-size:15px;color:#16a34a;font-weight:600;">All clear — nothing needs attention right now.</div>
          </td></tr>
        </table>`);
      }

      // CTA
      content.push(viewAppButton("Open Actions", `${appUrl}?page=actions`, accent));
      content.push(closing());

      return { subject, html: emailLayout(accent, content.join("\n"), `${dayLabel} Actions`) };
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
  // Service-role calls (e.g. from send-digest cron) are also accepted
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Missing Authorization header" }, 401);
  }

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const isServiceRole = authHeader === `Bearer ${serviceRoleKey}`;

  if (!isServiceRole) {
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
