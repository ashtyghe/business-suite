import { useState, useEffect } from "react";
import { fetchAll, createCustomer, updateCustomer, deleteCustomer, createSite, updateSite, deleteSite, createJob, updateJob, deleteJob, createQuote, updateQuote, deleteQuote, createInvoice, updateInvoice, deleteInvoice, createTimeEntry, updateTimeEntry, deleteTimeEntry, createBill, updateBill, deleteBill, createScheduleEntry, updateScheduleEntry, deleteScheduleEntry } from './lib/db';

// ── Google Font ──────────────────────────────────────────────────────────────
const fontLink = document.createElement("link");
fontLink.rel = "stylesheet";
fontLink.href = "https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;500;600;700;800&display=swap";
document.head.appendChild(fontLink);

const spinStyle = document.createElement("style");
spinStyle.textContent = "@keyframes spin { to { transform: rotate(360deg); } }";
document.head.appendChild(spinStyle);

// ── Seed Data ────────────────────────────────────────────────────────────────
const SEED_CLIENTS = [
  { id: 1, name: "Hartwell Properties", email: "james@hartwell.com", phone: "0412 345 678", address: "22 King St, Sydney NSW 2000",
    sites: [
      { id: 101, name: "King St HQ",        address: "22 King St, Sydney NSW 2000",      contactName: "James Hartwell", contactPhone: "0412 345 678" },
      { id: 102, name: "Parramatta Office", address: "8 Church St, Parramatta NSW 2150", contactName: "Linda Park",     contactPhone: "0412 345 900" },
    ]
  },
  { id: 2, name: "BlueLine Construction", email: "ops@blueline.com.au", phone: "0398 765 432", address: "88 Industrial Ave, Melbourne VIC 3000",
    sites: [
      { id: 201, name: "Industrial Ave Depot", address: "88 Industrial Ave, Melbourne VIC 3000",  contactName: "Mark Chen",    contactPhone: "0398 765 432" },
      { id: 202, name: "Southbank Site",        address: "14 Riverside Blvd, Southbank VIC 3006", contactName: "Rachel Moore", contactPhone: "0398 111 222" },
    ]
  },
  { id: 3, name: "Mara & Co Interiors", email: "mara@marainteriors.com", phone: "0455 111 222", address: "5 Design Lane, Brisbane QLD 4000",
    sites: [
      { id: 301, name: "Brisbane Studio", address: "5 Design Lane, Brisbane QLD 4000", contactName: "Mara Costa", contactPhone: "0455 111 222" },
    ]
  },
  { id: 4, name: "Nexus Facilities", email: "facilities@nexus.com", phone: "0411 999 888", address: "101 Commerce Rd, Perth WA 6000",
    sites: [
      { id: 401, name: "Perth HQ",         address: "101 Commerce Rd, Perth WA 6000",       contactName: "David Nguyen", contactPhone: "0411 999 888" },
      { id: 402, name: "Fremantle Store",  address: "44 Harbour St, Fremantle WA 6160",     contactName: "Aisha Patel",  contactPhone: "0411 777 333" },
      { id: 403, name: "Joondalup Branch", address: "9 Ocean Keys Blvd, Joondalup WA 6027", contactName: "Tom Nguyen",   contactPhone: "0411 222 555" },
    ]
  },
];

const SEED_JOBS = [
  { id: 1, title: "Office Fitout – Level 3", clientId: 1, siteId: 101, status: "in_progress", priority: "high", description: "Full office refurbishment including partition walls, electrical and plumbing.", startDate: "2026-02-10", dueDate: "2026-03-25", assignedTo: ["Tom Baker", "Sarah Lee"], tags: ["fitout", "commercial"], createdAt: "2026-02-01", activityLog: [{ ts: "2026-02-01 09:00", user: "Alex Jones", action: "Job created" }, { ts: "2026-02-10 08:30", user: "Alex Jones", action: "Status changed to In Progress" }] },
  { id: 2, title: "Roof Repair & Waterproofing", clientId: 2, siteId: 201, status: "quoted", priority: "medium", description: "Replace damaged roof sheets and apply waterproof membrane to flat section.", startDate: "2026-03-15", dueDate: "2026-03-30", assignedTo: ["Mike Chen"], tags: ["roofing", "maintenance"], createdAt: "2026-02-15", activityLog: [{ ts: "2026-02-15 10:00", user: "Alex Jones", action: "Job created" }, { ts: "2026-02-16 14:00", user: "Alex Jones", action: "Quote Q-0002 added" }] },
  { id: 3, title: "Kitchen Renovation", clientId: 3, siteId: 301, status: "scheduled", priority: "medium", description: "Full kitchen demo and rebuild with new cabinetry, benchtops and appliances.", startDate: "2026-03-20", dueDate: "2026-04-20", assignedTo: ["Sarah Lee", "Dan Wright"], tags: ["renovation", "residential"], createdAt: "2026-02-20", activityLog: [{ ts: "2026-02-20 11:00", user: "Alex Jones", action: "Job created" }] },
  { id: 4, title: "HVAC Maintenance – Q1", clientId: 4, siteId: 401, status: "completed", priority: "low", description: "Quarterly service and filter replacement across all HVAC units.", startDate: "2026-01-15", dueDate: "2026-01-20", assignedTo: ["Tom Baker"], tags: ["hvac", "maintenance"], createdAt: "2026-01-10", activityLog: [{ ts: "2026-01-10 08:00", user: "Alex Jones", action: "Job created" }, { ts: "2026-01-20 16:00", user: "Tom Baker", action: "Status changed to Completed" }] },
  { id: 5, title: "Bathroom Tiling & Fixtures", clientId: 1, siteId: null, status: "draft", priority: "low", description: "Re-tile master bathroom and replace all fixtures.", startDate: "", dueDate: "", assignedTo: [], tags: ["tiling", "plumbing"], createdAt: "2026-02-28", activityLog: [{ ts: "2026-02-28 15:00", user: "Alex Jones", action: "Job created" }] },
];

const SEED_QUOTES = [
  { id: 1, jobId: 1, number: "Q-0001", status: "accepted", lineItems: [{ desc: "Labour – Demolition", qty: 16, unit: "hrs", rate: 95 }, { desc: "Partition Walls (supply & install)", qty: 4, unit: "ea", rate: 1200 }, { desc: "Electrical Works", qty: 1, unit: "lot", rate: 3500 }], tax: 10, notes: "Quote valid for 30 days.", createdAt: "2026-02-01" },
  { id: 2, jobId: 2, number: "Q-0002", status: "sent", lineItems: [{ desc: "Roof Sheet Replacement", qty: 24, unit: "m²", rate: 85 }, { desc: "Waterproof Membrane", qty: 40, unit: "m²", rate: 65 }, { desc: "Labour", qty: 20, unit: "hrs", rate: 90 }], tax: 10, notes: "Materials subject to availability.", createdAt: "2026-02-16" },
  { id: 3, jobId: 3, number: "Q-0003", status: "draft", lineItems: [{ desc: "Cabinetry Supply & Install", qty: 1, unit: "lot", rate: 8500 }, { desc: "Benchtops – Stone", qty: 6, unit: "lm", rate: 650 }, { desc: "Tiling", qty: 18, unit: "m²", rate: 95 }], tax: 10, notes: "", createdAt: "2026-02-21" },
];

const SEED_SCHEDULE = [
  { id: 1, jobId: 1, title: "Demo Day", date: "2026-03-10", startTime: "07:00", endTime: "15:00", assignedTo: ["Tom Baker", "Sarah Lee"], notes: "Bring PPE. Access via loading dock." },
  { id: 2, jobId: 1, title: "Partition Install", date: "2026-03-11", startTime: "07:00", endTime: "16:00", assignedTo: ["Tom Baker"], notes: "" },
  { id: 3, jobId: 3, title: "Kitchen Demo", date: "2026-03-20", startTime: "08:00", endTime: "14:00", assignedTo: ["Sarah Lee", "Dan Wright"], notes: "Client will not be home – key under mat." },
  { id: 4, jobId: 4, title: "HVAC Service", date: "2026-01-17", startTime: "09:00", endTime: "12:00", assignedTo: ["Tom Baker"], notes: "All 6 units on level 2." },
];

const SEED_TIME = [
  { id: 1, jobId: 1, worker: "Tom Baker",   date: "2026-03-10", startTime: "07:00", endTime: "15:00", hours: 8,   description: "Demolition works", billable: true },
  { id: 2, jobId: 1, worker: "Sarah Lee",   date: "2026-03-10", startTime: "07:00", endTime: "15:00", hours: 8,   description: "Demolition works", billable: true },
  { id: 3, jobId: 1, worker: "Tom Baker",   date: "2026-03-11", startTime: "07:00", endTime: "16:00", hours: 9,   description: "Partition framing", billable: true },
  { id: 4, jobId: 4, worker: "Tom Baker",   date: "2026-01-17", startTime: "09:00", endTime: "12:00", hours: 3,   description: "HVAC filter replacement x6", billable: true },
  { id: 5, jobId: 1, worker: "Mike Chen",   date: "2026-03-09", startTime: "08:00", endTime: "14:00", hours: 6,   description: "Electrical rough-in coordination", billable: true },
  { id: 6, jobId: 3, worker: "Sarah Lee",   date: "2026-03-05", startTime: "08:00", endTime: "12:00", hours: 4,   description: "Kitchen site measure-up", billable: false },
  { id: 7, jobId: 1, worker: "Dan Wright",  date: "2026-03-11", startTime: "08:00", endTime: "15:30", hours: 7.5, description: "Plasterboard installation", billable: true },
];

const SEED_BILLS = [
  { id: 1, jobId: 1, supplier: "BuildRight Supplies", invoiceNo: "BR-4421", date: "2026-03-09", amount: 2340.00, amountExGst: 2127.27, gstAmount: 212.73, hasGst: true, category: "Materials", description: "Timber framing, plasterboard, screws", status: "posted", markup: 15, notes: "", capturedAt: "2026-03-09" },
  { id: 2, jobId: 1, supplier: "ElecPro", invoiceNo: "EP-0091", date: "2026-03-12", amount: 1850.00, amountExGst: 1681.82, gstAmount: 168.18, hasGst: true, category: "Subcontractor", description: "Electrical rough-in", status: "approved", markup: 0, notes: "Awaiting sign-off from project manager", capturedAt: "2026-03-12" },
  { id: 3, jobId: 4, supplier: "CoolAir Parts", invoiceNo: "CA-771", date: "2026-01-17", amount: 480.00, amountExGst: 436.36, gstAmount: 43.64, hasGst: true, category: "Materials", description: "HVAC filters x6", status: "posted", markup: 10, notes: "", capturedAt: "2026-01-17" },
  { id: 4, jobId: null, supplier: "Metro Hire Co", invoiceNo: "MH-2291", date: "2026-03-08", amount: 660.00, amountExGst: 600.00, gstAmount: 60.00, hasGst: true, category: "Plant & Equipment", description: "Scissor lift hire – 3 days", status: "inbox", markup: 0, notes: "", capturedAt: "2026-03-08" },
  { id: 5, jobId: null, supplier: "Bunnings Trade", invoiceNo: "BT-00412", date: "2026-03-07", amount: 387.50, amountExGst: 387.50, gstAmount: 0, hasGst: false, category: "Materials", description: "Paint, brushes, drop sheets", status: "inbox", markup: 0, notes: "Receipt photographed – check GST treatment", capturedAt: "2026-03-07" },
  { id: 6, jobId: 2, supplier: "Roofmaster Supplies", invoiceNo: "RM-8801", date: "2026-03-14", amount: 3200.00, amountExGst: 2909.09, gstAmount: 290.91, hasGst: true, category: "Materials", description: "Roof sheets x24, waterproof membrane", status: "linked", markup: 12, notes: "", capturedAt: "2026-03-14" },
  { id: 7, jobId: 3, supplier: "Cabinet Kings", invoiceNo: "CK-3310", date: "2026-03-02", amount: 9240.00, amountExGst: 8400.00, gstAmount: 840.00, hasGst: true, category: "Subcontractor", description: "Kitchen cabinetry fabrication & delivery", status: "approved", markup: 0, notes: "", capturedAt: "2026-03-02" },
];

const SEED_INVOICES = [
  { id: 1, jobId: 4, number: "INV-0001", status: "paid", lineItems: [{ desc: "HVAC Quarterly Maintenance", qty: 1, unit: "lot", rate: 950 }, { desc: "Replacement Filters x6", qty: 6, unit: "ea", rate: 95 }], tax: 10, dueDate: "2026-02-17", notes: "Thank you for your business.", createdAt: "2026-01-20" },
];

const TEAM = ["Tom Baker", "Sarah Lee", "Mike Chen", "Dan Wright", "Priya Sharma"];

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => `$${Number(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const calcQuoteTotal = (q) => {
  const sub = q.lineItems.reduce((s, l) => s + l.qty * l.rate, 0);
  return sub * (1 + q.tax / 100);
};
const uid = () => Date.now() + Math.random();

// ── Activity Log Helpers ──────────────────────────────────────────────────────
const CURRENT_USER = "Alex Jones";
const nowTs = () => {
  const d = new Date();
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) + " " +
    d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false });
};
const mkLog = (action, user = CURRENT_USER) => ({ ts: nowTs(), user, action });
const addLog = (prev, action, user = CURRENT_USER) => [...(prev || []), mkLog(action, user)];

// ActivityLog display component
const ActivityLog = ({ entries = [] }) => {
  if (!entries.length) return <div style={{ color: "#bbb", fontSize: 13, padding: "20px 0", textAlign: "center" }}>No activity recorded yet.</div>;
  return (
    <div className="timeline">
      {[...entries].reverse().map((e, i) => (
        <div key={i} className="timeline-item">
          <div className="timeline-dot" />
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>
            <span style={{ fontWeight: 600 }}>{e.action}</span>
            <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>
              <span style={{ fontWeight: 600, color: "#777" }}>{e.user}</span> · {e.ts}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const STATUS_COLORS = {
  draft: "#999",
  scheduled: "#555",
  quoted: "#333",
  in_progress: "#111",
  completed: "#444",
  cancelled: "#bbb",
};
const STATUS_BG = {
  draft: "#f0f0f0",
  scheduled: "#e8e8e8",
  quoted: "#d8d8d8",
  in_progress: "#111",
  completed: "#333",
  cancelled: "#f5f5f5",
};
const STATUS_TEXT = {
  draft: "#888",
  scheduled: "#444",
  quoted: "#222",
  in_progress: "#fff",
  completed: "#fff",
  cancelled: "#aaa",
};

// ── Global Styles ────────────────────────────────────────────────────────────
const injectStyles = () => {
  const s = document.createElement("style");
  s.textContent = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Open Sans', sans-serif !important; }
    .jm-root { font-family: 'Open Sans', sans-serif; background: #fafafa; color: #111; min-height: 100vh; display: flex; }
    .jm-sidebar { width: 220px; min-width: 220px; background: #111; color: #fff; display: flex; flex-direction: column; position: fixed; top: 0; left: 0; height: 100vh; z-index: 100; }
    .jm-logo { padding: 24px 20px 20px; border-bottom: 1px solid #2a2a2a; }
    .jm-logo-mark { font-size: 11px; font-weight: 800; letter-spacing: 0.2em; text-transform: uppercase; color: #fff; }
    .jm-logo-sub { font-size: 9px; color: #666; letter-spacing: 0.15em; text-transform: uppercase; margin-top: 3px; }
    .jm-nav { flex: 1; padding: 16px 0; overflow-y: auto; }
    .jm-nav-section { font-size: 9px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #444; padding: 16px 20px 6px; }
    .jm-nav-item { display: flex; align-items: center; gap: 10px; padding: 10px 20px; font-size: 13px; font-weight: 500; cursor: pointer; color: #999; border-left: 3px solid transparent; transition: all 0.15s; }
    .jm-nav-item:hover { color: #fff; background: #1a1a1a; }
    .jm-nav-item.active { color: #fff; border-left-color: #fff; background: #1e1e1e; }
    .jm-nav-item .badge { margin-left: auto; background: #fff; color: #111; font-size: 10px; font-weight: 700; border-radius: 10px; padding: 1px 7px; min-width: 20px; text-align: center; }
    .jm-main { margin-left: 220px; flex: 1; display: flex; flex-direction: column; min-height: 100vh; }
    .jm-topbar { background: #fff; border-bottom: 1px solid #e8e8e8; padding: 0 28px; height: 60px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 50; }
    .jm-page-title { font-size: 16px; font-weight: 700; letter-spacing: -0.02em; }
    .jm-topbar-actions { display: flex; gap: 10px; align-items: center; }
    .jm-content { padding: 28px; flex: 1; }
    .btn { display: inline-flex; align-items: center; gap: 7px; padding: 9px 16px; font-size: 13px; font-weight: 600; font-family: 'Open Sans', sans-serif; border: none; border-radius: 6px; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
    .btn-primary { background: #111; color: #fff; }
    .btn-primary:hover { background: #333; }
    .btn-secondary { background: #fff; color: #111; border: 1.5px solid #ddd; }
    .btn-secondary:hover { border-color: #111; }
    .btn-ghost { background: transparent; color: #111; padding: 8px 12px; }
    .btn-ghost:hover { background: #f0f0f0; }
    .btn-danger { background: #fff; color: #c00; border: 1.5px solid #fcc; }
    .btn-danger:hover { background: #fff0f0; }
    .btn-sm { padding: 6px 12px; font-size: 12px; }
    .btn-xs { padding: 4px 9px; font-size: 11px; }
    .card { background: #fff; border: 1px solid #e8e8e8; border-radius: 10px; }
    .card-header { padding: 18px 20px 14px; border-bottom: 1px solid #f0f0f0; display: flex; align-items: center; justify-content: space-between; }
    .card-title { font-size: 13px; font-weight: 700; letter-spacing: -0.01em; }
    .card-body { padding: 20px; }
    .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .stat-card { background: #fff; border: 1px solid #e8e8e8; border-radius: 10px; padding: 20px; }
    .stat-label { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #888; margin-bottom: 8px; }
    .stat-value { font-size: 28px; font-weight: 800; letter-spacing: -0.04em; color: #111; }
    .stat-sub { font-size: 12px; color: #999; margin-top: 4px; }
    .stat-card.dark { background: #111; border-color: #111; }
    .stat-card.dark .stat-label { color: #666; }
    .stat-card.dark .stat-value { color: #fff; }
    .stat-card.dark .stat-sub { color: #555; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #999; padding: 10px 14px; border-bottom: 1px solid #f0f0f0; background: #fafafa; }
    td { padding: 12px 14px; border-bottom: 1px solid #f5f5f5; vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #fafafa; }
    .badge { display: inline-flex; align-items: center; padding: 3px 9px; border-radius: 20px; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
    .pill { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: #f0f0f0; color: #555; }
    .form-group { margin-bottom: 16px; }
    .form-label { display: block; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #666; margin-bottom: 6px; }
    .form-control { width: 100%; padding: 9px 12px; border: 1.5px solid #e0e0e0; border-radius: 6px; font-size: 13px; font-family: 'Open Sans', sans-serif; color: #111; background: #fff; outline: none; transition: border-color 0.15s; }
    .form-control:focus { border-color: #111; }
    textarea.form-control { resize: vertical; min-height: 80px; }
    select.form-control { cursor: pointer; }
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .modal { background: #fff; border-radius: 12px; width: 100%; max-width: 640px; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
    .modal-lg { max-width: 800px; }
    .modal-header { padding: 20px 24px 16px; border-bottom: 1px solid #f0f0f0; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; background: #fff; z-index: 1; }
    .modal-title { font-size: 16px; font-weight: 700; }
    .modal-body { padding: 24px; }
    .modal-footer { padding: 16px 24px; border-top: 1px solid #f0f0f0; display: flex; justify-content: flex-end; gap: 10px; position: sticky; bottom: 0; background: #fff; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
    .tabs { display: flex; gap: 2px; border-bottom: 1px solid #e8e8e8; margin-bottom: 20px; }
    .tab { padding: 10px 16px; font-size: 13px; font-weight: 600; cursor: pointer; color: #999; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: all 0.15s; }
    .tab:hover { color: #333; }
    .tab.active { color: #111; border-bottom-color: #111; }
    .empty-state { text-align: center; padding: 48px 20px; color: #999; }
    .empty-state-icon { font-size: 36px; margin-bottom: 12px; opacity: 0.4; }
    .empty-state-text { font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #666; }
    .empty-state-sub { font-size: 12px; }
    .search-bar { display: flex; align-items: center; gap: 8px; background: #f5f5f5; border: 1.5px solid #e8e8e8; border-radius: 8px; padding: 8px 14px; min-width: 0; flex: 1; }
    .search-bar input { border: none; background: transparent; font-size: 13px; font-family: 'Open Sans', sans-serif; outline: none; flex: 1; color: #111; min-width: 0; }
    .line-items-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    .line-items-table th { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #999; padding: 6px 8px; border-bottom: 1px solid #f0f0f0; text-align: left; }
    .line-items-table td { padding: 6px 8px; vertical-align: middle; }
    .line-items-table input { width: 100%; border: 1.5px solid #e8e8e8; border-radius: 4px; padding: 5px 7px; font-size: 12px; font-family: 'Open Sans', sans-serif; outline: none; }
    .line-items-table input:focus { border-color: #111; }
    .totals-box { background: #fafafa; border: 1px solid #e8e8e8; border-radius: 8px; padding: 14px 16px; min-width: 220px; }
    .totals-row { display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0; }
    .totals-row.total { font-weight: 800; font-size: 15px; border-top: 1px solid #ddd; margin-top: 8px; padding-top: 8px; }
    .job-card { background: #fff; border: 1px solid #e8e8e8; border-radius: 10px; padding: 16px; cursor: pointer; transition: all 0.15s; }
    .job-card:hover { border-color: #111; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
    .kanban { display: grid; grid-template-columns: repeat(5, minmax(180px,1fr)); gap: 16px; align-items: start; }
    .bill-pipeline { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; align-items: start; }
    .kanban-col { background: #f5f5f5; border-radius: 10px; padding: 12px; min-height: 200px; }
    .kanban-col-header { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #666; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; }
    .kanban-card { background: #fff; border: 1px solid #e8e8e8; border-radius: 8px; padding: 12px; margin-bottom: 8px; cursor: pointer; transition: all 0.15s; font-size: 12px; }
    .kanban-card:hover { border-color: #111; }
    .priority-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
    .priority-high { background: #111; }
    .priority-medium { background: #777; }
    .priority-low { background: #ccc; }
    .avatar { width: 26px; height: 26px; border-radius: 50%; background: #111; color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; border: 2px solid #fff; margin-left: -6px; }
    .avatar:first-child { margin-left: 0; }
    .avatar-group { display: flex; }
    .tag { display: inline-flex; padding: 2px 8px; background: #f0f0f0; color: #555; border-radius: 4px; font-size: 11px; font-weight: 600; margin: 2px; }
    .progress-bar { height: 4px; background: #e8e8e8; border-radius: 2px; overflow: hidden; }
    .progress-fill { height: 100%; background: #111; border-radius: 2px; transition: width 0.3s; }
    .timeline { position: relative; padding-left: 24px; }
    .timeline::before { content: ''; position: absolute; left: 6px; top: 6px; bottom: 6px; width: 1px; background: #e8e8e8; }
    .timeline-item { position: relative; margin-bottom: 20px; }
    .timeline-dot { position: absolute; left: -21px; top: 4px; width: 10px; height: 10px; border-radius: 50%; background: #111; border: 2px solid #fff; box-shadow: 0 0 0 1px #111; }
    .alert { padding: 12px 16px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; }
    .alert-info { background: #f5f5f5; border: 1px solid #e0e0e0; color: #444; }
    .alert-success { background: #f5fff5; border: 1px solid #c0e0c0; color: #2a5a2a; }
    .checkbox-label { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
    .multi-select { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px; border: 1.5px solid #e0e0e0; border-radius: 6px; min-height: 44px; }
    .multi-option { padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1.5px solid #e0e0e0; color: #666; transition: all 0.1s; }
    .multi-option.selected { background: #111; color: #fff; border-color: #111; }
    .chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: #f0f0f0; color: #444; }

    /* ── Sidebar transition ── */
    .jm-sidebar { transition: transform 0.28s cubic-bezier(0.4,0,0.2,1); }
    .jm-sidebar-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 99; }

    /* ── Hamburger ── */
    .jm-hamburger { display: none; align-items: center; justify-content: center; width: 38px; height: 38px; border: none; background: transparent; cursor: pointer; border-radius: 8px; color: #111; flex-shrink: 0; }
    .jm-hamburger:hover { background: #f0f0f0; }

    /* ── Bottom mobile nav ── */
    .jm-bottom-nav { display: none; position: fixed; bottom: 0; left: 0; right: 0; background: #111; z-index: 90; padding: 0; border-top: 1px solid #222; }
    .jm-bottom-nav-inner { display: flex; align-items: stretch; }
    .jm-bottom-nav-item { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px 4px 10px; cursor: pointer; color: #666; gap: 3px; position: relative; min-width: 0; border: none; background: transparent; font-family: 'Open Sans', sans-serif; transition: color 0.15s; }
    .jm-bottom-nav-item.active { color: #fff; }
    .jm-bottom-nav-item span { font-size: 9px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 52px; }
    .jm-bottom-nav-item .bnav-badge { position: absolute; top: 5px; right: calc(50% - 14px); background: #fff; color: #111; font-size: 8px; font-weight: 800; border-radius: 8px; padding: 1px 4px; min-width: 14px; text-align: center; }
    .jm-more-menu { position: fixed; bottom: 60px; right: 0; left: 0; background: #111; border-top: 1px solid #222; z-index: 95; padding: 8px 0; }
    .jm-more-menu-item { display: flex; align-items: center; gap: 14px; padding: 13px 24px; color: #bbb; font-size: 14px; font-weight: 600; cursor: pointer; border: none; background: transparent; font-family: 'Open Sans', sans-serif; width: 100%; text-align: left; }
    .jm-more-menu-item.active { color: #fff; background: #1e1e1e; }
    .jm-more-menu-item:hover { color: #fff; background: #1a1a1a; }
    .jm-more-badge { margin-left: auto; background: #fff; color: #111; font-size: 10px; font-weight: 700; border-radius: 10px; padding: 1px 7px; }

    /* ── Responsive breakpoints ── */
    @media (max-width: 1024px) {
      .jm-sidebar { transform: translateX(-100%); }
      .jm-sidebar.open { transform: translateX(0); }
      .jm-sidebar-overlay.open { display: block; }
      .jm-main { margin-left: 0 !important; }
      .jm-hamburger { display: flex; }
      .jm-sidebar-close { display: flex !important; }
    }
    @media (max-width: 767px) {
      .bill-pipeline { grid-template-columns: repeat(2, 1fr); overflow-x: auto; }
      .jm-bottom-nav { display: flex; flex-direction: column; }
      .jm-content { padding: 16px; padding-bottom: 80px; }
      .jm-topbar { padding: 0 14px; height: 54px; }
      .jm-topbar-date { display: none; }
      .stat-grid { grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
      .stat-card { padding: 14px; }
      .stat-value { font-size: 20px; }
      .grid-2, .grid-3 { grid-template-columns: 1fr; }
      .kanban { grid-template-columns: repeat(2, minmax(160px,1fr)); overflow-x: auto; }
      .dashboard-grid { grid-template-columns: 1fr !important; }
      .modal { border-radius: 16px 16px 0 0; max-height: 92vh; }
      .modal-overlay { align-items: flex-end; padding: 0; }
      .modal-lg { max-width: 100%; }
      .topbar-actions-hide { display: none; }
      .line-items-table th:nth-child(3), .line-items-table td:nth-child(3) { display: none; }
    }
    @media (min-width: 768px) and (max-width: 1024px) {
      .jm-content { padding: 20px; }
      .stat-grid { grid-template-columns: repeat(3, 1fr); }
      .kanban { grid-template-columns: repeat(3, minmax(160px,1fr)); overflow-x: auto; }
      .dashboard-grid { grid-template-columns: 1fr 1fr !important; }
    }
    @media (min-width: 1025px) {
      .dashboard-grid { grid-template-columns: 1fr 1fr !important; }
    }
  `;
  document.head.appendChild(s);
};
injectStyles();

// ── Icons ────────────────────────────────────────────────────────────────────
const Icon = ({ name, size = 15 }) => {
  const icons = {
    dashboard: "M3 3h7v7H3zm11 0h7v7h-7zm0 11h7v7h-7zM3 14h7v7H3z",
    jobs: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
    clients: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm8 0a4 4 0 100-8 4 4 0 000 8",
    schedule: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
    quotes: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    time: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
    bills: "M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z",
    invoices: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z",
    plus: "M12 5v14M5 12h14",
    close: "M6 18L18 6M6 6l12 12",
    edit: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
    trash: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
    search: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    eye: "M15 12a3 3 0 11-6 0 3 3 0 016 0zm-9.197.196C6.678 8.34 9.112 6 12 6s5.322 2.34 6.197 5.196a.5.5 0 010 .608C17.322 14.66 14.888 17 12 17s-5.322-2.34-6.197-4.196a.5.5 0 010-.608z",
    check: "M5 13l4 4L19 7",
    arrow_right: "M9 5l7 7-7 7",
    dollar: "M12 1v22M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6",
    copy: "M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z",
    send: "M12 19l9 2-9-18-9 18 9-2zm0 0v-8",
    filter: "M3 4h18M7 12h10M11 20h2",
    activity: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
    kanban: "M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v10m0 4v4M9 17H5a2 2 0 01-2-2v-4m6 6h10a2 2 0 002-2v-4",
    list_view: "M4 6h16M4 10h16M4 14h16M4 18h16",
    chart: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    notification: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {icons[name] && <path d={icons[name]} />}
    </svg>
  );
};

// ── Status Badge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const labels = { draft: "Draft", scheduled: "Scheduled", quoted: "Quoted", in_progress: "In Progress", completed: "Completed", cancelled: "Cancelled", sent: "Sent", accepted: "Accepted", declined: "Declined", pending: "Pending", approved: "Approved", paid: "Paid", overdue: "Overdue", void: "Void" };
  return (
    <span className="badge" style={{ background: STATUS_BG[status] || "#f0f0f0", color: STATUS_TEXT[status] || "#666" }}>
      {labels[status] || status}
    </span>
  );
};

// ── Avatar Group ─────────────────────────────────────────────────────────────
const AvatarGroup = ({ names = [], max = 3 }) => {
  const shown = names.slice(0, max);
  const extra = names.length - max;
  return (
    <div className="avatar-group">
      {shown.map((n, i) => (
        <div key={i} className="avatar" title={n} style={{ background: ["#111","#333","#555","#777","#999"][i % 5] }}>
          {n.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase()}
        </div>
      ))}
      {extra > 0 && <div className="avatar" style={{ background: "#ccc", color: "#666" }}>+{extra}</div>}
    </div>
  );
};

// ── Close Button ─────────────────────────────────────────────────────────────
const CloseBtn = ({ onClick }) => (
  <button onClick={onClick} className="btn btn-ghost" style={{ padding: "6px", borderRadius: "6px" }}><Icon name="close" size={16} /></button>
);

// ── Line Items Editor ─────────────────────────────────────────────────────────
const LineItemsEditor = ({ items, onChange }) => {
  const update = (i, field, val) => {
    const next = items.map((it, idx) => idx === i ? { ...it, [field]: field === "qty" || field === "rate" ? parseFloat(val) || 0 : val } : it);
    onChange(next);
  };
  const add = () => onChange([...items, { desc: "", qty: 1, unit: "hrs", rate: 0 }]);
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));
  const sub = items.reduce((s, l) => s + (l.qty * l.rate), 0);
  return (
    <div>
      <table className="line-items-table">
        <thead>
          <tr>
            <th style={{ width: "40%" }}>Description</th>
            <th style={{ width: "10%" }}>Qty</th>
            <th style={{ width: "12%" }}>Unit</th>
            <th style={{ width: "15%" }}>Rate ($)</th>
            <th style={{ width: "15%" }}>Total</th>
            <th style={{ width: "8%" }}></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td><input value={it.desc} onChange={e => update(i, "desc", e.target.value)} placeholder="Description" /></td>
              <td><input type="number" value={it.qty} onChange={e => update(i, "qty", e.target.value)} min="0" /></td>
              <td>
                <select style={{ width: "100%", border: "1.5px solid #e8e8e8", borderRadius: 4, padding: "5px 7px", fontFamily: "'Open Sans', sans-serif", fontSize: 12 }} value={it.unit} onChange={e => update(i, "unit", e.target.value)}>
                  {["hrs","ea","m²","lm","lot","day","m³","kg"].map(u => <option key={u}>{u}</option>)}
                </select>
              </td>
              <td><input type="number" value={it.rate} onChange={e => update(i, "rate", e.target.value)} min="0" /></td>
              <td style={{ fontWeight: 600 }}>{fmt(it.qty * it.rate)}</td>
              <td><button onClick={() => remove(i)} className="btn btn-ghost btn-xs" style={{ color: "#c00", padding: "4px" }}><Icon name="trash" size={12} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={add} className="btn btn-secondary btn-sm"><Icon name="plus" size={12} />Add Line</button>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <div className="totals-box">
          <div className="totals-row"><span>Subtotal</span><span>{fmt(sub)}</span></div>
          <div className="totals-row"><span>GST (10%)</span><span>{fmt(sub * 0.1)}</span></div>
          <div className="totals-row total"><span>Total</span><span>{fmt(sub * 1.1)}</span></div>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// PAGES
// ══════════════════════════════════════════════════════════════════════════════

// ── Dashboard ─────────────────────────────────────────────────────────────────
const Dashboard = ({ jobs, clients, quotes, invoices, bills, timeEntries, schedule, onNav }) => {
  const active = jobs.filter(j => j.status === "in_progress").length;
  const totalRevenue = invoices.filter(i => i.status === "paid").reduce((s, inv) => s + calcQuoteTotal(inv), 0);
  const pendingInvoices = invoices.filter(i => i.status !== "paid").reduce((s, inv) => s + calcQuoteTotal(inv), 0);
  const totalHours = timeEntries.reduce((s, t) => s + t.hours, 0);
  const pendingBills = bills.filter(b => b.status === "pending").reduce((s, b) => s + b.amount, 0);

  const recentJobs = [...jobs].sort((a, b) => b.id - a.id).slice(0, 5);

  return (
    <div>
      <div className="stat-grid">
        <div className="stat-card dark">
          <div className="stat-label">Active Jobs</div>
          <div className="stat-value">{active}</div>
          <div className="stat-sub">{jobs.length} total jobs</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Revenue Collected</div>
          <div className="stat-value">{fmt(totalRevenue)}</div>
          <div className="stat-sub">from paid invoices</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Outstanding Invoices</div>
          <div className="stat-value">{fmt(pendingInvoices)}</div>
          <div className="stat-sub">{invoices.filter(i => i.status !== "paid").length} unpaid</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Hours Logged</div>
          <div className="stat-value">{totalHours}</div>
          <div className="stat-sub">across all jobs</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Bills</div>
          <div className="stat-value">{fmt(pendingBills)}</div>
          <div className="stat-sub">{bills.filter(b => b.status === "pending").length} awaiting approval</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Clients</div>
          <div className="stat-value">{clients.length}</div>
          <div className="stat-sub">active accounts</div>
        </div>
      </div>

      <div className="dashboard-grid" style={{ display: "grid", gap: 20 }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Recent Jobs</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onNav("jobs")}>View all <Icon name="arrow_right" size={12} /></button>
          </div>
          <div style={{ overflow: "hidden" }}>
            {recentJobs.map(job => {
              const client = clients.find(c => c.id === job.clientId);
              return (
                <div key={job.id} style={{ padding: "12px 20px", borderBottom: "1px solid #f5f5f5", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => onNav("jobs")}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{job.title}</div>
                    <div style={{ fontSize: 12, color: "#999" }}>{client?.name}</div>
                  </div>
                  <StatusBadge status={job.status} />
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Jobs by Status</span>
          </div>
          <div className="card-body">
            {["draft","scheduled","quoted","in_progress","completed"].map(s => {
              const count = jobs.filter(j => j.status === s).length;
              const pct = jobs.length ? (count / jobs.length) * 100 : 0;
              const labels = { draft: "Draft", scheduled: "Scheduled", quoted: "Quoted", in_progress: "In Progress", completed: "Completed" };
              return (
                <div key={s} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
                    <span style={{ fontWeight: 600 }}>{labels[s]}</span>
                    <span style={{ color: "#999" }}>{count} jobs</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${pct}%`, background: s === "in_progress" ? "#111" : s === "completed" ? "#555" : "#ccc" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Upcoming Schedule</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onNav("schedule")}>View all <Icon name="arrow_right" size={12} /></button>
          </div>
          <div style={{ overflow: "hidden" }}>
            {[...schedule].sort((a,b) => a.date > b.date ? 1 : -1).slice(0, 4).map(s => {
              const job = jobs.find(j => j.id === s.jobId);
              return (
                <div key={s.id} style={{ padding: "11px 20px", borderBottom: "1px solid #f5f5f5", display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ background: "#111", color: "#fff", borderRadius: 6, padding: "6px 10px", textAlign: "center", minWidth: 44 }}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{new Date(s.date).getDate()}</div>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>{new Date(s.date).toLocaleString("en", { month: "short" })}</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{s.title}</div>
                    <div style={{ fontSize: 12, color: "#999" }}>{job?.title}</div>
                  </div>
                  <AvatarGroup names={s.assignedTo} max={2} />
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Quote Pipeline</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onNav("quotes")}>View all <Icon name="arrow_right" size={12} /></button>
          </div>
          <div className="card-body">
            {quotes.map(q => {
              const job = jobs.find(j => j.id === q.jobId);
              return (
                <div key={q.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f5f5f5" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{q.number}</div>
                    <div style={{ fontSize: 12, color: "#999" }}>{job?.title}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{fmt(calcQuoteTotal(q))}</div>
                    <StatusBadge status={q.status} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Section Label ─────────────────────────────────────────────────────────────
const SectionLabel = ({ children }) => (
  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#999", marginBottom: 10, marginTop: 4 }}>{children}</div>
);

// ── Job Detail Drawer ─────────────────────────────────────────────────────────
const JobDetail = ({ job, clients, quotes, setQuotes, invoices, setInvoices, timeEntries, setTimeEntries, bills, setBills, schedule, setSchedule, jobs, setJobs, staff, onClose, onEdit }) => {
  const [tab, setTab] = useState("overview");
  const client = clients.find(c => c.id === job.clientId);

  const jobQuotes    = quotes.filter(q => q.jobId === job.id);
  const jobInvoices  = invoices.filter(i => i.jobId === job.id);
  const jobTime      = timeEntries.filter(t => t.jobId === job.id);
  const jobBills     = bills.filter(b => b.jobId === job.id);
  const jobSchedule  = schedule.filter(s => s.jobId === job.id).sort((a,b) => a.date > b.date ? 1 : -1);

  const totalQuoted   = jobQuotes.filter(q => q.status === "accepted").reduce((s,q) => s + calcQuoteTotal(q), 0);
  const totalInvoiced = jobInvoices.reduce((s,i) => s + calcQuoteTotal(i), 0);
  const totalPaid     = jobInvoices.filter(i => i.status === "paid").reduce((s,i) => s + calcQuoteTotal(i), 0);
  const totalHours    = jobTime.reduce((s,t) => s + t.hours, 0);
  const totalCosts    = jobBills.filter(b => b.status === "approved").reduce((s,b) => s + b.amount, 0);

  // Quick-add quote from within job
  const addQuoteForJob = async () => {
    try {
      const newQ = { jobId: job.id, status: "draft", lineItems: [{ desc: "", qty: 1, unit: "hrs", rate: 0 }], tax: 10, notes: "" };
      const saved = await createQuote(newQ);
      setQuotes(qs => [...qs, saved]);
    } catch (err) {
      console.error('Failed to create quote:', err);
    }
  };

  // Convert accepted quote → invoice
  const quoteToInvoice = async (q) => {
    try {
      const newInv = { jobId: job.id, status: "draft", lineItems: [...q.lineItems], tax: q.tax, dueDate: "", notes: q.notes, fromQuoteId: q.id };
      const saved = await createInvoice(newInv);
      setInvoices(is => [...is, saved]);
      setJobs(js => js.map(j => j.id === job.id ? { ...j, activityLog: addLog(j.activityLog, `Invoice ${saved.number} created from ${q.number}`) } : j));
    } catch (err) {
      console.error('Failed to create invoice from quote:', err);
    }
  };

  // Quick-add time
  const [showTimeForm, setShowTimeForm] = useState(false);
  const [timeForm, setTimeForm] = useState({ worker: TEAM[0], date: new Date().toISOString().slice(0,10), startTime: "", endTime: "", hours: 1, description: "", billable: true });
  const quickHours = calcHoursFromTimes(timeForm.startTime, timeForm.endTime) || timeForm.hours;
  const saveTime = async () => {
    const hours = calcHoursFromTimes(timeForm.startTime, timeForm.endTime) || Number(timeForm.hours);
    try {
      const staffMember = staff ? staff.find(s => s.name === timeForm.worker) : null;
      const staffId = staffMember?.id;
      const saved = await createTimeEntry({ ...timeForm, jobId: job.id, hours }, staffId);
      setTimeEntries(ts => [...ts, saved]);
      setJobs(js => js.map(j => j.id === job.id ? { ...j, activityLog: addLog(j.activityLog, `${timeForm.worker} logged ${hours}h`) } : j));
    } catch (err) {
      console.error('Failed to save time entry:', err);
    }
    setShowTimeForm(false);
    setTimeForm({ worker: (staff && staff[0]?.name) || TEAM[0], date: new Date().toISOString().slice(0,10), startTime: "", endTime: "", hours: 1, description: "", billable: true });
  };

  const delTime = async (id) => {
    try {
      await deleteTimeEntry(id);
      setTimeEntries(ts => ts.filter(t => t.id !== id));
    } catch (err) { console.error('Failed to delete time entry:', err); }
  };
  const delQuote = async (id) => {
    try {
      await deleteQuote(id);
      setQuotes(qs => qs.filter(q => q.id !== id));
    } catch (err) { console.error('Failed to delete quote:', err); }
  };
  const delInvoice = async (id) => {
    try {
      await deleteInvoice(id);
      setInvoices(is => is.filter(i => i.id !== id));
    } catch (err) { console.error('Failed to delete invoice:', err); }
  };
  const delBill = async (id) => {
    try {
      await deleteBill(id);
      setBills(bs => bs.filter(b => b.id !== id));
    } catch (err) { console.error('Failed to delete bill:', err); }
  };
  const markInvPaid = async (id) => {
    const inv = invoices.find(i => i.id === id);
    try {
      const saved = await updateInvoice(id, { ...inv, status: "paid" });
      setInvoices(is => is.map(i => i.id === saved.id ? saved : i));
      setJobs(js => js.map(j => j.id === job.id ? { ...j, activityLog: addLog(j.activityLog, `Invoice ${inv?.number} marked paid`) } : j));
    } catch (err) { console.error('Failed to mark invoice paid:', err); }
  };
  const acceptQuote = async (id) => {
    const q = quotes.find(x => x.id === id);
    try {
      const saved = await updateQuote(id, { ...q, status: "accepted" });
      setQuotes(qs => qs.map(x => x.id === saved.id ? saved : x));
      setJobs(js => js.map(j => j.id === job.id ? { ...j, activityLog: addLog(j.activityLog, `Quote ${q?.number} accepted`) } : j));
    } catch (err) { console.error('Failed to accept quote:', err); }
  };

  // ── Edit state for inline modals ──
  const [editingQuote,   setEditingQuote]   = useState(null);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [editingBill,    setEditingBill]    = useState(null);

  const saveQuote = async (data) => {
    try {
      const saved = await updateQuote(data.id, data);
      setQuotes(qs => qs.map(q => q.id === saved.id ? saved : q));
      setJobs(js => js.map(j => j.id === job.id ? { ...j, activityLog: addLog(j.activityLog, `Quote ${data.number} updated`) } : j));
    } catch (err) { console.error('Failed to save quote:', err); }
    setEditingQuote(null);
  };
  const saveInvoice = async (data) => {
    try {
      const saved = await updateInvoice(data.id, data);
      setInvoices(is => is.map(i => i.id === saved.id ? saved : i));
      setJobs(js => js.map(j => j.id === job.id ? { ...j, activityLog: addLog(j.activityLog, `Invoice ${data.number} updated`) } : j));
    } catch (err) { console.error('Failed to save invoice:', err); }
    setEditingInvoice(null);
  };
  const saveBillFromJob = async (data) => {
    try {
      if (editingBill?.id) {
        const saved = await updateBill(editingBill.id, data);
        setBills(bs => bs.map(b => b.id === editingBill.id ? saved : b));
        setJobs(js => js.map(j => j.id === job.id ? { ...j, activityLog: addLog(j.activityLog, `Bill from ${data.supplier} updated`) } : j));
      } else {
        const billData = { ...data, jobId: job.id, status: "linked" };
        const saved = await createBill(billData);
        setBills(bs => [...bs, saved]);
        setJobs(js => js.map(j => j.id === job.id ? { ...j, activityLog: addLog(j.activityLog, `Bill captured: ${data.supplier} ${fmt(data.amount)}`) } : j));
      }
    } catch (err) { console.error('Failed to save bill:', err); }
    setEditingBill(null);
  };

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "quotes", label: `Quotes (${jobQuotes.length})` },
    { id: "invoices", label: `Invoices (${jobInvoices.length})` },
    { id: "time", label: `Time (${totalHours}h)` },
    { id: "costs", label: `Costs (${jobBills.length})` },
    { id: "schedule", label: `Schedule (${jobSchedule.length})` },
    { id: "activity", label: `Activity (${(job.activityLog||[]).length})` },
  ];

  return (
    <>
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg" style={{ maxWidth: 860, maxHeight: "92vh" }}>
        {/* Header */}
        <div className="modal-header" style={{ flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
          <div style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <span className={`priority-dot priority-${job.priority}`} />
                <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>{job.title}</span>
              </div>
              <div style={{ fontSize: 12, color: "#888" }}>
                {client?.name}
                {job.dueDate && <span> · Due {job.dueDate}</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <StatusBadge status={job.status} />
              <button className="btn btn-secondary btn-sm" onClick={onEdit}><Icon name="edit" size={12} />Edit</button>
              <CloseBtn onClick={onClose} />
            </div>
          </div>
          {/* Tabs */}
          <div className="tabs" style={{ marginBottom: 0, width: "100%", overflowX: "auto", flexShrink: 0 }}>
            {tabs.map(t => <div key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)} style={{ whiteSpace: "nowrap" }}>{t.label}</div>)}
          </div>
        </div>

        <div className="modal-body" style={{ padding: "20px 24px" }}>

          {/* ── Overview ── */}
          {tab === "overview" && (
            <div>
              {job.description && <p style={{ fontSize: 13, color: "#555", lineHeight: 1.6, marginBottom: 20 }}>{job.description}</p>}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px,1fr))", gap: 12, marginBottom: 20 }}>
                {[
                  { label: "Quoted", val: fmt(totalQuoted), sub: `${jobQuotes.filter(q=>q.status==="accepted").length} accepted` },
                  { label: "Invoiced", val: fmt(totalInvoiced), sub: `${fmt(totalPaid)} paid` },
                  { label: "Time Logged", val: `${totalHours}h`, sub: `${jobTime.filter(t=>t.billable).reduce((s,t)=>s+t.hours,0)}h billable` },
                  { label: "Costs", val: fmt(totalCosts), sub: `${jobBills.filter(b=>b.status==="pending").length} pending` },
                ].map((s,i) => (
                  <div key={i} style={{ background: "#f8f8f8", borderRadius: 8, padding: "14px 16px" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#999", marginBottom: 6 }}>{s.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em" }}>{s.val}</div>
                    <div style={{ fontSize: 11, color: "#aaa", marginTop: 3 }}>{s.sub}</div>
                  </div>
                ))}
              </div>
              <div className="grid-2">
                <div>
                  <SectionLabel>Job Details</SectionLabel>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      { label: "Client", val: client?.name },
                      { label: "Site", val: (() => { const s = client?.sites?.find(x => x.id === job.siteId); return s ? s.name : "—"; })() },
                      { label: "Site Contact", val: (() => { const s = client?.sites?.find(x => x.id === job.siteId); return s?.contactName ? `${s.contactName}${s.contactPhone ? " · " + s.contactPhone : ""}` : "—"; })() },
                      { label: "Status", val: <StatusBadge status={job.status} /> },
                      { label: "Priority", val: <span style={{ textTransform: "capitalize" }}>{job.priority}</span> },
                      { label: "Start Date", val: job.startDate || "—" },
                      { label: "Due Date", val: job.dueDate || "—" },
                    ].map((r,i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderBottom: "1px solid #f5f5f5", paddingBottom: 6 }}>
                        <span style={{ color: "#888" }}>{r.label}</span><span style={{ fontWeight: 600 }}>{r.val}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <SectionLabel>Team</SectionLabel>
                  {job.assignedTo.length === 0
                    ? <div style={{ fontSize: 13, color: "#bbb" }}>No team assigned</div>
                    : job.assignedTo.map((w,i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <div className="avatar" style={{ margin: 0 }}>{w.split(" ").map(p=>p[0]).join("")}</div>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{w}</span>
                        <span style={{ fontSize: 11, color: "#bbb", marginLeft: "auto" }}>{jobTime.filter(t=>t.worker===w).reduce((s,t)=>s+t.hours,0)}h</span>
                      </div>
                    ))
                  }
                  {job.tags.length > 0 && <>
                    <SectionLabel>Tags</SectionLabel>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{job.tags.map((t,i) => <span key={i} className="tag">{t}</span>)}</div>
                  </>}
                </div>
              </div>
            </div>
          )}

          {/* ── Quotes ── */}
          {tab === "quotes" && (
            <div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
                <button className="btn btn-primary btn-sm" onClick={async () => {
                  try {
                    const newQ = { jobId: job.id, status: "draft", lineItems: [{ desc: "", qty: 1, unit: "hrs", rate: 0 }], tax: 10, notes: "" };
                    const saved = await createQuote(newQ);
                    setQuotes(qs => [...qs, saved]);
                    setEditingQuote(saved);
                  } catch (err) { console.error('Failed to create quote:', err); }
                }}><Icon name="plus" size={12} />New Quote</button>
              </div>
              {jobQuotes.length === 0
                ? <div className="empty-state"><div className="empty-state-icon">📋</div><div className="empty-state-text">No quotes yet</div><div className="empty-state-sub">Create a quote to send to the client</div></div>
                : jobQuotes.map(q => {
                  const sub = q.lineItems.reduce((s,l) => s + l.qty * l.rate, 0);
                  const alreadyInvoiced = invoices.some(i => i.fromQuoteId === q.id);
                  return (
                    <div key={q.id} style={{ border: "1px solid #e8e8e8", borderRadius: 10, padding: 16, marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 14 }}>{q.number}</div>
                          <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>{q.createdAt}</div>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <StatusBadge status={q.status} />
                          {q.status !== "accepted" && <button className="btn btn-secondary btn-xs" onClick={() => acceptQuote(q.id)}>Accept</button>}
                          {q.status === "accepted" && !alreadyInvoiced && (
                            <button className="btn btn-primary btn-xs" onClick={() => { quoteToInvoice(q); setTab("invoices"); }}>
                              <Icon name="invoices" size={11} />→ Invoice
                            </button>
                          )}
                          {alreadyInvoiced && <span style={{ fontSize: 11, color: "#aaa" }}>Invoiced ✓</span>}
                          <button className="btn btn-ghost btn-xs" onClick={() => setEditingQuote(q)}><Icon name="edit" size={11} /></button>
                          <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => delQuote(q.id)}><Icon name="trash" size={11} /></button>
                        </div>
                      </div>
                      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                        <thead><tr>{["Description","Qty","Unit","Rate","Total"].map(h => <th key={h} style={{ textAlign: "left", color: "#bbb", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", paddingBottom: 4, borderBottom: "1px solid #f0f0f0" }}>{h}</th>)}</tr></thead>
                        <tbody>
                          {q.lineItems.map((l,i) => (
                            <tr key={i}>
                              <td style={{ padding: "5px 0", color: "#444" }}>{l.desc}</td>
                              <td style={{ color: "#666" }}>{l.qty}</td>
                              <td style={{ color: "#666" }}>{l.unit}</td>
                              <td style={{ color: "#666" }}>{fmt(l.rate)}</td>
                              <td style={{ fontWeight: 600 }}>{fmt(l.qty * l.rate)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10, gap: 20, fontSize: 13 }}>
                        <span style={{ color: "#999" }}>Subtotal <strong style={{ color: "#111" }}>{fmt(sub)}</strong></span>
                        <span style={{ color: "#999" }}>GST <strong style={{ color: "#111" }}>{fmt(sub * q.tax / 100)}</strong></span>
                        <span style={{ fontWeight: 800, fontSize: 14 }}>Total {fmt(calcQuoteTotal(q))}</span>
                      </div>
                      {q.notes && <div style={{ marginTop: 8, fontSize: 12, color: "#999", fontStyle: "italic", borderTop: "1px solid #f5f5f5", paddingTop: 8 }}>{q.notes}</div>}
                    </div>
                  );
                })
              }
            </div>
          )}

          {/* ── Invoices ── */}
          {tab === "invoices" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: "#888" }}>
                  {jobInvoices.length > 0 && <span><strong style={{ color: "#111" }}>{fmt(totalPaid)}</strong> paid of <strong style={{ color: "#111" }}>{fmt(totalInvoiced)}</strong> invoiced</span>}
                </div>
                <button className="btn btn-primary btn-sm" onClick={async () => {
                  try {
                    const newInv = { jobId: job.id, status: "draft", lineItems: [{ desc: "", qty: 1, unit: "hrs", rate: 0 }], tax: 10, dueDate: "", notes: "" };
                    const saved = await createInvoice(newInv);
                    setInvoices(is => [...is, saved]);
                    setEditingInvoice(saved);
                  } catch (err) { console.error('Failed to create invoice:', err); }
                }}><Icon name="plus" size={12} />New Invoice</button>
              </div>
              {jobInvoices.length === 0
                ? <div className="empty-state"><div className="empty-state-icon">💳</div><div className="empty-state-text">No invoices yet</div><div className="empty-state-sub">Create an invoice or convert an accepted quote</div></div>
                : jobInvoices.map(inv => {
                  const sub = inv.lineItems.reduce((s,l) => s + l.qty * l.rate, 0);
                  const fromQuote = inv.fromQuoteId ? quotes.find(q => q.id === inv.fromQuoteId) : null;
                  return (
                    <div key={inv.id} style={{ border: "1px solid #e8e8e8", borderRadius: 10, padding: 16, marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 14 }}>{inv.number}</div>
                          <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
                            {inv.createdAt}
                            {fromQuote && <span style={{ marginLeft: 8, color: "#bbb" }}>from {fromQuote.number}</span>}
                            {inv.dueDate && <span style={{ marginLeft: 8 }}>· Due {inv.dueDate}</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <StatusBadge status={inv.status} />
                          {inv.status !== "paid" && inv.status !== "void" && (
                            <button className="btn btn-primary btn-xs" onClick={() => markInvPaid(inv.id)}>Mark Paid</button>
                          )}
                          <button className="btn btn-ghost btn-xs" onClick={() => setEditingInvoice(inv)}><Icon name="edit" size={11} /></button>
                          <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => delInvoice(inv.id)}><Icon name="trash" size={11} /></button>
                        </div>
                      </div>
                      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                        <thead><tr>{["Description","Qty","Unit","Rate","Total"].map(h => <th key={h} style={{ textAlign: "left", color: "#bbb", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", paddingBottom: 4, borderBottom: "1px solid #f0f0f0" }}>{h}</th>)}</tr></thead>
                        <tbody>
                          {inv.lineItems.map((l,i) => (
                            <tr key={i}><td style={{ padding: "5px 0", color: "#444" }}>{l.desc}</td><td style={{ color: "#666" }}>{l.qty}</td><td style={{ color: "#666" }}>{l.unit}</td><td style={{ color: "#666" }}>{fmt(l.rate)}</td><td style={{ fontWeight: 600 }}>{fmt(l.qty*l.rate)}</td></tr>
                          ))}
                        </tbody>
                      </table>
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10, gap: 20, fontSize: 13 }}>
                        <span style={{ color: "#999" }}>Subtotal <strong style={{ color: "#111" }}>{fmt(sub)}</strong></span>
                        <span style={{ color: "#999" }}>GST <strong style={{ color: "#111" }}>{fmt(sub * inv.tax / 100)}</strong></span>
                        <span style={{ fontWeight: 800, fontSize: 14 }}>Total {fmt(calcQuoteTotal(inv))}</span>
                      </div>
                    </div>
                  );
                })
              }
            </div>
          )}

          {/* ── Time ── */}
          {tab === "time" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: "#888" }}>
                  {totalHours > 0 && <span><strong style={{ color: "#111" }}>{jobTime.filter(t=>t.billable).reduce((s,t)=>s+t.hours,0)}h</strong> billable · <strong style={{ color: "#111" }}>{totalHours}h</strong> total</span>}
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => setShowTimeForm(v => !v)}><Icon name="plus" size={12} />Log Time</button>
              </div>
              {showTimeForm && (
                <div style={{ background: "#f8f8f8", borderRadius: 10, padding: 16, marginBottom: 16, border: "1px solid #e8e8e8" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 10 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Worker</label>
                      <select className="form-control" value={timeForm.worker} onChange={e => setTimeForm(f => ({ ...f, worker: e.target.value }))}>
                        {(staff && staff.length > 0 ? staff.map(s => s.name) : TEAM).map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Date</label>
                      <input type="date" className="form-control" value={timeForm.date} onChange={e => setTimeForm(f => ({ ...f, date: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Hours</label>
                      <div style={{ background: "#fff", border: "1.5px solid #e0e0e0", borderRadius: 6, padding: "9px 12px", fontSize: 14, fontWeight: 700, color: quickHours > 0 ? "#111" : "#ccc", textAlign: "center" }}>
                        {quickHours > 0 ? `${quickHours.toFixed(1)}h` : "—"}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Start Time</label>
                      <input type="time" className="form-control" value={timeForm.startTime}
                        onChange={e => setTimeForm(f => ({ ...f, startTime: e.target.value, endTime: f.endTime || addMinsToTime(e.target.value, 60) }))} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">End Time</label>
                      <input type="time" className="form-control" value={timeForm.endTime}
                        onChange={e => setTimeForm(f => ({ ...f, endTime: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label className="form-label">Description</label>
                    <input className="form-control" value={timeForm.description} onChange={e => setTimeForm(f => ({ ...f, description: e.target.value }))} placeholder="Work description" />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label className="checkbox-label"><input type="checkbox" checked={timeForm.billable} onChange={e => setTimeForm(f => ({ ...f, billable: e.target.checked }))} /><span>Billable</span></label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => setShowTimeForm(false)}>Cancel</button>
                      <button className="btn btn-primary btn-sm" onClick={saveTime} disabled={quickHours <= 0}><Icon name="check" size={12} />Save</button>
                    </div>
                  </div>
                </div>
              )}
              {jobTime.length === 0 && !showTimeForm
                ? <div className="empty-state"><div className="empty-state-icon">⏱</div><div className="empty-state-text">No time logged yet</div></div>
                : <div className="card"><div className="table-wrap">
                  <table>
                    <thead><tr><th>Worker</th><th>Date</th><th>Hours</th><th>Billable</th><th>Description</th><th></th></tr></thead>
                    <tbody>
                      {[...jobTime].sort((a,b) => b.date > a.date ? 1 : -1).map(t => (
                        <tr key={t.id}>
                          <td><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div className="avatar" style={{ width: 26, height: 26, fontSize: 10, background: "#333", margin: 0 }}>{t.worker.split(" ").map(w=>w[0]).join("")}</div><span style={{ fontWeight: 600, fontSize: 13 }}>{t.worker}</span></div></td>
                          <td style={{ fontSize: 12, color: "#999" }}>{t.date}</td>
                          <td><span style={{ fontWeight: 700 }}>{t.hours}h</span></td>
                          <td><span className="badge" style={{ background: t.billable ? "#111" : "#f0f0f0", color: t.billable ? "#fff" : "#999" }}>{t.billable ? "Billable" : "Non-bill"}</span></td>
                          <td style={{ fontSize: 12, color: "#666" }}>{t.description}</td>
                          <td><button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => delTime(t.id)}><Icon name="trash" size={11} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div></div>
              }
            </div>
          )}

          {/* ── Costs / Bills ── */}
          {tab === "costs" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: "#888" }}>
                  {jobBills.length > 0 && (
                    <span>
                      <strong style={{ color: "#111" }}>{fmt(jobBills.filter(b=>b.status==="posted"||b.status==="approved").reduce((s,b)=>s+b.amount,0))}</strong> approved
                      {jobBills.filter(b=>b.status==="inbox"||b.status==="linked").length > 0 && (
                        <span> · <strong style={{ color: "#111" }}>{fmt(jobBills.filter(b=>b.status==="inbox"||b.status==="linked").reduce((s,b)=>s+b.amount,0))}</strong> pending</span>
                      )}
                    </span>
                  )}
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => setEditingBill({})}><Icon name="plus" size={12} />Capture Bill</button>
              </div>
              {jobBills.length === 0
                ? <div className="empty-state"><div className="empty-state-icon">🧾</div><div className="empty-state-text">No bills captured for this job</div><div className="empty-state-sub">Capture receipts and supplier invoices here</div></div>
                : <div className="card"><div className="table-wrap">
                  <table>
                    <thead><tr><th>Supplier</th><th>Invoice #</th><th>Category</th><th>Date</th><th>Ex-GST</th><th>Total</th><th>Markup</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      {jobBills.map(b => {
                        const exGst = b.hasGst !== false ? (b.amount||0) / 1.1 : (b.amount||0);
                        const onCharge = exGst * (1 + (b.markup||0) / 100);
                        return (
                          <tr key={b.id}>
                            <td>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{b.supplier || <span style={{ color: "#ccc" }}>—</span>}</div>
                              {b.description && <div style={{ fontSize: 11, color: "#aaa", marginTop: 1 }}>{b.description.slice(0,40)}{b.description.length>40?"…":""}</div>}
                            </td>
                            <td><span style={{ fontFamily: "monospace", fontSize: 12, color: "#666" }}>{b.invoiceNo || "—"}</span></td>
                            <td><span className="chip">{b.category}</span></td>
                            <td style={{ fontSize: 12, color: "#999" }}>{b.date}</td>
                            <td style={{ fontSize: 13 }}>{fmt(exGst)}</td>
                            <td style={{ fontWeight: 700 }}>{fmt(b.amount||0)}</td>
                            <td style={{ fontSize: 12 }}>
                              {(b.markup||0) > 0
                                ? <span style={{ color: "#555" }}>{b.markup}% → <strong>{fmt(onCharge)}</strong></span>
                                : <span style={{ color: "#ddd" }}>—</span>}
                            </td>
                            <td><BillStatusBadge status={b.status} /></td>
                            <td>
                              <div style={{ display: "flex", gap: 4 }}>
                                {b.status === "linked" && (
                                  <button className="btn btn-ghost btn-xs" style={{ color: "#1e7e34" }} title="Approve"
                                    onClick={async () => {
                                      try {
                                        const saved = await updateBill(b.id, { ...b, status: "approved" });
                                        setBills(bs => bs.map(x => x.id === saved.id ? saved : x));
                                        setJobs(js => js.map(j => j.id === job.id ? { ...j, activityLog: addLog(j.activityLog, `Bill from ${b.supplier} approved`) } : j));
                                      } catch (err) { console.error('Failed to approve bill:', err); }
                                    }}>
                                    <Icon name="check" size={11} />
                                  </button>
                                )}
                                <button className="btn btn-ghost btn-xs" onClick={() => setEditingBill(b)}><Icon name="edit" size={11} /></button>
                                <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => delBill(b.id)}><Icon name="trash" size={11} /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div></div>
              }
            </div>
          )}

          {/* ── Schedule ── */}
          {tab === "schedule" && (
            <div>
              {jobSchedule.length === 0
                ? <div className="empty-state"><div className="empty-state-icon">📅</div><div className="empty-state-text">No schedule entries</div></div>
                : jobSchedule.map(s => {
                  const schClient = clients.find(c => c.id === job.clientId);
                  const schSite = schClient?.sites?.find(st => st.id === job.siteId);
                  return (
                    <div key={s.id} style={{ display: "flex", gap: 14, alignItems: "flex-start", borderBottom: "1px solid #f5f5f5", paddingBottom: 14, marginBottom: 14 }}>
                      <div style={{ background: "#111", color: "#fff", borderRadius: 6, padding: "8px 12px", textAlign: "center", minWidth: 68, flexShrink: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>{new Date(s.date+"T12:00:00").toLocaleString("en", { month: "short" })}</div>
                        <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{new Date(s.date+"T12:00:00").getDate()}</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{s.date} · {new Date(s.date+"T12:00:00").toLocaleDateString("en-AU",{weekday:"long"})}</div>
                        {schSite && <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>📍 {schSite.name}</div>}
                        {schSite?.contactName && <div style={{ fontSize: 12, color: "#888" }}>👤 {schSite.contactName} {schSite.contactPhone && `· ${schSite.contactPhone}`}</div>}
                        {s.notes && <div style={{ fontSize: 12, color: "#999", fontStyle: "italic", marginTop: 4 }}>{s.notes}</div>}
                        {(s.assignedTo||[]).length > 0 && <div style={{ marginTop: 8 }}><AvatarGroup names={s.assignedTo} max={4} /></div>}
                      </div>
                    </div>
                  );
                })
              }
            </div>
          )}

          {/* ── Activity ── */}
          {tab === "activity" && (
            <div>
              <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 13, color: "#888" }}>{(job.activityLog||[]).length} event{(job.activityLog||[]).length !== 1 ? "s" : ""} recorded</div>
              </div>
              <ActivityLog entries={job.activityLog || []} />
            </div>
          )}

        </div>
      </div>
    </div>

    {/* ── Inline Quote Edit Modal ─────────────────────────────────────────── */}
    {editingQuote && (
      <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={e => e.target === e.currentTarget && setEditingQuote(null)}>
        <div className="modal modal-lg" style={{ maxWidth: 720 }}>
          <div className="modal-header">
            <span className="modal-title">Edit Quote – {editingQuote.number}</span>
            <CloseBtn onClick={() => setEditingQuote(null)} />
          </div>
          <div className="modal-body">
            <div className="grid-2" style={{ marginBottom: 16 }}>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-control" value={editingQuote.status}
                  onChange={e => setEditingQuote(q => ({ ...q, status: e.target.value }))}>
                  {["draft","sent","accepted","declined"].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">GST %</label>
                <input type="number" className="form-control" value={editingQuote.tax}
                  onChange={e => setEditingQuote(q => ({ ...q, tax: parseFloat(e.target.value)||0 }))} min="0" max="100" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Line Items</label>
              <LineItemsEditor items={editingQuote.lineItems}
                onChange={items => setEditingQuote(q => ({ ...q, lineItems: items }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Notes / Terms</label>
              <textarea className="form-control" value={editingQuote.notes||""}
                onChange={e => setEditingQuote(q => ({ ...q, notes: e.target.value }))}
                placeholder="Payment terms, inclusions/exclusions, validity period…" />
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setEditingQuote(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={() => saveQuote(editingQuote)}>
              <Icon name="check" size={13} />Save Quote
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Inline Invoice Edit Modal ───────────────────────────────────────── */}
    {editingInvoice && (
      <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={e => e.target === e.currentTarget && setEditingInvoice(null)}>
        <div className="modal modal-lg" style={{ maxWidth: 720 }}>
          <div className="modal-header">
            <span className="modal-title">Edit Invoice – {editingInvoice.number}</span>
            <CloseBtn onClick={() => setEditingInvoice(null)} />
          </div>
          <div className="modal-body">
            <div className="grid-3" style={{ marginBottom: 16 }}>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-control" value={editingInvoice.status}
                  onChange={e => setEditingInvoice(i => ({ ...i, status: e.target.value }))}>
                  {["draft","sent","paid","overdue","void"].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Due Date</label>
                <input type="date" className="form-control" value={editingInvoice.dueDate||""}
                  onChange={e => setEditingInvoice(i => ({ ...i, dueDate: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">GST %</label>
                <input type="number" className="form-control" value={editingInvoice.tax}
                  onChange={e => setEditingInvoice(i => ({ ...i, tax: parseFloat(e.target.value)||0 }))} min="0" max="100" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Line Items</label>
              <LineItemsEditor items={editingInvoice.lineItems}
                onChange={items => setEditingInvoice(i => ({ ...i, lineItems: items }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea className="form-control" value={editingInvoice.notes||""}
                onChange={e => setEditingInvoice(i => ({ ...i, notes: e.target.value }))}
                placeholder="Payment instructions, bank details, thank you note…" />
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setEditingInvoice(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={() => saveInvoice(editingInvoice)}>
              <Icon name="check" size={13} />Save Invoice
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Inline Bill Capture / Edit Modal ───────────────────────────────── */}
    {editingBill !== null && (
      <BillModal
        bill={editingBill?.id ? editingBill : null}
        jobs={jobs || []}
        onSave={saveBillFromJob}
        onClose={() => setEditingBill(null)}
        defaultJobId={job.id}
      />
    )}
    </>
  );
};

// ── Jobs ──────────────────────────────────────────────────────────────────────
const Jobs = ({ jobs, setJobs, clients, quotes, setQuotes, invoices, setInvoices, timeEntries, setTimeEntries, bills, setBills, schedule, setSchedule, staff }) => {
  const [view, setView] = useState("list");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [editJob, setEditJob] = useState(null);
  const [detailJob, setDetailJob] = useState(null);
  const [form, setForm] = useState({ title: "", clientId: "", status: "draft", priority: "medium", description: "", startDate: "", dueDate: "", assignedTo: [], tags: "" });

  const filtered = jobs.filter(j => {
    const q = search.toLowerCase();
    const client = clients.find(c => c.id === j.clientId);
    return (filterStatus === "all" || j.status === filterStatus) &&
      (j.title.toLowerCase().includes(q) || client?.name.toLowerCase().includes(q));
  });

  const openNew = () => { setEditJob(null); setForm({ title: "", clientId: clients[0]?.id || "", siteId: null, status: "draft", priority: "medium", description: "", startDate: "", dueDate: "", assignedTo: [], tags: "" }); setShowModal(true); };
  const openEdit = (j) => { setEditJob(j); setForm({ ...j, siteId: j.siteId || null, tags: j.tags.join(", ") }); setShowModal(true); };
  const openDetail = (j) => setDetailJob(j);
  const save = async () => {
    const data = { ...form, clientId: form.clientId, tags: form.tags.split(",").map(t => t.trim()).filter(Boolean) };
    try {
      if (editJob) {
        const changes = [];
        if (editJob.title !== data.title) changes.push(`Title changed to "${data.title}"`);
        if (editJob.status !== data.status) changes.push(`Status → ${data.status.replace("_"," ")}`);
        if (editJob.priority !== data.priority) changes.push(`Priority → ${data.priority}`);
        if (String(editJob.clientId) !== String(data.clientId)) changes.push(`Client changed`);
        if ((editJob.siteId||null) !== (data.siteId||null)) changes.push(`Site changed`);
        const msg = changes.length ? changes.join(" · ") : "Job updated";
        const saved = await updateJob(editJob.id, data);
        setJobs(js => js.map(j => j.id === editJob.id ? { ...saved, activityLog: addLog(j.activityLog, msg) } : j));
      } else {
        const saved = await createJob(data);
        setJobs(js => [...js, { ...saved, activityLog: [mkLog("Job created")] }]);
      }
    } catch (err) {
      console.error('Failed to save job:', err);
    }
    setShowModal(false);
  };
  const del = async (id) => {
    try {
      await deleteJob(id);
      setJobs(js => js.filter(j => j.id !== id));
      if (detailJob?.id === id) setDetailJob(null);
    } catch (err) {
      console.error('Failed to delete job:', err);
    }
  };

  const STATUSES = ["all","draft","scheduled","quoted","in_progress","completed","cancelled"];
  const kanbanCols = ["draft","scheduled","quoted","in_progress","completed"];

  // Relationship counts per job
  const jobStats = (jobId) => ({
    quotes: quotes.filter(q => q.jobId === jobId).length,
    invoices: invoices.filter(i => i.jobId === jobId).length,
    hours: timeEntries.filter(t => t.jobId === jobId).reduce((s,t) => s + t.hours, 0),
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div className="search-bar" style={{ flex: 1 }}>
          <Icon name="search" size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search jobs, clients..." />
        </div>
        <select className="form-control" style={{ width: "auto" }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          {STATUSES.map(s => <option key={s} value={s}>{s === "all" ? "All Statuses" : s.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
        </select>
        <div style={{ display: "flex", gap: 4, background: "#f0f0f0", borderRadius: 6, padding: 3 }}>
          <button className={`btn btn-xs ${view === "list" ? "btn-primary" : "btn-ghost"}`} onClick={() => setView("list")}><Icon name="list_view" size={12} /></button>
          <button className={`btn btn-xs ${view === "kanban" ? "btn-primary" : "btn-ghost"}`} onClick={() => setView("kanban")}><Icon name="kanban" size={12} /></button>
        </div>
        <button className="btn btn-primary" onClick={openNew}><Icon name="plus" size={14} />New Job</button>
      </div>

      {view === "list" ? (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Job</th><th>Client</th><th>Status</th><th>Priority</th><th>Due Date</th><th>Assigned</th><th>Links</th><th></th></tr></thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={8}><div className="empty-state"><div className="empty-state-icon">🔧</div><div className="empty-state-text">No jobs found</div></div></td></tr>}
                {filtered.map(job => {
                  const client = clients.find(c => c.id === job.clientId);
                  const stats = jobStats(job.id);
                  return (
                    <tr key={job.id} style={{ cursor: "pointer" }} onClick={() => openDetail(job)}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{job.title}</div>
                        <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{job.description?.slice(0, 55)}{job.description?.length > 55 ? "…" : ""}</div>
                      </td>
                      <td>
                        <div style={{ fontSize: 13 }}>{client?.name}</div>
                        {(() => { const s = client?.sites?.find(x => x.id === job.siteId); return s ? <div style={{ fontSize: 11, color: "#aaa" }}>📍 {s.name}</div> : null; })()}
                      </td>
                      <td><StatusBadge status={job.status} /></td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span className={`priority-dot priority-${job.priority}`} />
                          <span style={{ fontSize: 12, textTransform: "capitalize" }}>{job.priority}</span>
                        </div>
                      </td>
                      <td><span style={{ fontSize: 12, color: job.dueDate ? "#111" : "#ccc" }}>{job.dueDate || "—"}</span></td>
                      <td onClick={e => e.stopPropagation()}><AvatarGroup names={job.assignedTo} max={3} /></td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: 6 }}>
                          {stats.quotes > 0 && <span className="chip"><Icon name="quotes" size={10} />{stats.quotes}</span>}
                          {stats.invoices > 0 && <span className="chip"><Icon name="invoices" size={10} />{stats.invoices}</span>}
                          {stats.hours > 0 && <span className="chip"><Icon name="time" size={10} />{stats.hours}h</span>}
                        </div>
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button className="btn btn-ghost btn-xs" onClick={() => openEdit(job)}><Icon name="edit" size={12} /></button>
                          <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(job.id)}><Icon name="trash" size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="kanban">
          {kanbanCols.map(col => {
            const colJobs = filtered.filter(j => j.status === col);
            const labels = { draft: "Draft", scheduled: "Scheduled", quoted: "Quoted", in_progress: "In Progress", completed: "Completed" };
            return (
              <div key={col} className="kanban-col">
                <div className="kanban-col-header">
                  <span>{labels[col]}</span>
                  <span style={{ background: "#e0e0e0", borderRadius: 10, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>{colJobs.length}</span>
                </div>
                {colJobs.map(job => {
                  const client = clients.find(c => c.id === job.clientId);
                  const stats = jobStats(job.id);
                  return (
                    <div key={job.id} className="kanban-card" onClick={() => openDetail(job)}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span className={`priority-dot priority-${job.priority}`} />
                        <span style={{ fontWeight: 700, fontSize: 12, flex: 1 }}>{job.title}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#999", marginBottom: 6 }}>{client?.name}</div>
                      {job.dueDate && <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>Due: {job.dueDate}</div>}
                      <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
                        {stats.quotes > 0 && <span className="chip" style={{ fontSize: 10 }}><Icon name="quotes" size={9} />{stats.quotes} quote{stats.quotes>1?"s":""}</span>}
                        {stats.invoices > 0 && <span className="chip" style={{ fontSize: 10 }}><Icon name="invoices" size={9} />{stats.invoices} inv</span>}
                        {stats.hours > 0 && <span className="chip" style={{ fontSize: 10 }}><Icon name="time" size={9} />{stats.hours}h</span>}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>{job.tags.slice(0,2).map((t, i) => <span key={i} className="tag" style={{ fontSize: 10, padding: "1px 6px" }}>{t}</span>)}</div>
                        <AvatarGroup names={job.assignedTo} max={2} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Job detail drawer */}
      {detailJob && (
        <JobDetail
          job={jobs.find(j => j.id === detailJob.id) || detailJob}
          clients={clients}
          quotes={quotes} setQuotes={setQuotes}
          invoices={invoices} setInvoices={setInvoices}
          timeEntries={timeEntries} setTimeEntries={setTimeEntries}
          bills={bills} setBills={setBills}
          schedule={schedule} setSchedule={setSchedule}
          jobs={jobs} setJobs={setJobs}
          staff={staff}
          onClose={() => setDetailJob(null)}
          onEdit={() => { openEdit(jobs.find(j => j.id === detailJob.id) || detailJob); setDetailJob(null); }}
        />
      )}

      {/* Edit / New modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{editJob ? "Edit Job" : "New Job"}</span>
              <CloseBtn onClick={() => setShowModal(false)} />
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Job Title *</label>
                <input className="form-control" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Office Fitout – Level 3" />
              </div>
              <div className="grid-3">
                <div className="form-group">
                  <label className="form-label">Client *</label>
                  <select className="form-control" value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value, siteId: "" }))}>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Site</label>
                  <select className="form-control" value={form.siteId || ""} onChange={e => setForm(f => ({ ...f, siteId: e.target.value || null }))}>
                    <option value="">— No specific site —</option>
                    {(clients.find(c => String(c.id) === String(form.clientId))?.sites || []).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-control" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    {["draft","scheduled","quoted","in_progress","completed","cancelled"].map(s => <option key={s} value={s}>{s.replace("_"," ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Priority</label>
                  <select className="form-control" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                    {["high","medium","low"].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Tags (comma separated)</label>
                  <input className="form-control" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="fitout, commercial, urgent" />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Start Date</label>
                  <input type="date" className="form-control" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Due Date</label>
                  <input type="date" className="form-control" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Assigned Team Members</label>
                <div className="multi-select">
                  {(staff && staff.length > 0 ? staff.map(s => s.name) : TEAM).map(t => (
                    <span key={t} className={`multi-option ${form.assignedTo.includes(t) ? "selected" : ""}`}
                      onClick={() => setForm(f => ({ ...f, assignedTo: f.assignedTo.includes(t) ? f.assignedTo.filter(x => x !== t) : [...f.assignedTo, t] }))}>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-control" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Job details, scope of work..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={!form.title}><Icon name="check" size={13} />{editJob ? "Save Changes" : "Create Job"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Clients ───────────────────────────────────────────────────────────────────
const Clients = ({ clients, setClients, jobs }) => {
  const [showModal, setShowModal] = useState(false);
  const [editClient, setEditClient] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "", sites: [] });
  const [search, setSearch] = useState("");
  const [expandedSites, setExpandedSites] = useState({});
  // Site sub-modal
  const [showSiteModal, setShowSiteModal] = useState(false);
  const [editSite, setEditSite] = useState(null);
  const [siteClientId, setSiteClientId] = useState(null);
  const [siteForm, setSiteForm] = useState({ name: "", address: "", contactName: "", contactPhone: "" });

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email || "").toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => {
    setEditClient(null);
    setForm({ name: "", email: "", phone: "", address: "", sites: [] });
    setShowModal(true);
  };
  const openEdit = (c) => {
    setEditClient(c);
    setForm({ ...c, sites: c.sites || [] });
    setShowModal(true);
  };
  const save = async () => {
    try {
      if (editClient) {
        await updateCustomer(editClient.id, form);
        setClients(cs => cs.map(c => c.id === editClient.id ? { ...c, ...form } : c));
      } else {
        const saved = await createCustomer(form);
        setClients(cs => [...cs, { ...saved, sites: [] }]);
      }
    } catch (err) {
      console.error('Failed to save client:', err);
    }
    setShowModal(false);
  };
  const del = async (id) => {
    try {
      await deleteCustomer(id);
      setClients(cs => cs.filter(c => c.id !== id));
    } catch (err) {
      console.error('Failed to delete client:', err);
    }
  };

  const toggleSites = (id) => setExpandedSites(s => ({ ...s, [id]: !s[id] }));

  // Site modal helpers
  const openNewSite = (clientId) => {
    setSiteClientId(clientId);
    setEditSite(null);
    setSiteForm({ name: "", address: "", contactName: "", contactPhone: "" });
    setShowSiteModal(true);
  };
  const openEditSite = (clientId, site) => {
    setSiteClientId(clientId);
    setEditSite(site);
    setSiteForm({ ...site });
    setShowSiteModal(true);
  };
  const saveSite = async () => {
    try {
      if (editSite) {
        const saved = await updateSite(editSite.id, siteForm);
        setClients(cs => cs.map(c => {
          if (c.id !== siteClientId) return c;
          return { ...c, sites: (c.sites || []).map(s => s.id === editSite.id ? saved : s) };
        }));
      } else {
        const saved = await createSite(siteClientId, siteForm);
        setClients(cs => cs.map(c => {
          if (c.id !== siteClientId) return c;
          return { ...c, sites: [...(c.sites || []), saved] };
        }));
      }
    } catch (err) {
      console.error('Failed to save site:', err);
    }
    setShowSiteModal(false);
  };
  const delSite = async (clientId, siteId) => {
    try {
      await deleteSite(siteId);
      setClients(cs => cs.map(c => c.id === clientId ? { ...c, sites: (c.sites||[]).filter(s => s.id !== siteId) } : c));
    } catch (err) {
      console.error('Failed to delete site:', err);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <div className="search-bar" style={{ flex: 1 }}>
          <Icon name="search" size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients..." />
        </div>
        <button className="btn btn-primary" onClick={openNew}><Icon name="plus" size={14} />New Client</button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {filtered.map(client => {
          const clientJobs = jobs.filter(j => j.clientId === client.id);
          const active = clientJobs.filter(j => j.status === "in_progress").length;
          const sites = client.sites || [];
          const sitesOpen = expandedSites[client.id];
          return (
            <div key={client.id} className="card">
              {/* Client header */}
              <div style={{ padding: "18px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flex: 1, minWidth: 0 }}>
                  <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#111", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
                    {client.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{client.name}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
                      {client.email  && <span style={{ fontSize: 12, color: "#666" }}>📧 {client.email}</span>}
                      {client.phone  && <span style={{ fontSize: 12, color: "#666" }}>📞 {client.phone}</span>}
                      {client.address && <span style={{ fontSize: 12, color: "#666" }}>📍 {client.address}</span>}
                    </div>
                    <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                      <span className="chip">{clientJobs.length} jobs</span>
                      {active > 0 && <span className="chip" style={{ background: "#111", color: "#fff" }}>{active} active</span>}
                      <span className="chip">🏢 {sites.length} site{sites.length !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0, marginLeft: 12 }}>
                  <button className="btn btn-ghost btn-xs" onClick={() => openEdit(client)}><Icon name="edit" size={12} /></button>
                  <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(client.id)}><Icon name="trash" size={12} /></button>
                </div>
              </div>

              {/* Sites accordion toggle */}
              <div
                style={{ borderTop: "1px solid #f0f0f0", padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", background: sitesOpen ? "#fafafa" : "transparent" }}
                onClick={() => toggleSites(client.id)}
              >
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888" }}>
                  Sites &amp; Contacts ({sites.length})
                </span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button className="btn btn-ghost btn-xs" style={{ fontSize: 11, padding: "3px 8px" }}
                    onClick={e => { e.stopPropagation(); openNewSite(client.id); }}>
                    <Icon name="plus" size={10} /> Add Site
                  </button>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                    style={{ transform: sitesOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s", color: "#aaa" }}>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </div>
              </div>

              {/* Sites list */}
              {sitesOpen && (
                <div style={{ borderTop: "1px solid #f5f5f5" }}>
                  {sites.length === 0 ? (
                    <div style={{ padding: "16px 20px", fontSize: 13, color: "#bbb", textAlign: "center" }}>
                      No sites added yet. Click "+ Add Site" to add one.
                    </div>
                  ) : (
                    sites.map((site, si) => (
                      <div key={site.id} style={{ padding: "14px 20px", borderBottom: si < sites.length - 1 ? "1px solid #f5f5f5" : "none", display: "flex", gap: 14, alignItems: "flex-start" }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 16 }}>🏢</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>{site.name}</div>
                          {site.address && <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>📍 {site.address}</div>}
                          {(site.contactName || site.contactPhone) && (
                            <div style={{ display: "flex", gap: "4px 14px", flexWrap: "wrap", marginTop: 4 }}>
                              {site.contactName  && <span style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>👤 {site.contactName}</span>}
                              {site.contactPhone && <span style={{ fontSize: 12, color: "#555" }}>📞 {site.contactPhone}</span>}
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                          <button className="btn btn-ghost btn-xs" onClick={() => openEditSite(client.id, site)}><Icon name="edit" size={11} /></button>
                          <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => delSite(client.id, site.id)}><Icon name="trash" size={11} /></button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Recent jobs */}
              {clientJobs.length > 0 && (
                <div style={{ borderTop: "1px solid #f0f0f0", padding: "12px 20px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#999", marginBottom: 8 }}>Recent Jobs</div>
                  {clientJobs.slice(0, 2).map(j => (
                    <div key={j.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{j.title}</span>
                      <StatusBadge status={j.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Client edit/new modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{editClient ? "Edit Client" : "New Client"}</span>
              <CloseBtn onClick={() => setShowModal(false)} />
            </div>
            <div className="modal-body">
              <div className="form-group"><label className="form-label">Company / Client Name *</label><input className="form-control" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div className="grid-2">
                <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-control" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Phone</label><input className="form-control" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
              </div>
              <div className="form-group"><label className="form-label">Address</label><input className="form-control" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={!form.name}><Icon name="check" size={13} />{editClient ? "Save Changes" : "Add Client"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Site add/edit modal */}
      {showSiteModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowSiteModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <span className="modal-title">{editSite ? "Edit Site" : "Add Site"}</span>
              <CloseBtn onClick={() => setShowSiteModal(false)} />
            </div>
            <div className="modal-body">
              <div className="form-group"><label className="form-label">Site Name *</label><input className="form-control" value={siteForm.name} onChange={e => setSiteForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Head Office, Warehouse, Site A" /></div>
              <div className="form-group"><label className="form-label">Address</label><input className="form-control" value={siteForm.address} onChange={e => setSiteForm(f => ({ ...f, address: e.target.value }))} placeholder="Physical address" /></div>
              <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16, marginTop: 4, marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 12 }}>Site Contact</div>
                <div className="grid-2">
                  <div className="form-group"><label className="form-label">Contact Name</label><input className="form-control" value={siteForm.contactName} onChange={e => setSiteForm(f => ({ ...f, contactName: e.target.value }))} placeholder="Full name" /></div>
                  <div className="form-group"><label className="form-label">Contact Phone</label><input className="form-control" value={siteForm.contactPhone} onChange={e => setSiteForm(f => ({ ...f, contactPhone: e.target.value }))} placeholder="04xx xxx xxx" /></div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowSiteModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveSite} disabled={!siteForm.name}><Icon name="check" size={13} />{editSite ? "Save Changes" : "Add Site"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Schedule ──────────────────────────────────────────────────────────────────
const Schedule = ({ schedule, setSchedule, jobs, clients, staff }) => {
  const [showModal, setShowModal] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [form, setForm] = useState({ jobId: "", date: new Date().toISOString().slice(0,10), assignedTo: [], notes: "" });
  const [filterDate, setFilterDate] = useState("");

  const today = new Date().toISOString().slice(0, 10);
  const sorted = [...schedule].sort((a, b) => a.date > b.date ? 1 : -1);
  const displayed = filterDate ? sorted.filter(e => e.date === filterDate) : sorted;

  const openNew = () => {
    setEditEntry(null);
    setForm({ jobId: jobs[0]?.id || "", date: today, assignedTo: [], notes: "" });
    setShowModal(true);
  };
  const openEdit = (s) => {
    setEditEntry(s);
    setForm({ jobId: s.jobId, date: s.date, assignedTo: s.assignedTo || [], notes: s.notes || "" });
    setShowModal(true);
  };
  const save = async () => {
    const data = { ...form, jobId: form.jobId };
    try {
      if (editEntry) {
        const saved = await updateScheduleEntry(editEntry.id, data);
        setSchedule(s => s.map(e => e.id === editEntry.id ? saved : e));
      } else {
        const saved = await createScheduleEntry(data);
        setSchedule(s => [...s, saved]);
      }
    } catch (err) { console.error('Failed to save schedule entry:', err); }
    setShowModal(false);
  };
  const del = async (id) => {
    try {
      await deleteScheduleEntry(id);
      setSchedule(s => s.filter(e => e.id !== id));
    } catch (err) { console.error('Failed to delete schedule entry:', err); }
  };

  const grouped = displayed.reduce((acc, e) => { (acc[e.date] = acc[e.date] || []).push(e); return acc; }, {});

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em" }}>Filter Date</label>
          <input type="date" className="form-control" style={{ width: "auto" }} value={filterDate} onChange={e => setFilterDate(e.target.value)} />
          {filterDate && <button className="btn btn-ghost btn-sm" onClick={() => setFilterDate("")} style={{ fontSize: 12 }}>Clear</button>}
        </div>
        <button className="btn btn-primary" onClick={openNew}><Icon name="plus" size={14} />Schedule Job</button>
      </div>

      {Object.keys(grouped).length === 0 && (
        <div className="empty-state"><div className="empty-state-icon">📅</div><div className="empty-state-text">No schedule entries{filterDate ? " for this date" : ""}</div></div>
      )}

      {Object.entries(grouped).map(([date, entries]) => {
        const d = new Date(date + "T12:00:00");
        const isToday = date === today;
        const isPast = date < today;
        return (
          <div key={date} style={{ marginBottom: 28 }}>
            {/* Day header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <div style={{ background: isToday ? "#111" : isPast ? "#e0e0e0" : "#f0f0f0", color: isToday ? "#fff" : "#555", borderRadius: 8, padding: "6px 14px", textAlign: "center", flexShrink: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {d.toLocaleString("en", { month: "short" })}
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{d.getDate()}</div>
                <div style={{ fontSize: 10, color: isToday ? "#aaa" : "#888" }}>
                  {d.toLocaleString("en", { weekday: "short" })}
                </div>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {isToday ? "Today · " : ""}
                  {d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </div>
                <div style={{ fontSize: 12, color: "#aaa" }}>{entries.length} job{entries.length !== 1 ? "s" : ""} scheduled</div>
              </div>
            </div>

            {/* Job cards for this day */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 4 }}>
              {entries.map(entry => {
                const job = jobs.find(j => j.id === entry.jobId);
                const client = clients.find(c => c.id === job?.clientId);
                const site = client?.sites?.find(s => s.id === job?.siteId);
                return (
                  <div key={entry.id} className="card" style={{ padding: "14px 18px", borderLeft: `4px solid ${isPast ? "#ddd" : "#111"}` }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, fontSize: 14 }}>{job?.title || "Unknown Job"}</span>
                          {job && <StatusBadge status={job.status} />}
                        </div>
                        <div style={{ fontSize: 12, color: "#777", marginBottom: entry.notes ? 6 : 0 }}>
                          {client?.name}
                          {site && <span style={{ color: "#aaa" }}> · {site.name}</span>}
                        </div>
                        {site?.contactName && (
                          <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>
                            👤 {site.contactName}
                            {site.contactPhone && <span style={{ marginLeft: 10 }}>📞 {site.contactPhone}</span>}
                          </div>
                        )}
                        {entry.notes && (
                          <div style={{ fontSize: 12, color: "#999", fontStyle: "italic", marginTop: 4, padding: "6px 10px", background: "#fafafa", borderRadius: 6 }}>
                            {entry.notes}
                          </div>
                        )}
                        {(entry.assignedTo || []).length > 0 && (
                          <div style={{ marginTop: 8 }}><AvatarGroup names={entry.assignedTo} max={5} /></div>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                        <button className="btn btn-ghost btn-xs" onClick={() => openEdit(entry)}><Icon name="edit" size={12} /></button>
                        <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(entry.id)}><Icon name="trash" size={12} /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{editEntry ? "Edit Schedule Entry" : "Schedule a Job"}</span>
              <CloseBtn onClick={() => setShowModal(false)} />
            </div>
            <div className="modal-body">
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Job *</label>
                  <select className="form-control" value={form.jobId} onChange={e => setForm(f => ({ ...f, jobId: e.target.value }))}>
                    {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Date *</label>
                  <input type="date" className="form-control" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Assigned To</label>
                <div className="multi-select">
                  {(staff && staff.length > 0 ? staff.map(s => s.name) : TEAM).map(t => (
                    <span key={t} className={`multi-option ${form.assignedTo.includes(t) ? "selected" : ""}`}
                      onClick={() => setForm(f => ({ ...f, assignedTo: f.assignedTo.includes(t) ? f.assignedTo.filter(x => x !== t) : [...f.assignedTo, t] }))}>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea className="form-control" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Access instructions, special requirements..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={!form.jobId || !form.date}><Icon name="check" size={13} />{editEntry ? "Save Changes" : "Add to Schedule"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Quotes ────────────────────────────────────────────────────────────────────
const Quotes = ({ quotes, setQuotes, jobs, clients, invoices }) => {
  const [showModal, setShowModal] = useState(false);
  const [editQuote, setEditQuote] = useState(null);
  const [form, setForm] = useState({ jobId: "", status: "draft", lineItems: [{ desc: "", qty: 1, unit: "hrs", rate: 0 }], tax: 10, notes: "" });

  const openNew = () => { setEditQuote(null); setForm({ jobId: jobs[0]?.id || "", status: "draft", lineItems: [{ desc: "", qty: 1, unit: "hrs", rate: 0 }], tax: 10, notes: "" }); setShowModal(true); };
  const openEdit = (q) => { setEditQuote(q); setForm(q); setShowModal(true); };
  const save = async () => {
    const data = { ...form, jobId: form.jobId };
    try {
      if (editQuote) {
        const saved = await updateQuote(editQuote.id, data);
        setQuotes(qs => qs.map(q => q.id === saved.id ? saved : q));
      } else {
        const saved = await createQuote(data);
        setQuotes(qs => [...qs, saved]);
      }
    } catch (err) { console.error('Failed to save quote:', err); }
    setShowModal(false);
  };
  const del = async (id) => {
    try {
      await deleteQuote(id);
      setQuotes(qs => qs.filter(q => q.id !== id));
    } catch (err) { console.error('Failed to delete quote:', err); }
  };
  const duplicate = async (q) => {
    try {
      const saved = await createQuote({ ...q, status: "draft" });
      setQuotes(qs => [...qs, saved]);
    } catch (err) { console.error('Failed to duplicate quote:', err); }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
        <button className="btn btn-primary" onClick={openNew}><Icon name="plus" size={14} />New Quote</button>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Number</th><th>Job</th><th>Client</th><th>Status</th><th>Subtotal</th><th>GST</th><th>Total</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {quotes.length === 0 && <tr><td colSpan={9}><div className="empty-state"><div className="empty-state-icon">📋</div><div className="empty-state-text">No quotes yet</div></div></td></tr>}
              {quotes.map(q => {
                const job = jobs.find(j => j.id === q.jobId);
                const client = clients.find(c => c.id === job?.clientId);
                const sub = q.lineItems.reduce((s, l) => s + l.qty * l.rate, 0);
                const linkedInv = invoices.filter(i => i.fromQuoteId === q.id);
                return (
                  <tr key={q.id}>
                    <td><span style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 13 }}>{q.number}</span></td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{job?.title}</div>
                      {linkedInv.length > 0 && <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>→ {linkedInv.map(i=>i.number).join(", ")}</div>}
                    </td>
                    <td style={{ fontSize: 13, color: "#666" }}>{client?.name}</td>
                    <td><StatusBadge status={q.status} /></td>
                    <td>{fmt(sub)}</td>
                    <td>{fmt(sub * q.tax / 100)}</td>
                    <td style={{ fontWeight: 700 }}>{fmt(sub * (1 + q.tax / 100))}</td>
                    <td style={{ fontSize: 12, color: "#999" }}>{q.createdAt}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="btn btn-ghost btn-xs" onClick={() => openEdit(q)}><Icon name="edit" size={12} /></button>
                        <button className="btn btn-ghost btn-xs" onClick={() => duplicate(q)} title="Duplicate"><Icon name="copy" size={12} /></button>
                        <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(q.id)}><Icon name="trash" size={12} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <span className="modal-title">{editQuote ? `Edit ${editQuote.number}` : "New Quote"}</span>
              <CloseBtn onClick={() => setShowModal(false)} />
            </div>
            <div className="modal-body">
              <div className="grid-2" style={{ marginBottom: 16 }}>
                <div className="form-group">
                  <label className="form-label">Job</label>
                  <select className="form-control" value={form.jobId} onChange={e => setForm(f => ({ ...f, jobId: e.target.value }))}>
                    {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-control" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    {["draft","sent","accepted","declined"].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Line Items</label>
                <LineItemsEditor items={form.lineItems} onChange={items => setForm(f => ({ ...f, lineItems: items }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Notes / Terms</label>
                <textarea className="form-control" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Payment terms, inclusions/exclusions, validity period..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}><Icon name="check" size={13} />{editQuote ? "Save Changes" : "Create Quote"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Time Tracking ─────────────────────────────────────────────────────────────

// Hour presets matching the reference timesheet app
const TIME_PRESETS = [
  { label:"30m", mins:30 }, { label:"1h", mins:60 }, { label:"1.5h", mins:90 },
  { label:"2h", mins:120 }, { label:"2.5h", mins:150 }, { label:"3h", mins:180 },
  { label:"3.5h", mins:210 }, { label:"4h", mins:240 }, { label:"4.5h", mins:270 },
  { label:"5h", mins:300 }, { label:"5.5h", mins:330 }, { label:"6h", mins:360 },
  { label:"6.5h", mins:390 }, { label:"7h", mins:420 }, { label:"8h", mins:480 },
];

// Colour thresholds per day
const DAY_THR = { orange: 4, green: 6 };

function calcHoursFromTimes(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60;
  return Math.round(diff / 60 * 10) / 10;
}

function addMinsToTime(timeStr, mins) {
  const [h, m] = (timeStr || "09:00").split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2,"0")}:${String(total % 60).padStart(2,"0")}`;
}

function dayColour(hours) {
  if (hours === 0) return "#ccc";
  if (hours >= DAY_THR.green) return "#27ae60";
  if (hours >= DAY_THR.orange) return "#e67e22";
  return "#e74c3c";
}

// ── Log Time Modal ────────────────────────────────────────────────────────────
const LogTimeModal = ({ jobs, onSave, onClose, editEntry = null, staff }) => {
  const staffNames = (staff && staff.length > 0) ? staff.map(s => s.name) : TEAM;
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState(() => {
    if (editEntry) return {
      jobId: String(editEntry.jobId),
      worker: editEntry.worker,
      date: editEntry.date,
      startTime: editEntry.startTime || "09:00",
      endTime: editEntry.endTime || addMinsToTime("09:00", editEntry.hours * 60),
      description: editEntry.description,
      billable: editEntry.billable,
    };
    return { jobId: String(jobs[0]?.id || ""), worker: staffNames[0] || "", date: today, startTime: "", endTime: "", description: "", billable: true };
  });
  const [activePreset, setActivePreset] = useState(null);
  const [endTouched, setEndTouched] = useState(!!editEntry);

  const hours = calcHoursFromTimes(form.startTime, form.endTime);

  const onStartChange = (val) => {
    setForm(f => {
      const next = { ...f, startTime: val };
      if (!endTouched && val) next.endTime = addMinsToTime(val, 60);
      return next;
    });
    setActivePreset(null);
  };

  const applyPreset = (mins, label) => {
    const start = form.startTime || "09:00";
    setForm(f => ({ ...f, startTime: start, endTime: addMinsToTime(start, mins) }));
    setActivePreset(label);
    setEndTouched(true);
  };

  const save = () => {
    if (!form.startTime || !form.endTime) return;
    if (hours <= 0) return;
    if (!form.jobId) return;
    onSave({
      ...form,
      jobId: form.jobId,
      hours,
    });
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">{editEntry ? "Edit Time Entry" : "Log Time"}</span>
          <CloseBtn onClick={onClose} />
        </div>
        <div className="modal-body">
          {/* Job + Worker */}
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Job</label>
              <select className="form-control" value={form.jobId} onChange={e => setForm(f => ({ ...f, jobId: e.target.value }))}>
                {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Worker</label>
              <select className="form-control" value={form.worker} onChange={e => setForm(f => ({ ...f, worker: e.target.value }))}>
                {staffNames.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Date */}
          <div className="form-group">
            <label className="form-label">Date</label>
            <input type="date" className="form-control" value={form.date} max={today} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>

          {/* Start / End */}
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Start Time</label>
              <input type="time" className="form-control" value={form.startTime}
                onChange={e => onStartChange(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">End Time</label>
              <input type="time" className="form-control" value={form.endTime}
                onChange={e => { setEndTouched(true); setForm(f => ({ ...f, endTime: e.target.value })); setActivePreset(null); }} />
            </div>
          </div>

          {/* Hours display */}
          <div style={{ textAlign: "center", padding: "12px 16px", background: "#f8f8f8", borderRadius: 8, marginBottom: 16 }}>
            <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.04em", color: hours > 0 ? "#111" : "#ccc", lineHeight: 1 }}>
              {hours > 0 ? `${hours.toFixed(1)}h` : "0.0h"}
            </div>
            <div style={{ fontSize: 11, color: "#999", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4 }}>hours logged</div>
          </div>

          {/* Quick-select presets */}
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 8 }}>Quick Select</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginBottom: 16 }}>
            {TIME_PRESETS.map(p => (
              <button key={p.label}
                onClick={() => applyPreset(p.mins, p.label)}
                style={{
                  padding: "7px 4px", borderRadius: 20, fontSize: 12, fontWeight: 600, textAlign: "center",
                  border: activePreset === p.label ? "2px solid #111" : "2px solid #e0e0e0",
                  background: activePreset === p.label ? "#111" : "#f5f5f5",
                  color: activePreset === p.label ? "#fff" : "#555",
                  cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s",
                }}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Description */}
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-control" value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="What was done on this job?" />
          </div>

          {/* Billable */}
          <label className="checkbox-label">
            <input type="checkbox" checked={form.billable} onChange={e => setForm(f => ({ ...f, billable: e.target.checked }))} />
            <span>Billable to client</span>
          </label>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={hours <= 0 || !form.jobId}>
            <Icon name="check" size={13} />{editEntry ? "Save Changes" : "Log Time"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Mini calendar ─────────────────────────────────────────────────────────────
const TimeCalendar = ({ timeEntries, selectedWorker, onDayClick, calMonth, setCalMonth }) => {
  const now = new Date();
  const viewDate = new Date(now.getFullYear(), now.getMonth() + calMonth, 1);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0
  const today = new Date().toISOString().slice(0, 10);
  const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthLabel = viewDate.toLocaleDateString("en-AU", { month: "long", year: "numeric" });

  // Build day→hours map
  const dayHrs = {};
  timeEntries
    .filter(t => !selectedWorker || t.worker === selectedWorker)
    .filter(t => t.date.startsWith(monthStr))
    .forEach(t => { dayHrs[t.date] = (dayHrs[t.date] || 0) + t.hours; });

  const DOW = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(<div key={`e${i}`} />);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${monthStr}-${String(d).padStart(2,"0")}`;
    const hrs = dayHrs[iso] || 0;
    const isFuture = iso > today;
    const isToday = iso === today;
    const clr = dayColour(hrs);
    cells.push(
      <div key={iso}
        onClick={() => hrs > 0 && onDayClick(iso)}
        style={{
          background: "#fff", borderRadius: 8, padding: "6px 4px", minHeight: 48, textAlign: "center",
          boxShadow: isToday ? "0 0 0 2px #111" : "0 1px 4px rgba(0,0,0,0.06)",
          opacity: isFuture ? 0.4 : 1,
          cursor: hrs > 0 ? "pointer" : "default",
          transition: "box-shadow 0.15s",
        }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#999", marginBottom: 3 }}>{d}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: hrs > 0 ? clr : "#ddd", lineHeight: 1 }}>
          {hrs > 0 ? `${hrs.toFixed(1)}h` : "·"}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setCalMonth(m => m - 1)} style={{ padding: "4px 10px", fontSize: 18 }}>‹</button>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{monthLabel}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setCalMonth(m => m + 1)} style={{ padding: "4px 10px", fontSize: 18 }}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, marginBottom: 6 }}>
        {DOW.map(d => <div key={d} style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 0" }}>{d}</div>)}
        {cells}
      </div>
    </div>
  );
};

// ── Week strip ────────────────────────────────────────────────────────────────
const WeekStrip = ({ timeEntries, selectedWorker, weekOffset, setWeekOffset, selectedDay, setSelectedDay }) => {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const dow = now.getDay() === 0 ? 6 : now.getDay() - 1; // Mon=0
  const monday = new Date(now);
  monday.setDate(now.getDate() - dow + weekOffset * 7);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  const weekLabel = `${days[0].toLocaleDateString("en-AU", { day:"numeric", month:"short" })} – ${days[6].toLocaleDateString("en-AU", { day:"numeric", month:"short" })}`;

  return (
    <div style={{ background: "#fff", borderBottom: "1px solid #e8e8e8", padding: "12px 16px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(w => w - 1)} style={{ fontSize: 20, padding: "2px 10px" }}>‹</button>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#555" }}>{weekLabel}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(w => w + 1)} style={{ fontSize: 20, padding: "2px 10px" }}>›</button>
      </div>
      <div style={{ display: "flex", gap: 3, overflowX: "auto", paddingBottom: 1 }}>
        {days.map(d => {
          const iso = d.toISOString().slice(0, 10);
          const hrs = timeEntries
            .filter(t => t.date === iso && (!selectedWorker || t.worker === selectedWorker))
            .reduce((s, t) => s + t.hours, 0);
          const isToday = iso === today;
          const isPast = iso <= today;
          const isActive = iso === selectedDay;
          const clr = isPast && hrs === 0 ? "#e74c3c" : dayColour(hrs);
          const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
          return (
            <div key={iso}
              onClick={() => setSelectedDay(iso)}
              style={{
                flex: 1, minWidth: 40, textAlign: "center", padding: "8px 2px 10px",
                borderRadius: "8px 8px 0 0", cursor: "pointer",
                background: isActive ? "#f5f5f5" : "transparent",
                borderBottom: isActive ? "3px solid #111" : "3px solid transparent",
                transition: "all 0.15s",
              }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: isActive ? "#111" : "#aaa", marginBottom: 3 }}>
                {DAYS[d.getDay()]}
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: isToday ? "#111" : "#444", marginBottom: 2 }}>{d.getDate()}</div>
              <div style={{ fontSize: 10, fontWeight: 700, height: 14, color: hrs > 0 || isPast ? clr : "transparent" }}>
                {hrs > 0 ? `${hrs.toFixed(1)}h` : isPast ? "" : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Main TimeTracking component ───────────────────────────────────────────────
const TimeTracking = ({ timeEntries, setTimeEntries, jobs, setJobs, clients, staff }) => {
  const today = new Date().toISOString().slice(0, 10);
  const [tsTab, setTsTab] = useState("week");           // "week" | "team" | "calendar"
  const [selectedWorker, setSelectedWorker] = useState("all");
  const [selectedDay, setSelectedDay] = useState(today);
  const [weekOffset, setWeekOffset] = useState(0);
  const [calMonth, setCalMonth] = useState(0);
  const [showLogModal, setShowLogModal] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [calDrillDay, setCalDrillDay] = useState(null);

  // Stats — filtered to selected worker
  const workerEntries = selectedWorker === "all" ? timeEntries : timeEntries.filter(t => t.worker === selectedWorker);
  const now = new Date();
  const todayHrs   = workerEntries.filter(t => t.date === today).reduce((s,t) => s+t.hours, 0);
  const dow = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const monISO = (() => { const d = new Date(now); d.setDate(now.getDate() - dow); return d.toISOString().slice(0,10); })();
  const weekHrs  = workerEntries.filter(t => t.date >= monISO).reduce((s,t) => s+t.hours, 0);
  const monthHrs = workerEntries.filter(t => t.date.startsWith(today.slice(0,7))).reduce((s,t) => s+t.hours, 0);

  // Day entries for week view
  const dayEntries = timeEntries
    .filter(t => t.date === selectedDay && (selectedWorker === "all" || t.worker === selectedWorker))
    .sort((a,b) => (a.startTime||"").localeCompare(b.startTime||""));

  const saveEntry = async (data) => {
    try {
      const staffMember = staff ? staff.find(s => s.name === data.worker) : null;
      const staffId = staffMember?.id;
      if (editEntry) {
        const saved = await updateTimeEntry(editEntry.id, data, staffId);
        setTimeEntries(ts => ts.map(t => t.id === editEntry.id ? saved : t));
        setJobs && setJobs(js => js.map(j => j.id === data.jobId ? { ...j, activityLog: addLog(j.activityLog, `${data.worker} updated time entry (${data.hours}h)`) } : j));
      } else {
        const saved = await createTimeEntry(data, staffId);
        setTimeEntries(ts => [...ts, saved]);
        setJobs && setJobs(js => js.map(j => j.id === data.jobId ? { ...j, activityLog: addLog(j.activityLog, `${data.worker} logged ${data.hours}h`) } : j));
      }
    } catch (err) { console.error('Failed to save time entry:', err); }
    setShowLogModal(false);
    setEditEntry(null);
  };

  const del = async (id) => {
    try {
      await deleteTimeEntry(id);
      setTimeEntries(ts => ts.filter(t => t.id !== id));
    } catch (err) { console.error('Failed to delete time entry:', err); }
  };
  const openEdit = (entry) => { setEditEntry(entry); setShowLogModal(true); };
  const openNew = () => { setEditEntry(null); setShowLogModal(true); };

  // Team summary — derive worker list from staff prop (or fall back to unique names in entries)
  const staffNames = (staff && staff.length > 0) ? staff.map(s => s.name) : [...new Set(timeEntries.map(t => t.worker).filter(Boolean))];
  const byWorker = staffNames.map(w => {
    const wEntries = timeEntries.filter(t => t.worker === w);
    return {
      name: w,
      total: wEntries.reduce((s,t) => s+t.hours, 0),
      today: wEntries.filter(t => t.date === today).reduce((s,t) => s+t.hours, 0),
      week: wEntries.filter(t => t.date >= monISO).reduce((s,t) => s+t.hours, 0),
      billable: wEntries.filter(t => t.billable).reduce((s,t) => s+t.hours, 0),
      count: wEntries.length,
    };
  }).filter(w => w.total > 0).sort((a,b) => b.total - a.total);

  const statClr = (h, o, g) => h >= g ? "#27ae60" : h >= o ? "#e67e22" : h > 0 ? "#e74c3c" : "#aaa";

  return (
    <div>
      {/* Top toolbar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {/* Stat pills */}
        <div style={{ display: "flex", gap: 8, flex: 1, flexWrap: "wrap" }}>
          {[
            { label: "Today", val: todayHrs, o: DAY_THR.orange, g: DAY_THR.green },
            { label: "This Week", val: weekHrs, o: DAY_THR.orange * 5, g: DAY_THR.green * 5 },
            { label: "This Month", val: monthHrs, o: DAY_THR.orange * 20, g: DAY_THR.green * 20 },
          ].map(s => (
            <div key={s.label} className="stat-card" style={{ flex: 1, padding: "12px 16px", minWidth: 80 }}>
              <div className="stat-label">{s.label}</div>
              <div className="stat-value" style={{ fontSize: 20, color: statClr(s.val, s.o, s.g) }}>{s.val.toFixed(1)}h</div>
            </div>
          ))}
        </div>
        <select className="form-control" style={{ width: "auto" }} value={selectedWorker} onChange={e => setSelectedWorker(e.target.value)}>
          <option value="all">All Team</option>
          {staffNames.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button className="btn btn-primary" onClick={openNew}><Icon name="plus" size={14} />Log Time</button>
      </div>

      {/* Sub-tabs */}
      <div className="tabs" style={{ marginBottom: 0 }}>
        {[["week","Week View"],["team","Team"],["calendar","Calendar"]].map(([id,label]) => (
          <div key={id} className={`tab ${tsTab === id ? "active" : ""}`} onClick={() => setTsTab(id)}>{label}</div>
        ))}
      </div>

      {/* ── Week View ── */}
      {tsTab === "week" && (
        <div style={{ background: "#fafafa", borderRadius: "0 0 10px 10px", border: "1px solid #e8e8e8", borderTop: "none", marginBottom: 20 }}>
          <WeekStrip timeEntries={timeEntries} selectedWorker={selectedWorker === "all" ? null : selectedWorker}
            weekOffset={weekOffset} setWeekOffset={setWeekOffset}
            selectedDay={selectedDay} setSelectedDay={setSelectedDay} />

          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
              {new Date(selectedDay + "T12:00:00").toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}
              {" · "}
              <span style={{ color: dayColour(dayEntries.reduce((s,t) => s+t.hours, 0)) }}>
                {dayEntries.reduce((s,t) => s+t.hours, 0).toFixed(1)}h
              </span>
            </div>

            {dayEntries.length === 0 ? (
              <div className="empty-state" style={{ padding: "28px 0" }}>
                <div className="empty-state-icon">⏱</div>
                <div className="empty-state-text">No entries for this day</div>
                <div className="empty-state-sub">Click "Log Time" to add one</div>
              </div>
            ) : (
              dayEntries.map(entry => {
                const job = jobs.find(j => j.id === entry.jobId);
                const clr = dayColour(entry.hours);
                return (
                  <div key={entry.id} style={{
                    background: "#fff", borderRadius: 10, padding: 14, marginBottom: 10,
                    border: "1px solid #e8e8e8", borderLeft: `4px solid ${clr}`,
                    display: "flex", gap: 14, alignItems: "flex-start",
                  }}>
                    <div style={{ minWidth: 56, textAlign: "center" }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: clr, lineHeight: 1 }}>{entry.hours.toFixed(1)}h</div>
                      {entry.startTime && <div style={{ fontSize: 11, color: "#aaa", marginTop: 3 }}>{entry.startTime}–{entry.endTime}</div>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                        <div className="avatar" style={{ width: 22, height: 22, fontSize: 9, margin: 0, flexShrink: 0 }}>
                          {entry.worker.split(" ").map(w=>w[0]).join("")}
                        </div>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{entry.worker}</span>
                        <span className="badge" style={{ background: entry.billable ? "#111" : "#f0f0f0", color: entry.billable ? "#fff" : "#999", fontSize: 10 }}>
                          {entry.billable ? "Billable" : "Non-bill"}
                        </span>
                      </div>
                      {job && <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 3 }}>{job.title}</div>}
                      {entry.description && <div style={{ fontSize: 12, color: "#888", lineHeight: 1.5 }}>{entry.description}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => openEdit(entry)}><Icon name="edit" size={12} /></button>
                      <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(entry.id)}><Icon name="trash" size={12} /></button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── Team View ── */}
      {tsTab === "team" && (
        <div style={{ marginTop: 16 }}>
          {byWorker.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon">👥</div><div className="empty-state-text">No time logged yet</div></div>
          ) : (
            byWorker.map(w => (
              <div key={w.name} style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: 16, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div className="avatar" style={{ width: 36, height: 36, fontSize: 13, margin: 0 }}>{w.name.split(" ").map(p=>p[0]).join("")}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{w.name}</div>
                      <div style={{ fontSize: 11, color: "#aaa" }}>{w.count} entries</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: dayColour(w.total / 20) }}>{w.total.toFixed(1)}h</div>
                    <div style={{ fontSize: 11, color: "#aaa" }}>all time</div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                  {[
                    { label: "Today", val: w.today, clr: dayColour(w.today) },
                    { label: "This Week", val: w.week, clr: dayColour(w.week / 5) },
                    { label: "Billable", val: w.billable, clr: "#27ae60" },
                    { label: "Non-Bill", val: w.total - w.billable, clr: "#e67e22" },
                  ].map(s => (
                    <div key={s.label} style={{ background: "#f8f8f8", borderRadius: 7, padding: "8px 10px", textAlign: "center" }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: s.clr }}>{s.val.toFixed(1)}h</div>
                      <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12 }}>
                  <div className="progress-bar" style={{ height: 6 }}>
                    <div className="progress-fill" style={{ width: `${(w.billable / (w.total || 1)) * 100}%`, background: "#27ae60" }} />
                  </div>
                  <div style={{ fontSize: 10, color: "#aaa", marginTop: 4 }}>
                    {w.total > 0 ? Math.round((w.billable/w.total)*100) : 0}% billable
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Calendar View ── */}
      {tsTab === "calendar" && (
        <div style={{ marginTop: 16 }}>
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <TimeCalendar
              timeEntries={timeEntries}
              selectedWorker={selectedWorker === "all" ? null : selectedWorker}
              calMonth={calMonth} setCalMonth={setCalMonth}
              onDayClick={(iso) => setCalDrillDay(calDrillDay === iso ? null : iso)}
            />
            {/* Colour legend */}
            <div style={{ display: "flex", gap: 14, marginTop: 10, justifyContent: "center" }}>
              {[["#e74c3c",`< ${DAY_THR.orange}h`],["#e67e22",`${DAY_THR.orange}–${DAY_THR.green}h`],["#27ae60",`≥ ${DAY_THR.green}h`]].map(([c,l]) => (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#888" }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: c, display: "inline-block" }} />
                  {l}
                </div>
              ))}
            </div>
          </div>

          {/* Day drill-down */}
          {calDrillDay && (() => {
            const dayE = timeEntries
              .filter(t => t.date === calDrillDay && (selectedWorker === "all" || t.worker === selectedWorker))
              .sort((a,b) => (a.startTime||"").localeCompare(b.startTime||""));
            const dayTotal = dayE.reduce((s,t)=>s+t.hours, 0);
            const d = new Date(calDrillDay + "T12:00:00");
            return (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {d.toLocaleDateString("en-AU", { weekday:"long", day:"numeric", month:"long" })}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: dayColour(dayTotal) }}>{dayTotal.toFixed(1)}h</span>
                    <button className="btn btn-ghost btn-xs" onClick={() => setCalDrillDay(null)}>✕</button>
                  </div>
                </div>
                {dayE.length === 0 ? (
                  <div style={{ fontSize: 13, color: "#aaa", textAlign: "center", padding: 20 }}>No entries</div>
                ) : dayE.map(entry => {
                  const job = jobs.find(j => j.id === entry.jobId);
                  return (
                    <div key={entry.id} style={{ background: "#fff", border: "1px solid #e8e8e8", borderLeft: `4px solid ${dayColour(entry.hours)}`, borderRadius: 10, padding: "12px 14px", marginBottom: 8, display: "flex", gap: 12, alignItems: "center" }}>
                      <div style={{ fontWeight: 800, fontSize: 18, color: dayColour(entry.hours), minWidth: 44 }}>{entry.hours.toFixed(1)}h</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{entry.worker}</div>
                        {job && <div style={{ fontSize: 12, color: "#888" }}>{job.title}</div>}
                        {entry.description && <div style={{ fontSize: 11, color: "#aaa" }}>{entry.description}</div>}
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="btn btn-ghost btn-xs" onClick={() => openEdit(entry)}><Icon name="edit" size={12} /></button>
                        <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(entry.id)}><Icon name="trash" size={12} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* Log / Edit modal */}
      {showLogModal && (
        <LogTimeModal
          jobs={jobs}
          editEntry={editEntry}
          onSave={saveEntry}
          onClose={() => { setShowLogModal(false); setEditEntry(null); }}
          staff={staff}
        />
      )}
    </div>
  );
};

// ── Bills ─────────────────────────────────────────────────────────────────────
// Bills module: two-stage pipeline  Inbox → Linked → Approved → Posted
// "Inbox"  = receipt captured, no job assigned yet
// "Linked" = bill matched to a job, pending approval
// "Approved" = manager has signed off, ready to post as job cost
// "Posted" = converted to an approved cost entry on the job

const BILL_STATUSES = ["inbox", "linked", "approved", "posted"];
const BILL_STATUS_LABELS = { inbox: "Inbox", linked: "Linked", approved: "Approved", posted: "Posted to Job" };
const BILL_STATUS_COLORS = {
  inbox:    { bg: "#f5f5f5", text: "#777" },
  linked:   { bg: "#e8f0fe", text: "#2c5fa8" },
  approved: { bg: "#e6f4ea", text: "#1e7e34" },
  posted:   { bg: "#111",    text: "#fff" },
};
const BILL_CATEGORIES = ["Materials", "Subcontractor", "Plant & Equipment", "Labour", "Other"];

const BillStatusBadge = ({ status }) => {
  const c = BILL_STATUS_COLORS[status] || { bg: "#f0f0f0", text: "#666" };
  return (
    <span className="badge" style={{ background: c.bg, color: c.text }}>
      {BILL_STATUS_LABELS[status] || status}
    </span>
  );
};

// ── Capture / Edit Bill Modal ──────────────────────────────────────────────────
const BillModal = ({ bill, jobs, onSave, onClose, defaultJobId }) => {
  const blank = {
    supplier: "", invoiceNo: "", date: new Date().toISOString().slice(0,10),
    amount: "", hasGst: true, markup: 0,
    jobId: defaultJobId || null, category: "Materials", description: "", notes: "", status: "inbox",
    capturedAt: new Date().toISOString().slice(0,10),
  };
  const [form, setForm] = useState(bill ? { ...bill } : blank);

  const exGst = form.hasGst ? (parseFloat(form.amount) || 0) / 1.1 : (parseFloat(form.amount) || 0);
  const gst   = form.hasGst ? (parseFloat(form.amount) || 0) - exGst : 0;
  const withMarkup = exGst * (1 + (parseFloat(form.markup) || 0) / 100);

  const handleSave = () => {
    const amt = parseFloat(form.amount) || 0;
    const exG = form.hasGst ? amt / 1.1 : amt;
    onSave({
      ...form,
      ...(bill?.id ? { id: bill.id } : {}),
      amount: amt,
      amountExGst: parseFloat(exG.toFixed(2)),
      gstAmount: parseFloat((amt - exG).toFixed(2)),
      jobId: form.jobId || null,
      markup: parseFloat(form.markup) || 0,
      capturedAt: bill?.capturedAt || new Date().toISOString().slice(0,10),
      status: form.jobId && form.status === "inbox" ? "linked" : form.status,
    });
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg" style={{ maxWidth: 700 }}>
        <div className="modal-header">
          <span className="modal-title">{bill ? `Edit Bill – ${bill.invoiceNo || bill.supplier}` : "Capture Receipt / Bill"}</span>
          <CloseBtn onClick={onClose} />
        </div>
        <div className="modal-body">

          {/* Supplier & Reference */}
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#aaa", marginBottom: 10 }}>Supplier Details</div>
          <div className="grid-2" style={{ marginBottom: 0 }}>
            <div className="form-group">
              <label className="form-label">Supplier Name *</label>
              <input className="form-control" value={form.supplier} onChange={e => setForm(f=>({...f, supplier: e.target.value}))} placeholder="e.g. Bunnings, ElecPro…" />
            </div>
            <div className="form-group">
              <label className="form-label">Invoice / Receipt #</label>
              <input className="form-control" value={form.invoiceNo} onChange={e => setForm(f=>({...f, invoiceNo: e.target.value}))} placeholder="e.g. INV-1234" />
            </div>
          </div>
          <div className="grid-2" style={{ marginBottom: 0 }}>
            <div className="form-group">
              <label className="form-label">Bill Date</label>
              <input type="date" className="form-control" value={form.date} onChange={e => setForm(f=>({...f, date: e.target.value}))} />
            </div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <select className="form-control" value={form.category} onChange={e => setForm(f=>({...f, category: e.target.value}))}>
                {BILL_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <input className="form-control" value={form.description} onChange={e => setForm(f=>({...f, description: e.target.value}))} placeholder="What was purchased / what work was performed…" />
          </div>

          {/* Amount & GST */}
          <div style={{ borderTop: "1px solid #f0f0f0", marginTop: 4, paddingTop: 16, marginBottom: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#aaa", marginBottom: 10 }}>Amount & Tax</div>
            <div className="grid-2" style={{ marginBottom: 0 }}>
              <div className="form-group">
                <label className="form-label">Total Amount (as on receipt)</label>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#888", fontSize: 13 }}>$</span>
                  <input type="number" className="form-control" style={{ paddingLeft: 24 }} value={form.amount} onChange={e => setForm(f=>({...f, amount: e.target.value}))} placeholder="0.00" min="0" step="0.01" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">GST</label>
                <div style={{ display: "flex", alignItems: "center", gap: 16, height: 40 }}>
                  <label className="checkbox-label" style={{ fontWeight: 600, fontSize: 13 }}>
                    <input type="checkbox" checked={form.hasGst} onChange={e => setForm(f=>({...f, hasGst: e.target.checked}))} />
                    Includes GST (10%)
                  </label>
                </div>
              </div>
            </div>
            {/* GST breakdown */}
            {parseFloat(form.amount) > 0 && (
              <div style={{ background: "#f8f8f8", borderRadius: 8, padding: "12px 16px", display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 16, fontSize: 13 }}>
                <div><span style={{ color: "#999" }}>Ex-GST </span><strong>{fmt(exGst)}</strong></div>
                <div><span style={{ color: "#999" }}>GST </span><strong>{fmt(gst)}</strong></div>
                <div style={{ marginLeft: "auto" }}><span style={{ color: "#999" }}>Total (inc.) </span><strong>{fmt(parseFloat(form.amount)||0)}</strong></div>
              </div>
            )}
          </div>

          {/* Link to job & markup */}
          <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16, marginBottom: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#aaa", marginBottom: 10 }}>Job Allocation & Markup</div>
            <div className="grid-2" style={{ marginBottom: 0 }}>
              <div className="form-group">
                <label className="form-label">Link to Job</label>
                <select className="form-control" value={form.jobId || ""} onChange={e => setForm(f=>({...f, jobId: e.target.value || null}))}>
                  <option value="">— Unallocated (Inbox) —</option>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Markup % (on-charge to client)</label>
                <div style={{ position: "relative" }}>
                  <input type="number" className="form-control" style={{ paddingRight: 32 }} value={form.markup} onChange={e => setForm(f=>({...f, markup: e.target.value}))} placeholder="0" min="0" max="200" />
                  <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "#888", fontSize: 13 }}>%</span>
                </div>
                {parseFloat(form.markup) > 0 && parseFloat(form.amount) > 0 && (
                  <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                    On-charge: <strong style={{ color: "#111" }}>{fmt(withMarkup)}</strong> (ex-GST + {form.markup}%)
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Internal Notes</label>
              <textarea className="form-control" value={form.notes} onChange={e => setForm(f=>({...f, notes: e.target.value}))} placeholder="Any notes for approver, discrepancies, receipt condition…" style={{ minHeight: 60 }} />
            </div>
          </div>

        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!form.supplier || !form.amount}>
            <Icon name="check" size={13} />{bill ? "Save Changes" : "Capture Bill"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Post to Job Modal ─────────────────────────────────────────────────────────
const PostToJobModal = ({ bill, jobs, onPost, onClose }) => {
  const [jobId, setJobId]     = useState(bill.jobId ? String(bill.jobId) : "");
  const [category, setCategory] = useState(bill.category || "Materials");
  const [markup, setMarkup]   = useState(bill.markup || 0);

  const exGst = bill.hasGst ? bill.amount / 1.1 : bill.amount;
  const withMarkup = exGst * (1 + (parseFloat(markup) || 0) / 100);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <span className="modal-title">Post to Job as Cost</span>
          <CloseBtn onClick={onClose} />
        </div>
        <div className="modal-body">
          <div style={{ background: "#f8f8f8", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{bill.supplier}</div>
            <div style={{ fontSize: 12, color: "#888" }}>{bill.invoiceNo && `${bill.invoiceNo} · `}{bill.description}</div>
            <div style={{ fontSize: 15, fontWeight: 800, marginTop: 6 }}>{fmt(bill.amount)} <span style={{ fontSize: 11, fontWeight: 400, color: "#aaa" }}>inc. GST</span></div>
          </div>

          <div className="form-group">
            <label className="form-label">Post to Job *</label>
            <select className="form-control" value={jobId} onChange={e => setJobId(e.target.value)}>
              <option value="">— Select a job —</option>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Cost Category</label>
            <select className="form-control" value={category} onChange={e => setCategory(e.target.value)}>
              {BILL_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Markup %</label>
            <div style={{ position: "relative" }}>
              <input type="number" className="form-control" style={{ paddingRight: 32 }} value={markup}
                onChange={e => setMarkup(e.target.value)} min="0" max="200" placeholder="0" />
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "#888", fontSize: 13 }}>%</span>
            </div>
          </div>

          {/* Cost summary */}
          <div style={{ background: "#111", color: "#fff", borderRadius: 8, padding: "14px 16px", marginTop: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#666", marginBottom: 10 }}>Cost Summary</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#888" }}>Ex-GST cost</span><span>{fmt(exGst)}</span>
              </div>
              {parseFloat(markup) > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#888" }}>Markup ({markup}%)</span><span>+ {fmt(exGst * (parseFloat(markup)||0) / 100)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #2a2a2a", paddingTop: 6, marginTop: 2, fontWeight: 800, fontSize: 15 }}>
                <span>On-charge to client</span><span>{fmt(withMarkup)}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onPost(jobId, category, parseFloat(markup)||0)} disabled={!jobId}>
            <Icon name="check" size={13} />Post to Job
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main Bills Component ───────────────────────────────────────────────────────
const Bills = ({ bills, setBills, jobs, setJobs, clients }) => {
  const [tab, setTab] = useState("pipeline");
  const [showBillModal, setShowBillModal] = useState(false);
  const [editBill, setEditBill] = useState(null);
  const [postBill, setPostBill] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterJob, setFilterJob] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);

  // ── Stats
  const inbox    = bills.filter(b => b.status === "inbox");
  const linked   = bills.filter(b => b.status === "linked");
  const approved = bills.filter(b => b.status === "approved");
  const posted   = bills.filter(b => b.status === "posted");
  const totalAll = bills.reduce((s,b) => s + (b.amount||0), 0);
  const totalPending = [...inbox, ...linked, ...approved].reduce((s,b) => s + (b.amount||0), 0);
  const totalPosted  = posted.reduce((s,b) => s + (b.amount||0), 0);

  // ── Filtered list view
  const filtered = bills.filter(b => {
    const job = jobs.find(j => j.id === b.jobId);
    const matchSearch = !search ||
      b.supplier.toLowerCase().includes(search.toLowerCase()) ||
      (b.invoiceNo||"").toLowerCase().includes(search.toLowerCase()) ||
      (b.description||"").toLowerCase().includes(search.toLowerCase()) ||
      (job?.title||"").toLowerCase().includes(search.toLowerCase());
    const matchStatus   = filterStatus === "all"   || b.status === filterStatus;
    const matchCategory = filterCategory === "all" || b.category === filterCategory;
    const matchJob      = filterJob === "all"      || String(b.jobId) === filterJob;
    return matchSearch && matchStatus && matchCategory && matchJob;
  });

  // ── Actions
  const openNew  = () => { setEditBill(null); setShowBillModal(true); };
  const openEdit = (b) => { setEditBill(b); setShowBillModal(true); };

  const saveBill = async (data) => {
    try {
      if (editBill) {
        const saved = await updateBill(editBill.id, data);
        setBills(bs => bs.map(b => b.id === editBill.id ? saved : b));
      } else {
        const saved = await createBill(data);
        setBills(bs => [...bs, saved]);
        if (data.jobId) {
          setJobs(js => js.map(j => j.id === data.jobId ? { ...j, activityLog: addLog(j.activityLog, `Bill captured: ${data.supplier} ${fmt(data.amount)}`) } : j));
        }
      }
    } catch (err) { console.error('Failed to save bill:', err); }
    setShowBillModal(false);
  };

  const del = async (id) => {
    try {
      await deleteBill(id);
      setBills(bs => bs.filter(b => b.id !== id));
    } catch (err) { console.error('Failed to delete bill:', err); }
  };

  const setStatus = async (id, status) => {
    const bill = bills.find(b => b.id === id);
    if (!bill) return;
    try {
      const saved = await updateBill(id, { ...bill, status });
      setBills(bs => bs.map(b => b.id === saved.id ? saved : b));
    } catch (err) { console.error('Failed to update bill status:', err); }
  };

  const approveSelected = async () => {
    try {
      const toApprove = bills.filter(b => selectedIds.includes(b.id) && (b.status === "inbox" || b.status === "linked"));
      await Promise.all(toApprove.map(b => updateBill(b.id, { ...b, status: "approved" })));
      setBills(bs => bs.map(b => selectedIds.includes(b.id) && (b.status === "inbox" || b.status === "linked") ? { ...b, status: "approved" } : b));
      setSelectedIds([]);
    } catch (err) { console.error('Failed to approve bills:', err); }
  };

  const handlePost = async (billId, jobId, category, markup) => {
    const bill = bills.find(b => b.id === billId);
    if (!bill) return;
    const exGst = bill.hasGst ? bill.amount / 1.1 : bill.amount;
    const onCharge = exGst * (1 + markup / 100);
    try {
      const saved = await updateBill(billId, { ...bill, status: "posted", jobId, category, markup });
      setBills(bs => bs.map(b => b.id === billId ? saved : b));
      setJobs(js => js.map(j => j.id === jobId ? { ...j, activityLog: addLog(j.activityLog, `Bill posted: ${bill.supplier} ${fmt(onCharge)} (ex-GST + ${markup}% markup)`) } : j));
    } catch (err) { console.error('Failed to post bill:', err); }
    setPostBill(null);
  };

  const toggleSelect = (id) => setSelectedIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const toggleAll = () => setSelectedIds(s => s.length === filtered.length ? [] : filtered.map(b => b.id));

  return (
    <div>
      {/* ── Summary strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Inbox",    count: inbox.length,    total: inbox.reduce((s,b)=>s+b.amount,0),    color: "#888" },
          { label: "Linked",   count: linked.length,   total: linked.reduce((s,b)=>s+b.amount,0),   color: "#2c5fa8" },
          { label: "Approved", count: approved.length, total: approved.reduce((s,b)=>s+b.amount,0), color: "#1e7e34" },
          { label: "Posted",   count: posted.length,   total: posted.reduce((s,b)=>s+b.amount,0),   color: "#111" },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ padding: "14px 16px", borderTop: `3px solid ${s.color}`, cursor: "pointer" }}
            onClick={() => { setFilterStatus(s.label.toLowerCase()); setTab("list"); }}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize: 22, color: s.color }}>{s.count}</div>
            <div className="stat-sub">{fmt(s.total)}</div>
          </div>
        ))}
      </div>

      {/* ── Tabs + actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div className="tabs" style={{ marginBottom: 0 }}>
          <div className={`tab ${tab === "pipeline" ? "active" : ""}`} onClick={() => setTab("pipeline")}>Pipeline</div>
          <div className={`tab ${tab === "list" ? "active" : ""}`} onClick={() => setTab("list")}>All Bills</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {selectedIds.length > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={approveSelected}>
              <Icon name="check" size={12} />Approve {selectedIds.length} selected
            </button>
          )}
          <button className="btn btn-primary" onClick={openNew}><Icon name="plus" size={14} />Capture Bill</button>
        </div>
      </div>

      {/* ══ PIPELINE VIEW ══ */}
      {tab === "pipeline" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, alignItems: "start" }}>
          {BILL_STATUSES.map(status => {
            const stageBills = bills.filter(b => b.status === status);
            const sc = BILL_STATUS_COLORS[status];
            return (
              <div key={status} style={{ background: "#f7f7f7", borderRadius: 10, padding: 12, minHeight: 200 }}>
                {/* Column header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#666" }}>{BILL_STATUS_LABELS[status]}</div>
                    <div style={{ fontSize: 11, color: "#aaa", marginTop: 1 }}>{stageBills.length} bill{stageBills.length !== 1 ? "s" : ""} · {fmt(stageBills.reduce((s,b)=>s+b.amount,0))}</div>
                  </div>
                  <span className="badge" style={{ background: sc.bg, color: sc.text, fontSize: 10 }}>{stageBills.length}</span>
                </div>

                {/* Cards */}
                {stageBills.length === 0 && (
                  <div style={{ textAlign: "center", padding: "24px 0", color: "#ccc", fontSize: 12 }}>Empty</div>
                )}
                {stageBills.map(b => {
                  const job = jobs.find(j => j.id === b.jobId);
                  const exGst = b.hasGst ? b.amount / 1.1 : b.amount;
                  return (
                    <div key={b.id} style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 8, padding: "12px", marginBottom: 8, fontSize: 12 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                        <span style={{ flex: 1 }}>{b.supplier}</span>
                        <span style={{ fontWeight: 800, color: "#111", whiteSpace: "nowrap" }}>{fmt(b.amount)}</span>
                      </div>
                      {b.invoiceNo && <div style={{ color: "#aaa", fontFamily: "monospace", fontSize: 11, marginBottom: 3 }}>{b.invoiceNo}</div>}
                      {b.description && <div style={{ color: "#777", marginBottom: 6, fontSize: 11, lineHeight: 1.4 }}>{b.description.slice(0,60)}{b.description.length>60?"…":""}</div>}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span className="chip" style={{ fontSize: 10 }}>{b.category}</span>
                        {job ? <span style={{ fontSize: 11, color: "#888", flex: 1, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.title}</span>
                          : <span style={{ fontSize: 10, color: "#ccc", marginLeft: "auto" }}>Unlinked</span>}
                      </div>
                      {b.markup > 0 && <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>Markup {b.markup}% → {fmt(exGst*(1+b.markup/100))}</div>}
                      {b.notes && <div style={{ fontSize: 10, color: "#aaa", marginTop: 4, fontStyle: "italic", borderTop: "1px solid #f5f5f5", paddingTop: 4 }}>{b.notes}</div>}

                      {/* Stage actions */}
                      <div style={{ display: "flex", gap: 4, marginTop: 8, paddingTop: 8, borderTop: "1px solid #f5f5f5", flexWrap: "wrap" }}>
                        {status === "inbox" && (
                          <button className="btn btn-secondary btn-xs" onClick={() => setStatus(b.id, "linked")} disabled={!b.jobId} title={!b.jobId ? "Link to a job first" : "Mark as Linked"}>
                            Link →
                          </button>
                        )}
                        {status === "linked" && (
                          <button className="btn btn-secondary btn-xs" style={{ color: "#1e7e34", borderColor: "#c0e0c0" }} onClick={() => setStatus(b.id, "approved")}>
                            ✓ Approve
                          </button>
                        )}
                        {status === "approved" && (
                          <button className="btn btn-primary btn-xs" onClick={() => setPostBill(b)}>
                            Post to Job →
                          </button>
                        )}
                        {status === "posted" && (
                          <span style={{ fontSize: 10, color: "#aaa", fontStyle: "italic" }}>
                            ✓ Posted{b.postedAt ? ` ${b.postedAt}` : ""}
                          </span>
                        )}
                        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                          <button className="btn btn-ghost btn-xs" onClick={() => openEdit(b)}><Icon name="edit" size={10} /></button>
                          <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(b.id)}><Icon name="trash" size={10} /></button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* ══ LIST VIEW ══ */}
      {tab === "list" && (
        <div>
          {/* Filters */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <div className="search-bar" style={{ flex: 1, minWidth: 180 }}>
              <Icon name="search" size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search supplier, invoice, description…" />
            </div>
            <select className="form-control" style={{ width: "auto" }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="all">All Statuses</option>
              {BILL_STATUSES.map(s => <option key={s} value={s}>{BILL_STATUS_LABELS[s]}</option>)}
            </select>
            <select className="form-control" style={{ width: "auto" }} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
              <option value="all">All Categories</option>
              {BILL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="form-control" style={{ width: "auto" }} value={filterJob} onChange={e => setFilterJob(e.target.value)}>
              <option value="all">All Jobs</option>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
            </select>
          </div>

          {/* Totals bar */}
          {filtered.length > 0 && (
            <div style={{ display: "flex", gap: 20, marginBottom: 12, fontSize: 13, padding: "10px 16px", background: "#fafafa", borderRadius: 8, border: "1px solid #f0f0f0", flexWrap: "wrap" }}>
              <span style={{ color: "#888" }}>Showing <strong style={{ color: "#111" }}>{filtered.length}</strong> bills</span>
              <span style={{ color: "#888" }}>Total <strong style={{ color: "#111" }}>{fmt(filtered.reduce((s,b)=>s+b.amount,0))}</strong></span>
              <span style={{ color: "#888" }}>Ex-GST <strong style={{ color: "#111" }}>{fmt(filtered.reduce((s,b)=>s+(b.hasGst?b.amount/1.1:b.amount),0))}</strong></span>
              {selectedIds.length > 0 && <span style={{ marginLeft: "auto", color: "#2c5fa8", fontWeight: 600 }}>{selectedIds.length} selected · {fmt(bills.filter(b=>selectedIds.includes(b.id)).reduce((s,b)=>s+b.amount,0))}</span>}
            </div>
          )}

          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>
                      <input type="checkbox" checked={filtered.length > 0 && selectedIds.length === filtered.length} onChange={toggleAll} />
                    </th>
                    <th>Supplier</th><th>Invoice #</th><th>Job</th><th>Category</th>
                    <th>Date</th><th>Ex-GST</th><th>GST</th><th>Total</th><th>Markup</th><th>Status</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={12}><div className="empty-state"><div className="empty-state-icon">🧾</div><div className="empty-state-text">No bills match your filters</div></div></td></tr>
                  )}
                  {filtered.map(b => {
                    const job = jobs.find(j => j.id === b.jobId);
                    const exGst = b.hasGst ? b.amount / 1.1 : b.amount;
                    const gst = b.amount - exGst;
                    const onCharge = exGst * (1 + (b.markup||0) / 100);
                    return (
                      <tr key={b.id} style={{ background: selectedIds.includes(b.id) ? "#f5f8ff" : "transparent" }}>
                        <td onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={selectedIds.includes(b.id)} onChange={() => toggleSelect(b.id)} />
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{b.supplier}</div>
                          {b.notes && <div style={{ fontSize: 10, color: "#aaa", marginTop: 1, fontStyle: "italic" }}>{b.notes.slice(0,40)}{b.notes.length>40?"…":""}</div>}
                        </td>
                        <td><span style={{ fontFamily: "monospace", fontSize: 12, color: "#555" }}>{b.invoiceNo||"—"}</span></td>
                        <td>
                          {job ? <div style={{ fontSize: 12 }}>{job.title}</div> : <span style={{ color: "#ccc", fontSize: 12 }}>Unlinked</span>}
                        </td>
                        <td><span className="chip">{b.category}</span></td>
                        <td style={{ fontSize: 12, color: "#999" }}>{b.date}</td>
                        <td style={{ fontSize: 13 }}>{fmt(exGst)}</td>
                        <td style={{ fontSize: 12, color: "#999" }}>{b.hasGst ? fmt(gst) : <span style={{ color: "#ddd" }}>—</span>}</td>
                        <td style={{ fontWeight: 700 }}>{fmt(b.amount)}</td>
                        <td style={{ fontSize: 12 }}>
                          {b.markup > 0 ? <span style={{ color: "#555" }}>{b.markup}% → <strong>{fmt(onCharge)}</strong></span> : <span style={{ color: "#ddd" }}>—</span>}
                        </td>
                        <td><BillStatusBadge status={b.status} /></td>
                        <td>
                          <div style={{ display: "flex", gap: 4, flexWrap: "nowrap" }}>
                            {b.status === "inbox"    && <button className="btn btn-ghost btn-xs" title="Link" onClick={() => setStatus(b.id, "linked")} disabled={!b.jobId}><Icon name="arrow_right" size={11} /></button>}
                            {b.status === "linked"   && <button className="btn btn-ghost btn-xs" style={{ color: "#1e7e34" }} title="Approve" onClick={() => setStatus(b.id, "approved")}><Icon name="check" size={11} /></button>}
                            {b.status === "approved" && <button className="btn btn-primary btn-xs" title="Post to Job" onClick={() => setPostBill(b)}>Post →</button>}
                            <button className="btn btn-ghost btn-xs" onClick={() => openEdit(b)}><Icon name="edit" size={11} /></button>
                            <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(b.id)}><Icon name="trash" size={11} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Modals */}
      {showBillModal && (
        <BillModal bill={editBill} jobs={jobs} onSave={saveBill} onClose={() => setShowBillModal(false)} />
      )}
      {postBill && (
        <PostToJobModal
          bill={postBill}
          jobs={jobs}
          onPost={(jobId, category, markup) => handlePost(postBill.id, jobId, category, markup)}
          onClose={() => setPostBill(null)}
        />
      )}
    </div>
  );
};

// ── Invoices ──────────────────────────────────────────────────────────────────
const Invoices = ({ invoices, setInvoices, jobs, clients, quotes }) => {
  const [showModal, setShowModal] = useState(false);
  const [editInvoice, setEditInvoice] = useState(null);
  const [form, setForm] = useState({ jobId: "", status: "draft", lineItems: [{ desc: "", qty: 1, unit: "hrs", rate: 0 }], tax: 10, dueDate: "", notes: "" });

  const openNew = () => { setEditInvoice(null); setForm({ jobId: jobs[0]?.id || "", status: "draft", lineItems: [{ desc: "", qty: 1, unit: "hrs", rate: 0 }], tax: 10, dueDate: "", notes: "" }); setShowModal(true); };
  const openEdit = (inv) => { setEditInvoice(inv); setForm(inv); setShowModal(true); };
  const fromQuote = (q) => {
    setEditInvoice(null);
    setForm({ jobId: q.jobId, status: "draft", lineItems: [...q.lineItems], tax: q.tax, dueDate: "", notes: q.notes });
    setShowModal(true);
  };
  const save = async () => {
    const data = { ...form, jobId: form.jobId };
    try {
      if (editInvoice) {
        const saved = await updateInvoice(editInvoice.id, data);
        setInvoices(is => is.map(i => i.id === saved.id ? saved : i));
      } else {
        const saved = await createInvoice(data);
        setInvoices(is => [...is, saved]);
      }
    } catch (err) { console.error('Failed to save invoice:', err); }
    setShowModal(false);
  };
  const del = async (id) => {
    try {
      await deleteInvoice(id);
      setInvoices(is => is.filter(i => i.id !== id));
    } catch (err) { console.error('Failed to delete invoice:', err); }
  };
  const markPaid = async (id) => {
    const inv = invoices.find(i => i.id === id);
    try {
      const saved = await updateInvoice(id, { ...inv, status: "paid" });
      setInvoices(is => is.map(i => i.id === saved.id ? saved : i));
    } catch (err) { console.error('Failed to mark invoice paid:', err); }
  };

  const totalOwed = invoices.filter(i => i.status !== "paid" && i.status !== "void").reduce((s, inv) => s + calcQuoteTotal(inv), 0);
  const totalPaid = invoices.filter(i => i.status === "paid").reduce((s, inv) => s + calcQuoteTotal(inv), 0);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div className="stat-card dark" style={{ flex: 1, padding: "14px 18px" }}>
          <div className="stat-label">Outstanding</div>
          <div className="stat-value" style={{ fontSize: 20 }}>{fmt(totalOwed)}</div>
        </div>
        <div className="stat-card" style={{ flex: 1, padding: "14px 18px" }}>
          <div className="stat-label">Collected</div>
          <div className="stat-value" style={{ fontSize: 20 }}>{fmt(totalPaid)}</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {quotes.filter(q => q.status === "accepted").length > 0 && (
            <div style={{ position: "relative" }}>
              <select className="form-control" style={{ paddingRight: 32 }} onChange={e => { const q = quotes.find(q => String(q.id) === e.target.value); if (q) fromQuote(q); e.target.value = ""; }}>
                <option value="">Invoice from Quote…</option>
                {quotes.filter(q => q.status === "accepted").map(q => <option key={q.id} value={q.id}>{q.number}</option>)}
              </select>
            </div>
          )}
          <button className="btn btn-primary" onClick={openNew}><Icon name="plus" size={14} />New Invoice</button>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Number</th><th>Job</th><th>Client</th><th>Status</th><th>Subtotal</th><th>GST</th><th>Total</th><th>Due Date</th><th></th></tr></thead>
            <tbody>
              {invoices.length === 0 && <tr><td colSpan={9}><div className="empty-state"><div className="empty-state-icon">💳</div><div className="empty-state-text">No invoices yet</div></div></td></tr>}
              {invoices.map(inv => {
                const job = jobs.find(j => j.id === inv.jobId);
                const client = clients.find(c => c.id === job?.clientId);
                const sub = inv.lineItems.reduce((s, l) => s + l.qty * l.rate, 0);
                const fromQuote = inv.fromQuoteId ? quotes.find(q => q.id === inv.fromQuoteId) : null;
                return (
                  <tr key={inv.id}>
                    <td><span style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 13 }}>{inv.number}</span>{fromQuote && <div style={{ fontSize: 10, color: "#bbb", marginTop: 2 }}>from {fromQuote.number}</div>}</td>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{job?.title}</td>
                    <td style={{ fontSize: 13, color: "#666" }}>{client?.name}</td>
                    <td><StatusBadge status={inv.status} /></td>
                    <td>{fmt(sub)}</td>
                    <td>{fmt(sub * inv.tax / 100)}</td>
                    <td style={{ fontWeight: 700 }}>{fmt(sub * (1 + inv.tax / 100))}</td>
                    <td style={{ fontSize: 12, color: inv.dueDate ? "#111" : "#ccc" }}>{inv.dueDate || "—"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        {inv.status !== "paid" && inv.status !== "void" && <button className="btn btn-ghost btn-xs" style={{ color: "#2a7" }} onClick={() => markPaid(inv.id)} title="Mark Paid"><Icon name="check" size={12} /></button>}
                        <button className="btn btn-ghost btn-xs" onClick={() => openEdit(inv)}><Icon name="edit" size={12} /></button>
                        <button className="btn btn-ghost btn-xs" style={{ color: "#c00" }} onClick={() => del(inv.id)}><Icon name="trash" size={12} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <span className="modal-title">{editInvoice ? `Edit ${editInvoice.number}` : "New Invoice"}</span>
              <CloseBtn onClick={() => setShowModal(false)} />
            </div>
            <div className="modal-body">
              <div className="grid-3" style={{ marginBottom: 16 }}>
                <div className="form-group">
                  <label className="form-label">Job</label>
                  <select className="form-control" value={form.jobId} onChange={e => setForm(f => ({ ...f, jobId: e.target.value }))}>
                    {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-control" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    {["draft","sent","paid","overdue","void"].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Due Date</label><input type="date" className="form-control" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
              </div>
              <div className="form-group">
                <label className="form-label">Line Items</label>
                <LineItemsEditor items={form.lineItems} onChange={items => setForm(f => ({ ...f, lineItems: items }))} />
              </div>
              <div className="form-group"><label className="form-label">Notes</label><textarea className="form-control" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Payment instructions, bank details, thank you note..." /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}><Icon name="check" size={13} />{editInvoice ? "Save Changes" : "Create Invoice"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Global Activity Log Page ──────────────────────────────────────────────────
const ActivityPage = ({ jobs, clients, quotes, invoices, bills, timeEntries, schedule }) => {
  const [filterType, setFilterType] = useState("all");
  const [filterJob, setFilterJob] = useState("all");

  // Collect all activity events from all jobs
  const allEvents = [];
  jobs.forEach(j => {
    const client = clients.find(c => c.id === j.clientId);
    (j.activityLog || []).forEach(e => allEvents.push({ ...e, entityType: "job", entityLabel: j.title, entitySub: client?.name, jobId: j.id }));
  });

  // Sort newest first
  allEvents.sort((a, b) => b.ts > a.ts ? 1 : -1);

  const filtered = allEvents
    .filter(e => filterType === "all" || e.entityType === filterType)
    .filter(e => filterJob === "all" || String(e.jobId) === filterJob);

  const typeColors = { job: "#111", quote: "#555", invoice: "#333", bill: "#777", time: "#999" };

  return (
    <div>
      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6, flex: 1, flexWrap: "wrap" }}>
          {["all","job"].map(t => (
            <button key={t} className={`btn btn-sm ${filterType === t ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setFilterType(t)} style={{ textTransform: "capitalize" }}>
              {t === "all" ? "All Events" : `Jobs`}
            </button>
          ))}
        </div>
        <select className="form-control" style={{ width: "auto" }} value={filterJob} onChange={e => setFilterJob(e.target.value)}>
          <option value="all">All Jobs</option>
          {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
        </select>
      </div>

      {/* Summary stats */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: "Total Events", val: allEvents.length },
          { label: "Today", val: allEvents.filter(e => e.ts.startsWith(new Date().toLocaleDateString("en-AU",{day:"2-digit",month:"short",year:"numeric"}))).length },
          { label: "This Week", val: (() => { const d=new Date(); d.setDate(d.getDate()-7); const w=d.toISOString().slice(0,10); return allEvents.filter(e => e.ts >= w).length; })() },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ flex: 1, padding: "14px 18px" }}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize: 24 }}>{s.val}</div>
          </div>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">📋</div><div className="empty-state-text">No activity events found</div></div>
      ) : (
        <div className="card">
          <div style={{ padding: "0 4px" }}>
            <div className="timeline" style={{ padding: "16px 24px 16px 40px" }}>
              {filtered.map((e, i) => (
                <div key={i} className="timeline-item">
                  <div className="timeline-dot" style={{ background: typeColors[e.entityType] || "#111" }} />
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.4 }}>{e.action}</div>
                      <div style={{ fontSize: 12, color: "#888", marginTop: 3 }}>
                        <span style={{ fontWeight: 600, color: "#555" }}>{e.entityLabel}</span>
                        {e.entitySub && <span style={{ color: "#bbb" }}> · {e.entitySub}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 12, color: "#888", fontWeight: 600 }}>{e.user}</div>
                      <div style={{ fontSize: 11, color: "#bbb", marginTop: 1 }}>{e.ts}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ══════════════════════════════════════════════════════════════════════════════
// ── Hamburger Icon ────────────────────────────────────────────────────────────
const HamburgerIcon = ({ open }) => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    {open
      ? <><line x1="4" y1="4" x2="16" y2="16"/><line x1="16" y1="4" x2="4" y2="16"/></>
      : <><line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="15" x2="17" y2="15"/></>
    }
  </svg>
);

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [clients, setClients] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [timeEntries, setTimeEntries] = useState([]);
  const [bills, setBills] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(null);

  useEffect(() => {
    fetchAll()
      .then(data => {
        setClients(data.clients);
        setJobs(data.jobs);
        setQuotes(data.quotes);
        setInvoices(data.invoices);
        setTimeEntries(data.timeEntries);
        setBills(data.bills);
        setSchedule(data.schedule);
        setStaff(data.staff);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load data:', err);
        setDbError(err.message);
        setLoading(false);
      });
  }, []);

  const pendingBillsCount = bills.filter(b => b.status === "inbox" || b.status === "linked" || b.status === "approved").length;
  const unpaidInvCount = invoices.filter(i => i.status !== "paid" && i.status !== "void").length;
  const activeJobsCount = jobs.filter(j => j.status === "in_progress").length;

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: "dashboard" },
    { id: "jobs", label: "Jobs", icon: "jobs", badge: activeJobsCount || null },
    { id: "clients", label: "Clients", icon: "clients" },
    { id: "schedule", label: "Schedule", icon: "schedule" },
    { id: "quotes", label: "Quotes", icon: "quotes" },
    { id: "time", label: "Time", icon: "time" },
    { id: "bills", label: "Bills", icon: "bills", badge: pendingBillsCount || null },
    { id: "invoices", label: "Invoices", icon: "invoices", badge: unpaidInvCount || null },
    { id: "activity", label: "Activity", icon: "notification" },
  ];

  // Bottom nav shows first 4; rest in "More"
  const bottomNavItems = navItems.slice(0, 4);
  const moreNavItems = navItems.slice(4);
  const moreIsActive = moreNavItems.some(n => n.id === page);

  const pageTitles = { dashboard: "Dashboard", jobs: "Jobs", clients: "Clients", schedule: "Schedule", quotes: "Quotes", time: "Time Tracking", bills: "Bills & Costs", invoices: "Invoices", activity: "Activity Log" };

  const navigate = (id) => {
    setPage(id);
    setSidebarOpen(false);
    setMoreOpen(false);
  };

  const renderPage = () => {
    switch (page) {
      case "dashboard": return <Dashboard jobs={jobs} clients={clients} quotes={quotes} invoices={invoices} bills={bills} timeEntries={timeEntries} schedule={schedule} onNav={navigate} />;
      case "jobs": return <Jobs jobs={jobs} setJobs={setJobs} clients={clients} quotes={quotes} setQuotes={setQuotes} invoices={invoices} setInvoices={setInvoices} timeEntries={timeEntries} setTimeEntries={setTimeEntries} bills={bills} setBills={setBills} schedule={schedule} setSchedule={setSchedule} staff={staff} />;
      case "clients": return <Clients clients={clients} setClients={setClients} jobs={jobs} />;
      case "schedule": return <Schedule schedule={schedule} setSchedule={setSchedule} jobs={jobs} clients={clients} staff={staff} />;
      case "quotes": return <Quotes quotes={quotes} setQuotes={setQuotes} jobs={jobs} clients={clients} invoices={invoices} />;
      case "time": return <TimeTracking timeEntries={timeEntries} setTimeEntries={setTimeEntries} jobs={jobs} setJobs={setJobs} clients={clients} staff={staff} />;
      case "bills": return <Bills bills={bills} setBills={setBills} jobs={jobs} setJobs={setJobs} clients={clients} />;
      case "invoices": return <Invoices invoices={invoices} setInvoices={setInvoices} jobs={jobs} clients={clients} quotes={quotes} />;
      case "activity": return <ActivityPage jobs={jobs} clients={clients} quotes={quotes} invoices={invoices} bills={bills} timeEntries={timeEntries} schedule={schedule} />;
      default: return null;
    }
  };

  return (
    <div className="jm-root" onClick={() => moreOpen && setMoreOpen(false)}>
      {loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: 16 }}>
          <div style={{ width: 32, height: 32, border: "3px solid #e8e8e8", borderTopColor: "#111", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <div style={{ color: "#888", fontSize: 14 }}>Loading…</div>
        </div>
      )}
      {dbError && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: 16 }}>
          <div style={{ color: "#e74c3c", fontWeight: 700 }}>Failed to connect to database</div>
          <div style={{ color: "#888", fontSize: 13 }}>{dbError}</div>
        </div>
      )}
      {!loading && !dbError && (
      <>
      {/* Overlay for mobile sidebar */}
      <div className={`jm-sidebar-overlay ${sidebarOpen ? "open" : ""}`} onClick={() => setSidebarOpen(false)} />

      {/* Sidebar */}
      <nav className={`jm-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="jm-logo" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div className="jm-logo-mark">FieldOps</div>
            <div className="jm-logo-sub">Job Management</div>
          </div>
          {/* Close btn visible only on mobile */}
          <button
            onClick={() => setSidebarOpen(false)}
            style={{ display: "none", background: "transparent", border: "none", color: "#666", cursor: "pointer", padding: 4 }}
            className="jm-sidebar-close"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="3" x2="15" y2="15"/><line x1="15" y1="3" x2="3" y2="15"/>
            </svg>
          </button>
        </div>
        <div className="jm-nav">
          <div className="jm-nav-section">Main</div>
          {navItems.slice(0, 4).map(n => (
            <div key={n.id} className={`jm-nav-item ${page === n.id ? "active" : ""}`} onClick={() => navigate(n.id)}>
              <Icon name={n.icon} size={15} />{n.label}
              {n.badge ? <span className="badge">{n.badge}</span> : null}
            </div>
          ))}
          <div className="jm-nav-section">Finance</div>
          {navItems.slice(4, 8).map(n => (
            <div key={n.id} className={`jm-nav-item ${page === n.id ? "active" : ""}`} onClick={() => navigate(n.id)}>
              <Icon name={n.icon} size={15} />{n.label}
              {n.badge ? <span className="badge">{n.badge}</span> : null}
            </div>
          ))}
          <div className="jm-nav-section">System</div>
          {navItems.slice(8).map(n => (
            <div key={n.id} className={`jm-nav-item ${page === n.id ? "active" : ""}`} onClick={() => navigate(n.id)}>
              <Icon name={n.icon} size={15} />{n.label}
            </div>
          ))}
        </div>
        <div style={{ padding: "16px 20px", borderTop: "1px solid #1e1e1e" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#fff", color: "#111", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 11, flexShrink: 0 }}>AJ</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>Alex Jones</div>
              <div style={{ fontSize: 10, color: "#555" }}>Admin</div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <div className="jm-main">
        {/* Top bar */}
        <div className="jm-topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="jm-hamburger" onClick={() => setSidebarOpen(o => !o)} aria-label="Toggle menu">
              <HamburgerIcon open={sidebarOpen} />
            </button>
            <span className="jm-page-title">{pageTitles[page]}</span>
          </div>
          <div className="jm-topbar-actions">
            <button className="btn btn-ghost btn-sm" style={{ color: "#999" }}><Icon name="notification" size={16} /></button>
            <div className="topbar-actions-hide" style={{ width: 1, height: 24, background: "#e8e8e8" }} />
            <span className="topbar-actions-hide jm-topbar-date" style={{ fontSize: 12, color: "#999" }}>Mon, 9 Mar 2026</span>
          </div>
        </div>

        {/* Page content */}
        <div className="jm-content">
          {renderPage()}
        </div>
      </div>

      {/* More menu (slides up from bottom nav) */}
      {moreOpen && (
        <div className="jm-more-menu" onClick={e => e.stopPropagation()}>
          {moreNavItems.map(n => (
            <button key={n.id} className={`jm-more-menu-item ${page === n.id ? "active" : ""}`} onClick={() => navigate(n.id)}>
              <Icon name={n.icon} size={16} />
              {n.id === "time" ? "Time Tracking" : n.id === "bills" ? "Bills & Costs" : n.label}
              {n.badge ? <span className="jm-more-badge">{n.badge}</span> : null}
            </button>
          ))}
        </div>
      )}

      {/* Bottom navigation (mobile only) */}
      <div className="jm-bottom-nav">
        <div className="jm-bottom-nav-inner">
          {bottomNavItems.map(n => (
            <button key={n.id} className={`jm-bottom-nav-item ${page === n.id ? "active" : ""}`} onClick={() => navigate(n.id)}>
              {n.badge ? <span className="bnav-badge">{n.badge}</span> : null}
              <Icon name={n.icon} size={20} />
              <span>{n.label}</span>
            </button>
          ))}
          {/* More button */}
          <button
            className={`jm-bottom-nav-item ${moreIsActive ? "active" : ""}`}
            onClick={e => { e.stopPropagation(); setMoreOpen(o => !o); }}
          >
            {(pendingBillsCount + unpaidInvCount) > 0 && !moreIsActive
              ? <span className="bnav-badge">{pendingBillsCount + unpaidInvCount}</span>
              : null}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
            </svg>
            <span>More</span>
          </button>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
