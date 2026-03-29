#!/usr/bin/env node
/**
 * Send example Dashboard and Actions digest emails using seed data.
 *
 * Usage:
 *   RESEND_API_KEY=re_xxx node scripts/send-example-digests.js ashley@c8c.com.au
 *
 * Requires: Node 18+ (native fetch)
 */

const TO = process.argv[2] || "ashley@c8c.com.au";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "FieldOps <notifications@c8c.com.au>";

if (!RESEND_API_KEY) {
  console.error("Error: Set RESEND_API_KEY environment variable");
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(val) {
  const s = val == null ? "" : String(val);
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatCurrency(n) {
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return "$0.00";
  return "$" + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// ── Email building blocks ────────────────────────────────────────────────────

function emailLayout(accentColor, content, subtitle) {
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
      <tr>
        <td style="padding:32px 32px 24px 32px;" class="mob-pad">
          ${content}
        </td>
      </tr>
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

function sectionHeading(label, color) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 12px 0;">
    <tr><td style="border-bottom:2px solid ${color};padding-bottom:6px;">
      <span style="font-size:13px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:0.06em;">${esc(label)}</span>
    </td></tr>
  </table>`;
}

function kpiCard(label, value, color, sub) {
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

function progressBar(label, value, max, color, suffix) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0;">
    <tr>
      <td style="font-size:12px;color:#555;padding:2px 0;width:40%;">${esc(label)}</td>
      <td style="padding:2px 8px;width:40%;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:#eee;border-radius:3px;height:8px;">
          <div style="width:${pct}%;max-width:100%;background:${color};height:8px;border-radius:3px;"></div>
        </td></tr></table>
      </td>
      <td style="font-size:12px;font-weight:700;color:${color};text-align:right;white-space:nowrap;width:20%;">${esc(suffix || String(value))}</td>
    </tr>
  </table>`;
}

function listItemRow(title, sub, detail, severity) {
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

function categoryBlock(label, color, count, items) {
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

function viewAppButton(label, url, color) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 8px 0;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr><td style="background:${color};border-radius:8px;">
          <a href="${url}" target="_blank" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.02em;">${label}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>`;
}

function closing() {
  return `<p style="margin:24px 0 0 0;font-size:14px;color:#555555;line-height:1.6;">Kind regards,<br><strong style="color:#333333;">FieldOps</strong></p>`;
}

// ── Build Dashboard HTML ─────────────────────────────────────────────────────

function buildDashboardHtml() {
  const appUrl = "https://fieldops.netlify.app";
  const dateStr = "Monday, 30 March 2026";
  const dayLabel = "Monday";

  const content = [];

  // Title
  content.push(`<p style="margin:0 0 4px 0;font-size:12px;color:#999;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">${dayLabel} Business Dashboard</p>`);
  content.push(`<p style="margin:0 0 20px 0;font-size:18px;font-weight:700;color:#111;">${dateStr}</p>`);

  // Action items banner
  const actionItems = [
    { label: "1 overdue job", color: "#dc2626" },
    { label: "1 draft quote to send", color: "#ca8a04" },
    { label: "1 WO awaiting acceptance", color: "#2563eb" },
    { label: "2 bills in inbox", color: "#dc2626" },
    { label: "1 outstanding invoice", color: "#dc2626" },
  ];
  const pills = actionItems.map(a =>
    `<span style="display:inline-block;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600;color:${a.color};background:${a.color}12;border:1px solid ${a.color}30;margin:2px 4px 2px 0;">${esc(a.label)}</span>`
  ).join("");
  content.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
    <tr><td style="background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:12px 14px;">
      <div style="font-size:11px;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Needs Attention</div>
      ${pills}
    </td></tr>
  </table>`);

  // Financial KPIs
  content.push(sectionHeading("Financial Overview", "#111"));
  content.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="digest-kpi-table">
    <tr>
      ${kpiCard("Total Quoted", "$18,847.00", "#111")}
      ${kpiCard("Revenue", "$1,615.00", "#16a34a")}
    </tr>
    <tr>
      ${kpiCard("Outstanding", "$0.00", "#16a34a", "0 invoices")}
      ${kpiCard("Unposted Bills", "$19,157.50", "#d97706", "5 bills")}
    </tr>
  </table>`);

  // Profitability
  const margin = -2108;
  const marginPct = -2108 > 0 ? "N/A" : "—";
  content.push(sectionHeading("Profitability", "#d97706"));
  content.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:6px;border-top:3px solid #d97706;margin:0 0 16px 0;">
    <tr>
      <td style="padding:16px;text-align:center;width:33%;">
        <div style="font-size:28px;font-weight:700;color:#d97706;">-96%</div>
        <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;">Margin</div>
      </td>
      <td style="padding:16px;border-left:1px solid #e5e7eb;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="font-size:11px;color:#888;padding:2px 0;">Revenue</td><td style="font-size:13px;font-weight:700;color:#333;text-align:right;">$1,615.00</td></tr>
          <tr><td style="font-size:11px;color:#888;padding:2px 0;">Costs</td><td style="font-size:13px;font-weight:700;color:#333;text-align:right;">$38,727.50</td></tr>
        </table>
      </td>
    </tr>
  </table>`);

  // Jobs & Operations
  content.push(sectionHeading("Jobs & Operations", "#ea580c"));
  content.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="digest-kpi-table">
    <tr>
      ${kpiCard("Active Jobs", "1", "#ea580c")}
      ${kpiCard("Completed", "1", "#16a34a")}
      ${kpiCard("Overdue", "1", "#dc2626")}
    </tr>
  </table>`);

  // Jobs by status
  const statuses = [
    { label: "Draft", count: 1, color: "#888" },
    { label: "Scheduled", count: 1, color: "#0891b2" },
    { label: "Quoted", count: 1, color: "#7c3aed" },
    { label: "In Progress", count: 1, color: "#ea580c" },
    { label: "Completed", count: 1, color: "#16a34a" },
  ];
  content.push(statuses.map(s => progressBar(s.label, s.count, 5, s.color, String(s.count))).join(""));

  // Overdue jobs
  content.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 0 0;">
    <tr>
      <td style="padding:4px 0;font-size:12px;color:#dc2626;"><span style="display:inline-block;width:6px;height:6px;background:#dc2626;border-radius:50%;margin-right:6px;vertical-align:middle;"></span>Office Fitout – Level 3</td>
      <td style="padding:4px 0;font-size:11px;color:#999;text-align:right;">Due 25 Mar</td>
    </tr>
  </table>`);

  // Orders
  content.push(sectionHeading("Orders", "#2563eb"));
  content.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="digest-kpi-table">
    <tr>
      ${kpiCard("Work Orders", "2", "#2563eb", "1 overdue")}
      ${kpiCard("Awaiting Accept", "1", "#d97706")}
      ${kpiCard("Purchase Orders", "1", "#059669")}
    </tr>
  </table>`);

  // Timesheets
  content.push(sectionHeading("Timesheets", "#be185d"));
  content.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:6px;border-top:3px solid #be185d;margin:0 0 8px 0;">
    <tr>
      <td style="padding:14px;text-align:center;width:33%;">
        <div style="font-size:24px;font-weight:700;color:#be185d;">45.5h</div>
        <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;">Total</div>
      </td>
      <td style="padding:14px;text-align:center;border-left:1px solid #e5e7eb;width:33%;">
        <div style="font-size:24px;font-weight:700;color:#333;">41.5h</div>
        <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;">Billable</div>
      </td>
      <td style="padding:14px;text-align:center;border-left:1px solid #e5e7eb;width:34%;">
        <div style="font-size:24px;font-weight:700;color:#16a34a;">91%</div>
        <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;">Billable Rate</div>
      </td>
    </tr>
  </table>`);

  // Workers
  const workers = [
    { name: "Tom Baker", total: 20, billable: 20 },
    { name: "Sarah Lee", total: 12, billable: 8 },
    { name: "Dan Wright", total: 7.5, billable: 7.5 },
    { name: "Mike Chen", total: 6, billable: 6 },
  ];
  content.push(workers.map(w => {
    const ratio = w.total > 0 ? Math.round((w.billable / w.total) * 100) : 0;
    const c = ratio >= 80 ? "#16a34a" : ratio >= 50 ? "#d97706" : "#dc2626";
    return progressBar(`${w.name}`, w.billable, w.total, c, `${w.total}h (${ratio}%)`);
  }).join(""));

  // Quotes
  content.push(sectionHeading("Quotes Pipeline", "#ca8a04"));
  content.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="digest-kpi-table">
    <tr>
      ${kpiCard("Pipeline", "$18,847.00", "#ca8a04")}
      ${kpiCard("Drafts", "1", "#d97706")}
      ${kpiCard("Conversion", "33%", "#16a34a")}
    </tr>
  </table>`);

  // Unpaid invoices
  content.push(sectionHeading("Unpaid Invoices", "#4f46e5"));
  content.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px 0;">
    <tr>
      <td style="padding:6px 0;font-size:10px;font-weight:700;color:#888;text-transform:uppercase;">Invoice</td>
      <td style="padding:6px 0;font-size:10px;font-weight:700;color:#888;text-transform:uppercase;text-align:right;">Amount</td>
      <td style="padding:6px 0;font-size:10px;font-weight:700;color:#888;text-transform:uppercase;text-align:right;">Status</td>
    </tr>
  </table>`);
  content.push(`<p style="font-size:13px;color:#16a34a;text-align:center;padding:8px 0;">All invoices paid</p>`);

  // Schedule
  content.push(sectionHeading("Upcoming Schedule", "#0891b2"));
  const scheduleItems = [
    { title: "Painting & Touch-ups", date: "30 Mar", time: "" },
    { title: "Benchtop Measure & Template", date: "30 Mar", time: "" },
    { title: "Membrane Application", date: "01 Apr", time: "" },
    { title: "Final Fix Electrical", date: "02 Apr", time: "" },
  ];
  content.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px 0;">
    ${scheduleItems.map(s => `<tr>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;width:28%;">
        <span style="font-size:11px;font-weight:700;color:#0891b2;">${esc(s.date)}</span>
        ${s.time ? `<span style="font-size:10px;color:#999;margin-left:4px;">${esc(s.time)}</span>` : ""}
      </td>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#333;">${esc(s.title)}</td>
    </tr>`).join("")}
  </table>`);

  // CTA
  content.push(viewAppButton("Open Dashboard", appUrl, "#111"));
  content.push(closing());

  return {
    subject: `Monday Dashboard — ${dateStr}`,
    html: emailLayout("#111111", content.join("\n"), "Monday Dashboard"),
  };
}

// ── Build Actions HTML ───────────────────────────────────────────────────────

function buildActionsHtml() {
  const appUrl = "https://fieldops.netlify.app";
  const dateStr = "Tuesday, 31 March 2026";
  const dayLabel = "Tuesday";

  const content = [];

  // Title
  content.push(`<p style="margin:0 0 4px 0;font-size:12px;color:#999;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">${dayLabel} Actions Report</p>`);
  content.push(`<p style="margin:0 0 20px 0;font-size:18px;font-weight:700;color:#111;">${dateStr}</p>`);

  // Summary
  const totalCount = 15;
  const highCount = 5;
  const accent = "#ef4444";
  content.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
    <tr><td style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:16px 20px;text-align:center;">
      <div style="font-size:36px;font-weight:700;color:${accent};line-height:1;">${totalCount}</div>
      <div style="font-size:13px;color:#555;margin-top:4px;">items need attention</div>
      <div style="margin-top:8px;"><span style="display:inline-block;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:700;background:#dc2626;color:#fff;">${highCount} high priority</span></div>
    </td></tr>
  </table>`);

  // Category badges
  const cats = [
    { label: "Timesheets", count: 1, color: "#be185d" },
    { label: "Quotes", count: 1, color: "#ca8a04" },
    { label: "Jobs", count: 1, color: "#111111" },
    { label: "Orders", count: 2, color: "#2563eb" },
    { label: "Bills", count: 5, color: "#dc2626" },
    { label: "Compliance", count: 5, color: "#0d9488" },
  ];
  const badges = cats.map(c =>
    `<span style="display:inline-block;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600;color:${c.color};background:${c.color}12;border:1px solid ${c.color}30;margin:2px 4px 2px 0;">${c.count} ${esc(c.label)}</span>`
  ).join("");
  content.push(`<div style="margin:0 0 20px 0;">${badges}</div>`);

  // Timesheets
  content.push(sectionHeading("Timesheets", "#be185d"));
  content.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:6px;border-left:3px solid #be185d;margin:0 0 8px 0;">
    <tr><td style="padding:12px 14px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="font-size:11px;color:#888;padding:2px 0;">Total Hours</td><td style="font-size:13px;font-weight:700;color:#333;text-align:right;">45.5h</td></tr>
        <tr><td style="font-size:11px;color:#888;padding:2px 0;">Billable</td><td style="font-size:13px;font-weight:700;color:#333;text-align:right;">41.5h</td></tr>
        <tr><td style="font-size:11px;color:#888;padding:2px 0;">Non-billable</td><td style="font-size:13px;font-weight:700;color:#333;text-align:right;">4h</td></tr>
        <tr><td style="font-size:11px;color:#888;padding:2px 0;">Billable %</td><td style="font-size:13px;font-weight:700;color:#16a34a;text-align:right;">91%</td></tr>
      </table>
    </td></tr>
  </table>`);

  const workers = [
    { name: "Tom Baker", total: 20, billable: 20 },
    { name: "Sarah Lee", total: 12, billable: 8 },
    { name: "Dan Wright", total: 7.5, billable: 7.5 },
    { name: "Mike Chen", total: 6, billable: 6 },
  ];
  content.push(workers.map(w => {
    const ratio = w.total > 0 ? Math.round((w.billable / w.total) * 100) : 0;
    const c = ratio >= 80 ? "#16a34a" : ratio >= 50 ? "#d97706" : "#dc2626";
    return progressBar(w.name, w.billable, w.total, c, `${w.total}h (${ratio}%)`);
  }).join(""));

  // Quotes
  content.push(categoryBlock("Quotes", "#ca8a04", 1, [
    { title: "Q-0003", sub: "Kitchen Renovation", detail: "$15,097.00 · Ready to send", severity: "low" },
  ]));

  // Jobs
  content.push(categoryBlock("Jobs", "#111111", 1, [
    { title: "Office Fitout – Level 3", sub: "Hartwell Properties", detail: "4 days overdue", severity: "high" },
  ]));

  // Orders
  content.push(categoryBlock("Orders", "#2563eb", 2, [
    { title: "WO-0001 — Apex Electrical Pty Ltd", sub: "Office Fitout – Level 3", detail: "3 days overdue", severity: "high" },
    { title: "WO-0002 — Ironclad Roofing Co.", sub: "Roof Repair & Waterproofing", detail: "Sent 14 days ago · Awaiting acceptance", severity: "medium" },
  ]));

  // Bills
  content.push(categoryBlock("Bills", "#dc2626", 5, [
    { title: "Metro Hire Co — MH-2291", sub: "", detail: "$660.00 · inbox", severity: "medium" },
    { title: "Bunnings Trade — BT-00412", sub: "", detail: "$387.50 · inbox", severity: "medium" },
    { title: "ElecPro — EP-0091", sub: "Office Fitout – Level 3", detail: "$1,850.00 · approved", severity: "low" },
    { title: "Roofmaster Supplies — RM-8801", sub: "Roof Repair & Waterproofing", detail: "$3,200.00 · linked", severity: "low" },
    { title: "Cabinet Kings — CK-3310", sub: "Kitchen Renovation", detail: "$9,240.00 · approved", severity: "low" },
  ]));

  // Compliance
  content.push(categoryBlock("Compliance Issues", "#0d9488", 5, [
    { title: "Apex Electrical Pty Ltd", sub: "Workers Compensation", detail: "Expired", severity: "high" },
    { title: "Apex Electrical Pty Ltd", sub: "Public Liability", detail: "Expired", severity: "high" },
    { title: "Ironclad Roofing Co.", sub: "Trade License", detail: "Missing", severity: "medium" },
    { title: "Ironclad Roofing Co.", sub: "SWMS", detail: "Missing", severity: "medium" },
    { title: "Apex Electrical Pty Ltd", sub: "Subcontractor Statement", detail: "Missing", severity: "medium" },
  ]));

  // CTA
  content.push(viewAppButton("Open Actions", `${appUrl}?page=actions`, accent));
  content.push(closing());

  return {
    subject: `Tuesday Actions — ${totalCount} items need attention`,
    html: emailLayout(accent, content.join("\n"), "Tuesday Actions"),
  };
}

// ── Send via Resend API ──────────────────────────────────────────────────────

async function sendEmail(to, subject, html) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend API ${res.status}: ${err}`);
  }
  return res.json();
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Sending example digest emails to ${TO}...\n`);

  // Dashboard
  const dashboard = buildDashboardHtml();
  console.log(`1. Dashboard Digest: "${dashboard.subject}"`);
  const d = await sendEmail(TO, dashboard.subject, dashboard.html);
  console.log(`   Sent! ID: ${d.id}\n`);

  // Actions
  const actions = buildActionsHtml();
  console.log(`2. Actions Digest: "${actions.subject}"`);
  const a = await sendEmail(TO, actions.subject, actions.html);
  console.log(`   Sent! ID: ${a.id}\n`);

  console.log("Done — check your inbox!");
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
