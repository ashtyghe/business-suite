import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") || "FieldOps <notifications@c8c.com.au>";
const APP_URL = Deno.env.get("APP_URL") || "https://fieldops.netlify.app";

// ── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysUntil(dateStr: string): number {
  return Math.ceil(
    (new Date(dateStr).getTime() - new Date(todayStr()).getTime()) /
      (1000 * 60 * 60 * 24)
  );
}

function fmtDate(d: string): string {
  if (!d) return "—";
  const parts = d.split("-");
  if (parts.length < 3) return d;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(parts[2], 10).toString().padStart(2, "0")} ${months[parseInt(parts[1], 10) - 1]}`;
}

function fmt(n: number): string {
  return "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function calcTotal(lineItems: { quantity: number; unit_price: number }[], taxRate: number): number {
  const sub = lineItems.reduce((s, l) => s + (l.quantity || 0) * (l.unit_price || 0), 0);
  return sub * (1 + (taxRate || 10) / 100);
}

function getMonday(dateStr: string): string {
  const dt = new Date(dateStr + "T12:00:00");
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  return dt.toISOString().slice(0, 10);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const ORDER_TERMINAL = ["Cancelled", "Billed", "Completed"];

const COMPLIANCE_DOC_TYPES = [
  "workers_comp", "public_liability", "white_card",
  "trade_license", "subcontractor_statement", "swms",
];

const COMPLIANCE_DOC_LABELS: Record<string, string> = {
  workers_comp: "Workers Compensation",
  public_liability: "Public Liability",
  white_card: "White Card",
  trade_license: "Trade License",
  subcontractor_statement: "Subcontractor Statement",
  swms: "SWMS",
};

function getComplianceStatus(doc: { expiry_date?: string } | undefined): string {
  if (!doc) return "missing";
  if (!doc.expiry_date) return "no_expiry";
  const days = daysUntil(doc.expiry_date);
  if (days < 0) return "expired";
  if (days <= 30) return "expiring_soon";
  return "current";
}

// ── Data fetch ───────────────────────────────────────────────────────────────

async function fetchAllData(supabase: ReturnType<typeof createClient>) {
  const q = async (promise: PromiseLike<{ data: unknown; error: unknown }>) => {
    const { data, error } = await promise;
    if (error) throw new Error(String(error));
    return data as Record<string, unknown>[];
  };

  const [
    jobs, customers, quotes, quoteLines, invoices, invoiceLines,
    timeEntries, bills, scheduleRows, staff, workOrders,
    purchaseOrders, poLines, contractors, contractorDocs,
  ] = await Promise.all([
    q(supabase.from("jobs").select("*")),
    q(supabase.from("customers").select("*")),
    q(supabase.from("quotes").select("*")),
    q(supabase.from("line_items").select("*").not("quote_id", "is", null)),
    q(supabase.from("invoices").select("*")),
    q(supabase.from("line_items").select("*").not("invoice_id", "is", null)),
    q(supabase.from("time_entries").select("*")),
    q(supabase.from("bills").select("*")),
    q(supabase.from("schedule").select("*")),
    q(supabase.from("staff").select("*")),
    q(supabase.from("work_orders").select("*")),
    q(supabase.from("purchase_orders").select("*")),
    q(supabase.from("purchase_order_lines").select("*")),
    q(supabase.from("contractors").select("*")),
    q(supabase.from("contractor_documents").select("*")),
  ]);

  // Attach line items to quotes and invoices
  const quotesWithLines = quotes.map((qr: Record<string, unknown>) => ({
    ...qr,
    line_items: quoteLines.filter((l: Record<string, unknown>) => l.quote_id === qr.id),
  }));
  const invoicesWithLines = invoices.map((inv: Record<string, unknown>) => ({
    ...inv,
    line_items: invoiceLines.filter((l: Record<string, unknown>) => l.invoice_id === inv.id),
  }));

  // Attach lines to POs
  const posWithLines = purchaseOrders.map((po: Record<string, unknown>) => ({
    ...po,
    lines: poLines.filter((l: Record<string, unknown>) => l.purchase_order_id === po.id),
  }));

  // Attach docs to contractors
  const contractorsWithDocs = contractors.map((c: Record<string, unknown>) => ({
    ...c,
    documents: contractorDocs.filter((d: Record<string, unknown>) => d.contractor_id === c.id),
  }));

  return {
    jobs, customers, quotes: quotesWithLines, invoices: invoicesWithLines,
    timeEntries, bills, schedule: scheduleRows, staff, workOrders,
    purchaseOrders: posWithLines, contractors: contractorsWithDocs,
  };
}

// ── Build dashboard digest data ──────────────────────────────────────────────

function buildDashboardData(data: ReturnType<typeof fetchAllData> extends Promise<infer T> ? T : never) {
  const { jobs, customers, quotes, invoices, timeEntries, bills, schedule, workOrders, purchaseOrders } = data;
  const today = todayStr();

  // Financial
  const totalQuoted = quotes.filter((q: any) => q.status !== "declined")
    .reduce((s: number, q: any) => s + calcTotal(q.line_items, q.tax_rate), 0);
  const revenueCollected = invoices.filter((i: any) => i.status === "paid")
    .reduce((s: number, inv: any) => s + calcTotal(inv.line_items, inv.tax_rate), 0);
  const outstandingInvItems = invoices.filter((i: any) => ["sent", "overdue"].includes(i.status));
  const outstandingInv = outstandingInvItems.reduce((s: number, inv: any) => s + calcTotal(inv.line_items, inv.tax_rate), 0);
  const unpostedBillsArr = bills.filter((b: any) => ["inbox", "linked", "approved"].includes(b.status));
  const totalInvoiced = invoices.reduce((s: number, inv: any) => s + calcTotal(inv.line_items, inv.tax_rate), 0);
  const totalBillsCost = bills.reduce((s: number, b: any) => s + Number(b.total || 0), 0);
  const margin = totalInvoiced > 0 ? Math.round(((totalInvoiced - totalBillsCost) / totalInvoiced) * 100) : 0;

  // Jobs
  const activeJobs = jobs.filter((j: any) => j.status === "in_progress").length;
  const completedJobs = jobs.filter((j: any) => j.status === "completed").length;
  const overdueJobsList = jobs.filter((j: any) =>
    j.scheduled_end && daysUntil(j.scheduled_end.slice(0, 10)) < 0 &&
    j.status !== "completed" && j.status !== "cancelled"
  );

  // Orders
  const activeWOs = workOrders.filter((wo: any) => !ORDER_TERMINAL.includes(wo.status)).length;
  const overdueWOs = workOrders.filter((wo: any) =>
    wo.due_date && daysUntil(wo.due_date) < 0 && !ORDER_TERMINAL.includes(wo.status)
  ).length;
  const woAwaitingAcceptance = workOrders.filter((wo: any) => wo.status === "Sent").length;
  const activePOs = purchaseOrders.filter((po: any) => !ORDER_TERMINAL.includes(po.status)).length;
  const overduePOs = purchaseOrders.filter((po: any) =>
    po.due_date && daysUntil(po.due_date) < 0 && !ORDER_TERMINAL.includes(po.status)
  ).length;

  // Timesheets
  const totalHours = timeEntries.reduce((s: number, t: any) => s + Number(t.hours || 0), 0);
  const billableHours = timeEntries.reduce((s: number, t: any) => s + (t.billable !== false ? Number(t.hours || 0) : 0), 0);
  const billableRatio = totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : 0;

  // Worker hours
  const workerMap: Record<string, { total: number; billable: number }> = {};
  for (const t of timeEntries as any[]) {
    const name = t.worker_name || "Unknown";
    if (!workerMap[name]) workerMap[name] = { total: 0, billable: 0 };
    workerMap[name].total += Number(t.hours || 0);
    if (t.billable !== false) workerMap[name].billable += Number(t.hours || 0);
  }
  const workers = Object.entries(workerMap)
    .map(([name, hrs]) => ({ name, total: hrs.total, billable: hrs.billable }))
    .sort((a, b) => b.total - a.total);

  // Quotes
  const quoteDrafts = quotes.filter((q: any) => q.status === "draft").length;
  const pipelineQuotes = quotes.filter((q: any) => ["draft", "sent"].includes(q.status));
  const pipelineTotal = pipelineQuotes.reduce((s: number, q: any) => s + calcTotal(q.line_items, q.tax_rate), 0);
  const quoteConversion = quotes.length > 0
    ? Math.round((quotes.filter((q: any) => q.status === "accepted").length / quotes.length) * 100)
    : 0;

  // Jobs by status
  const statusConfig = [
    { status: "draft", label: "Draft", color: "#888" },
    { status: "scheduled", label: "Scheduled", color: "#0891b2" },
    { status: "quoted", label: "Quoted", color: "#7c3aed" },
    { status: "in_progress", label: "In Progress", color: "#ea580c" },
    { status: "completed", label: "Completed", color: "#16a34a" },
  ];
  const jobStatuses = statusConfig.map(sc => ({
    ...sc,
    count: jobs.filter((j: any) => j.status === sc.status).length,
  }));

  // Unpaid invoices
  const unpaidInvoices = invoices
    .filter((i: any) => i.status !== "paid" && i.status !== "void")
    .map((inv: any) => ({
      number: inv.invoice_number || "",
      amount: fmt(calcTotal(inv.line_items, inv.tax_rate)),
      status: inv.due_date && daysUntil(inv.due_date) < 0 ? "overdue" : inv.status,
    }));

  // Schedule
  const mon = getMonday(today);
  const sun = addDays(mon, 6);
  const scheduleItems = (schedule as any[])
    .filter((s: any) => s.entry_date >= today && s.entry_date <= sun)
    .sort((a: any, b: any) => (a.entry_date || "").localeCompare(b.entry_date || ""))
    .slice(0, 7)
    .map((s: any) => {
      const job = jobs.find((j: any) => j.id === s.job_id) as any;
      return {
        title: s.title || job?.title || "Unknown",
        date: fmtDate(s.entry_date),
        time: s.start_time || "",
      };
    });

  // Action items
  const actionItems: { label: string; color: string }[] = [];
  if (overdueJobsList.length > 0) actionItems.push({ label: `${overdueJobsList.length} overdue job${overdueJobsList.length > 1 ? "s" : ""}`, color: "#dc2626" });
  if (quoteDrafts > 0) actionItems.push({ label: `${quoteDrafts} draft quote${quoteDrafts > 1 ? "s" : ""} to send`, color: "#ca8a04" });
  if (overdueWOs > 0) actionItems.push({ label: `${overdueWOs} overdue work order${overdueWOs > 1 ? "s" : ""}`, color: "#dc2626" });
  if (woAwaitingAcceptance > 0) actionItems.push({ label: `${woAwaitingAcceptance} WO${woAwaitingAcceptance > 1 ? "s" : ""} awaiting acceptance`, color: "#2563eb" });
  const inboxBills = bills.filter((b: any) => b.status === "inbox").length;
  if (inboxBills > 0) actionItems.push({ label: `${inboxBills} bill${inboxBills > 1 ? "s" : ""} in inbox`, color: "#dc2626" });
  if (outstandingInvItems.length > 0) actionItems.push({ label: `${outstandingInvItems.length} outstanding invoice${outstandingInvItems.length > 1 ? "s" : ""}`, color: "#dc2626" });

  return {
    appUrl: APP_URL,
    totalQuoted, revenueCollected, outstandingInv,
    outstandingInvCount: outstandingInvItems.length,
    unpostedBillsTotal: unpostedBillsArr.reduce((s: number, b: any) => s + Number(b.total || 0), 0),
    unpostedBillsCount: unpostedBillsArr.length,
    totalInvoiced, totalBillsCost, margin,
    activeJobs, completedJobs, overdueJobCount: overdueJobsList.length, totalJobs: jobs.length,
    overdueJobs: overdueJobsList.slice(0, 5).map((j: any) => ({
      title: j.title,
      dueDate: fmtDate(j.scheduled_end?.slice(0, 10) || ""),
    })),
    activeWOs, overdueWOs, woAwaitingAcceptance, activePOs, overduePOs,
    totalHours, billableHours, billableRatio, workers,
    quoteDrafts, pipelineTotal, quoteConversion,
    jobStatuses, unpaidInvoices, scheduleItems, actionItems,
    jobsDueThisWeek: [],
  };
}

// ── Build actions digest data ────────────────────────────────────────────────

function buildActionsData(data: ReturnType<typeof fetchAllData> extends Promise<infer T> ? T : never) {
  const { jobs, customers, quotes, invoices, bills, timeEntries, workOrders, purchaseOrders, contractors } = data;
  const today = todayStr();

  type Item = { title: string; sub: string; detail: string; severity: string };

  // Timesheets
  const totalHours = timeEntries.reduce((s: number, t: any) => s + Number(t.hours || 0), 0);
  const billableHours = timeEntries.reduce((s: number, t: any) => s + (t.billable !== false ? Number(t.hours || 0) : 0), 0);
  const billableRatio = totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : 0;

  const workerMap: Record<string, { total: number; billable: number }> = {};
  for (const t of timeEntries as any[]) {
    const name = t.worker_name || "Unknown";
    if (!workerMap[name]) workerMap[name] = { total: 0, billable: 0 };
    workerMap[name].total += Number(t.hours || 0);
    if (t.billable !== false) workerMap[name].billable += Number(t.hours || 0);
  }
  const workers = Object.entries(workerMap)
    .map(([name, hrs]) => ({ name, total: hrs.total, billable: hrs.billable }))
    .sort((a, b) => b.total - a.total);

  // Non-billable time
  const unbilledTime = (timeEntries as any[]).filter((t: any) => t.billable === false);
  const timesheetItems: Item[] = unbilledTime.slice(0, 10).map((t: any) => {
    const job = (jobs as any[]).find((j: any) => j.id === t.job_id);
    return {
      title: `${t.worker_name || "Unknown"} — ${t.hours}h`,
      sub: job?.title || "",
      detail: `${fmtDate(t.entry_date)} · Non-billable`,
      severity: "low",
    };
  });

  // Quotes
  const quoteItems: Item[] = (quotes as any[]).filter((q: any) => q.status === "draft").map((q: any) => {
    const job = (jobs as any[]).find((j: any) => j.id === q.job_id);
    const total = calcTotal(q.line_items, q.tax_rate);
    return {
      title: q.quote_number || "",
      sub: job?.title || "",
      detail: `${fmt(total)} · Ready to send`,
      severity: "low",
    };
  });

  // Jobs
  const jobItems: Item[] = (jobs as any[])
    .filter((j: any) => j.scheduled_end && daysUntil(j.scheduled_end.slice(0, 10)) < 0 && j.status !== "completed" && j.status !== "cancelled")
    .map((j: any) => {
      const client = (customers as any[]).find((c: any) => c.id === j.customer_id);
      const days = Math.abs(daysUntil(j.scheduled_end.slice(0, 10)));
      return {
        title: j.title,
        sub: client?.name || "",
        detail: `${days} day${days !== 1 ? "s" : ""} overdue`,
        severity: "high" as const,
      };
    });

  // Orders
  const orderItems: Item[] = [
    ...[...(workOrders as any[]), ...(purchaseOrders as any[])]
      .filter((o: any) => !ORDER_TERMINAL.includes(o.status) && o.due_date && daysUntil(o.due_date) < 0)
      .map((o: any) => {
        const job = (jobs as any[]).find((j: any) => j.id === o.job_id);
        const days = Math.abs(daysUntil(o.due_date));
        return {
          title: `${o.ref} — ${o.contractor_name || o.supplier_name || ""}`,
          sub: job?.title || "",
          detail: `${days} day${days !== 1 ? "s" : ""} overdue`,
          severity: "high" as const,
        };
      }),
    ...(workOrders as any[]).filter((wo: any) => wo.status === "Sent").map((wo: any) => {
      const job = (jobs as any[]).find((j: any) => j.id === wo.job_id);
      const days = wo.issue_date ? Math.abs(daysUntil(wo.issue_date)) : null;
      return {
        title: `${wo.ref} — ${wo.contractor_name || ""}`,
        sub: job?.title || "",
        detail: days ? `Sent ${days} day${days !== 1 ? "s" : ""} ago · Awaiting acceptance` : "Awaiting acceptance",
        severity: "medium" as const,
      };
    }),
  ];

  // Bills
  const billItems: Item[] = (bills as any[])
    .filter((b: any) => ["inbox", "linked", "approved"].includes(b.status))
    .map((b: any) => {
      const job = (jobs as any[]).find((j: any) => j.id === b.job_id);
      return {
        title: `${b.supplier_name || ""} — ${b.invoice_number || ""}`,
        sub: job?.title || "",
        detail: `${fmt(Number(b.total || 0))} · ${b.status}`,
        severity: b.status === "inbox" ? "medium" : "low",
      };
    });

  // Invoices
  const invoiceItems: Item[] = (invoices as any[])
    .filter((i: any) => i.status !== "paid" && i.status !== "void")
    .map((inv: any) => {
      const job = (jobs as any[]).find((j: any) => j.id === inv.job_id);
      const total = calcTotal(inv.line_items, inv.tax_rate);
      const isOverdue = inv.due_date && daysUntil(inv.due_date) < 0;
      return {
        title: inv.invoice_number || "",
        sub: job?.title || "",
        detail: `${fmt(total)} · ${isOverdue ? "Overdue" : inv.status}`,
        severity: isOverdue ? "high" : "medium",
      };
    });

  // Compliance
  const complianceItems: Item[] = (contractors as any[]).flatMap((c: any) => {
    const issues: Item[] = [];
    COMPLIANCE_DOC_TYPES.forEach(dt => {
      const doc = (c.documents || []).find((d: any) => d.doc_type === dt);
      const status = getComplianceStatus(doc);
      if (status === "expired" || status === "missing") {
        issues.push({
          title: c.name,
          sub: COMPLIANCE_DOC_LABELS[dt] || dt,
          detail: status === "expired" ? "Expired" : "Missing",
          severity: status === "expired" ? "high" : "medium",
        });
      }
    });
    return issues;
  });

  const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const sortBySeverity = (items: Item[]) =>
    items.sort((a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2));

  const categories = [
    { id: "timesheets", label: "Timesheets", color: "#be185d", items: sortBySeverity(timesheetItems) },
    { id: "quotes", label: "Quotes", color: "#ca8a04", items: sortBySeverity(quoteItems) },
    { id: "jobs", label: "Jobs", color: "#111111", items: sortBySeverity(jobItems) },
    { id: "orders", label: "Orders", color: "#2563eb", items: sortBySeverity(orderItems) },
    { id: "bills", label: "Bills", color: "#dc2626", items: sortBySeverity(billItems) },
    { id: "invoices", label: "Invoices", color: "#4f46e5", items: sortBySeverity(invoiceItems) },
    { id: "compliance", label: "Compliance Issues", color: "#0d9488", items: sortBySeverity(complianceItems) },
  ].filter(c => c.items.length > 0 || c.id === "timesheets");

  const totalCount = categories.reduce((s, c) => s + c.items.length, 0);
  const highCount = categories.flatMap(c => c.items.filter(i => i.severity === "high")).length;

  return {
    appUrl: APP_URL,
    totalCount,
    highCount,
    totalHours,
    billableHours,
    billableRatio,
    workers,
    categories,
  };
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  // Accept both cron invocations (no body) and manual POST with { type, to }
  let digestType: string | null = null;
  let recipientEmail: string | null = null;

  if (req.method === "POST") {
    try {
      const body = await req.json();
      digestType = body.type || null;      // "dashboard" or "actions"
      recipientEmail = body.to || null;    // override recipient
    } catch {
      // No body = auto-detect from day of week
    }
  }

  // Auto-detect digest type from day of week if not provided
  if (!digestType) {
    const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon, ...
    if (dayOfWeek === 1 || dayOfWeek === 5) {
      digestType = "dashboard";  // Monday & Friday
    } else if (dayOfWeek === 2 || dayOfWeek === 4) {
      digestType = "actions";    // Tuesday & Thursday
    } else {
      return new Response(
        JSON.stringify({ skipped: true, reason: "No digest scheduled for today" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }
  }

  if (!RESEND_API_KEY) {
    return new Response(
      JSON.stringify({ error: "RESEND_API_KEY not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Use service role to read all data
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // If no recipient provided, send to all admin staff
  let recipients: string[] = [];
  if (recipientEmail) {
    recipients = [recipientEmail];
  } else {
    const { data: staffRows } = await supabase.from("staff").select("email, role").eq("active", true);
    recipients = (staffRows || [])
      .filter((s: any) => s.role === "admin" && s.email)
      .map((s: any) => s.email);
  }

  if (recipients.length === 0) {
    return new Response(
      JSON.stringify({ error: "No recipients found" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Fetch all data
  const allData = await fetchAllData(supabase);

  // Date formatting
  const dateStr = new Date().toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const dayOfWeek = new Date().getDay();
  const dayLabels: Record<string, Record<number, string>> = {
    dashboard: { 1: "Monday", 5: "Friday" },
    actions: { 2: "Tuesday", 4: "Thursday" },
  };
  const dayLabel = dayLabels[digestType]?.[dayOfWeek] || "Weekly";

  // Build email data
  let emailType: string;
  let emailData: Record<string, unknown>;

  if (digestType === "dashboard") {
    emailType = "dashboard_digest";
    emailData = { ...buildDashboardData(allData), dayLabel, dateStr };
  } else {
    emailType = "actions_digest";
    emailData = { ...buildActionsData(allData), dayLabel, dateStr };
  }

  // Send via the send-email function (using service role key for auth)
  const results: { email: string; success: boolean; error?: string }[] = [];
  const sendEmailUrl = `${SUPABASE_URL}/functions/v1/send-email`;

  for (const to of recipients) {
    try {
      const res = await fetch(sendEmailUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ type: emailType, to, data: emailData }),
      });

      if (!res.ok) {
        const err = await res.text();
        results.push({ email: to, success: false, error: err });
      } else {
        results.push({ email: to, success: true });
      }
    } catch (err) {
      results.push({ email: to, success: false, error: (err as Error).message });
    }
  }

  return new Response(
    JSON.stringify({ digestType, dateStr, recipients: results }),
    { headers: { "Content-Type": "application/json" } }
  );
});
