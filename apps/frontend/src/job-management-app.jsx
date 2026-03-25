import { useState, useEffect, lazy, Suspense, Component, useCallback } from "react";
import { Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom";
// db imports used by extracted pages — kept here only for re-export if needed
// Individual pages import directly from '../lib/db'
import { useAppStore } from './lib/store';
// supabase imports used by extracted pages — they import directly
import { useAuth } from './lib/AuthContext';
import { changePassword, adminResetUserPassword } from './lib/auth';
import { buildQuotePdfHtml, buildInvoicePdfHtml, buildOrderPdfHtml, htmlToPdfBase64 } from './lib/pdf';
import NotesTab from './NotesTab';
import QuickAddNoteModal from './components/QuickAddNoteModal';
import './styles/global.css';
import sh from './styles/app-shell.module.css';
import db from './styles/dashboard.module.css';
import jb from './styles/jobs.module.css';
import sc from './styles/schedule.module.css';
import bl from './styles/bills.module.css';
import tm from './styles/time.module.css';
import pg from './styles/pages.module.css';
// Heavy libraries loaded dynamically where used (fabric, pdfjs-dist, pdf-lib, signature_pad)

// ── TODO ─────────────────────────────────────────────────────────────────────
// Planned features & improvements for FieldOps:
//
// Features:
// TODO: Build digital asset management (DAM) for centralized templates, contracts, compliance docs, marketing assets
// TODO: Add drag-and-drop reordering for job phases and tasks
// TODO: Add notifications system (in-app + push) for overdue invoices, expiring contractor docs, job updates
//
// Integrations:
// TODO: Add webhook support for real-time Xero payment status updates (replace polling)
//
// ── File splitting plan (phased) ──────────────────────────────────────────
//
// Phase 1 — Quick wins (biggest impact, lowest risk):
// DONE: Extracted JobDetail (~2,000 lines) into pages/JobDetail.jsx
//       - Also extracted: PhotoMarkupEditor, PlanDrawingEditor, FormFillerModal,
//         BillModal, PdfFormFiller, OrderCard into components/
// DONE: Split JobDetail tabs into sub-components: JobPnL, JobGantt, JobTasks
// DONE: Extracted Notes tab (~500 lines incl. modals) into JobDetail/JobNotes.jsx
// DONE: Extracted seed data (~450 lines) into fixtures/seedData.jsx
// DONE: Extracted CallerMemory (~340 lines) into pages/CallerMemory.jsx
// DONE: Extracted shared helpers (~100 lines) into utils/helpers.js
// DONE: Extracted Icon component into components/Icon.jsx
//
// Phase 2 — Route-based code splitting (developer experience + bundle size):
// DONE: Extracted all 21 route pages into pages/ (monolith reduced from ~9,500 to ~850 lines)
//       Dashboard, Jobs, Clients, Contractors, Suppliers, Schedule, Quotes, TimeTracking,
//       Bills, Invoices, Actions, Reminders, Activity, DisplaySchedule, DisplayOverview,
//       MyAssistant, Settings, Files, CallLog, SystemStatus, Orders
// DONE: Extracted OrderDrawer + helpers into components/OrderDrawer.jsx
// DONE: React.lazy() + Suspense for route-based code splitting
//       Initial bundle reduced from ~694KB to ~106KB (85% reduction)
//       Each page loads as a separate chunk on navigation
//
// Phase 3 — State management (performance + scalability):
// DONE: Replaced prop drilling with Zustand store (useAppStore)
// DONE: React.memo() on 15 heavy page components
// DONE: ErrorBoundary wrapping all routes with graceful error recovery
//
// Other technical debt:
// TODO: Add unit and integration tests for critical flows (quoting, invoicing, bill extraction)
// TODO: Replace inline styles with CSS modules or styled-components for maintainability
// TODO: Implement optimistic UI updates for better perceived performance
// ─────────────────────────────────────────────────────────────────────────────

// ── Google Font ──────────────────────────────────────────────────────────────
const fontLink = document.createElement("link");
fontLink.rel = "stylesheet";
fontLink.href = "https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;500;600;700;800&display=swap";
document.head.appendChild(fontLink);

const spinStyle = document.createElement("style");
spinStyle.textContent = "@keyframes spin { to { transform: rotate(360deg); } }";
document.head.appendChild(spinStyle);

// ── Seed Data & Helpers (extracted) ──────────────────────────────────────────
import {
  SEED_CLIENTS, SEED_JOBS, SEED_QUOTES, SEED_SCHEDULE, SEED_FUTURE_SCHEDULE,
  SEED_TIME, SEED_BILLS, SEED_REMINDERS, SEED_CALL_LOG, SEED_INVOICES,
  DEFAULT_COMPANY, SEED_TEMPLATES, TEAM_DATA,
  ORDER_TERMINAL, SECTION_COLORS,
  SEED_WO, SEED_PO, SEED_CONTRACTORS, SEED_SUPPLIERS,
} from './fixtures/seedData.jsx';
import {
  CURRENT_USER, setCURRENT_USER, daysUntil,
  getContractorComplianceCount, hexToRgba,
} from './utils/helpers';
import { Icon } from './components/Icon';
import { StatusBadge } from './components/shared';
import { getFormattedDateTime } from './utils/timezone';
// CallerMemory is lazy-loaded above
// Shared components used by extracted pages — they import directly
// Component imports used by extracted pages — they import directly
// (PhotoMarkupEditor, PlanDrawingEditor, FormFillerModal, BillModal, PdfFormFiller, OrderCard, JobDetail)

// ── Lazy-loaded page components (route-based code splitting) ────────────────
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Jobs = lazy(() => import('./pages/Jobs'));
const OrdersPage = lazy(() => import('./pages/Orders'));
const Clients = lazy(() => import('./pages/Clients'));
const Contractors = lazy(() => import('./pages/Contractors'));
const Suppliers = lazy(() => import('./pages/Suppliers'));
const Schedule = lazy(() => import('./pages/Schedule'));
const Quotes = lazy(() => import('./pages/Quotes'));
const TimeTracking = lazy(() => import('./pages/TimeTracking'));
const Bills = lazy(() => import('./pages/Bills'));
const Invoices = lazy(() => import('./pages/Invoices'));
const Actions = lazy(() => import('./pages/Actions'));
const Reminders = lazy(() => import('./pages/Reminders'));
const ActivityPage = lazy(() => import('./pages/Activity'));
const DisplaySchedule = lazy(() => import('./pages/DisplaySchedule'));
const DisplayOverview = lazy(() => import('./pages/DisplayOverview'));
const MyAssistant = lazy(() => import('./pages/MyAssistant'));
const Settings = lazy(() => import('./pages/Settings'));
const Account = lazy(() => import('./pages/Account'));
const FilesPage = lazy(() => import('./pages/Files'));
const CallLog = lazy(() => import('./pages/CallLog'));
const SystemStatus = lazy(() => import('./pages/SystemStatus'));
const CallerMemory = lazy(() => import('./pages/CallerMemory'));

const TEAM = TEAM_DATA.map(t => t.name);

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => `$${Number(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const calcQuoteTotal = (q) => {
  const sub = q.lineItems.reduce((s, l) => s + l.qty * l.rate, 0);
  return sub * (1 + q.tax / 100);
};
const uid = () => Date.now() + Math.random();

// ── Activity Log Helpers ──────────────────────────────────────────────────────
// Set dynamically from auth context inside App — defaults to seed data name
const nowTs = () => {
  const d = new Date();
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) + " " +
    d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false });
};
const mkLog = (action, user = CURRENT_USER) => ({ ts: nowTs(), user, action });
const addLog = (prev, action, user = CURRENT_USER) => [...(prev || []), mkLog(action, user)];

// ── Note Categories ─────────────────────────────────────────────────────────
const NOTE_CATEGORIES = [
  { id: "general", label: "General", color: "#64748b" },
  { id: "site_update", label: "Site Update", color: "#0891b2" },
  { id: "issue", label: "Issue", color: "#dc2626" },
  { id: "inspection", label: "Inspection", color: "#7c3aed" },
  { id: "delivery", label: "Delivery", color: "#d97706" },
  { id: "safety", label: "Safety", color: "#059669" },
  { id: "form", label: "Form", color: "#2563eb" },
];

// ── Form Templates ──────────────────────────────────────────────────────────
const FORM_TEMPLATES = [
  { id: "swms", name: "SWMS / HPS", icon: "⚠️", fields: [
    { key: "jobDescription", label: "Job Description", type: "text" },
    { key: "location", label: "Location", type: "text" },
    { key: "date", label: "Date", type: "date" },
    { key: "supervisor", label: "Supervisor", type: "text" },
    { key: "hazards", label: "Identified Hazards", type: "textarea" },
    { key: "controls", label: "Control Measures", type: "textarea" },
    { key: "ppe", label: "PPE Required", type: "checklist", options: ["Hard Hat", "Safety Glasses", "High-Vis Vest", "Steel Cap Boots", "Gloves", "Ear Protection", "Dust Mask", "Fall Harness"] },
    { key: "workersBriefed", label: "Workers Briefed", type: "textarea" },
    { key: "signature", label: "Supervisor Signature", type: "signature" },
  ]},
  { id: "service_report", name: "Service Report", icon: "🔧", fields: [
    { key: "client", label: "Client", type: "text" },
    { key: "site", label: "Site", type: "text" },
    { key: "date", label: "Date", type: "date" },
    { key: "technician", label: "Technician", type: "text" },
    { key: "arrivalTime", label: "Arrival Time", type: "time" },
    { key: "departureTime", label: "Departure Time", type: "time" },
    { key: "workPerformed", label: "Work Performed", type: "textarea" },
    { key: "materialsUsed", label: "Materials Used", type: "textarea" },
    { key: "followUp", label: "Follow-up Actions", type: "checklist", options: ["Parts on order", "Return visit required", "Quote to follow", "Warranty claim", "No further action"] },
    { key: "clientSignature", label: "Client Signature", type: "signature" },
  ]},
  { id: "take5", name: "Take 5", icon: "✋", fields: [
    { key: "date", label: "Date", type: "date" },
    { key: "worker", label: "Worker Name", type: "text" },
    { key: "location", label: "Location", type: "text" },
    { key: "safetyChecks", label: "Safety Checks", type: "checklist", options: [
      "Do I know the task and how to do it safely?",
      "Am I fit for duty (not fatigued, medicated, etc)?",
      "Have I identified all hazards?",
      "Are tools and equipment in good condition?",
      "Is the work area clean and clear?",
      "Are others in the area safe from my work?",
      "Do I have the right PPE?",
      "Do I know emergency procedures?",
      "Have I checked for overhead/underground services?",
      "Am I comfortable to proceed?"
    ]},
    { key: "additionalHazards", label: "Additional Hazards Identified", type: "textarea" },
    { key: "controlActions", label: "Control Actions Taken", type: "textarea" },
    { key: "signature", label: "Worker Signature", type: "signature" },
  ]},
];

// ── Orders: Seed Data ────────────────────────────────────────────────────────
const ORDER_CONTRACTORS = [
  { id: "c1", name: "Apex Electrical Pty Ltd", contact: "Mark Simmons", email: "mark@apexelec.com.au", phone: "0412 345 678", trade: "Electrical" },
  { id: "c2", name: "Blue Ridge Plumbing", contact: "Sarah O'Brien", email: "sarah@blueridgeplumbing.com.au", phone: "0421 987 654", trade: "Plumbing" },
  { id: "c3", name: "Coastal Civil Works", contact: "Tom Fletcher", email: "tom@coastalcivil.com.au", phone: "0433 112 233", trade: "Civil" },
  { id: "c4", name: "Ironclad Roofing Co.", contact: "Dave Nguyen", email: "dave@ironcladroofing.com.au", phone: "0455 667 788", trade: "Roofing" },
];
const ORDER_SUPPLIERS = [
  { id: "s1", name: "Reece Plumbing & Bathrooms", contact: "Accounts", email: "accounts@reece.com.au", phone: "1300 555 000", abn: "12 345 678 901" },
  { id: "s2", name: "Bunnings Trade", contact: "Trade Desk", email: "trade@bunnings.com.au", phone: "1300 888 111", abn: "23 456 789 012" },
  { id: "s3", name: "Middy's Electrical", contact: "Sales", email: "sales@middys.com.au", phone: "03 9412 5555", abn: "34 567 890 123" },
  { id: "s4", name: "Clark Rubber & Foam", contact: "Warehouse", email: "orders@clarkrubber.com.au", phone: "1800 252 759", abn: "45 678 901 234" },
];
const ORDER_UNITS = ["hr", "day", "ea", "m", "m2", "m3", "kg", "t", "L", "lm", "set", "lot"];

// ── Orders: Status Pipeline ──────────────────────────────────────────────────
const ORDER_STATUSES = ["Draft", "Approved", "Sent", "Viewed", "Accepted", "Completed", "Billed", "Cancelled"];
const ORDER_TRANSITIONS = {
  Draft: ["Approved", "Cancelled"], Approved: ["Sent", "Draft", "Cancelled"], Sent: ["Viewed", "Accepted", "Cancelled"],
  Viewed: ["Accepted", "Cancelled"], Accepted: ["Completed", "Cancelled"], Completed: ["Billed"], Billed: [], Cancelled: ["Draft"],
};
const ORDER_STATUS_TRIGGERS = {
  Sent: "Triggered automatically when document is emailed",
  Viewed: "Triggered when recipient opens the document link",
  Billed: "Triggered when matched to a bill in Job Management",
};
const ORDER_ACTIVE = ["Approved", "Sent", "Viewed", "Accepted", "Completed"];
const ORDER_STATUS_PROGRESS = { Draft: 0, Approved: 15, Sent: 30, Viewed: 45, Accepted: 60, Completed: 80, Billed: 100, Cancelled: 0 };
const ORDER_STATUS_COLORS = {
  Draft: { bg: "#f1f5f9", text: "#475569" }, Approved: { bg: "#e0f2fe", text: "#0369a1" }, Sent: { bg: "#dbeafe", text: "#1d4ed8" },
  Viewed: { bg: "#ede9fe", text: "#6d28d9" }, Accepted: { bg: "#fef3c7", text: "#b45309" }, Completed: { bg: "#d1fae5", text: "#047857" },
  Billed: { bg: "#ccfbf1", text: "#0f766e" }, Cancelled: { bg: "#fee2e2", text: "#dc2626" },
};
const ORDER_BAR_COLORS = {
  Draft: "#cbd5e1", Approved: "#38bdf8", Sent: "#60a5fa", Viewed: "#a78bfa", Accepted: "#fbbf24", Completed: "#34d399", Billed: "#2dd4bf", Cancelled: "#fca5a5",
};


// ── View Field (reusable read-only display for View mode) ─────────────────────
const ViewField = ({ label, value }) => (
  <div className={sh.viewFieldWrap}>
    <div className={sh.viewFieldLabel}>{label}</div>
    <div className={sh.viewFieldValue}>{value || '—'}</div>
  </div>
);

// ── Orders: Helpers ──────────────────────────────────────────────────────────
const genId = () => Math.random().toString(36).slice(2, 9).toUpperCase();
const orderToday = () => new Date().toISOString().slice(0, 10);
const orderAddDays = (dateStr, n) => { const d = new Date(dateStr); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmtDate = (d) => { if (!d) return "—"; const [y, m, day] = d.split("-"); return `${parseInt(day,10).toString().padStart(2,"0")} ${MONTHS[parseInt(m,10)-1]}`; };
const orderFmtDate = fmtDate;
const fmtFileSize = (bytes) => { if (bytes < 1024) return bytes + " B"; if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"; return (bytes / (1024 * 1024)).toFixed(1) + " MB"; };
const orderFmtTs = (ts) => {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) + " " +
    d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: true });
};
const makeLogEntry = (action, detail = "", auto = false) => ({ id: genId(), ts: new Date().toISOString(), action, detail, auto });
const orderAddLog = (order, action, detail = "", auto = false) => ({ ...order, auditLog: [...(order.auditLog || []), makeLogEntry(action, detail, auto)] });
const applyTransition = (order, newStatus, extraDetail = "") => {
  const old = order.status;
  const detail = extraDetail || (ORDER_STATUS_TRIGGERS[newStatus] ? ORDER_STATUS_TRIGGERS[newStatus] : "");
  const auto = !!ORDER_STATUS_TRIGGERS[newStatus];
  return orderAddLog({ ...order, status: newStatus }, `Status changed: ${old} → ${newStatus}`, detail, auto);
};
const orderJobDisplay = (job) => {
  if (!job) return null;
  const ref = job.jobNumber || ("J-" + String(job.id).padStart(4, "0"));
  return { ref, name: job.title, client: job.clientName || "" };
};


const CONTRACTOR_TRADES = ["Electrical", "Plumbing", "Roofing", "Carpentry", "Painting", "Tiling", "HVAC", "Landscaping", "Other"];

const COMPLIANCE_DOC_TYPES = [
  { id: "workers_comp", label: "Workers Compensation", icon: "shield", reminderDays: [30, 14, 7], fields: ["policyNumber", "insurer", "expiryDate"] },
  { id: "public_liability", label: "Public Liability", icon: "shield", reminderDays: [30, 14, 7], fields: ["policyNumber", "insurer", "coverAmount", "expiryDate"] },
  { id: "white_card", label: "White Card", icon: "badge", reminderDays: [30, 14], fields: ["cardNumber", "holderName", "issueDate"] },
  { id: "trade_license", label: "Trade License", icon: "badge", reminderDays: [30, 14, 7], fields: ["licenseNumber", "licenseClass", "issuingBody", "expiryDate"] },
  { id: "subcontractor_statement", label: "Subcontractor Statement", icon: "file", reminderDays: [14, 7], fields: ["periodFrom", "periodTo", "abn"] },
  { id: "swms", label: "SWMS", icon: "file", reminderDays: [14, 7], fields: ["title", "revision", "approvedBy", "approvalDate"] },
];

const COMPLIANCE_STATUS_COLORS = {
  current: { bg: "#ecfdf5", text: "#059669", label: "Current" },
  expiring_soon: { bg: "#fffbeb", text: "#d97706", label: "Expiring Soon" },
  expired: { bg: "#fef2f2", text: "#dc2626", label: "Expired" },
  missing: { bg: "#f0f0f0", text: "#888", label: "Missing" },
  no_expiry: { bg: "#ecfdf5", text: "#059669", label: "Current" },
};

const getComplianceStatus = (doc) => {
  if (!doc) return "missing";
  if (!doc.expiryDate) return "no_expiry";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(doc.expiryDate + "T00:00:00");
  const diffDays = Math.ceil((expiry - today) / 86400000);
  if (diffDays < 0) return "expired";
  if (diffDays <= 30) return "expiring_soon";
  return "current";
};

const getDaysUntilExpiry = (expiryDate) => {
  if (!expiryDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate + "T00:00:00");
  return Math.ceil((expiry - today) / 86400000);
};


// ActivityLog display component
const ActivityLog = ({ entries = [] }) => {
  if (!entries.length) return <div className={sh.activityEmpty}>No activity recorded yet.</div>;
  return (
    <div className="timeline">
      {[...entries].reverse().map((e, i) => (
        <div key={i} className="timeline-item">
          <div className="timeline-dot" />
          <div className={sh.activityEntry}>
            <span className={sh.activityAction}>{e.action}</span>
            <div className={sh.activityMeta}>
              <span className={sh.activityUser}>{e.user}</span> · {e.ts}
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
  scheduled: "#0891b2",
  quoted: "#ca8a04",
  in_progress: "#ea580c",
  completed: "#059669",
  cancelled: "#f5f5f5",
  sent: "#2563eb",
  accepted: "#059669",
  declined: "#dc2626",
  paid: "#059669",
  overdue: "#dc2626",
  void: "#64748b",
  inbox: "#f0f0f0",
  linked: "#2563eb",
  approved: "#059669",
  posted: "#111",
  pending: "#ca8a04",
};
const STATUS_TEXT = {
  draft: "#888",
  scheduled: "#fff",
  quoted: "#fff",
  in_progress: "#fff",
  completed: "#fff",
  cancelled: "#aaa",
  sent: "#fff",
  accepted: "#fff",
  declined: "#fff",
  paid: "#fff",
  overdue: "#fff",
  void: "#fff",
  inbox: "#888",
  linked: "#fff",
  approved: "#fff",
  posted: "#fff",
  pending: "#fff",
};


// ── Xero Sync Badge ─────────────────────────────────────────────────────────
const XeroSyncBadge = ({ syncStatus, xeroId }) => {
  if (!syncStatus && !xeroId) return null;
  const colors = {
    synced: { bg: "#ecfdf5", text: "#16a34a", label: "Synced" },
    pending: { bg: "#fffbeb", text: "#d97706", label: "Pending" },
    error: { bg: "#fef2f2", text: "#dc2626", label: "Error" },
  };
  const c = colors[syncStatus] || (xeroId ? colors.synced : { bg: "#f5f5f5", text: "#888", label: "Not synced" });
  return (
    <span className={sh.xeroBadge} style={{ background: c.bg, color: c.text }}>
      <span className={`${sh.xeroDot} ${pg.u1}`} />
      Xero
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
        <div key={i} className={`avatar ${pg.u2}`} title={n}>
          {n.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase()}
        </div>
      ))}
      {extra > 0 && <div className={`avatar ${pg.u3}`}>+{extra}</div>}
    </div>
  );
};

// ── Close Button ─────────────────────────────────────────────────────────────
const CloseBtn = ({ onClick }) => (
  <button onClick={onClick} className={`btn btn-ghost ${sh.closeBtn}`}><Icon name="close" size={16} /></button>
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
            <th className={pg.u4}>Description</th>
            <th className={pg.u5}>Qty</th>
            <th className={pg.u6}>Unit</th>
            <th className={pg.p2_0}>Rate ($)</th>
            <th className={pg.p2_0}>Total</th>
            <th className={pg.u7}></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td><input value={it.desc} onChange={e => update(i, "desc", e.target.value)} placeholder="Description" /></td>
              <td><input type="number" value={it.qty} onChange={e => update(i, "qty", e.target.value)} min="0" /></td>
              <td>
                <select className={sh.lineItemSelect} value={it.unit} onChange={e => update(i, "unit", e.target.value)}>
                  {["hrs","ea","m²","lm","lot","day","m³","kg"].map(u => <option key={u}>{u}</option>)}
                </select>
              </td>
              <td><input type="number" value={it.rate} onChange={e => update(i, "rate", e.target.value)} min="0" /></td>
              <td className={sh.lineItemTotal}>{fmt(it.qty * it.rate)}</td>
              <td><button onClick={() => remove(i)} className={`btn btn-ghost btn-xs ${sh.lineItemDeleteBtn}`}><Icon name="trash" size={12} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={add} className="btn btn-secondary btn-sm"><Icon name="plus" size={12} />Add Line</button>
      <div className={sh.totalsWrap}>
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
// ORDERS COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

const OrderIcon = ({ name, size = 16, cls = "" }) => {
  const icons = {
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    edit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    trash: <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></>,
    send: <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    briefcase: <><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></>,
    shopping: <><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></>,
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>,
    link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    grid: <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></>,
    bar: <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    warning: <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
    upload: <><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></>,
    paperclip: <><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></>,
    mail: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></>,
    chevdown: <polyline points="6 9 12 15 18 9"/>,
    check: <polyline points="20 6 9 17 4 12"/>,
    activity: <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>,
    zap: <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`${cls} ${pg.flexShrink0}`}>
      {icons[name]}
    </svg>
  );
};

const OrderStatusBadge = ({ status }) => {
  const c = ORDER_STATUS_COLORS[status] || { bg: "#f0f0f0", text: "#666" };
  return <span className="order-badge" style={{ background: c.bg, color: c.text }}>{status}</span>;
};

const DueDateChip = ({ dateStr, isTerminal }) => {
  if (!dateStr) return null;
  const days = daysUntil(dateStr);
  if (isTerminal) return <span className={pg.dueDateTerminal}><OrderIcon name="calendar" size={11} /> {orderFmtDate(dateStr)}</span>;
  if (days < 0) return <span className={pg.dueDateOverdue}><OrderIcon name="warning" size={11} /> {Math.abs(days)}d overdue</span>;
  if (days === 0) return <span className={pg.dueDateToday}><OrderIcon name="clock" size={11} /> Due today</span>;
  if (days <= 3) return <span className={pg.dueDateSoon}><OrderIcon name="clock" size={11} /> {days}d left</span>;
  return <span className={pg.dueDateDefault}><OrderIcon name="calendar" size={11} /> {orderFmtDate(dateStr)}</span>;
};

const OrderProgressBar = ({ status }) => {
  const pct = ORDER_STATUS_PROGRESS[status] ?? 0;
  const color = ORDER_BAR_COLORS[status] || "#cbd5e1";
  if (status === "Cancelled") return <div className="order-progress-track" />;
  return <div className="order-progress-track"><div className="order-progress-fill" style={{ width: pct + "%", background: color }} /></div>;
};

const SectionProgressBar = ({ status, section }) => {
  const configs = {
    jobs: { draft: 0, scheduled: 20, quoted: 40, in_progress: 60, completed: 100, cancelled: 0 },
    quotes: { draft: 0, sent: 50, accepted: 100, declined: 0 },
    invoices: { draft: 0, sent: 33, paid: 100, overdue: 66, void: 0 },
    bills: { inbox: 0, linked: 33, approved: 66, posted: 100 },
  };
  const colors = {
    jobs: { draft: "#cbd5e1", scheduled: "#0891b2", quoted: "#ca8a04", in_progress: "#ea580c", completed: "#059669", cancelled: "#e2e8f0" },
    quotes: { draft: "#cbd5e1", sent: "#2563eb", accepted: "#059669", declined: "#dc2626" },
    invoices: { draft: "#cbd5e1", sent: "#2563eb", paid: "#059669", overdue: "#dc2626", void: "#64748b" },
    bills: { inbox: "#cbd5e1", linked: "#2563eb", approved: "#059669", posted: "#111" },
  };
  const pct = configs[section]?.[status] ?? 0;
  const color = colors[section]?.[status] || "#cbd5e1";
  if (pct === 0 && (status === "cancelled" || status === "declined" || status === "void")) return <div className="order-progress-track" />;
  return <div className="order-progress-track"><div className="order-progress-fill" style={{ width: pct + "%", background: color }} /></div>;
};

const FileIconBadge = ({ name }) => {
  const ext = (name || "").split(".").pop().toLowerCase();
  let icon = "FILE", color = "#64748b", bg = "#f1f5f9";
  if (ext === "pdf") { icon = "PDF"; color = "#ef4444"; bg = "#fef2f2"; }
  else if (["jpg","jpeg","png","gif","webp","heic"].includes(ext)) { icon = "IMG"; color = "#8b5cf6"; bg = "#f5f3ff"; }
  else if (["doc","docx"].includes(ext)) { icon = "DOC"; color = "#2563eb"; bg = "#eff6ff"; }
  else if (["xls","xlsx","csv"].includes(ext)) { icon = "XLS"; color = "#059669"; bg = "#ecfdf5"; }
  return <span className={pg.fileIconBadge} style={{ color, background: bg }}>{icon}</span>;
};

const OrderFileAttachments = ({ files, onChange, onMarkup, onLightbox }) => {
  const handleFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    const mapped = picked.map(f => ({ id: genId(), name: f.name, size: f.size, type: f.type, dataUrl: null, _file: f }));
    mapped.forEach(m => {
      if (m.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = ev => { onChange(prev => prev.map(x => x.id === m.id ? { ...x, dataUrl: ev.target.result } : x)); };
        reader.readAsDataURL(m._file);
      }
    });
    onChange(prev => [...prev, ...mapped]);
    e.target.value = "";
  };
  return (
    <div className={pg.u9}>
      {files.length > 0 && files.map(f => (
        <div key={f.id} className={pg.u10}>
          {f.dataUrl ? <img src={f.dataUrl} alt={f.name} className={pg.u11} onClick={() => onLightbox && onLightbox(f.dataUrl)} />
            : <div className={pg.u12}><FileIconBadge name={f.name} /></div>}
          <div className={pg.listItemMain}>
            <div className={pg.u13}>{f.name}</div>
            <div className={pg.textSubSm}>{fmtFileSize(f.size)}</div>
          </div>
          {f.dataUrl && f.type?.startsWith("image/") && onMarkup && <button onClick={() => onMarkup(f.dataUrl, f.id)} className={pg.p2_1} title="Mark up">✏️</button>}
          <button onClick={() => onChange(prev => prev.filter(x => x.id !== f.id))} className={pg.ghostBtn}>
            <OrderIcon name="x" size={14} />
          </button>
        </div>
      ))}
      <label className={pg.u14}>
        <OrderIcon name="upload" size={16} />
        {files.length > 0 ? "Add more files" : "Attach files — drawings, specs, photos…"}
        <input type="file" multiple className={pg.hidden} onChange={handleFiles} accept="*/*" />
      </label>
    </div>
  );
};

const OrderLineItems = ({ lines, onChange }) => {
  const add = () => onChange([...lines, { id: genId(), desc: "", qty: "1", unit: "ea" }]);
  const remove = (id) => onChange(lines.filter(l => l.id !== id));
  const update = (id, field, val) => onChange(lines.map(l => l.id === id ? { ...l, [field]: val } : l));
  return (
    <div className={pg.flexColGap8}>
      <div className={pg.u15}>
        <span>Description</span><span>Qty</span><span>Unit</span><span></span>
      </div>
      {lines.map(l => (
        <div key={l.id} className={pg.u16}>
          <input className={`form-control ${pg.h36fs13}`} placeholder="Description" value={l.desc} onChange={e => update(l.id, "desc", e.target.value)} />
          <input className={`form-control ${pg.h36fs13}`} type="number" min="0" placeholder="Qty" value={l.qty} onChange={e => update(l.id, "qty", e.target.value)} />
          <select className={`form-control ${pg.h36fs13}`} value={l.unit} onChange={e => update(l.id, "unit", e.target.value)}>
            {ORDER_UNITS.map(u => <option key={u}>{u}</option>)}
          </select>
          <button onClick={() => remove(l.id)} className={pg.ghostBtn}><OrderIcon name="x" size={14} /></button>
        </div>
      ))}
      <button onClick={add} className={pg.u17}>
        <OrderIcon name="plus" size={14} /> Add line item
      </button>
    </div>
  );
};

const OrderAuditLog = ({ log }) => {
  if (!log || log.length === 0) return <div className={pg.u18}>No activity recorded yet.</div>;
  const getColor = (action) => {
    if (action.startsWith("Created")) return { bg: "#f1f5f9", text: "#64748b" };
    if (action.startsWith("Status")) return { bg: "#dbeafe", text: "#2563eb" };
    if (action.startsWith("Emailed")) return { bg: "#ede9fe", text: "#7c3aed" };
    if (action.startsWith("Edited")) return { bg: "#fef3c7", text: "#d97706" };
    return { bg: "#f1f5f9", text: "#64748b" };
  };
  return (
    <div>
      {[...log].reverse().map((entry, i) => (
        <div key={entry.id} className={i < log.length - 1 ? pg.auditLogEntryBorder : pg.auditLogEntry}>
          <div className={pg.auditLogIcon} style={{ background: getColor(entry.action).bg, color: getColor(entry.action).text }}>
            <OrderIcon name={entry.auto ? "zap" : "activity"} size={10} />
          </div>
          <div className={pg.listItemMain}>
            <div className={pg.u20}>
              <span className={pg.fs13fw600c334155}>{entry.action}</span>
              <div className={pg.u21}>
                {entry.auto && <span className={pg.u22}>auto</span>}
                <span className={pg.u23}>{orderFmtTs(entry.ts)}</span>
              </div>
            </div>
            {entry.detail && <div className={pg.fs12c64748bmt2}>{entry.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Orders: PDF + Acceptance Page ─────────────────────────────────────────────
const printOrderPdf = (type, order, jobs) => {
  const job = jobs.find(j => j.id === order.jobId);
  const html = buildOrderPdfHtml({ type, order, job });
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) { alert("Please allow pop-ups to generate PDF."); return; }
  win.document.write(html); win.document.close(); win.focus();
  setTimeout(() => win.print(), 400);
};

// ── Orders: Email Modal ───────────────────────────────────────────────────────
const OrderEmailModal = ({ type, order, jobs, companyInfo, onClose, onSent }) => {
  const isWO = type === "wo";
  const partyEmail = isWO ? order.contractorEmail : order.supplierEmail;
  const partyName = isWO ? order.contractorName : order.supplierName;
  const partyContact = isWO ? order.contractorContact : order.supplierContact;
  const jd = orderJobDisplay(jobs.find(j => j.id === order.jobId));
  const job = jobs.find(j => j.id === order.jobId);
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
  const docType = isWO ? "work_order" : "purchase_order";
  const acceptUrl = order.acceptToken
    ? `${supabaseUrl}/functions/v1/accept-document?token=${order.acceptToken}&type=${docType}`
    : null;
  const [includeAcceptLink, setIncludeAcceptLink] = useState(true);
  const [includePdf, setIncludePdf] = useState(true);
  const [to, setTo] = useState(partyEmail || "");
  const [cc, setCc] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState(null);
  const accent = isWO ? "#2563eb" : "#059669";
  const ToggleBtn = ({ on, onChange, accentCol }) => (
    <button className={`order-toggle ${on ? "on" : ""}`} style={{ background: on ? (accentCol || accent) : "#e2e8f0" }} onClick={() => onChange(!on)}>
      <div className="order-toggle-knob" />
    </button>
  );
  const handleSend = async () => {
    if (!to) return;
    setSending(true); setSendError(null);
    try {
      // Generate PDF attachment
      let attachments = [];
      if (includePdf) {
        const pdfHtml = buildOrderPdfHtml({ type, order, job, company: companyInfo, acceptUrl: includeAcceptLink ? acceptUrl : null });
        try {
          const pdfBase64 = await htmlToPdfBase64(pdfHtml, `${order.ref}.pdf`);
          attachments.push({ filename: `${order.ref}.pdf`, content: pdfBase64 });
        } catch (e) { console.warn("PDF generation failed:", e); }
      }
      // Send via Resend
      const emailData = {
        number: order.ref,
        jobTitle: jd?.name || "",
        acceptUrl: includeAcceptLink ? acceptUrl : undefined,
        ...(isWO ? { contractorName: partyContact || partyName } : { supplierName: partyContact || partyName }),
      };
      await sendEmail(docType, to, emailData, { cc: cc || undefined, attachments });
      if (onSent) onSent(`Emailed to ${to}${cc ? ", cc: " + cc : ""}${includeAcceptLink ? " · acceptance link included" : ""}`);
      setSent(true);
    } catch (err) {
      setSendError(err.message || "Failed to send email");
    } finally { setSending(false); }
  };
  if (sent) return (
    <div className="order-email-overlay">
      <div className={pg.u24}>
        <div className={pg.u25}><OrderIcon name="check" size={24} cls="" /></div>
        <h3 className={pg.u26}>Email Sent</h3>
        <p className={pg.u27}>{isWO ? "Work order" : "Purchase order"} {order.ref} has been sent to {to}.</p>
        <button className={`btn btn-primary ${pg.sectionAccentBtn}`} style={{ background: accent }} onClick={onClose}>Done</button>
      </div>
    </div>
  );
  return (
    <div className="order-email-overlay">
      <div className="order-email-modal">
        <div className={pg.drawerHeaderBarLg} style={{ background: accent }}>
          <div className={pg.flexCenterGap12}>
            <OrderIcon name="mail" size={18} />
            <div><div className={pg.u30}>Send via Email</div><div className={pg.cellAmount}>{order.ref}</div></div>
          </div>
          <button onClick={onClose} className={pg.u31}><OrderIcon name="x" size={16} /></button>
        </div>
        <div className={pg.p2_2}>
          {sendError && <div className={pg.u32}>{sendError}</div>}
          <div className="grid-2">
            <div className="form-group"><label className="form-label">To</label><input className="form-control" type="email" placeholder="recipient@example.com" value={to} onChange={e => setTo(e.target.value)} />{partyName && <div className={pg.u33}>{partyName}</div>}</div>
            <div className="form-group"><label className="form-label">CC <span className={pg.u34}>optional</span></label><input className="form-control" type="text" placeholder="cc@example.com" value={cc} onChange={e => setCc(e.target.value)} /></div>
          </div>
          <div className={pg.u35}>
            <div className={pg.u36}>Email Options</div>
            <div className={pg.u37}>
              <div className={pg.u38}>
                <ToggleBtn on={includePdf} onChange={v => setIncludePdf(v)} />
                <div className={pg.flex1}>
                  <div className={pg.flexCenter}>
                    <span className={pg.u39}>PDF</span>
                    <span className={pg.fs13fw500}>Attach {order.ref}.pdf</span>
                    <button onClick={() => printOrderPdf(type, order, jobs)} className={pg.u40}>Preview</button>
                  </div>
                  <div className={pg.fs11c94a3b8mt2}>Professional PDF with all document details attached to the email</div>
                </div>
              </div>
              {acceptUrl && (
                <div className={pg.u41}>
                  <ToggleBtn on={includeAcceptLink} onChange={v => setIncludeAcceptLink(v)} />
                  <div className={pg.flex1}>
                    <div className={pg.fs13fw500}>✅ Accept Button</div>
                    <div className={pg.fs11c94a3b8mt2}>HTML button in email + link on PDF — recipient clicks to accept</div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className={pg.u42}>
            <strong className={pg.u43}>Email preview:</strong> Branded HTML email with {isWO ? "work order" : "purchase order"} details, {includePdf ? "PDF attachment" : "no attachment"}{includeAcceptLink && acceptUrl ? ", and Accept button" : ""}. Sent from <strong>FieldOps</strong> via Resend.
          </div>
        </div>
        <div className={pg.u44}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className={`btn btn-primary ${pg.sectionAccentBtn}`} style={{ background: accent, opacity: sending ? 0.6 : 1 }} disabled={!to || sending} onClick={handleSend}>
            <OrderIcon name="send" size={14} /> {sending ? "Sending..." : `Send ${isWO ? "to Contractor" : "to Supplier"}`}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Section Drawer (reusable shell) ──────────────────────────────────────────
const SectionDrawer = ({ accent, icon, typeLabel, title, statusBadge, mode, setMode, showToggle = true, isNew, statusStrip, children, footer, onClose, zIndex = 1050 }) => (
  <div className="section-drawer-overlay" style={{ zIndex }}>
    <div className="section-drawer-backdrop" onClick={onClose} />
    <div className="section-drawer">
      {/* Header */}
      <div className={pg.drawerHeaderBar} style={{ background: accent }}>
        <div className={pg.u46}>
          {icon && <div className={pg.u47}>{icon}</div>}
          <div className={pg.u48}>
            {typeLabel && <div className={pg.u49}>{typeLabel}</div>}
            <div className={pg.u50}>{title}</div>
          </div>
          {statusBadge}
        </div>
        <div className={pg.u51}>
          <button className={pg.u55} onClick={onClose}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
      {/* Status strip */}
      {statusStrip}
      {/* Body */}
      <div className={pg.u56}>{children}</div>
      {/* Footer */}
      {footer && <div className={pg.u57}>{footer}</div>}
    </div>
  </div>
);

// ── Orders: Order Drawer ──────────────────────────────────────────────────────
const OrderDrawer = ({ type, order, initialMode = "view", onSave, onClose, onTransition, jobs, presetJobId, companyInfo }) => {
  const isWO = type === "wo";
  const parties = isWO ? ORDER_CONTRACTORS : ORDER_SUPPLIERS;
  const isNew = !order;
  const baseForm = {
    id: genId(), ref: (isWO ? "WO-" : "PO-") + String(Math.floor(Math.random() * 900) + 100), status: "Draft",
    jobId: presetJobId || "", issueDate: orderToday(), dueDate: orderAddDays(orderToday(), 14), poLimit: "", notes: "", internalNotes: "",
    attachments: [], auditLog: [makeLogEntry("Created", isWO ? "Work order created" : "Purchase order created")],
  };
  const woFields = { contractorId: "", contractorName: "", contractorContact: "", contractorEmail: "", contractorPhone: "", trade: "", scopeOfWork: "" };
  const poFields = { supplierId: "", supplierName: "", supplierContact: "", supplierEmail: "", supplierAbn: "", deliveryAddress: "", lines: [{ id: genId(), desc: "", qty: "1", unit: "ea" }] };
  const [form, setForm] = useState(() => order ? { ...order } : { ...baseForm, ...(isWO ? woFields : poFields) });
  const [mode, setMode] = useState(isNew ? "edit" : initialMode);
  const [dirty, setDirty] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [lightboxImg, setLightboxImg] = useState(null);
  const [markupImg, setMarkupImg] = useState(null);
  const [showPlanDrawing, setShowPlanDrawing] = useState(false);
  const [showOrderPdfFiller, setShowOrderPdfFiller] = useState(null);
  const orderPdfInputRef = useRef(null);
  const [orderEmailSending, setOrderEmailSending] = useState(false);
  const [orderEmailStatus, setOrderEmailStatus] = useState(null);
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setDirty(true); };

  const handleOrderPdfFile = (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setShowOrderPdfFiller({ pdfData: ev.target.result, fileName: file.name });
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const handleOrderPdfSave = ({ filledPdfDataUrl, thumbnail, fields: pdfFields, fileName: filledName }) => {
    const att = { id: genId(), name: filledName, size: Math.round(filledPdfDataUrl.length * 0.75), type: "application/pdf", dataUrl: filledPdfDataUrl, pdfThumbnail: thumbnail };
    setForm(f => ({ ...f, attachments: [...f.attachments, att] }));
    setDirty(true);
    setShowOrderPdfFiller(null);
  };

  const handleDirectSendOrder = async () => {
    const recipientEmail = isWO ? form.contractorEmail : form.supplierEmail;
    const recipientName = isWO ? form.contractorName : form.supplierName;
    const emailType = isWO ? "work_order" : "purchase_order";
    if (!recipientEmail) { alert(`No ${isWO ? "contractor" : "supplier"} email address found.`); return; }
    const jobTitle = jobs.find(j => j.id === form.jobId)?.title || "";
    if (!window.confirm(`Send ${form.ref} via email to ${recipientName} (${recipientEmail})?`)) return;
    setOrderEmailSending(true); setOrderEmailStatus(null);
    try {
      await sendEmail(emailType, recipientEmail, { ...form, jobTitle, contractorName: form.contractorName, supplierName: form.supplierName });
      setOrderEmailStatus({ type: "success", msg: `Sent to ${recipientEmail}` });
      let u = form;
      u = { ...u, auditLog: [...(u.auditLog || []), { action: "Emailed via Resend", detail: `Sent to ${recipientEmail}`, ts: new Date().toISOString(), user: "System" }] };
      setForm(u); if (onSave) onSave(u);
      setTimeout(() => setOrderEmailStatus(null), 4000);
    } catch (err) {
      setOrderEmailStatus({ type: "error", msg: err.message || "Failed to send" });
    } finally { setOrderEmailSending(false); }
  };

  const saveOrderMarkup = (dataUrl) => {
    if (markupImg?.attachmentId) {
      // Replace existing attachment with marked-up version
      setForm(f => ({ ...f, attachments: f.attachments.map(a => a.id === markupImg.attachmentId ? { ...a, dataUrl, name: a.name.replace(/\.[^.]+$/, "") + "_marked.png" } : a) }));
      setDirty(true);
    } else {
      // Add as new attachment from lightbox markup
      const att = { id: genId(), name: "markup_" + Date.now() + ".png", size: Math.round(dataUrl.length * 0.75), type: "image/png", dataUrl };
      setForm(f => ({ ...f, attachments: [...f.attachments, att] }));
      setDirty(true);
    }
    setMarkupImg(null);
  };

  const saveOrderPlan = (dataUrl) => {
    const att = { id: genId(), name: "plan_" + Date.now() + ".png", size: Math.round(dataUrl.length * 0.75), type: "image/png", dataUrl };
    setForm(f => ({ ...f, attachments: [...f.attachments, att] }));
    setDirty(true);
    setShowPlanDrawing(false);
  };
  const selectParty = (id) => {
    const p = parties.find(x => x.id === id);
    if (!p) { set(isWO ? "contractorId" : "supplierId", ""); return; }
    if (isWO) setForm(f => ({ ...f, contractorId: p.id, contractorName: p.name, contractorContact: p.contact, contractorEmail: p.email, contractorPhone: p.phone, trade: p.trade }));
    else setForm(f => ({ ...f, supplierId: p.id, supplierName: p.name, supplierContact: p.contact, supplierEmail: p.email, supplierAbn: p.abn }));
    setDirty(true);
  };
  const handleTransition = (newStatus) => { const updated = applyTransition(form, newStatus); setForm(updated); setDirty(true); if (onTransition) onTransition(updated); };
  const handleSave = () => { const toSave = dirty ? orderAddLog(form, "Edited", "Order details updated") : form; onSave(toSave); setDirty(false); setMode("view"); };
  const availableTransitions = ORDER_TRANSITIONS[form.status] || [];
  const isTerminal = ORDER_TERMINAL.includes(form.status);
  const jd = orderJobDisplay(jobs.find(j => j.id === form.jobId));
  const partyId = isWO ? form.contractorId : form.supplierId;
  const partyName = isWO ? form.contractorName : form.supplierName;
  const accent = isWO ? SECTION_COLORS.wo.accent : SECTION_COLORS.po.accent;
  const lightTint = isWO ? SECTION_COLORS.wo.light : SECTION_COLORS.po.light;

  if (showEmail) return <OrderEmailModal type={type} order={form} jobs={jobs} companyInfo={companyInfo} onClose={() => setShowEmail(false)}
    onSent={(detail) => {
      let u = orderAddLog(form, "Emailed", detail, false);
      if (form.status === "Approved") u = applyTransition(u, "Sent");
      setForm(u); setDirty(false); if (onSave) onSave(u); setShowEmail(false);
    }} />;

  const statusStripEl = (
    <div className={pg.statusStripBar} style={{ background: lightTint }}>
      <div className={pg.flexBetweenMb6Alt}>
        <div className={pg.u58}>
          {availableTransitions.map(s => (
            <button key={s} onClick={() => handleTransition(s)} className={ORDER_STATUS_TRIGGERS[s] ? pg.transitionBtnAuto : pg.transitionBtnNormal}>
              {ORDER_STATUS_TRIGGERS[s] && <OrderIcon name="zap" size={10} />}{s}
            </button>
          ))}
          {availableTransitions.length === 0 && isTerminal && <span className={pg.fs11c94a3b8italic}>No further transitions</span>}
        </div>
        <DueDateChip dateStr={form.dueDate} isTerminal={isTerminal} />
      </div>
      <OrderProgressBar status={form.status} />
      <div className={pg.u60}>
        {ORDER_STATUSES.filter(s => s !== "Cancelled").map(s => (
          <span key={s} className={form.status === s ? pg.statusLabelActive : pg.statusLabelInactive}>{s}</span>
        ))}
      </div>
    </div>
  );

  const footerEl = <>
    <div className={pg.flexCenter}>
      <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
      <button className="btn btn-secondary btn-sm" onClick={() => printOrderPdf(type, form, jobs)}><OrderIcon name="file" size={14} /> PDF</button>
    </div>
    <div className={pg.flexCenter}>
      {mode === "edit" && dirty && <button className={`btn btn-primary ${pg.sectionAccentBtn}`} style={{ background: accent }} onClick={handleSave}>Save</button>}
      {mode === "edit" && !isNew && !dirty && <button className="btn btn-secondary" onClick={() => setMode("view")}>Done editing</button>}
      {mode === "view" && <button className={`btn btn-sm ${pg.bluePrimaryBtn}`} disabled={orderEmailSending} onClick={handleDirectSendOrder}><OrderIcon name="send" size={14} /> {orderEmailSending ? "Sending..." : `Email ${isWO ? "Contractor" : "Supplier"}`}</button>}
      {mode === "view" && <button className={`btn btn-primary ${pg.sectionAccentBtn}`} style={{ background: accent }} onClick={() => setShowEmail(true)}><OrderIcon name="mail" size={14} /> Draft Email</button>}
      {isNew && <button className={`btn btn-primary ${pg.sectionAccentBtn}`} style={{ background: accent }} onClick={handleSave}>Create {isWO ? "Work Order" : "Purchase Order"}</button>}
    </div>
  </>;

  return (<>
    <SectionDrawer
      accent={accent}
      icon={<OrderIcon name={isWO ? "briefcase" : "shopping"} size={16} />}
      typeLabel={isWO ? "Work Order" : "Purchase Order"}
      title={form.ref}
      statusBadge={<OrderStatusBadge status={form.status} />}
      mode={mode} setMode={setMode} isNew={isNew}
      statusStrip={statusStripEl}
      footer={footerEl}
      onClose={() => { if (!dirty) onClose(); }}
    >
      {mode === "view" ? (
        <div className={pg.u61}>
          {orderEmailStatus && <div className={orderEmailStatus.type === "success" ? pg.emailStatusSuccess : pg.emailStatusError}>{orderEmailStatus.msg}</div>}
          <div className="grid-2">
            <div>
              <div className="form-label">{isWO ? "Contractor" : "Supplier"}</div>
              <div className={pg.u62}>{partyName || <span className={pg.italicMuted}>None selected</span>}</div>
              {isWO ? <><div className={pg.fs13c64748b}>{form.contractorContact}</div><div className={pg.fs13c64748b}>{form.contractorEmail}</div><div className={pg.fs13c64748b}>{form.contractorPhone}</div></> :
                <><div className={pg.fs13c64748b}>{form.supplierContact}</div><div className={pg.fs13c64748b}>{form.supplierEmail}</div><div className={pg.textSubSm}>ABN: {form.supplierAbn}</div></>}
            </div>
            <div className={pg.u63}>
              <div><span className={pg.textSubSm}>Issue Date</span><div className={pg.fw500}>{orderFmtDate(form.issueDate)}</div></div>
              <div><span className={pg.textSubSm}>{isWO ? "Due Date" : "Delivery Date"}</span><div className={pg.fw500}>{orderFmtDate(form.dueDate)}</div></div>
              {jd && <div><span className={pg.textSubSm}>Linked Job</span><div className={pg.fw500}>{jd.ref} · {jd.name}</div></div>}
              {form.poLimit && <div><span className={pg.textSubSm}>PO Limit</span><div className={pg.u64}>${parseFloat(form.poLimit).toLocaleString("en-AU", { minimumFractionDigits: 2 })}</div></div>}
            </div>
          </div>
          {isWO && form.scopeOfWork && <div className={pg.tintBox} style={{ background: lightTint }}><div className="form-label" style={{ color: accent }}>Scope of Work</div><div className={pg.u66}>{form.scopeOfWork}</div></div>}
          {!isWO && form.deliveryAddress && <div className={pg.tintBox} style={{ background: lightTint }}><div className="form-label" style={{ color: accent }}>Delivery Address</div><div className={pg.fs13}>{form.deliveryAddress}</div></div>}
          {!isWO && form.lines && form.lines.length > 0 && (
            <table className={pg.u67}>
              <thead><tr className={pg.u68}><th className={pg.u69}>Description</th><th className={pg.p2_3}>Qty</th><th className={pg.p2_3}>Unit</th></tr></thead>
              <tbody>{form.lines.map(l => <tr key={l.id} className={pg.u70}><td className={pg.u71}>{l.desc || "—"}</td><td className={pg.u72}>{l.qty}</td><td className={pg.u73}>{l.unit}</td></tr>)}</tbody>
            </table>
          )}
          {form.notes && <div className={pg.borderTopPt16}><div className="form-label">Notes / Terms</div><div className={pg.u74}>{form.notes}</div></div>}
          {form.internalNotes && <div className={pg.u75}><div className={pg.u76}>Internal Notes</div><div className={pg.u77}>{form.internalNotes}</div></div>}
          {form.attachments && form.attachments.length > 0 && (
            <div className={pg.borderTopPt16}>
              <div className={`form-label ${pg.cardStatusRow}`}><OrderIcon name="paperclip" size={11} /> Attachments ({form.attachments.length})</div>
              <div className={pg.grid2colGap8}>
                {form.attachments.map(f => (
                  <div key={f.id} className={f.dataUrl ? pg.fileAttachRowClickable : pg.fileAttachRow}
                    onClick={() => f.dataUrl && setLightboxImg(f.dataUrl)}>
                    {f.dataUrl ? <img src={f.dataUrl} alt={f.name} className={pg.u78} /> : <FileIconBadge name={f.name} />}
                    <div className={pg.listItemMain}><div className={pg.u79}>{f.name}</div><div className={pg.u80}>{fmtFileSize(f.size)}</div></div>
                    {f.dataUrl && f.type?.startsWith("image/") && <button onClick={e => { e.stopPropagation(); setMarkupImg({ src: f.dataUrl, attachmentId: f.id }); }} className={pg.p2_1} title="Mark up">✏️</button>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className={pg.borderTopPt16}>
            <div className={`form-label ${pg.cardStatusRow}`}><OrderIcon name="activity" size={11} /> Activity Log</div>
            <OrderAuditLog log={form.auditLog} />
          </div>
        </div>
      ) : (
        <div className={pg.p2_2}>
          <div className="grid-2">
            <div className="form-group"><label className="form-label">{isWO ? "Contractor" : "Supplier"}</label><select className="form-control" value={partyId} onChange={e => selectParty(e.target.value)}><option value="">{"— Select " + (isWO ? "contractor" : "supplier") + " —"}</option>{parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Linked Job</label><select className="form-control" value={form.jobId} onChange={e => set("jobId", e.target.value ? Number(e.target.value) : "")}><option value="">— No linked job —</option>{jobs.map(j => { const d = orderJobDisplay(j); return <option key={j.id} value={j.id}>{d.ref + " · " + d.name}</option>; })}</select></div>
          </div>
          <div className="grid-2">
            <div className="form-group"><label className="form-label">Issue Date</label><input type="date" className="form-control" value={form.issueDate} onChange={e => set("issueDate", e.target.value)} /></div>
            <div className="form-group"><label className="form-label">{isWO ? "Due Date" : "Delivery Date"}</label><input type="date" className="form-control" value={form.dueDate} onChange={e => set("dueDate", e.target.value)} /></div>
          </div>
          {isWO && <div className="form-group"><label className="form-label">PO Limit (AUD)</label><div className={pg.posRel}><span className={pg.p2_4}>$</span><input type="number" min="0" step="0.01" className={`form-control ${pg.p2_5}`} placeholder="e.g. 5000.00" value={form.poLimit} onChange={e => set("poLimit", e.target.value)} /></div></div>}
          {isWO ? (
            <div className="form-group"><label className="form-label">Scope of Work</label><textarea rows={6} className={`form-control ${pg.heightAuto}`} placeholder="Describe the full scope of work..." value={form.scopeOfWork} onChange={e => set("scopeOfWork", e.target.value)} /></div>
          ) : (
            <>
              <div className="form-group"><label className="form-label">Delivery Address</label><input type="text" className="form-control" placeholder="Site or warehouse delivery address" value={form.deliveryAddress} onChange={e => set("deliveryAddress", e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Items to Order</label><OrderLineItems lines={form.lines} onChange={v => set("lines", v)} /></div>
              <div className="form-group"><label className="form-label">PO Limit (AUD)</label><div className={pg.posRel}><span className={pg.p2_4}>$</span><input type="number" min="0" step="0.01" className={`form-control ${pg.p2_5}`} placeholder="e.g. 5000.00" value={form.poLimit} onChange={e => set("poLimit", e.target.value)} /></div></div>
            </>
          )}
          <div className="grid-2">
            <div className="form-group"><label className="form-label">{isWO ? "Terms & Notes (visible to contractor)" : "Notes (visible to supplier)"}</label><textarea rows={3} className={`form-control ${pg.heightAuto}`} placeholder="Payment terms, special instructions..." value={form.notes} onChange={e => set("notes", e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Internal Notes</label><textarea rows={3} className={`form-control ${pg.heightAuto}`} placeholder="Not shown on document" value={form.internalNotes} onChange={e => set("internalNotes", e.target.value)} /></div>
          </div>
          <div className="form-group">
            <div className={pg.flexBetweenMb6Alt}>
              <label className={`form-label ${pg.u81}`}><OrderIcon name="paperclip" size={12} /> Attachments</label>
              <div className={pg.flexGap6}>
                <button type="button" className={`btn btn-sm ${pg.u82}`} onClick={() => orderPdfInputRef.current?.click()}>📄 Fill PDF</button>
                <input ref={orderPdfInputRef} type="file" accept=".pdf" className={pg.hidden} onChange={handleOrderPdfFile} />
                <button type="button" className={`btn btn-sm ${pg.u83}`} onClick={() => setShowPlanDrawing(true)}>📐 Draw Plan</button>
              </div>
            </div>
            <OrderFileAttachments files={form.attachments} onChange={updater => { setForm(f => ({ ...f, attachments: typeof updater === "function" ? updater(f.attachments) : updater })); setDirty(true); }}
              onMarkup={(src, attachmentId) => setMarkupImg({ src, attachmentId })}
              onLightbox={(src) => setLightboxImg(src)} />
          </div>
        </div>
      )}
    </SectionDrawer>

    {/* Lightbox */}
    {lightboxImg && (
      <div onClick={() => setLightboxImg(null)} className={pg.p2_6}>
        <img src={lightboxImg} alt="Attachment" className={pg.p2_7} />
        <button onClick={e => { e.stopPropagation(); setMarkupImg({ src: lightboxImg }); setLightboxImg(null); }}
          className={pg.p2_8}>
          ✏️ Mark Up Photo
        </button>
        <button onClick={() => setLightboxImg(null)} className={pg.p2_9}>✕</button>
      </div>
    )}

    {/* Photo Markup Editor */}
    {markupImg && (
      <PhotoMarkupEditor imageSrc={markupImg.src} onSave={saveOrderMarkup} onClose={() => setMarkupImg(null)} />
    )}

    {/* Plan Drawing Editor */}
    {showPlanDrawing && (
      <PlanDrawingEditor onSave={saveOrderPlan} onClose={() => setShowPlanDrawing(false)} />
    )}

    {/* PDF Form Filler */}
    {showOrderPdfFiller && (
      <PdfFormFiller
        pdfData={showOrderPdfFiller.pdfData}
        fileName={showOrderPdfFiller.fileName}
        onSave={handleOrderPdfSave}
        onClose={() => setShowOrderPdfFiller(null)}
      />
    )}
    </>
  );
};

// ── Orders: Order Card ────────────────────────────────────────────────────────
const OrderCard = ({ type, order, onOpen, onDelete, jobs }) => {
  const isWO = type === "wo";
  const jd = orderJobDisplay(jobs.find(j => j.id === order.jobId));
  const partyName = isWO ? order.contractorName : order.supplierName;
  const isTerminal = ORDER_TERMINAL.includes(order.status);
  const attachCount = (order.attachments || []).length;
  const hasPoLimit = order.poLimit && parseFloat(order.poLimit) > 0;
  return (
    <div className="order-card" onClick={() => onOpen(order)}>
      <div className={jb.gridCardTop}>
        <div className={pg.flexCenter}>
          <div className={isWO ? pg.orderIconBoxWo : pg.orderIconBoxPo}>
            <OrderIcon name={isWO ? "briefcase" : "shopping"} size={15} />
          </div>
          <div><div className={pg.textBold13}>{order.ref}</div><div className={pg.textSubSm}>{orderFmtDate(order.issueDate)}</div></div>
        </div>
        <div className={pg.cardStatusRow}>
          <OrderStatusBadge status={order.status} />
          {onDelete && <button onClick={e => { e.stopPropagation(); onDelete(order.id); }} className={pg.ghostBtn} title="Delete"><OrderIcon name="trash" size={13} /></button>}
        </div>
      </div>
      <div className={jb.gridCardClient}>
        {partyName || <span className={pg.italicMuted}>{"No " + (isWO ? "contractor" : "supplier")}</span>}
      </div>
      {jd && <div className={pg.u84}><OrderIcon name="link" size={10} /> {jd.ref + " · " + jd.name}</div>}
      <div className={jb.metaRow}>
        {hasPoLimit && <span className={pg.u85}>${parseFloat(order.poLimit).toLocaleString("en-AU")} limit</span>}
        {attachCount > 0 && <span className={pg.u86}><OrderIcon name="paperclip" size={10} /> {attachCount}</span>}
      </div>
      <OrderProgressBar status={order.status} />
      <div className={jb.gridCardFooter}>
        <DueDateChip dateStr={order.dueDate} isTerminal={isTerminal} />
        <span className={pg.u87}><OrderIcon name="eye" size={11} /> Open</span>
      </div>
    </div>
  );
};

// ── Orders: Dashboard ─────────────────────────────────────────────────────────
const OrdersDashboard = ({ workOrders, purchaseOrders, onView, onEdit, onStatusChange, jobs }) => {
  const [panel, setPanel] = useState(null);
  const [localWO, setLocalWO] = useState(workOrders);
  const [localPO, setLocalPO] = useState(purchaseOrders);
  if (localWO !== workOrders && JSON.stringify(localWO.map(o=>o.id+o.status)) !== JSON.stringify(workOrders.map(o=>o.id+o.status))) setLocalWO(workOrders);
  if (localPO !== purchaseOrders && JSON.stringify(localPO.map(o=>o.id+o.status)) !== JSON.stringify(purchaseOrders.map(o=>o.id+o.status))) setLocalPO(purchaseOrders);
  const allOrders = [...localWO.map(o => ({ ...o, _type: "wo" })), ...localPO.map(o => ({ ...o, _type: "po" }))];
  const now = orderToday();
  const overdue = allOrders.filter(o => !ORDER_TERMINAL.includes(o.status) && o.dueDate && o.dueDate < now).sort((a,b) => a.dueDate.localeCompare(b.dueDate));
  const dueSoon = allOrders.filter(o => !ORDER_TERMINAL.includes(o.status) && o.dueDate && o.dueDate >= now && daysUntil(o.dueDate) <= 7).sort((a,b) => a.dueDate.localeCompare(b.dueDate));
  const active = allOrders.filter(o => ORDER_ACTIVE.includes(o.status)).sort((a,b) => (a.dueDate||"").localeCompare(b.dueDate||""));
  const openList = allOrders.filter(o => !ORDER_TERMINAL.includes(o.status)).sort((a,b) => (a.dueDate||"9999").localeCompare(b.dueDate||"9999"));
  const openPanel = (label, orders) => setPanel({ label, orders });
  const handleDashTransition = (order, newStatus) => {
    const updated = applyTransition(order, newStatus);
    if (order._type === "wo") setLocalWO(prev => prev.map(o => o.id === updated.id ? updated : o));
    else setLocalPO(prev => prev.map(o => o.id === updated.id ? updated : o));
    onStatusChange(order._type, updated);
    setPanel(p => p ? { ...p, orders: p.orders.map(o => o.id === updated.id ? { ...updated, _type: order._type } : o) } : null);
  };
  const PanelRow = ({ order }) => {
    const isWO = order._type === "wo"; const jd = orderJobDisplay(jobs.find(j => j.id === order.jobId));
    const isTerminal = ORDER_TERMINAL.includes(order.status); const transitions = ORDER_TRANSITIONS[order.status] || [];
    const pName = isWO ? order.contractorName : order.supplierName;
    return (
      <div className={pg.u88}>
        <div className={pg.u89} onClick={() => onView(order._type, order)}>
          <div className={isWO ? pg.orderIconBoxWoShrink : pg.orderIconBoxPoShrink}>
            <OrderIcon name={isWO ? "briefcase" : "shopping"} size={14} />
          </div>
          <div className={pg.listItemMain}>
            <div className={pg.flexCenter}><span className={pg.fs13fw700}>{order.ref}</span><OrderStatusBadge status={order.status} /></div>
            <div className={pg.u90}>{pName || <span className={pg.u91}>No party</span>}</div>
            {jd && <div className={pg.u92}><OrderIcon name="link" size={9} />{jd.ref} · {jd.name}</div>}
          </div>
          <div className={pg.u93}>
            <DueDateChip dateStr={order.dueDate} isTerminal={isTerminal} />
            {order.poLimit && <span className={pg.u94}>${parseFloat(order.poLimit).toLocaleString("en-AU")}</span>}
          </div>
        </div>
        {!isTerminal && transitions.length > 0 && (
          <div className={pg.u95}>
            <span className={pg.u96}>Move to:</span>
            {transitions.map(s => (
              <button key={s} onClick={e => { e.stopPropagation(); handleDashTransition(order, s); }} className={ORDER_STATUS_TRIGGERS[s] ? pg.transitionBtnDashAuto : pg.transitionBtnDashNormal}>
                {ORDER_STATUS_TRIGGERS[s] && <OrderIcon name="zap" size={9} />}{s}
              </button>
            ))}
            <button onClick={e => { e.stopPropagation(); onEdit(order._type, order); }} className={pg.u98}><OrderIcon name="edit" size={11} /> Edit</button>
          </div>
        )}
      </div>
    );
  };
  const DashRow = ({ order }) => {
    const isWO = order._type === "wo"; const jd = orderJobDisplay(jobs.find(j => j.id === order.jobId));
    const isTerminal = ORDER_TERMINAL.includes(order.status);
    return (
      <div className={pg.u99} onClick={() => onView(order._type, order)}>
        <div className={isWO ? pg.orderIconBox24Wo : pg.orderIconBox24Po}><OrderIcon name={isWO ? "briefcase" : "shopping"} size={12} /></div>
        <div className={pg.listItemMain}>
          <div className={pg.cardStatusRow}><span className={pg.fs13fw600}>{order.ref}</span><OrderStatusBadge status={order.status} /></div>
          <div className={pg.u100}>{(isWO ? order.contractorName : order.supplierName) || "—"}{jd ? " · " + jd.ref : ""}</div>
        </div>
        <DueDateChip dateStr={order.dueDate} isTerminal={isTerminal} />
      </div>
    );
  };
  const StatusPipeline = ({ title, pipelineOrders, pType }) => {
    const isWO = pType === "wo";
    return (
      <div className="card"><div className="card-body">
        <h3 className={pg.u101}>
          <div className={isWO ? pg.orderIconBox20Wo : pg.orderIconBox20Po}><OrderIcon name={isWO ? "briefcase" : "shopping"} size={11} cls="" /></div>
          {title}
        </h3>
        <div className={pg.flexColGap8}>
          {ORDER_STATUSES.filter(s => s !== "Cancelled").map(s => {
            const matched = pipelineOrders.filter(o => o.status === s);
            const count = matched.length; const pct = pipelineOrders.length > 0 ? (count / pipelineOrders.length) * 100 : 0;
            return (
              <div key={s} className={count > 0 ? pg.pipelineStatusRowActive : pg.pipelineStatusRowEmpty} onClick={() => count > 0 && openPanel(s + " — " + title, matched.map(o => ({ ...o, _type: pType })))}>
                <span className={pg.u103}>{s}</span>
                <div className={pg.u104}><div style={{ height: "100%", borderRadius: 999, background: ORDER_BAR_COLORS[s], width: `${pct}%` }} /></div>
                <span className={count > 0 ? pg.pipelineCountActive : pg.pipelineCountZero}>{count}</span>
              </div>
            );
          })}
        </div>
      </div></div>
    );
  };
  const kpis = [
    { label: "Overdue", value: overdue.length, sub: "need attention", highlight: overdue.length > 0, borderColor: overdue.length > 0 ? "#fecaca" : "#e8e8e8", bg: overdue.length > 0 ? "#fef2f2" : "#fff", textColor: overdue.length > 0 ? "#dc2626" : "#111", orders: overdue },
    { label: "Due This Week", value: dueSoon.length, sub: "upcoming", highlight: dueSoon.length > 0, borderColor: dueSoon.length > 0 ? "#fed7aa" : "#e8e8e8", bg: dueSoon.length > 0 ? "#fff7ed" : "#fff", textColor: dueSoon.length > 0 ? "#ea580c" : "#111", orders: dueSoon },
    { label: "Active", value: active.length, sub: "in progress", highlight: false, borderColor: "#e8e8e8", bg: "#fff", textColor: "#2563eb", orders: active },
    { label: "All Open", value: openList.length, sub: localWO.length + " WO · " + localPO.length + " PO", highlight: false, borderColor: "#e8e8e8", bg: "#fff", textColor: "#111", orders: openList },
  ];
  return (
    <div className={pg.u107}>
      <div className="order-kpi-grid">
        {kpis.map(k => (
          <div key={k.label} className="order-kpi-card" style={{ border: `1px solid ${k.borderColor}`, background: k.bg, cursor: "pointer" }} onClick={() => openPanel(k.label, k.orders)}>
            <div className={pg.fs10fw700label94noMb}>{k.label}</div>
            <div className={pg.kpiValueBig} style={{ color: k.textColor }}>{k.value}</div>
            <div className={pg.fs11c94a3b8mt2}>{k.sub}</div>
          </div>
        ))}
      </div>
      <div className="grid-2">
        <StatusPipeline title="Work Orders" pipelineOrders={localWO} pType="wo" />
        <StatusPipeline title="Purchase Orders" pipelineOrders={localPO} pType="po" />
      </div>
      <div className={pg.gridAutoFit280}>
        {[
          { title: "Overdue", icon: "warning", iconBg: "#fef2f2", iconColor: "#dc2626", borderColor: "#fecaca", orders: overdue, empty: "No overdue orders" },
          { title: "Due This Week", icon: "clock", iconBg: "#fff7ed", iconColor: "#ea580c", borderColor: "#fed7aa", orders: dueSoon, empty: "Nothing due in 7 days" },
          { title: "Active Orders", icon: "bar", iconBg: "#eff6ff", iconColor: "#2563eb", borderColor: "#e8e8e8", orders: active, empty: "No active orders" },
        ].map(({ title, icon, iconBg, iconColor, borderColor, orders, empty }) => (
          <div key={title} className="card" style={{ borderColor }}>
            <div className="card-header" style={{ cursor: orders.length > 0 ? "pointer" : "default" }} onClick={() => orders.length > 0 && openPanel(title, orders)}>
              <div className={pg.flexCenter}>
                <div className={pg.u110}><OrderIcon name={icon} size={13} cls="" className={pg.u111} /></div>
                <span className="card-title">{title}</span>
                {orders.length > 0 && <span className={pg.orderCountPill} style={{ background: iconColor }}>{orders.length}</span>}
              </div>
            </div>
            <div className="card-body">
              {orders.length === 0 ? <div className={pg.u112}>{empty}</div>
                : <>{orders.slice(0, 5).map(o => <DashRow key={o.id} order={o} />)}{orders.length > 5 && <div className={pg.u113} onClick={() => openPanel(title, orders)}>+{orders.length - 5} more</div>}</>}
            </div>
          </div>
        ))}
      </div>
      {/* Side Panel */}
      {panel && (
        <div className="order-panel">
          <div className="order-panel-backdrop" onClick={() => setPanel(null)} />
          <div className="order-panel-body">
            <div className={pg.u114}>
              <div><div className={pg.fs10fw700label94noMb}>Dashboard</div><div className={pg.fw700fs15}>{panel.label}</div><div className={pg.fs11c94a3b8mt2}>{panel.orders.length} order{panel.orders.length !== 1 ? "s" : ""}</div></div>
              <button onClick={() => setPanel(null)} className={pg.u115}><OrderIcon name="x" size={16} /></button>
            </div>
            <div className={pg.u116}>
              {panel.orders.length === 0 ? <div className={pg.u117}>No orders in this view</div>
                : panel.orders.map(o => <PanelRow key={o.id + o.status} order={o} />)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════

// ── Section Label ─────────────────────────────────────────────────────────────
const SectionLabel = ({ children }) => (
  <div className={pg.u167}>{children}</div>
);

// ── Photo Markup Editor (fabric.js) ───────────────────────────────────────────
const MARKUP_COLORS = ["#dc2626", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ffffff", "#000000"];
const PhotoMarkupEditor = ({ imageSrc, onSave, onClose }) => {
  const canvasRef = useRef(null);
  const fabricRef = useRef(null);
  const containerRef = useRef(null);
  const fabricModRef = useRef(null);
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("#dc2626");
  const [brushSize, setBrushSize] = useState(3);
  const [fabricLoaded, setFabricLoaded] = useState(false);

  useEffect(() => {
    let disposed = false;
    import("fabric").then((mod) => {
      if (disposed) return;
      fabricModRef.current = mod;
      setFabricLoaded(true);
    });
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    if (!fabricLoaded || !canvasRef.current || fabricRef.current) return;
    const fb = fabricModRef.current;
    const cvs = new fb.Canvas(canvasRef.current, { isDrawingMode: true, selection: true });
    fabricRef.current = cvs;

    // Load the background image
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const container = containerRef.current;
      const maxW = container ? container.clientWidth - 40 : 800;
      const maxH = (window.innerHeight * 0.65);
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      cvs.setDimensions({ width: w, height: h });
      const bgImg = new fb.FabricImage(img, { scaleX: scale, scaleY: scale });
      cvs.backgroundImage = bgImg;
      cvs.renderAll();
    };
    img.src = imageSrc;

    cvs.freeDrawingBrush = new fb.PencilBrush(cvs);
    cvs.freeDrawingBrush.color = color;
    cvs.freeDrawingBrush.width = brushSize;

    return () => { cvs.dispose(); fabricRef.current = null; };
  }, [imageSrc, fabricLoaded]);

  useEffect(() => {
    const cvs = fabricRef.current;
    if (!cvs) return;
    if (tool === "pen") {
      cvs.isDrawingMode = true;
      cvs.freeDrawingBrush = new (fabricModRef.current.PencilBrush)(cvs);
      cvs.freeDrawingBrush.color = color;
      cvs.freeDrawingBrush.width = brushSize;
    } else {
      cvs.isDrawingMode = false;
    }
  }, [tool, color, brushSize]);

  const addArrow = () => {
    const cvs = fabricRef.current; const fb = fabricModRef.current; if (!cvs || !fb) return;
    setTool("select");
    const line = new fb.Line([50, 100, 200, 100], { stroke: color, strokeWidth: brushSize, selectable: true });
    const head = new fb.Triangle({ width: 14, height: 14, fill: color, left: 200, top: 100, angle: 90, originX: "center", originY: "center", selectable: false });
    const group = new fb.Group([line, head], { left: 50, top: 80 });
    cvs.add(group);
    cvs.setActiveObject(group);
    cvs.renderAll();
  };

  const addRect = () => {
    const cvs = fabricRef.current; const fb = fabricModRef.current; if (!cvs || !fb) return;
    setTool("select");
    const rect = new fb.Rect({ left: 60, top: 60, width: 150, height: 100, fill: "transparent", stroke: color, strokeWidth: brushSize, rx: 4, ry: 4 });
    cvs.add(rect);
    cvs.setActiveObject(rect);
    cvs.renderAll();
  };

  const addCircle = () => {
    const cvs = fabricRef.current; const fb = fabricModRef.current; if (!cvs || !fb) return;
    setTool("select");
    const circle = new fb.Circle({ left: 80, top: 80, radius: 50, fill: "transparent", stroke: color, strokeWidth: brushSize });
    cvs.add(circle);
    cvs.setActiveObject(circle);
    cvs.renderAll();
  };

  const addText = () => {
    const cvs = fabricRef.current; const fb = fabricModRef.current; if (!cvs || !fb) return;
    setTool("select");
    const text = new fb.IText("Note", { left: 60, top: 60, fontSize: 20, fontFamily: "Open Sans, sans-serif", fontWeight: "700", fill: color, editable: true });
    cvs.add(text);
    cvs.setActiveObject(text);
    cvs.renderAll();
  };

  const deleteSelected = () => {
    const cvs = fabricRef.current; if (!cvs) return;
    const active = cvs.getActiveObjects();
    if (active.length) { active.forEach(o => cvs.remove(o)); cvs.discardActiveObject(); cvs.renderAll(); }
  };

  const clearAll = () => {
    const cvs = fabricRef.current; if (!cvs) return;
    const objs = cvs.getObjects();
    objs.forEach(o => cvs.remove(o));
    cvs.renderAll();
  };

  const handleSave = () => {
    const cvs = fabricRef.current; if (!cvs) return;
    cvs.discardActiveObject();
    cvs.renderAll();
    const dataUrl = cvs.toDataURL({ format: "png", quality: 0.92, multiplier: 2 });
    onSave(dataUrl);
  };

  const tools = [
    { id: "pen", icon: "✏️", label: "Draw" },
    { id: "arrow", icon: "➡️", label: "Arrow", action: addArrow },
    { id: "rect", icon: "▢", label: "Rectangle", action: addRect },
    { id: "circle", icon: "◯", label: "Circle", action: addCircle },
    { id: "text", icon: "T", label: "Text", action: addText },
    { id: "select", icon: "☝️", label: "Select" },
  ];

  return (
    <div className={pg.u168}>
      {/* Toolbar */}
      <div className={pg.u169}>
        {tools.map(t => (
          <button key={t.id} onClick={() => { if (t.action) t.action(); else setTool(t.id); }}
            className={tool === t.id ? pg.markupToolBtnActive : pg.markupToolBtn}>
            <span className={pg.u170}>{t.icon}</span> {t.label}
          </button>
        ))}
        <div className={pg.vertDivider} />
        <button onClick={deleteSelected} className={pg.u171} title="Delete selected">🗑 Delete</button>
        <button onClick={clearAll} className={pg.u172} title="Clear all markups">✕ Clear</button>
        <div className={pg.vertDivider} />
        {/* Brush size */}
        <div className={pg.cardStatusRow}>
          <span className={pg.u173}>Size</span>
          <input type="range" min="1" max="12" value={brushSize} onChange={e => setBrushSize(Number(e.target.value))} style={{ width: 70, accentColor: color }} />
        </div>
        <div className={pg.vertDivider} />
        {/* Colors */}
        <div className={pg.flexGap3}>
          {MARKUP_COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)}
              className={color === c ? pg.markupColorSwatchActive : pg.markupColorSwatch}
              style={{ background: c, border: color !== c ? `2px solid ${c === "#ffffff" ? "#666" : "transparent"}` : undefined }} />
          ))}
        </div>
      </div>

      {/* Canvas area */}
      <div ref={containerRef} className={pg.u175}>
        <div className={pg.u176}>
          <canvas ref={canvasRef} />
        </div>
      </div>

      {/* Bottom bar */}
      <div className={pg.u177}>
        <button onClick={onClose} className={pg.p2_12}>Cancel</button>
        <button onClick={handleSave} className={pg.p2_13}>💾 Save Markup</button>
      </div>
    </div>
  );
};

// ── Plan Drawing Editor (fabric.js) ───────────────────────────────────────────
const PLAN_GRID_SIZE = 20;
const PLAN_COLORS = ["#111111", "#dc2626", "#2563eb", "#059669", "#d97706", "#8b5cf6", "#0891b2", "#94a3b8"];
const PLAN_LINE_WIDTHS = [1, 2, 3, 5, 8];

const PlanDrawingEditor = ({ onSave, onClose, existingSrc }) => {
  const canvasRef = useRef(null);
  const fabricRef = useRef(null);
  const fabricModRef = useRef(null);
  const containerRef = useRef(null);
  const [tool, setTool] = useState("line");
  const [color, setColor] = useState("#111111");
  const [lineWidth, setLineWidth] = useState(2);
  const [snapGrid, setSnapGrid] = useState(true);
  const [snapEndpoints, setSnapEndpoints] = useState(true);
  const [showLengths, setShowLengths] = useState(true);
  const [constrainAngle, setConstrainAngle] = useState(false);
  const [angleStep, setAngleStep] = useState(45);
  const [scale, setScale] = useState(100); // pixels per metre (displayed as mm)
  const [cursorInfo, setCursorInfo] = useState(null); // { angle, length, x, y }
  const drawStateRef = useRef(null); // { startX, startY, tempLine }
  const labelGroupsRef = useRef([]); // track measurement labels
  const [fabricLoaded, setFabricLoaded] = useState(false);

  useEffect(() => {
    let disposed = false;
    import("fabric").then((mod) => {
      if (disposed) return;
      fabricModRef.current = mod;
      setFabricLoaded(true);
    });
    return () => { disposed = true; };
  }, []);

  // Initialize canvas
  useEffect(() => {
    if (!fabricLoaded || !canvasRef.current || fabricRef.current) return;
    const fb = fabricModRef.current;
    const container = containerRef.current;
    const w = container ? container.clientWidth - 40 : 1200;
    const h = window.innerHeight * 0.72;
    const cvs = new fb.Canvas(canvasRef.current, {
      width: w, height: h, selection: true, isDrawingMode: false,
      backgroundColor: "#ffffff"
    });
    fabricRef.current = cvs;

    // Draw grid
    drawGrid(cvs, w, h);

    // Load existing plan if editing
    if (existingSrc) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const scaleF = Math.min(w / img.width, h / img.height, 1);
        const bgImg = new fb.FabricImage(img, { scaleX: scaleF, scaleY: scaleF });
        cvs.backgroundImage = bgImg;
        drawGrid(cvs, w, h);
        cvs.renderAll();
      };
      img.src = existingSrc;
    }

    // Line drawing handlers
    cvs.on("mouse:down", (opt) => {
      if (cvs.__activeTool !== "line" && cvs.__activeTool !== "wall") return;
      if (cvs.getActiveObject()) return;
      const pointer = cvs.getScenePoint(opt.e);
      let sx = pointer.x, sy = pointer.y;
      if (cvs.__snapGrid) { sx = Math.round(sx / PLAN_GRID_SIZE) * PLAN_GRID_SIZE; sy = Math.round(sy / PLAN_GRID_SIZE) * PLAN_GRID_SIZE; }
      if (cvs.__snapEndpoints) { const sn = findNearestEndpoint(cvs, sx, sy, 12); if (sn) { sx = sn.x; sy = sn.y; } }
      const isWall = cvs.__activeTool === "wall";
      const tempLine = new fb.Line([sx, sy, sx, sy], {
        stroke: cvs.__activeColor || "#111", strokeWidth: isWall ? Math.max((cvs.__lineWidth || 2) * 2, 6) : (cvs.__lineWidth || 2),
        selectable: false, evented: false, _isPlanLine: true, _isWall: isWall
      });
      cvs.add(tempLine);
      drawStateRef.current = { startX: sx, startY: sy, tempLine };
    });

    cvs.on("mouse:move", (opt) => {
      const ds = drawStateRef.current;
      if (!ds) {
        // Show cursor info for snapping
        const pointer = cvs.getScenePoint(opt.e);
        let cx = pointer.x, cy = pointer.y;
        if (cvs.__snapGrid) { cx = Math.round(cx / PLAN_GRID_SIZE) * PLAN_GRID_SIZE; cy = Math.round(cy / PLAN_GRID_SIZE) * PLAN_GRID_SIZE; }
        if (cvs.__snapEndpoints) { const sn = findNearestEndpoint(cvs, cx, cy, 12); if (sn) { cx = sn.x; cy = sn.y; } }
        return;
      }
      const pointer = cvs.getScenePoint(opt.e);
      let ex = pointer.x, ey = pointer.y;
      if (cvs.__snapGrid) { ex = Math.round(ex / PLAN_GRID_SIZE) * PLAN_GRID_SIZE; ey = Math.round(ey / PLAN_GRID_SIZE) * PLAN_GRID_SIZE; }
      if (cvs.__snapEndpoints) { const sn = findNearestEndpoint(cvs, ex, ey, 12, ds.tempLine); if (sn) { ex = sn.x; ey = sn.y; } }
      if (cvs.__constrainAngle) {
        const constrained = constrainToAngle(ds.startX, ds.startY, ex, ey, cvs.__angleStep || 45);
        ex = constrained.x; ey = constrained.y;
      }
      ds.tempLine.set({ x2: ex, y2: ey });
      cvs.renderAll();
      // Compute and display info
      const dx = ex - ds.startX, dy = ey - ds.startY;
      const lengthPx = Math.sqrt(dx * dx + dy * dy);
      const lengthMm = (lengthPx / (cvs.__scale || 50)) * 1000;
      let angle = Math.atan2(-dy, dx) * (180 / Math.PI);
      if (angle < 0) angle += 360;
      setCursorInfo({ angle: Math.round(angle), length: Math.round(lengthMm), x: Math.round(ex), y: Math.round(ey) });
    });

    cvs.on("mouse:up", () => {
      const ds = drawStateRef.current;
      if (!ds) return;
      drawStateRef.current = null;
      const line = ds.tempLine;
      const x1 = line.x1, y1 = line.y1, x2 = line.x2, y2 = line.y2;
      const dx = x2 - x1, dy = y2 - y1;
      const lengthPx = Math.sqrt(dx * dx + dy * dy);
      if (lengthPx < 3) { cvs.remove(line); setCursorInfo(null); cvs.renderAll(); return; }
      line.set({ selectable: true, evented: true, hasControls: true, hasBorders: true });
      // Add endpoint circles
      const dotOpts = { radius: 3, fill: cvs.__activeColor || "#111", stroke: "#fff", strokeWidth: 1, selectable: false, evented: false, _isPlanDot: true, _parentLine: line };
      const dot1 = new fb.Circle({ ...dotOpts, left: x1 - 3, top: y1 - 3 });
      const dot2 = new fb.Circle({ ...dotOpts, left: x2 - 3, top: y2 - 3 });
      cvs.add(dot1, dot2);
      // Add length label
      if (cvs.__showLengths) {
        const lengthMm = Math.round((lengthPx / (cvs.__scale || 50)) * 1000);
        const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
        let angle = Math.atan2(dy, dx) * (180 / Math.PI);
        const labelText = new fb.FabricText(lengthMm + "mm", {
          left: midX, top: midY - 12, fontSize: 11, fontFamily: "'Open Sans', monospace",
          fill: "#555", fontWeight: "600", originX: "center", originY: "center",
          selectable: false, evented: false, _isPlanLabel: true, _parentLine: line,
          angle: (angle > 90 || angle < -90) ? angle + 180 : angle
        });
        const labelBg = new fb.Rect({
          left: midX, top: midY - 12, width: labelText.width + 8, height: 16,
          fill: "rgba(255,255,255,0.88)", rx: 3, ry: 3, originX: "center", originY: "center",
          selectable: false, evented: false, _isPlanLabel: true, _parentLine: line,
          angle: (angle > 90 || angle < -90) ? angle + 180 : angle
        });
        cvs.add(labelBg, labelText);
        labelGroupsRef.current.push({ line, bg: labelBg, text: labelText, dot1, dot2 });
      }
      setCursorInfo(null);
      cvs.renderAll();
    });

    return () => { cvs.dispose(); fabricRef.current = null; };
  }, [existingSrc, fabricLoaded]);

  // Sync tool options to canvas
  useEffect(() => {
    const cvs = fabricRef.current; if (!cvs) return;
    cvs.__activeTool = tool;
    cvs.__activeColor = color;
    cvs.__lineWidth = lineWidth;
    cvs.__snapGrid = snapGrid;
    cvs.__snapEndpoints = snapEndpoints;
    cvs.__showLengths = showLengths;
    cvs.__constrainAngle = constrainAngle;
    cvs.__angleStep = angleStep;
    cvs.__scale = scale;

    if (tool === "pen") {
      cvs.isDrawingMode = true;
      cvs.freeDrawingBrush = new (fabricModRef.current.PencilBrush)(cvs);
      cvs.freeDrawingBrush.color = color;
      cvs.freeDrawingBrush.width = lineWidth;
    } else {
      cvs.isDrawingMode = false;
    }
    if (tool === "select") {
      cvs.selection = true;
      cvs.forEachObject(o => { if (!o._isPlanDot && !o._isPlanLabel && !o._isGrid) { o.selectable = true; o.evented = true; } });
    } else if (tool !== "pen") {
      cvs.selection = false;
      cvs.discardActiveObject();
    }
    cvs.renderAll();
  }, [tool, color, lineWidth, snapGrid, snapEndpoints, showLengths, constrainAngle, angleStep, scale]);

  const drawGrid = (cvs, w, h) => {
    const fb = fabricModRef.current; if (!fb) return;
    // Remove old grid
    cvs.getObjects().filter(o => o._isGrid).forEach(o => cvs.remove(o));
    for (let x = 0; x <= w; x += PLAN_GRID_SIZE) {
      const isMajor = x % (PLAN_GRID_SIZE * 5) === 0;
      cvs.add(new fb.Line([x, 0, x, h], { stroke: isMajor ? "#d4d4d4" : "#ececec", strokeWidth: isMajor ? 0.8 : 0.4, selectable: false, evented: false, _isGrid: true }));
    }
    for (let y = 0; y <= h; y += PLAN_GRID_SIZE) {
      const isMajor = y % (PLAN_GRID_SIZE * 5) === 0;
      cvs.add(new fb.Line([0, y, w, y], { stroke: isMajor ? "#d4d4d4" : "#ececec", strokeWidth: isMajor ? 0.8 : 0.4, selectable: false, evented: false, _isGrid: true }));
    }
    // Send grid to back
    cvs.getObjects().filter(o => o._isGrid).forEach(o => cvs.sendObjectToBack(o));
    cvs.renderAll();
  };

  const findNearestEndpoint = (cvs, x, y, threshold, exclude) => {
    let nearest = null, minDist = threshold;
    cvs.getObjects().forEach(obj => {
      if (obj === exclude || obj._isGrid || obj._isPlanLabel) return;
      if (obj._isPlanLine || obj._isWall) {
        [[obj.x1, obj.y1], [obj.x2, obj.y2]].forEach(([px, py]) => {
          const d = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
          if (d < minDist) { minDist = d; nearest = { x: px, y: py }; }
        });
      } else if (obj._isPlanDot) {
        const cx = obj.left + 3, cy = obj.top + 3;
        const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (d < minDist) { minDist = d; nearest = { x: cx, y: cy }; }
      }
    });
    return nearest;
  };

  const constrainToAngle = (x1, y1, x2, y2, step) => {
    const dx = x2 - x1, dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    let angle = Math.atan2(dy, dx) * (180 / Math.PI);
    angle = Math.round(angle / step) * step;
    const rad = angle * (Math.PI / 180);
    return { x: x1 + length * Math.cos(rad), y: y1 + length * Math.sin(rad) };
  };

  const addRect = () => {
    const cvs = fabricRef.current; const fb = fabricModRef.current; if (!cvs || !fb) return;
    setTool("select");
    const rect = new fb.Rect({ left: 100, top: 100, width: 200, height: 150, fill: "transparent", stroke: color, strokeWidth: lineWidth, rx: 0, ry: 0 });
    cvs.add(rect); cvs.setActiveObject(rect); cvs.renderAll();
  };

  const addText = () => {
    const cvs = fabricRef.current; const fb = fabricModRef.current; if (!cvs || !fb) return;
    setTool("select");
    const text = new fb.IText("Label", { left: 100, top: 100, fontSize: 16, fontFamily: "'Open Sans', sans-serif", fontWeight: "600", fill: color, editable: true });
    cvs.add(text); cvs.setActiveObject(text); cvs.renderAll();
  };

  const addDimension = () => {
    const cvs = fabricRef.current; const fb = fabricModRef.current; if (!cvs || !fb) return;
    setTool("select");
    const x1 = 100, y1 = 200, x2 = 300, y2 = 200;
    const mainLine = new fb.Line([x1, y1, x2, y2], { stroke: "#555", strokeWidth: 1, strokeDashArray: [4, 3], _isDimension: true });
    const tick1 = new fb.Line([x1, y1 - 6, x1, y1 + 6], { stroke: "#555", strokeWidth: 1 });
    const tick2 = new fb.Line([x2, y2 - 6, x2, y2 + 6], { stroke: "#555", strokeWidth: 1 });
    const lengthMm = Math.round((Math.abs(x2 - x1) / scale) * 1000);
    const label = new fb.FabricText(lengthMm + "mm", { left: (x1 + x2) / 2, top: y1 - 14, fontSize: 12, fill: "#555", fontWeight: "600", fontFamily: "monospace", originX: "center" });
    const group = new fb.Group([mainLine, tick1, tick2, label], { left: x1, top: y1 - 14 });
    cvs.add(group); cvs.setActiveObject(group); cvs.renderAll();
  };

  const deleteSelected = () => {
    const cvs = fabricRef.current; if (!cvs) return;
    const active = cvs.getActiveObjects();
    if (active.length) {
      active.forEach(obj => {
        // Also remove associated dots & labels
        const associated = labelGroupsRef.current.filter(g => g.line === obj);
        associated.forEach(g => { cvs.remove(g.bg); cvs.remove(g.text); cvs.remove(g.dot1); cvs.remove(g.dot2); });
        labelGroupsRef.current = labelGroupsRef.current.filter(g => g.line !== obj);
        cvs.remove(obj);
      });
      cvs.discardActiveObject(); cvs.renderAll();
    }
  };

  const clearAll = () => {
    const cvs = fabricRef.current; if (!cvs) return;
    cvs.getObjects().filter(o => !o._isGrid).forEach(o => cvs.remove(o));
    labelGroupsRef.current = [];
    cvs.renderAll();
  };

  const handleSave = () => {
    const cvs = fabricRef.current; if (!cvs) return;
    cvs.discardActiveObject();
    // Temporarily hide grid for export
    cvs.getObjects().filter(o => o._isGrid).forEach(o => o.set({ visible: false }));
    cvs.renderAll();
    const dataUrl = cvs.toDataURL({ format: "png", quality: 0.95, multiplier: 2 });
    cvs.getObjects().filter(o => o._isGrid).forEach(o => o.set({ visible: true }));
    cvs.renderAll();
    onSave(dataUrl);
  };

  const tools = [
    { id: "line", icon: "╱", label: "Line" },
    { id: "wall", icon: "▬", label: "Wall" },
    { id: "rect", icon: "▢", label: "Room", action: addRect },
    { id: "pen", icon: "✏️", label: "Freehand" },
    { id: "text", icon: "T", label: "Label", action: addText },
    { id: "dimension", icon: "↔", label: "Dimension", action: addDimension },
    { id: "select", icon: "☝️", label: "Select" },
  ];

  const planBtnClass = (active) => active ? pg.planToolBtnActive : pg.planToolBtn;
  const toggleClass = (on) => on ? pg.planToggleOn : pg.planToggleOff;

  return (
    <div className={pg.u178}>
      {/* Top Toolbar */}
      <div className={pg.u179}>
        {tools.map(t => (
          <button key={t.id} onClick={() => { if (t.action) t.action(); else setTool(t.id); }} className={planBtnClass(tool === t.id)}>
            <span className={pg.fs14}>{t.icon}</span> {t.label}
          </button>
        ))}
        <div className={pg.vertDividerSm} />
        <button onClick={deleteSelected} className={pg.planToolBtnDanger}>🗑</button>
        <button onClick={clearAll} className={pg.planToolBtnWarn}>✕ Clear</button>
        <div className={pg.vertDividerSm} />
        {/* Line width */}
        <div className={pg.p2_14}>
          <span className={pg.u180}>Width</span>
          {PLAN_LINE_WIDTHS.map(w => (
            <button key={w} onClick={() => setLineWidth(w)}
              className={lineWidth === w ? pg.planLineWidthBtnActive : pg.planLineWidthBtnInactive}>
              <div className={pg.planLineWidthIndicator} style={{ width: Math.min(w * 2, 14), height: Math.min(w, 8) }} />
            </button>
          ))}
        </div>
        <div className={pg.vertDividerSm} />
        {/* Colors */}
        <div className={pg.flexGap3}>
          {PLAN_COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)}
              className={color === c ? pg.planColorSwatchActive : pg.planColorSwatch}
              style={{ background: c, border: color !== c ? `1px solid ${c === "#111111" ? "#666" : "transparent"}` : undefined }} />
          ))}
        </div>
      </div>

      {/* Snap/Options Bar */}
      <div className={pg.u181}>
        <button onClick={() => setSnapGrid(v => !v)} className={toggleClass(snapGrid)}>⊞ Snap Grid</button>
        <button onClick={() => setSnapEndpoints(v => !v)} className={toggleClass(snapEndpoints)}>⊙ Snap Endpoints</button>
        <button onClick={() => setShowLengths(v => !v)} className={toggleClass(showLengths)}>📏 Show Lengths</button>
        <button onClick={() => setConstrainAngle(v => !v)} className={toggleClass(constrainAngle)}>📐 Constrain Angle</button>
        {constrainAngle && (
          <select value={angleStep} onChange={e => setAngleStep(Number(e.target.value))} className={pg.p2_15}>
            <option value={15}>15°</option>
            <option value={30}>30°</option>
            <option value={45}>45°</option>
            <option value={90}>90°</option>
          </select>
        )}
        <div className={pg.p2_16} />
        <span className={pg.u182}>Scale:</span>
        <select value={scale} onChange={e => setScale(Number(e.target.value))} className={pg.p2_15}>
          <option value={100}>100mm = 10px</option>
          <option value={250}>100mm = 25px</option>
          <option value={500}>100mm = 50px</option>
          <option value={1000}>100mm = 100px</option>
        </select>
        {cursorInfo && (
          <>
            <div className={pg.p2_16} />
            <span className={pg.u183}>
              {cursorInfo.length}mm &nbsp; {cursorInfo.angle}°
            </span>
          </>
        )}
      </div>

      {/* Canvas */}
      <div ref={containerRef} className={pg.u184}>
        <div className={pg.u185}>
          <canvas ref={canvasRef} />
        </div>
      </div>

      {/* Bottom bar */}
      <div className={pg.u186}>
        <button onClick={onClose} className={pg.p2_12}>Cancel</button>
        <button onClick={handleSave} className={pg.p2_13}>💾 Save Plan</button>
      </div>
    </div>
  );
};

// ── Job Detail Drawer ─────────────────────────────────────────────────────────
const JobDetail = ({ job, clients, quotes, setQuotes, invoices, setInvoices, timeEntries, setTimeEntries, bills, setBills, schedule, setSchedule, jobs, setJobs, staff, workOrders, setWorkOrders, purchaseOrders, setPurchaseOrders, onClose, onEdit }) => {
  const [tab, setTab] = useState("overview");
  const [detailMode, setDetailMode] = useState("view");
  const [detailForm, setDetailForm] = useState({ title: job.title, clientId: job.clientId, siteId: job.siteId || null, status: job.status, priority: job.priority, description: job.description || "", startDate: job.startDate || "", dueDate: job.dueDate || "", assignedTo: job.assignedTo || [], tags: (job.tags || []).join(", "), estimate: job.estimate || { labour: 0, materials: 0, subcontractors: 0, other: 0 } });
  const client = clients.find(c => c.id === job.clientId);

  const jobQuotes    = quotes.filter(q => q.jobId === job.id);
  const jobInvoices  = invoices.filter(i => i.jobId === job.id);
  const jobTime      = timeEntries.filter(t => t.jobId === job.id);
  const jobBills     = bills.filter(b => b.jobId === job.id);
  const jobSchedule  = schedule.filter(s => s.jobId === job.id).sort((a,b) => a.date > b.date ? 1 : -1);
  const jobWOs = (workOrders || []).filter(o => o.jobId === job.id);
  const jobPOs = (purchaseOrders || []).filter(o => o.jobId === job.id);

  const totalQuoted   = jobQuotes.filter(q => q.status === "accepted").reduce((s,q) => s + calcQuoteTotal(q), 0);
  const totalInvoiced = jobInvoices.reduce((s,i) => s + calcQuoteTotal(i), 0);
  const totalPaid     = jobInvoices.filter(i => i.status === "paid").reduce((s,i) => s + calcQuoteTotal(i), 0);
  const totalHours    = jobTime.reduce((s,t) => s + t.hours, 0);
  const totalCosts    = jobBills.filter(b => b.status === "approved").reduce((s,b) => s + b.amount, 0);
  const actualLabour  = jobTime.reduce((s,t) => { const st = (staff||[]).find(x => x.name === t.worker); return s + t.hours * (st?.costRate || 55); }, 0);
  const actualMaterials = jobBills.filter(b => b.category === "Materials").reduce((s,b) => s + b.amount, 0);
  const actualSubs    = jobBills.filter(b => b.category === "Subcontractor").reduce((s,b) => s + b.amount, 0);

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

  // ── Notes state & CRUD ──
  const [lightboxImg, setLightboxImg] = useState(null);
  const [markupImg, setMarkupImg] = useState(null); // { src, noteId, attachmentId } or { src, target: "new" }
  const [showPlanDrawing, setShowPlanDrawing] = useState(false);
  // P&L estimate editing
  const [editingEstimate, setEditingEstimate] = useState(false);
  const defaultEstimate = { labour: 0, materials: 0, subcontractors: 0, other: 0 };
  const [estimateForm, setEstimateForm] = useState({ ...defaultEstimate, ...(job.estimate || {}) });

  // ── Gantt state ──
  const [showPhaseForm, setShowPhaseForm] = useState(false);
  const [editPhase, setEditPhase] = useState(null);
  const defaultPhase = { name: "", startDate: job.startDate || new Date().toISOString().slice(0,10), endDate: job.dueDate || new Date().toISOString().slice(0,10), color: "#3b82f6", progress: 0 };
  const [phaseForm, setPhaseForm] = useState({ ...defaultPhase });

  // ── Tasks state ──
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskForm, setTaskForm] = useState({ text: "", dueDate: "", assignedTo: "" });

  // ── Forms state ──
  const [showFormFiller, setShowFormFiller] = useState(null);
  const [viewingForm, setViewingForm] = useState(null);

  // ── PDF Filler state ──
  const [showPdfFiller, setShowPdfFiller] = useState(null); // { pdfData, fileName, existingFields? }

  const handlePdfSave = ({ filledPdfDataUrl, thumbnail, fields: pdfFields, fileName: filledName }) => {
    const note = {
      id: Date.now(), text: `PDF filled: ${filledName}`, category: "general",
      attachments: [{ id: genId(), name: filledName, size: Math.round(filledPdfDataUrl.length * 0.75), type: "application/pdf", dataUrl: filledPdfDataUrl }],
      pdfNote: true, pdfThumbnail: thumbnail, pdfFields: pdfFields, pdfOriginalData: showPdfFiller?.pdfData ? Array.from(new Uint8Array(showPdfFiller.pdfData)) : null,
      createdAt: new Date().toISOString(), createdBy: CURRENT_USER,
    };
    setJobs(js => js.map(j => j.id === job.id ? { ...j, notes: [...(j.notes || []), note], activityLog: addLog(j.activityLog, `Filled PDF: ${filledName}`) } : j));
    setShowPdfFiller(null);
  };

  const reopenPdfNote = (note) => {
    if (note.pdfOriginalData) {
      const arr = new Uint8Array(note.pdfOriginalData);
      setShowPdfFiller({ pdfData: arr.buffer, fileName: note.attachments?.[0]?.name || "document.pdf", existingFields: note.pdfFields });
    }
  };

  const printFormPdf = (note, tmpl) => {
    const data = note.formData || {};
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>${tmpl?.name || "Form"} – ${job.title}</title><style>body{font-family:sans-serif;padding:30px;max-width:700px;margin:0 auto}h1{font-size:20px;border-bottom:2px solid #333;padding-bottom:8px}h2{font-size:14px;color:#666;margin-top:0}.field{margin-bottom:16px}.label{font-size:11px;font-weight:700;text-transform:uppercase;color:#888;letter-spacing:0.05em;margin-bottom:4px}.value{font-size:13px;color:#333;white-space:pre-wrap}.check{display:flex;gap:6px;align-items:center;font-size:13px;margin:2px 0}.check-y{color:#059669;font-weight:700}.check-n{color:#dc2626;font-weight:700}.sig{max-width:300px;height:80px;border:1px solid #ddd;border-radius:4px}.meta{font-size:11px;color:#888;margin-bottom:16px}</style></head><body>`);
    w.document.write(`<h1>${tmpl?.icon || ""} ${tmpl?.name || "Form"}</h1>`);
    w.document.write(`<h2>${job.title}</h2>`);
    w.document.write(`<div class="meta">Completed ${new Date(note.createdAt).toLocaleString()} by ${note.createdBy}</div>`);
    (tmpl?.fields || []).forEach(field => {
      const val = data[field.key];
      w.document.write(`<div class="field"><div class="label">${field.label}</div>`);
      if (field.type === "checklist") {
        (field.options || []).forEach(opt => {
          const checked = (val || []).includes(opt);
          w.document.write(`<div class="check"><span class="${checked ? "check-y" : "check-n"}">${checked ? "✓" : "✗"}</span><span>${opt}</span></div>`);
        });
      } else if (field.type === "signature") {
        w.document.write(val ? `<img class="sig" src="${val}" />` : `<div class="value">No signature</div>`);
      } else {
        w.document.write(`<div class="value">${val || "—"}</div>`);
      }
      w.document.write(`</div>`);
    });
    w.document.write(`</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const saveMarkup = (dataUrl) => {
    if (markupImg?.noteId && markupImg?.attachmentId) {
      // Replace existing attachment on a saved note
      setJobs(js => js.map(j => j.id === job.id ? {
        ...j,
        notes: (j.notes || []).map(n => n.id === markupImg.noteId ? {
          ...n,
          attachments: n.attachments.map(a => a.id === markupImg.attachmentId ? { ...a, dataUrl, name: a.name.replace(/\.[^.]+$/, "") + "_marked.png" } : a)
        } : n),
        activityLog: addLog(j.activityLog, "Photo marked up")
      } : j));
    } else if (markupImg?.target === "new" || markupImg?.target === "edit") {
      // Save marked-up image as a new note
      const att = { id: genId(), name: "markup_" + Date.now() + ".png", size: Math.round(dataUrl.length * 0.75), type: "image/png", dataUrl };
      const newNote = { id: Date.now(), text: "Marked up photo", category: "general", attachments: [att], createdAt: new Date().toISOString(), createdBy: CURRENT_USER };
      setJobs(js => js.map(j => j.id === job.id ? { ...j, notes: [...(j.notes || []), newNote], activityLog: addLog(j.activityLog, "Photo marked up") } : j));
    }
    setMarkupImg(null);
  };

  const savePlan = (dataUrl) => {
    const att = { id: genId(), name: "plan_" + Date.now() + ".png", size: Math.round(dataUrl.length * 0.75), type: "image/png", dataUrl };
    const newNote = { id: Date.now(), text: "Plan drawing", category: "general", attachments: [att], createdAt: new Date().toISOString(), createdBy: CURRENT_USER };
    setJobs(js => js.map(j => j.id === job.id ? { ...j, notes: [...(j.notes || []), newNote], activityLog: addLog(j.activityLog, "Added plan drawing") } : j));
    setShowPlanDrawing(false);
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
      setQuotes(qs => {
        const updated = qs.map(x => x.id === saved.id ? saved : x);
        // Update job estimate with cumulative accepted quote total
        const acceptedTotal = updated.filter(x => x.jobId === job.id && x.status === "accepted").reduce((s, x) => s + calcQuoteTotal(x), 0);
        setJobs(js => js.map(j => j.id === job.id ? {
          ...j,
          estimate: { ...(j.estimate || { labour: 0, materials: 0, subcontractors: 0, other: 0 }), total: acceptedTotal },
          activityLog: addLog(j.activityLog, `Quote ${q?.number} accepted · Estimate updated to ${fmt(acceptedTotal)}`)
        } : j));
        return updated;
      });
    } catch (err) { console.error('Failed to accept quote:', err); }
  };

  // ── Edit state for inline modals ──
  const [editingQuote,   setEditingQuote]   = useState(null);
  const [inlineQuoteMode, setInlineQuoteMode] = useState("edit");
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [inlineInvMode, setInlineInvMode] = useState("edit");
  const [editingBill,    setEditingBill]    = useState(null);

  const saveQuote = async (data) => {
    try {
      const saved = await updateQuote(data.id, data);
      setQuotes(qs => qs.map(q => q.id === saved.id ? saved : q));
      setEditingQuote(saved);
      setInlineQuoteMode("view");
      setJobs(js => js.map(j => j.id === job.id ? { ...j, activityLog: addLog(j.activityLog, `Quote ${data.number} updated`) } : j));
    } catch (err) { console.error('Failed to save quote:', err); }
  };
  const saveInvoice = async (data) => {
    try {
      const saved = await updateInvoice(data.id, data);
      setInvoices(is => is.map(i => i.id === saved.id ? saved : i));
      setEditingInvoice(saved);
      setInlineInvMode("view");
      setJobs(js => js.map(j => j.id === job.id ? { ...j, activityLog: addLog(j.activityLog, `Invoice ${data.number} updated`) } : j));
    } catch (err) { console.error('Failed to save invoice:', err); }
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

  const saveDetailForm = async () => {
    const data = { ...detailForm, tags: detailForm.tags.split(",").map(t => t.trim()).filter(Boolean), estimate: detailForm.estimate || { labour: 0, materials: 0, subcontractors: 0, other: 0 } };
    try {
      const changes = [];
      if (job.title !== data.title) changes.push(`Title changed to "${data.title}"`);
      if (job.status !== data.status) changes.push(`Status → ${data.status.replace("_"," ")}`);
      if (job.priority !== data.priority) changes.push(`Priority → ${data.priority}`);
      const msg = changes.length ? changes.join(" · ") : "Job updated";
      const saved = await updateJob(job.id, data);
      setJobs(js => js.map(j => j.id === job.id ? { ...saved, activityLog: addLog(j.activityLog, msg) } : j));
      setDetailMode("view");
    } catch (err) { console.error('Failed to save job:', err); }
  };

  const jobNotes = job.notes || [];
  const jobPhases = job.phases || [];
  const jobTasks = job.tasks || [];
  const tasksDone = jobTasks.filter(t => t.done).length;
  const tasksRemaining = jobTasks.length - tasksDone;
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "pnl", label: "P&L" },
    { id: "gantt", label: `Gantt (${jobPhases.length})` },
    { id: "tasks", label: `Tasks${tasksRemaining > 0 ? ` (${tasksRemaining})` : jobTasks.length > 0 ? " ✓" : ""}` },
    { id: "notes", label: `Notes (${jobNotes.length})` },
    { id: "quotes", label: `Quotes (${jobQuotes.length})` },
    { id: "invoices", label: `Invoices (${jobInvoices.length})` },
    { id: "time", label: `Time (${totalHours}h)` },
    { id: "costs", label: `Costs (${jobBills.length})` },
    { id: "schedule", label: `Schedule (${jobSchedule.length})` },
    { id: "orders", label: `Orders (${jobWOs.length + jobPOs.length})` },
    { id: "activity", label: `Activity (${(job.activityLog||[]).length})` },
  ];

  const jobAccent = SECTION_COLORS.jobs.accent;
  const jobLight = SECTION_COLORS.jobs.light;

  const jobStatusStrip = detailMode === "view" ? (
    <div className={pg.flexShrink0}>
      <div className={pg.statusStripBarSm} style={{ background: jobLight }}>
        {["draft","scheduled","in_progress","completed","cancelled"].filter(s => s !== job.status).map(s => (
          <button key={s} className={`btn btn-xs ${pg.u187}`} onClick={() => {
            const updated = { ...job, status: s, activityLog: addLog(job.activityLog, `Status → ${s.replace("_"," ")}`) };
            setJobs(js => js.map(j => j.id === job.id ? updated : j));
          }}>{s.replace("_"," ").replace(/\b\w/g, c => c.toUpperCase())}</button>
        ))}
      </div>
      {/* Tabs */}
      <div className={`tabs ${pg.u188}`}>
        {tabs.map(t => <div key={t.id} className={`tab ${tab === t.id ? "active" : ""} ${pg.tabItem}`} onClick={() => setTab(t.id)} style={{ borderBottomColor: tab === t.id ? jobAccent : "transparent" }}>{t.label}</div>)}
      </div>
    </div>
  ) : null;

  const jobFooter = detailMode === "view" ? <>
    <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
    <button className={`btn btn-sm ${pg.sectionAccentBtn}`} style={{ background: jobAccent }} onClick={() => { setDetailForm({ title: job.title, clientId: job.clientId, siteId: job.siteId || null, status: job.status, priority: job.priority, description: job.description || "", startDate: job.startDate || "", dueDate: job.dueDate || "", assignedTo: job.assignedTo || [], tags: (job.tags || []).join(", "), estimate: job.estimate || { labour: 0, materials: 0, subcontractors: 0, other: 0 } }); setDetailMode("edit"); }}>
      <Icon name="edit" size={13} /> Edit
    </button>
  </> : <>
    <button className="btn btn-ghost btn-sm" onClick={() => setDetailMode("view")}>Cancel</button>
    <button className={`btn btn-sm ${pg.sectionAccentBtn}`} style={{ background: jobAccent }} onClick={saveDetailForm} disabled={!detailForm.title}>
      <Icon name="check" size={13} /> Save Changes
    </button>
  </>;

  return (
    <>
    <SectionDrawer
      accent={jobAccent}
      icon={<Icon name="jobs" size={16} />}
      typeLabel="Job"
      title={job.title}
      statusBadge={<StatusBadge status={job.status} />}
      mode={detailMode} setMode={setDetailMode}
      showToggle={true}
      statusStrip={jobStatusStrip}
      footer={jobFooter}
      onClose={onClose}
    >
        {detailMode === "edit" ? (
        <div className={pg.drawerBody}>
          <div className="form-group">
            <label className="form-label">Job Title *</label>
            <input className="form-control" value={detailForm.title} onChange={e => setDetailForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Office Fitout – Level 3" />
          </div>
          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">Client *</label>
              <select className="form-control" value={detailForm.clientId} onChange={e => setDetailForm(f => ({ ...f, clientId: e.target.value, siteId: "" }))}>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Site</label>
              <select className="form-control" value={detailForm.siteId || ""} onChange={e => setDetailForm(f => ({ ...f, siteId: e.target.value || null }))}>
                <option value="">— No specific site —</option>
                {(clients.find(c => String(c.id) === String(detailForm.clientId))?.sites || []).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-control" value={detailForm.status} onChange={e => setDetailForm(f => ({ ...f, status: e.target.value }))}>
                {["draft","scheduled","quoted","in_progress","completed","cancelled"].map(s => <option key={s} value={s}>{s.replace("_"," ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
              </select>
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Priority</label>
              <select className="form-control" value={detailForm.priority} onChange={e => setDetailForm(f => ({ ...f, priority: e.target.value }))}>
                {["high","medium","low"].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Tags (comma separated)</label>
              <input className="form-control" value={detailForm.tags} onChange={e => setDetailForm(f => ({ ...f, tags: e.target.value }))} placeholder="fitout, commercial, urgent" />
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Start Date</label>
              <input type="date" className="form-control" value={detailForm.startDate} onChange={e => setDetailForm(f => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Due Date</label>
              <input type="date" className="form-control" value={detailForm.dueDate} onChange={e => setDetailForm(f => ({ ...f, dueDate: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Assigned Team Members</label>
            <div className="multi-select">
              {(staff && staff.length > 0 ? staff.map(s => s.name) : TEAM).map(t => (
                <span key={t} className={`multi-option ${detailForm.assignedTo.includes(t) ? "selected" : ""}`}
                  onClick={() => setDetailForm(f => ({ ...f, assignedTo: f.assignedTo.includes(t) ? f.assignedTo.filter(x => x !== t) : [...f.assignedTo, t] }))}>
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className={pg.mb16}>
            <div className={pg.textLabelMb8}>Estimate</div>
            <div className={pg.u189}>
              <div className={`grid-2 ${pg.p2_17}`}>
                <div className={`form-group ${jb.formGroupNoMb}`}>
                  <label className={`form-label ${jb.formLabelSm}`}>Labour ($)</label>
                  <input type="number" className="form-control" min="0" step="100" value={detailForm.estimate?.labour || ""} onChange={e => setDetailForm(f => ({ ...f, estimate: { ...f.estimate, labour: Number(e.target.value) || 0 } }))} placeholder="0" />
                </div>
                <div className={`form-group ${jb.formGroupNoMb}`}>
                  <label className={`form-label ${jb.formLabelSm}`}>Materials ($)</label>
                  <input type="number" className="form-control" min="0" step="100" value={detailForm.estimate?.materials || ""} onChange={e => setDetailForm(f => ({ ...f, estimate: { ...f.estimate, materials: Number(e.target.value) || 0 } }))} placeholder="0" />
                </div>
              </div>
              <div className="grid-2">
                <div className={`form-group ${jb.formGroupNoMb}`}>
                  <label className={`form-label ${jb.formLabelSm}`}>Subcontractors ($)</label>
                  <input type="number" className="form-control" min="0" step="100" value={detailForm.estimate?.subcontractors || ""} onChange={e => setDetailForm(f => ({ ...f, estimate: { ...f.estimate, subcontractors: Number(e.target.value) || 0 } }))} placeholder="0" />
                </div>
                <div className={`form-group ${jb.formGroupNoMb}`}>
                  <label className={`form-label ${jb.formLabelSm}`}>Other ($)</label>
                  <input type="number" className="form-control" min="0" step="100" value={detailForm.estimate?.other || ""} onChange={e => setDetailForm(f => ({ ...f, estimate: { ...f.estimate, other: Number(e.target.value) || 0 } }))} placeholder="0" />
                </div>
              </div>
              {(() => {
                const t = (detailForm.estimate?.labour || 0) + (detailForm.estimate?.materials || 0) + (detailForm.estimate?.subcontractors || 0) + (detailForm.estimate?.other || 0);
                return <div className={jb.editEstimateTotal}>Total: {fmt(t)}</div>;
              })()}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-control" value={detailForm.description} onChange={e => setDetailForm(f => ({ ...f, description: e.target.value }))} placeholder="Job details, scope of work..." />
          </div>
        </div>
        ) : (
        <div className={pg.drawerBody}>

          {/* ── Overview ── */}
          {tab === "overview" && (
            <div>
              <div className={pg.gridAutoFit120}>
                {(() => {
                  const e = job.estimate || {};
                  const estTotal = (e.labour||0)+(e.materials||0)+(e.subcontractors||0)+(e.other||0);
                  const totalActual = actualLabour + actualMaterials + actualSubs;
                  const profit = estTotal - totalActual;
                  const avgRate = totalHours > 0 ? actualLabour / totalHours : 55;
                  const budgetHours = (e.labour||0) > 0 ? Math.round((e.labour||0) / avgRate) : 0;
                  return [
                    { label: "P&L", val: estTotal > 0 ? fmt(profit) : "—", sub: estTotal > 0 ? `${fmt(totalActual)} costs / ${fmt(estTotal)} est` : "No budget set", color: profit >= 0 ? "#16a34a" : "#dc2626" },
                    { label: "Time Logged", val: `${totalHours}h`, sub: budgetHours > 0 ? `of ${budgetHours}h budget` : "No hours budget" },
                    { label: "Costs", val: fmt(actualMaterials), sub: `of ${fmt(e.materials || 0)} budget` },
                    { label: "Contractors", val: fmt(actualSubs), sub: `of ${fmt(e.subcontractors || 0)} budget` },
                  ];
                })().map((s,i) => (
                  <div key={i} className={pg.grayBox}>
                    <div className={pg.fs10fw700label}>{s.label}</div>
                    <div className={pg.fs20fw800tight} style={s.color ? { color: s.color } : undefined}>{s.val}</div>
                    <div className={pg.fs11caaamt3}>{s.sub}</div>
                  </div>
                ))}
              </div>
              <div>
                <SectionLabel>Job Details</SectionLabel>
                <div className={pg.flexColGap8}>
                  {(() => {
                    const site = client?.sites?.find(x => x.id === job.siteId);
                    return [
                      [{ label: "Client", val: client?.name || "—" }, { label: "Site", val: site ? site.name : "—" }],
                      [{ label: "Site Contact", val: site?.contactName ? `${site.contactName}${site.contactPhone ? " · " + site.contactPhone : ""}` : "—" }],
                      [{ label: "Priority", val: <span style={{ textTransform: "capitalize" }}>{job.priority}</span> }],
                      [{ label: "Start Date", val: fmtDate(job.startDate) }, { label: "Due Date", val: fmtDate(job.dueDate) }],
                      [{ label: "Description", val: job.description || "No description" }],
                    ];
                  })().map((row,ri) => (
                    <div key={ri} style={row.length > 1 ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" } : undefined}>
                      {row.map((r,ci) => (
                        <div key={ci} className={pg.u192}>
                          <span className={pg.color888}>{r.label}</span><span className={pg.fw600}>{r.val}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <SectionLabel>Team</SectionLabel>
                {job.assignedTo.length === 0
                  ? <div className={pg.u193}>No team assigned</div>
                  : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "4px 16px" }}>{job.assignedTo.map((w,i) => (
                    <div key={i} className={pg.u194}>
                      <div className={`avatar ${pg.u195}`}>{w.split(" ").map(p=>p[0]).join("")}</div>
                      <span className={pg.fs13fw600}>{w}</span>
                      <span className={pg.u196}>{jobTime.filter(t=>t.worker===w).reduce((s,t)=>s+t.hours,0)}h</span>
                    </div>
                  ))}</div>
                }
                {job.tags.length > 0 && <>
                  <SectionLabel>Tags</SectionLabel>
                  <div className={pg.u197}>{job.tags.map((t,i) => <span key={i} className="tag">{t}</span>)}</div>
                </>}
              </div>
            </div>
          )}

          {/* ── Quotes ── */}
          {tab === "quotes" && (
            <div>
              <div className={pg.u198}>
                <button className={`btn btn-primary btn-sm ${pg.sectionAccentBtn}`} style={{ background: SECTION_COLORS.quotes.accent }} onClick={async () => {
                  try {
                    const newQ = { jobId: job.id, status: "draft", lineItems: [{ desc: "", qty: 1, unit: "hrs", rate: 0 }], tax: 10, notes: "" };
                    const saved = await createQuote(newQ);
                    setQuotes(qs => [...qs, saved]);
                    setEditingQuote(saved);
                    setInlineQuoteMode("edit");
                  } catch (err) { console.error('Failed to create quote:', err); }
                }}><Icon name="plus" size={12} />New Quote</button>
              </div>
              {jobQuotes.length === 0
                ? <div className="empty-state"><div className="empty-state-icon">📋</div><div className="empty-state-text">No quotes yet</div><div className="empty-state-sub">Create a quote to send to the client</div></div>
                : jobQuotes.map(q => {
                  const sub = q.lineItems.reduce((s,l) => s + l.qty * l.rate, 0);
                  const alreadyInvoiced = invoices.some(i => i.fromQuoteId === q.id);
                  return (
                    <div key={q.id} className={pg.p2_18}>
                      <div className={pg.p2_19}>
                        <div>
                          <div className={pg.p2_20}>{q.number}</div>
                          <div className={pg.p2_21}>{fmtDate(q.createdAt)}</div>
                        </div>
                        <div className={pg.p2_22}>
                          <StatusBadge status={q.status} />
                          {q.status !== "accepted" && <button className="btn btn-secondary btn-xs" onClick={() => acceptQuote(q.id)}>Accept</button>}
                          {q.status === "accepted" && !alreadyInvoiced && (
                            <button className={`btn btn-primary btn-xs ${pg.sectionAccentBtn}`} style={{ background: SECTION_COLORS.invoices.accent }} onClick={() => { quoteToInvoice(q); setTab("invoices"); }}>
                              <Icon name="invoices" size={11} />→ Invoice
                            </button>
                          )}
                          {alreadyInvoiced && <span className={pg.textMutedSm}>Invoiced ✓</span>}
                          <button className="btn btn-ghost btn-xs" onClick={() => { setEditingQuote(q); setInlineQuoteMode("view"); }}><Icon name="edit" size={11} /></button>
                          <button className={`btn btn-ghost btn-xs ${pg.deleteBtn}`} onClick={() => delQuote(q.id)}><Icon name="trash" size={11} /></button>
                        </div>
                      </div>
                      <table className={pg.p2_23}>
                        <thead><tr>{["Description","Qty","Unit","Rate","Total"].map(h => <th key={h} className={pg.p2_24}>{h}</th>)}</tr></thead>
                        <tbody>
                          {q.lineItems.map((l,i) => (
                            <tr key={i}>
                              <td className={pg.p2_25}>{l.desc}</td>
                              <td className={pg.color666}>{l.qty}</td>
                              <td className={pg.color666}>{l.unit}</td>
                              <td className={pg.color666}>{fmt(l.rate)}</td>
                              <td className={pg.fw600}>{fmt(l.qty * l.rate)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className={pg.p2_26}>
                        <span className={pg.color999}>Subtotal <strong className={pg.color111}>{fmt(sub)}</strong></span>
                        <span className={pg.color999}>GST <strong className={pg.color111}>{fmt(sub * q.tax / 100)}</strong></span>
                        <span className={pg.p2_27}>Total {fmt(calcQuoteTotal(q))}</span>
                      </div>
                      {q.notes && <div className={pg.u201}>{q.notes}</div>}
                    </div>
                  );
                })
              }
            </div>
          )}

          {/* ── Invoices ── */}
          {tab === "invoices" && (
            <div>
              <div className={pg.flexBetweenMb14}>
                <div className={pg.fs13c888}>
                  {jobInvoices.length > 0 && <span><strong className={pg.color111}>{fmt(totalPaid)}</strong> paid of <strong className={pg.color111}>{fmt(totalInvoiced)}</strong> invoiced</span>}
                </div>
                <button className={`btn btn-primary btn-sm ${pg.sectionAccentBtn}`} style={{ background: SECTION_COLORS.invoices.accent }} onClick={async () => {
                  try {
                    const newInv = { jobId: job.id, status: "draft", lineItems: [{ desc: "", qty: 1, unit: "hrs", rate: 0 }], tax: 10, dueDate: "", notes: "" };
                    const saved = await createInvoice(newInv);
                    setInvoices(is => [...is, saved]);
                    setEditingInvoice(saved);
                    setInlineInvMode("edit");
                  } catch (err) { console.error('Failed to create invoice:', err); }
                }}><Icon name="plus" size={12} />New Invoice</button>
              </div>
              {jobInvoices.length === 0
                ? <div className="empty-state"><div className="empty-state-icon">💳</div><div className="empty-state-text">No invoices yet</div><div className="empty-state-sub">Create an invoice or convert an accepted quote</div></div>
                : jobInvoices.map(inv => {
                  const sub = inv.lineItems.reduce((s,l) => s + l.qty * l.rate, 0);
                  const fromQuote = inv.fromQuoteId ? quotes.find(q => q.id === inv.fromQuoteId) : null;
                  return (
                    <div key={inv.id} className={pg.p2_18}>
                      <div className={pg.p2_19}>
                        <div>
                          <div className={pg.p2_20}>{inv.number}</div>
                          <div className={pg.p2_21}>
                            {fmtDate(inv.createdAt)}
                            {fromQuote && <span className={pg.u202}>from {fromQuote.number}</span>}
                            {inv.dueDate && <span className={pg.u203}>· Due {fmtDate(inv.dueDate)}</span>}
                          </div>
                        </div>
                        <div className={pg.p2_22}>
                          <StatusBadge status={inv.status} />
                          <XeroSyncBadge syncStatus={inv.xeroSyncStatus} xeroId={inv.xeroInvoiceId} />
                          {inv.status !== "paid" && inv.status !== "void" && (
                            <button className={`btn btn-primary btn-xs ${pg.sectionAccentBtn}`} style={{ background: SECTION_COLORS.invoices.accent }} onClick={() => markInvPaid(inv.id)}>Mark Paid</button>
                          )}
                          {!inv.xeroInvoiceId && inv.status !== "draft" && (
                            <button className={`btn btn-ghost btn-xs ${pg.color0369a1}`} onClick={() => xeroSyncInvoice("push", inv.id)} title="Send to Xero"><Icon name="send" size={11} /> Xero</button>
                          )}
                          <button className="btn btn-ghost btn-xs" onClick={() => { setEditingInvoice(inv); setInlineInvMode("view"); }}><Icon name="edit" size={11} /></button>
                          <button className={`btn btn-ghost btn-xs ${pg.deleteBtn}`} onClick={() => delInvoice(inv.id)}><Icon name="trash" size={11} /></button>
                        </div>
                      </div>
                      <table className={pg.p2_23}>
                        <thead><tr>{["Description","Qty","Unit","Rate","Total"].map(h => <th key={h} className={pg.p2_24}>{h}</th>)}</tr></thead>
                        <tbody>
                          {inv.lineItems.map((l,i) => (
                            <tr key={i}><td className={pg.p2_25}>{l.desc}</td><td className={pg.color666}>{l.qty}</td><td className={pg.color666}>{l.unit}</td><td className={pg.color666}>{fmt(l.rate)}</td><td className={pg.fw600}>{fmt(l.qty*l.rate)}</td></tr>
                          ))}
                        </tbody>
                      </table>
                      <div className={pg.p2_26}>
                        <span className={pg.color999}>Subtotal <strong className={pg.color111}>{fmt(sub)}</strong></span>
                        <span className={pg.color999}>GST <strong className={pg.color111}>{fmt(sub * inv.tax / 100)}</strong></span>
                        <span className={pg.p2_27}>Total {fmt(calcQuoteTotal(inv))}</span>
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
              <div className={pg.flexBetweenMb14}>
                <div className={pg.fs13c888}>
                  {totalHours > 0 && <span><strong className={pg.color111}>{jobTime.filter(t=>t.billable).reduce((s,t)=>s+t.hours,0)}h</strong> billable · <strong className={pg.color111}>{totalHours}h</strong> total</span>}
                </div>
                <button className={`btn btn-primary btn-sm ${pg.sectionAccentBtn}`} style={{ background: SECTION_COLORS.time.accent }} onClick={() => setShowTimeForm(v => !v)}><Icon name="plus" size={12} />Log Time</button>
              </div>
              {showTimeForm && (
                <div className={pg.u205}>
                  <div className={`grid-3 ${pg.mb10}`}>
                    <div className={`form-group ${jb.formGroupNoMb}`}>
                      <label className="form-label">Worker</label>
                      <select className="form-control" value={timeForm.worker} onChange={e => setTimeForm(f => ({ ...f, worker: e.target.value }))}>
                        {(staff && staff.length > 0 ? staff.map(s => s.name) : TEAM).map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className={`form-group ${jb.formGroupNoMb}`}>
                      <label className="form-label">Date</label>
                      <input type="date" className="form-control" value={timeForm.date} onChange={e => setTimeForm(f => ({ ...f, date: e.target.value }))} />
                    </div>
                    <div className={`form-group ${jb.formGroupNoMb}`}>
                      <label className="form-label">Hours</label>
                      <div className={quickHours > 0 ? pg.hoursInputBoxActive : pg.hoursInputBoxEmpty}>
                        {quickHours > 0 ? `${quickHours.toFixed(1)}h` : "—"}
                      </div>
                    </div>
                  </div>
                  <div className={`grid-2 ${pg.mb10}`}>
                    <div className={`form-group ${jb.formGroupNoMb}`}>
                      <label className="form-label">Start Time</label>
                      <input type="time" className="form-control" value={timeForm.startTime}
                        onChange={e => setTimeForm(f => ({ ...f, startTime: e.target.value, endTime: f.endTime || addMinsToTime(e.target.value, 60) }))} />
                    </div>
                    <div className={`form-group ${jb.formGroupNoMb}`}>
                      <label className="form-label">End Time</label>
                      <input type="time" className="form-control" value={timeForm.endTime}
                        onChange={e => setTimeForm(f => ({ ...f, endTime: e.target.value }))} />
                    </div>
                  </div>
                  <div className={`form-group ${pg.mb10}`}>
                    <label className="form-label">Description</label>
                    <input className="form-control" value={timeForm.description} onChange={e => setTimeForm(f => ({ ...f, description: e.target.value }))} placeholder="Work description" />
                  </div>
                  <div className={pg.flexBetween}>
                    <label className="checkbox-label"><input type="checkbox" checked={timeForm.billable} onChange={e => setTimeForm(f => ({ ...f, billable: e.target.checked }))} /><span>Billable</span></label>
                    <div className={pg.flexGap8}>
                      <button className="btn btn-secondary btn-sm" onClick={() => setShowTimeForm(false)}>Cancel</button>
                      <button className={`btn btn-primary btn-sm ${pg.sectionAccentBtn}`} style={{ background: SECTION_COLORS.time.accent }} onClick={saveTime} disabled={quickHours <= 0}><Icon name="check" size={12} />Save</button>
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
                          <td><div className={pg.flexCenter}><div className={`avatar ${pg.u207}`}>{t.worker.split(" ").map(w=>w[0]).join("")}</div><span className={pg.textBold13}>{t.worker}</span></div></td>
                          <td className={pg.textSub}>{fmtDate(t.date)}</td>
                          <td><span className={pg.cellAmount}>{t.hours}h</span></td>
                          <td><span className={`badge ${t.billable ? pg.billableBadge : pg.nonBillBadge}`}>{t.billable ? "Billable" : "Non-bill"}</span></td>
                          <td className={pg.fs12c666}>{t.description}</td>
                          <td><button className={`btn btn-ghost btn-xs ${pg.deleteBtn}`} onClick={() => delTime(t.id)}><Icon name="trash" size={11} /></button></td>
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
              <div className={pg.flexBetweenMb14}>
                <div className={pg.fs13c888}>
                  {jobBills.length > 0 && (
                    <span>
                      <strong className={pg.color111}>{fmt(jobBills.filter(b=>b.status==="posted"||b.status==="approved").reduce((s,b)=>s+b.amount,0))}</strong> approved
                      {jobBills.filter(b=>b.status==="inbox"||b.status==="linked").length > 0 && (
                        <span> · <strong className={pg.color111}>{fmt(jobBills.filter(b=>b.status==="inbox"||b.status==="linked").reduce((s,b)=>s+b.amount,0))}</strong> pending</span>
                      )}
                    </span>
                  )}
                </div>
                <button className={`btn btn-primary btn-sm ${pg.sectionAccentBtn}`} style={{ background: SECTION_COLORS.bills.accent }} onClick={() => setEditingBill({})}><Icon name="plus" size={12} />Capture Bill</button>
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
                              <div className={pg.textBold13}>{b.supplier || <span className={pg.p2_28}>—</span>}</div>
                              {b.description && <div className={pg.u209}>{b.description.slice(0,40)}{b.description.length>40?"…":""}</div>}
                            </td>
                            <td><span className={pg.u210}>{b.invoiceNo || "—"}</span></td>
                            <td><span className="chip">{b.category}</span></td>
                            <td className={pg.textSub}>{fmtDate(b.date)}</td>
                            <td className={pg.fs13}>{fmt(exGst)}</td>
                            <td className={pg.cellAmount}>{fmt(b.amount||0)}</td>
                            <td className={pg.fs12}>
                              {(b.markup||0) > 0
                                ? <span className={pg.p2_29}>{b.markup}% → <strong>{fmt(onCharge)}</strong></span>
                                : <span className={pg.colorDdd}>—</span>}
                            </td>
                            <td><BillStatusBadge status={b.status} /> <XeroSyncBadge syncStatus={b.xeroSyncStatus} xeroId={b.xeroBillId} /></td>
                            <td>
                              <div className={pg.flexGap4}>
                                {!b.xeroBillId && (b.status === "approved" || b.status === "posted") && (
                                  <button className={`btn btn-ghost btn-xs ${pg.color0369a1}`} title="Send to Xero" onClick={() => xeroSyncBill("push", b.id)}><Icon name="send" size={11} /></button>
                                )}
                                {b.status === "linked" && (
                                  <button className={`btn btn-ghost btn-xs ${pg.color1e7e34}`} title="Approve"
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
                                <button className={`btn btn-ghost btn-xs ${pg.deleteBtn}`} onClick={() => delBill(b.id)}><Icon name="trash" size={11} /></button>
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
                    <div key={s.id} className={pg.u211}>
                      <div className={pg.u212}>
                        <div className={pg.u213}>{new Date(s.date+"T12:00:00").toLocaleString("en", { month: "short" })}</div>
                        <div className={pg.u214}>{new Date(s.date+"T12:00:00").getDate()}</div>
                      </div>
                      <div className={pg.flex1}>
                        <div className={pg.textBold14}>{fmtDate(s.date)} · {new Date(s.date+"T12:00:00").toLocaleDateString("en-AU",{weekday:"long"})}</div>
                        {schSite && <div className={pg.fs12c888mt2}>📍 {schSite.name}</div>}
                        {schSite?.contactName && <div className={pg.textMuted}>👤 {schSite.contactName} {schSite.contactPhone && `· ${schSite.contactPhone}`}</div>}
                        {s.notes && <div className={pg.u215}>{s.notes}</div>}
                        {(s.assignedTo||[]).length > 0 && <div className={pg.p2_30}><AvatarGroup names={s.assignedTo} max={4} /></div>}
                      </div>
                    </div>
                  );
                })
              }
            </div>
          )}

          {/* ── Activity ── */}
          {tab === "orders" && (
            <div>
              <div className={pg.flexBetweenMb14}>
                <div className={pg.fs13c888}>
                  {jobWOs.length + jobPOs.length > 0
                    ? <span><strong className={pg.color111}>{jobWOs.length}</strong> WO{jobWOs.length !== 1 ? "s" : ""} · <strong className={pg.color111}>{jobPOs.length}</strong> PO{jobPOs.length !== 1 ? "s" : ""}</span>
                    : "No orders yet"}
                </div>
                <div className={pg.flexGap6}>
                  <button className={`btn btn-primary btn-sm ${pg.p2_10}`} onClick={() => {
                    const newWo = { id: genId(), ref: "WO-" + String((workOrders || []).length + 1).padStart(3,"0"), status: "Draft", jobId: job.id, issueDate: orderToday(), dueDate: orderAddDays(14), poLimit: "", contractorId: "", contractorName: "", contractorContact: "", contractorEmail: "", contractorPhone: "", trade: "", scopeOfWork: "", notes: "", internalNotes: "", attachments: [], auditLog: [makeLogEntry("Created","Work order created")] };
                    setWorkOrders(prev => [...prev, newWo]);
                  }}><Icon name="plus" size={12} />New WO</button>
                  <button className={`btn btn-primary btn-sm ${pg.u216}`} onClick={() => {
                    const newPo = { id: genId(), ref: "PO-" + String((purchaseOrders || []).length + 1).padStart(3,"0"), status: "Draft", jobId: job.id, issueDate: orderToday(), dueDate: orderAddDays(14), poLimit: "", supplierId: "", supplierName: "", supplierContact: "", supplierEmail: "", supplierAbn: "", deliveryAddress: "", lines: [{ id: genId(), desc: "", qty: 1, unit: "ea" }], notes: "", internalNotes: "", attachments: [], auditLog: [makeLogEntry("Created","Purchase order created")] };
                    setPurchaseOrders(prev => [...prev, newPo]);
                  }}><Icon name="plus" size={12} />New PO</button>
                </div>
              </div>
              {jobWOs.length + jobPOs.length === 0
                ? <div className={pg.u217}>No work orders or purchase orders linked to this job yet.</div>
                : <div className="order-cards-grid">
                    {[...jobWOs.map(o => ({ ...o, _type: "wo" })), ...jobPOs.map(o => ({ ...o, _type: "po" }))].sort((a,b) => b.id - a.id).map(o => (
                      <OrderCard key={o.id} type={o._type} order={o} jobs={jobs} onOpen={() => {}} onDelete={() => {
                        if (o._type === "wo") setWorkOrders(prev => prev.filter(x => x.id !== o.id));
                        else setPurchaseOrders(prev => prev.filter(x => x.id !== o.id));
                      }} />
                    ))}
                  </div>
              }
            </div>
          )}

          {tab === "pnl" && (() => {
            const est = job.estimate || defaultEstimate;
            const breakdownTotal = (est.labour || 0) + (est.materials || 0) + (est.subcontractors || 0) + (est.other || 0);
            const acceptedQuotesTotal = jobQuotes.filter(q => q.status === "accepted").reduce((s, q) => s + calcQuoteTotal(q), 0);
            const totalEstimate = acceptedQuotesTotal > 0 ? Math.max(breakdownTotal, acceptedQuotesTotal) : breakdownTotal;

            // Client rates
            const clientRates = client?.rates || {};
            const clientLabourRate = clientRates.labourRate || 0;
            const clientMatMargin = clientRates.materialMargin || 0;
            const clientSubMargin = clientRates.subcontractorMargin || 0;

            // Revenue
            const revenue = totalQuoted > 0 ? totalQuoted : totalInvoiced;
            const revenueLabel = totalQuoted > 0 ? "Quoted (Accepted)" : "Invoiced";

            // Labour costs from time entries × staff cost rates
            const labourByWorker = {};
            jobTime.forEach(t => {
              const s = (staff || []).find(x => x.name === t.worker);
              const rate = s?.costRate || 55;
              if (!labourByWorker[t.worker]) labourByWorker[t.worker] = { hours: 0, cost: 0, rate };
              labourByWorker[t.worker].hours += t.hours;
              labourByWorker[t.worker].cost += t.hours * rate;
            });
            const actualLabour = Object.values(labourByWorker).reduce((s, w) => s + w.cost, 0);

            // Material costs from bills
            const matBills = jobBills.filter(b => b.category === "Materials");
            const actualMaterials = matBills.reduce((s, b) => s + b.amount, 0);

            // Subcontractor costs from bills + WO poLimits for accepted/completed WOs
            const subBills = jobBills.filter(b => b.category === "Subcontractor");
            const actualSubs = subBills.reduce((s, b) => s + b.amount, 0);

            // Other costs
            const otherBills = jobBills.filter(b => b.category !== "Materials" && b.category !== "Subcontractor");
            const actualOther = otherBills.reduce((s, b) => s + b.amount, 0);

            const totalActual = actualLabour + actualMaterials + actualSubs + actualOther;

            // Revenue at client rates
            const totalLabourHours = Object.values(labourByWorker).reduce((s, w) => s + w.hours, 0);
            const clientLabourRevenue = totalLabourHours * clientLabourRate;
            const clientMaterialRevenue = clientMatMargin > 0 ? actualMaterials * (1 + clientMatMargin / 100) : actualMaterials;
            const clientSubRevenue = clientSubMargin > 0 ? actualSubs * (1 + clientSubMargin / 100) : actualSubs;
            const clientTotalRevenue = clientLabourRevenue + clientMaterialRevenue + clientSubRevenue + actualOther;
            const clientProfit = clientTotalRevenue - totalActual;
            const clientMarginPct = clientTotalRevenue > 0 ? Math.round((clientProfit / clientTotalRevenue) * 100) : 0;

            const profit = revenue - totalActual;
            const marginPct = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;
            const costPct = totalEstimate > 0 ? Math.min(100, Math.round((totalActual / totalEstimate) * 100)) : 0;

            const varRow = (label, estimated, actual) => {
              const variance = estimated - actual;
              const pct = estimated > 0 ? Math.round((actual / estimated) * 100) : (actual > 0 ? 999 : 0);
              const overBudget = actual > estimated && estimated > 0;
              return (
                <tr key={label}>
                  <td className={pg.textBold13}>{label}</td>
                  <td className={pg.p2_31}>{fmt(estimated)}</td>
                  <td className={pg.p2_31}>{fmt(actual)}</td>
                  <td className={overBudget ? pg.varianceCellOver : pg.varianceCellUnder}>{variance >= 0 ? "+" : ""}{fmt(variance)}</td>
                  <td className={overBudget ? pg.variancePctOver : pg.variancePctUnder}>{pct}%</td>
                </tr>
              );
            };

            const saveEstimate = () => {
              setJobs(js => js.map(j => j.id === job.id ? { ...j, estimate: { ...estimateForm }, activityLog: addLog(j.activityLog, "Updated job estimate") } : j));
              setEditingEstimate(false);
            };

            return (
            <div>
              {/* Hero stat cards */}
              <div className={pg.u218}>
                <div className={pg.grayBox}>
                  <div className={pg.fs10fw700label}>Total Estimate</div>
                  <div className={pg.fs20fw800tight}>{totalEstimate > 0 ? fmt(totalEstimate) : "—"}</div>
                  <div className={pg.fs11caaamt3}>{acceptedQuotesTotal > 0 ? `Incl. ${fmt(acceptedQuotesTotal)} quoted` : totalEstimate > 0 ? "Budget set" : "No estimate set"}</div>
                </div>
                <div className={pg.grayBox}>
                  <div className={pg.fs10fw700label}>Revenue</div>
                  <div className={pg.fs20fw800tight}>{fmt(revenue)}</div>
                  <div className={pg.fs11caaamt3}>{revenueLabel}{totalPaid > 0 ? ` · ${fmt(totalPaid)} paid` : ""}</div>
                </div>
                <div className={pg.grayBox}>
                  <div className={pg.fs10fw700label}>Total Costs</div>
                  <div className={totalEstimate > 0 && totalActual > totalEstimate ? pg.costTotalOver : pg.costTotalUnder}>{fmt(totalActual)}</div>
                  {totalEstimate > 0 && <div className={pg.u219}>
                    <div className={pg.u220}>
                      <div style={{ width: `${costPct}%`, height: "100%", background: costPct > 90 ? "#dc2626" : costPct > 70 ? "#d97706" : "#059669", borderRadius: 2, transition: "width 0.3s" }} />
                    </div>
                    <div className={pg.u221}>{costPct}% of estimate</div>
                  </div>}
                </div>
                <div className={profit >= 0 ? pg.profitBoxPositive : pg.profitBoxNegative}>
                  <div className={profit >= 0 ? pg.profitLabelPositive : pg.profitLabelNegative}>Profit / Margin</div>
                  <div className={profit >= 0 ? pg.profitValuePositive : pg.profitValueNegative}>{fmt(profit)}</div>
                  <div className={profit >= 0 ? pg.profitMarginPositive : pg.profitMarginNegative}>{revenue > 0 ? `${marginPct}% margin` : "No revenue yet"}</div>
                </div>
              </div>

              {/* Estimate Breakdown — editable */}
              <div className={pg.mb20}>
                <div className={pg.u225}>
                  <div className={pg.textLabelNoMb}>Estimate Breakdown</div>
                  {!editingEstimate && <button className="btn btn-ghost btn-xs" onClick={() => { setEstimateForm({ ...defaultEstimate, ...(job.estimate || {}) }); setEditingEstimate(true); }}><Icon name="edit" size={11} /> Edit</button>}
                </div>
                {editingEstimate ? (
                  <div className={pg.u226}>
                    <div className={pg.u227}>
                      {[{ key: "labour", label: "Labour" }, { key: "materials", label: "Materials" }, { key: "subcontractors", label: "Subcontractors" }, { key: "other", label: "Other" }].map(f => (
                        <div key={f.key} className={`form-group ${jb.formGroupNoMb}`}>
                          <label className="form-label">{f.label}</label>
                          <div className={pg.p2_14}>
                            <span className={pg.p2_32}>$</span>
                            <input type="number" className={`form-control ${pg.flex1}`} value={estimateForm[f.key] || ""} onChange={e => setEstimateForm(prev => ({ ...prev, [f.key]: parseFloat(e.target.value) || 0 }))} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className={pg.u228}>
                      <div className={pg.fs14fw700}>Total: {fmt((estimateForm.labour || 0) + (estimateForm.materials || 0) + (estimateForm.subcontractors || 0) + (estimateForm.other || 0))}</div>
                      <div className={pg.flexGap8}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditingEstimate(false)}>Cancel</button>
                        <button className={`btn btn-sm ${pg.sectionAccentBtn}`} style={{ background: jobAccent }} onClick={saveEstimate}>Save Estimate</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className={pg.u229}>
                    {[{ label: "Labour", val: est.labour }, { label: "Materials", val: est.materials }, { label: "Subcontractors", val: est.subcontractors }, { label: "Other", val: est.other }].map(c => (
                      <div key={c.label} className={pg.u230}>
                        <div className={pg.p2_33}>{c.label}</div>
                        <div className={pg.u231}>{c.val ? fmt(c.val) : "—"}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Cost Breakdown */}
              <div className={pg.mb20}>
                <div className={pg.textLabelMb10}>Cost Breakdown</div>

                {/* Labour */}
                <div className={pg.whiteCardSm}>
                  <div className={pg.flexBetweenMb8}>
                    <div className={pg.fs13fw700}>Labour</div>
                    <div className={pg.fs14fw800}>{fmt(actualLabour)}</div>
                  </div>
                  {Object.entries(labourByWorker).length > 0 ? Object.entries(labourByWorker).map(([name, w]) => (
                    <div key={name} className={pg.detailRow}>
                      <span>{name} <span className={pg.color999}>({w.hours}h × ${w.rate}/hr)</span></span>
                      <span className={pg.fw600}>{fmt(w.cost)}</span>
                    </div>
                  )) : <div className={pg.textSub}>No time logged</div>}
                </div>

                {/* Materials */}
                <div className={pg.whiteCardSm}>
                  <div className={pg.flexBetweenMb8}>
                    <div className={pg.fs13fw700}>Materials</div>
                    <div className={pg.fs14fw800}>{fmt(actualMaterials)}</div>
                  </div>
                  {matBills.length > 0 ? matBills.map(b => (
                    <div key={b.id} className={pg.detailRow}>
                      <span>{b.supplier} {b.invoiceNo && <span className={pg.color999}>({b.invoiceNo})</span>}</span>
                      <span className={pg.fw600}>{fmt(b.amount)}</span>
                    </div>
                  )) : <div className={pg.textSub}>No material costs</div>}
                </div>

                {/* Subcontractors */}
                <div className={pg.whiteCardSm}>
                  <div className={pg.flexBetweenMb8}>
                    <div className={pg.fs13fw700}>Subcontractors</div>
                    <div className={pg.fs14fw800}>{fmt(actualSubs)}</div>
                  </div>
                  {subBills.length > 0 ? subBills.map(b => (
                    <div key={b.id} className={pg.detailRow}>
                      <span>{b.supplier} {b.invoiceNo && <span className={pg.color999}>({b.invoiceNo})</span>}</span>
                      <span className={pg.fw600}>{fmt(b.amount)}</span>
                    </div>
                  )) : <div className={pg.textSub}>No subcontractor costs</div>}
                </div>

                {/* Other */}
                {(otherBills.length > 0 || actualOther > 0) && (
                  <div className={pg.whiteCardSm}>
                    <div className={pg.flexBetweenMb8}>
                      <div className={pg.fs13fw700}>Other</div>
                      <div className={pg.fs14fw800}>{fmt(actualOther)}</div>
                    </div>
                    {otherBills.map(b => (
                      <div key={b.id} className={pg.detailRow}>
                        <span>{b.supplier} <span className={pg.color999}>({b.category})</span></span>
                        <span className={pg.fw600}>{fmt(b.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Estimate vs Actual */}
              {totalEstimate > 0 && (
                <div className={pg.mb20}>
                  <div className={pg.textLabelMb10}>Estimate vs Actual</div>
                  <div className={pg.p2_34}>
                    <table className={pg.u232}>
                      <thead>
                        <tr className={pg.p2_35}>
                          <th className={pg.u233}>Category</th>
                          <th className={pg.u234}>Estimate</th>
                          <th className={pg.u234}>Actual</th>
                          <th className={pg.u234}>Variance</th>
                          <th className={pg.u234}>Used</th>
                        </tr>
                      </thead>
                      <tbody>
                        {varRow("Labour", est.labour || 0, actualLabour)}
                        {varRow("Materials", est.materials || 0, actualMaterials)}
                        {varRow("Subcontractors", est.subcontractors || 0, actualSubs)}
                        {varRow("Other", est.other || 0, actualOther)}
                        <tr className={pg.u235}>
                          <td className={pg.u236}>Total</td>
                          <td className={pg.p2_36}>{fmt(totalEstimate)}</td>
                          <td className={pg.p2_36}>{fmt(totalActual)}</td>
                          <td className={pg.totalCellRight} style={{ color: totalActual > totalEstimate ? "#dc2626" : "#059669" }}>{totalEstimate - totalActual >= 0 ? "+" : ""}{fmt(totalEstimate - totalActual)}</td>
                          <td className={pg.totalCellRight} style={{ color: costPct > 100 ? "#dc2626" : "#059669" }}>{costPct}%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Revenue Breakdown */}
              <div>
                <div className={pg.textLabelMb10}>Revenue Breakdown</div>
                <div className={pg.p2_37}>
                  {[{ label: "Accepted Quotes", val: totalQuoted, count: jobQuotes.filter(q => q.status === "accepted").length },
                    { label: "Total Invoiced", val: totalInvoiced, count: jobInvoices.length },
                    { label: "Paid", val: totalPaid, count: jobInvoices.filter(i => i.status === "paid").length }
                  ].map((r, i) => (
                    <div key={r.label} className={i < 2 ? pg.revenueRowBorder : pg.revenueRow}>
                      <span className={pg.fs13c555}>{r.label} <span className={pg.color999}>({r.count})</span></span>
                      <span className={pg.fs14fw700}>{fmt(r.val)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Revenue at Client Rates */}
              {clientLabourRate > 0 && (
              <div className={pg.mt20}>
                <div className={pg.textLabelMb10}>Revenue at Client Rates</div>
                <div className={pg.p2_38}>
                  <div className={pg.u239}>
                    <div className={pg.u240}>Calculated Revenue</div>
                    <div className={pg.u241}>{fmt(clientTotalRevenue)}</div>
                    <div className={pg.p2_39}>Based on {client?.name} rates</div>
                  </div>
                  <div className={clientProfit >= 0 ? pg.profitBoxPositive : pg.profitBoxNegative}>
                    <div className={`${pg.projProfitLabel} ${clientProfit >= 0 ? pg.profitLabelPositive : pg.profitLabelNegative}`}>Projected Profit</div>
                    <div className={clientProfit >= 0 ? pg.profitValuePositive : pg.profitValueNegative}>{fmt(clientProfit)}</div>
                    <div className={pg.p2_39}>{clientMarginPct}% margin</div>
                  </div>
                </div>
                <div className={pg.p2_37}>
                  <div className={pg.listItemBorder}>
                    <span className={pg.fs13c555}>Labour <span className={pg.color999}>({totalLabourHours}h × ${clientLabourRate}/hr)</span></span>
                    <span className={pg.fs14fw700}>{fmt(clientLabourRevenue)}</span>
                  </div>
                  <div className={pg.listItemBorder}>
                    <span className={pg.fs13c555}>Materials <span className={pg.color999}>({fmt(actualMaterials)} + {clientMatMargin}% margin)</span></span>
                    <span className={pg.fs14fw700}>{fmt(clientMaterialRevenue)}</span>
                  </div>
                  <div className={pg.listItemBorder}>
                    <span className={pg.fs13c555}>Subcontractors <span className={pg.color999}>({fmt(actualSubs)} + {clientSubMargin}% margin)</span></span>
                    <span className={pg.fs14fw700}>{fmt(clientSubRevenue)}</span>
                  </div>
                  <div className={pg.u244}>
                    <span className={pg.fs13c555}>Other</span>
                    <span className={pg.fs14fw700}>{fmt(actualOther)}</span>
                  </div>
                  <div className={pg.u245}>
                    <span className={pg.u246}>Total</span>
                    <span className={pg.u247}>{fmt(clientTotalRevenue)}</span>
                  </div>
                </div>
              </div>
              )}
            </div>
            );
          })()}

          {/* ── Gantt Tab ── */}
          {tab === "gantt" && (() => {
            const phases = job.phases || [];
            if (phases.length === 0 && !showPhaseForm) {
              return (
                <div>
                  <div className="empty-state"><div className="empty-state-icon">📊</div><div className="empty-state-text">No project phases yet</div></div>
                  <div className={pg.u248}>
                    <button className={`btn btn-sm ${pg.sectionAccentBtn}`} style={{ background: jobAccent }} onClick={() => { setEditPhase(null); setPhaseForm({ ...defaultPhase }); setShowPhaseForm(true); }}>+ Add Phase</button>
                  </div>
                </div>
              );
            }
            const allDates = phases.flatMap(p => [p.startDate, p.endDate]).filter(Boolean);
            const minDate = allDates.length ? allDates.reduce((a, b) => a < b ? a : b) : job.startDate || new Date().toISOString().slice(0,10);
            const maxDate = allDates.length ? allDates.reduce((a, b) => a > b ? a : b) : job.dueDate || new Date().toISOString().slice(0,10);
            const startMs = new Date(minDate + "T00:00:00").getTime();
            const endMs = new Date(maxDate + "T23:59:59").getTime();
            const rangeMs = Math.max(endMs - startMs, 86400000);
            const todayStr = new Date().toISOString().slice(0,10);
            const todayMs = new Date(todayStr + "T12:00:00").getTime();
            const todayPct = Math.max(0, Math.min(100, ((todayMs - startMs) / rangeMs) * 100));

            const printGanttPdf = () => {
              const w = window.open("", "_blank");
              w.document.write(`<html><head><title>Gantt – ${job.title}</title><style>body{font-family:sans-serif;padding:30px}table{width:100%;border-collapse:collapse}th,td{padding:8px 12px;border:1px solid #ddd;text-align:left;font-size:13px}th{background:#f5f5f5;font-weight:700}.bar-cell{position:relative;height:24px}.bar{position:absolute;height:20px;border-radius:4px;top:2px}.bar-prog{height:100%;border-radius:4px;opacity:0.7}h1{font-size:20px;margin-bottom:4px}h2{font-size:14px;color:#888;margin-top:0}</style></head><body>`);
              w.document.write(`<h1>${job.title}</h1><h2>Project Schedule — Gantt Chart</h2>`);
              w.document.write(`<table><thead><tr><th style="width:160px">Phase</th><th>Start</th><th>End</th><th>Progress</th><th style="width:40%">Timeline</th></tr></thead><tbody>`);
              phases.forEach(p => {
                const pStart = ((new Date(p.startDate + "T00:00:00").getTime() - startMs) / rangeMs) * 100;
                const pWidth = Math.max(2, ((new Date(p.endDate + "T23:59:59").getTime() - new Date(p.startDate + "T00:00:00").getTime()) / rangeMs) * 100);
                w.document.write(`<tr><td style="font-weight:600">${p.name}</td><td>${fmtDate(p.startDate)}</td><td>${fmtDate(p.endDate)}</td><td>${p.progress}%</td><td class="bar-cell"><div class="bar" style="left:${pStart}%;width:${pWidth}%;background:${p.color}30"><div class="bar-prog" style="width:${p.progress}%;background:${p.color}"></div></div></td></tr>`);
              });
              w.document.write(`</tbody></table></body></html>`);
              w.document.close();
              setTimeout(() => w.print(), 300);
            };

            const savePhase = () => {
              if (!phaseForm.name.trim()) return;
              const updated = editPhase
                ? (job.phases || []).map(p => p.id === editPhase.id ? { ...p, ...phaseForm } : p)
                : [...(job.phases || []), { ...phaseForm, id: Date.now() }];
              setJobs(js => js.map(j => j.id === job.id ? { ...j, phases: updated, activityLog: addLog(j.activityLog, editPhase ? `Updated phase "${phaseForm.name}"` : `Added phase "${phaseForm.name}"`) } : j));
              setShowPhaseForm(false); setEditPhase(null);
            };
            const deletePhase = (pid) => {
              setJobs(js => js.map(j => j.id === job.id ? { ...j, phases: (j.phases || []).filter(p => p.id !== pid), activityLog: addLog(j.activityLog, "Removed a project phase") } : j));
            };

            return (
            <div>
              <div className={pg.p2_40}>
                <div className={pg.u249}>{phases.length} phase{phases.length !== 1 ? "s" : ""} · {minDate} → {maxDate}</div>
                <button className="btn btn-ghost btn-sm" onClick={printGanttPdf}>🖨️ Export PDF</button>
                <button className={`btn btn-sm ${pg.sectionAccentBtn}`} style={{ background: jobAccent }} onClick={() => { setEditPhase(null); setPhaseForm({ ...defaultPhase }); setShowPhaseForm(true); }}>+ Add Phase</button>
              </div>

              {showPhaseForm && (
                <div className={pg.p2_41}>
                  <div className={pg.p2_42}>
                    <div><label className={pg.fs11fw600c888}>Phase Name</label><input className="form-control" value={phaseForm.name} onChange={e => setPhaseForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Demolition" /></div>
                    <div><label className={pg.fs11fw600c888}>Color</label><input type="color" value={phaseForm.color} onChange={e => setPhaseForm(f => ({ ...f, color: e.target.value }))} className={pg.u250} /></div>
                    <div><label className={pg.fs11fw600c888}>Start Date</label><input type="date" className="form-control" value={phaseForm.startDate} onChange={e => setPhaseForm(f => ({ ...f, startDate: e.target.value }))} /></div>
                    <div><label className={pg.fs11fw600c888}>End Date</label><input type="date" className="form-control" value={phaseForm.endDate} onChange={e => setPhaseForm(f => ({ ...f, endDate: e.target.value }))} /></div>
                  </div>
                  <div className={pg.mb10}>
                    <label className={pg.fs11fw600c888}>Progress: {phaseForm.progress}%</label>
                    <input type="range" min="0" max="100" step="5" value={phaseForm.progress} onChange={e => setPhaseForm(f => ({ ...f, progress: parseInt(e.target.value) }))} className={pg.p2_43} />
                  </div>
                  <div className={pg.flexEndGap8}>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setShowPhaseForm(false); setEditPhase(null); }}>Cancel</button>
                    <button className={`btn btn-sm ${pg.sectionAccentBtn}`} style={{ background: jobAccent }} onClick={savePhase} disabled={!phaseForm.name.trim()}>
                      {editPhase ? "Update Phase" : "Add Phase"}
                    </button>
                  </div>
                </div>
              )}

              {/* Gantt Chart */}
              <div className={pg.p2_34}>
                {/* Header with date markers */}
                <div className={pg.u251}>
                  <div className={pg.u252}>Phase</div>
                  <div className={pg.u253}>
                    <span className={pg.u254}>{minDate}</span>
                    <span className={pg.u255}>{maxDate}</span>
                  </div>
                </div>
                {phases.map(p => {
                  const pStartMs = new Date(p.startDate + "T00:00:00").getTime();
                  const pEndMs = new Date(p.endDate + "T23:59:59").getTime();
                  const leftPct = ((pStartMs - startMs) / rangeMs) * 100;
                  const widthPct = Math.max(2, ((pEndMs - pStartMs) / rangeMs) * 100);
                  return (
                    <div key={p.id} className={pg.u256}>
                      <div className={pg.u257}>
                        <div className={pg.ganttPhaseDot} style={{ background: p.color }} />
                        <span className={pg.u258}>{p.name}</span>
                        <button className={`btn btn-ghost ${pg.u259}`} onClick={() => { setEditPhase(p); setPhaseForm({ name: p.name, startDate: p.startDate, endDate: p.endDate, color: p.color, progress: p.progress }); setShowPhaseForm(true); }}>✏️</button>
                        <button className={`btn btn-ghost ${pg.u260}`} onClick={() => deletePhase(p.id)}>🗑</button>
                      </div>
                      <div className={pg.u261}>
                        {todayPct > 0 && todayPct < 100 && <div className={pg.ganttTodayMarker} style={{ left: `${todayPct}%` }} />}
                        <div className={pg.ganttPhaseBar} style={{ left: `${leftPct}%`, width: `${widthPct}%`, background: p.color + "25" }}>
                          <div className={pg.ganttPhaseFill} style={{ width: `${p.progress}%`, background: p.color }} />
                        </div>
                        <div className={pg.ganttProgressLabel} style={{ left: `${leftPct + widthPct + 1}%` }}>{p.progress}%</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            );
          })()}

          {/* ── Tasks Tab ── */}
          {tab === "tasks" && (() => {
            const tasks = job.tasks || [];
            const done = tasks.filter(t => t.done).length;
            const todayStr = new Date().toISOString().slice(0,10);

            const toggleTask = (taskId) => {
              setJobs(js => js.map(j => j.id === job.id ? { ...j, tasks: (j.tasks || []).map(t => t.id === taskId ? { ...t, done: !t.done } : t) } : j));
            };
            const addTask = () => {
              if (!taskForm.text.trim()) return;
              const task = { id: Date.now(), text: taskForm.text, done: false, dueDate: taskForm.dueDate, assignedTo: taskForm.assignedTo, createdAt: new Date().toISOString() };
              setJobs(js => js.map(j => j.id === job.id ? { ...j, tasks: [...(j.tasks || []), task], activityLog: addLog(j.activityLog, `Added task "${task.text}"`) } : j));
              setTaskForm({ text: "", dueDate: "", assignedTo: "" });
              setShowTaskForm(false);
            };
            const deleteTask = (taskId) => {
              setJobs(js => js.map(j => j.id === job.id ? { ...j, tasks: (j.tasks || []).filter(t => t.id !== taskId) } : j));
            };
            const copyFromGantt = () => {
              const phases = job.phases || [];
              if (phases.length === 0) return;
              const existingTexts = new Set((job.tasks || []).map(t => t.text));
              const newTasks = phases.filter(p => !existingTexts.has(p.name)).map(p => ({
                id: Date.now() + Math.random(), text: p.name, done: p.progress >= 100, dueDate: p.endDate, assignedTo: "", createdAt: new Date().toISOString()
              }));
              if (newTasks.length === 0) return;
              setJobs(js => js.map(j => j.id === job.id ? { ...j, tasks: [...(j.tasks || []), ...newTasks], activityLog: addLog(j.activityLog, `Copied ${newTasks.length} tasks from Gantt phases`) } : j));
            };

            return (
            <div>
              <div className={pg.p2_40}>
                {tasks.length > 0 && (
                  <div className={pg.u262}>
                    <span className={pg.fs13fw600}>{done} of {tasks.length} complete</span>
                    <div className={pg.u263}>
                      <div className={pg.progressFill} style={{ width: `${tasks.length > 0 ? (done / tasks.length) * 100 : 0}%`, background: done === tasks.length ? "#059669" : jobAccent }} />
                    </div>
                  </div>
                )}
                {!tasks.length && <div className={pg.flex1} />}
                {(job.phases || []).length > 0 && <button className="btn btn-ghost btn-sm" onClick={copyFromGantt}>📋 Copy from Gantt</button>}
                <button className={`btn btn-sm ${pg.sectionAccentBtn}`} style={{ background: jobAccent }} onClick={() => setShowTaskForm(true)}>+ Add Task</button>
              </div>

              {showTaskForm && (
                <div className={pg.p2_41}>
                  <input className={`form-control ${pg.mb10}`} value={taskForm.text} onChange={e => setTaskForm(f => ({ ...f, text: e.target.value }))} placeholder="Task description…" />
                  <div className={pg.p2_42}>
                    <div><label className={pg.fs11fw600c888}>Due Date</label><input type="date" className="form-control" value={taskForm.dueDate} onChange={e => setTaskForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
                    <div><label className={pg.fs11fw600c888}>Assigned To</label>
                      <select className="form-control" value={taskForm.assignedTo} onChange={e => setTaskForm(f => ({ ...f, assignedTo: e.target.value }))}>
                        <option value="">Unassigned</option>
                        {TEAM.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className={pg.flexEndGap8}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowTaskForm(false)}>Cancel</button>
                    <button className={`btn btn-sm ${pg.sectionAccentBtn}`} style={{ background: jobAccent }} onClick={addTask} disabled={!taskForm.text.trim()}>Add Task</button>
                  </div>
                </div>
              )}

              {tasks.length === 0 && !showTaskForm && (
                <div className="empty-state"><div className="empty-state-icon">✅</div><div className="empty-state-text">No tasks yet</div></div>
              )}

              {tasks.length > 0 && (
                <div className={pg.p2_44}>
                  {tasks.map(task => {
                    const isOverdue = !task.done && task.dueDate && task.dueDate < todayStr;
                    return (
                      <div key={task.id} className={task.done ? pg.taskItemDone : pg.taskItemActive} style={{ borderLeft: `3px solid ${task.done ? "#059669" : isOverdue ? "#dc2626" : jobAccent}` }}>
                        <input type="checkbox" checked={task.done} onChange={() => toggleTask(task.id)} className={pg.taskCheckbox} style={{ accentColor: jobAccent }} />
                        <div className={pg.flex1}>
                          <div className={task.done ? pg.taskTextDone : pg.taskTextActive}>{task.text}</div>
                          <div className={pg.u265}>
                            {task.dueDate && <span className={isOverdue ? pg.taskDueOverdue : pg.taskDueNormal}>{isOverdue ? "⚠️ " : ""}{fmtDate(task.dueDate)}</span>}
                            {task.assignedTo && <span>· {task.assignedTo}</span>}
                          </div>
                        </div>
                        <button className={`btn btn-ghost ${pg.u266}`} onClick={() => deleteTask(task.id)}>✕</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            );
          })()}

          {tab === "notes" && (
            <NotesTab
              job={job}
              jobNotes={jobNotes}
              jobAccent={jobAccent}
              currentUser={CURRENT_USER}
              setJobs={setJobs}
              addLog={addLog}
              onShowFormFiller={setShowFormFiller}
              onShowPlanDrawing={setShowPlanDrawing}
              onShowPdfFiller={setShowPdfFiller}
              onSetLightboxImg={setLightboxImg}
              onSetMarkupImg={setMarkupImg}
              onSetViewingForm={setViewingForm}
              formTemplates={FORM_TEMPLATES}
              printFormPdf={printFormPdf}
              reopenPdfNote={reopenPdfNote}
            />
          )}

          {tab === "activity" && (
            <div>
              <div className={pg.u267}>
                <div className={pg.fs13c888}>{(job.activityLog||[]).length} event{(job.activityLog||[]).length !== 1 ? "s" : ""} recorded</div>
              </div>
              <ActivityLog entries={job.activityLog || []} />
            </div>
          )}

        </div>
        )}
    </SectionDrawer>

    {/* ── Image Lightbox ────────────────────────────────────────────── */}
    {lightboxImg && (
      <div onClick={() => setLightboxImg(null)} className={pg.p2_6}>
        <img src={lightboxImg} alt="Attachment" className={pg.p2_7} />
        <button onClick={(e) => { e.stopPropagation(); setMarkupImg({ src: lightboxImg, target: "new" }); setLightboxImg(null); }}
          className={pg.p2_8}>
          ✏️ Mark Up Photo
        </button>
        <button onClick={() => setLightboxImg(null)} className={pg.p2_9}>✕</button>
      </div>
    )}

    {/* ── Photo Markup Editor ──────────────────────────────────────── */}
    {markupImg && (
      <PhotoMarkupEditor
        imageSrc={markupImg.src}
        onSave={saveMarkup}
        onClose={() => setMarkupImg(null)}
      />
    )}

    {/* ── Plan Drawing Editor ────────────────────────────────────────── */}
    {showPlanDrawing && (
      <PlanDrawingEditor
        onSave={savePlan}
        onClose={() => setShowPlanDrawing(false)}
      />
    )}

    {/* ── PDF Form Filler ────────────────────────────────────────────── */}
    {showPdfFiller && (
      <PdfFormFiller
        pdfData={showPdfFiller.pdfData}
        fileName={showPdfFiller.fileName}
        existingFields={showPdfFiller.existingFields}
        onSave={handlePdfSave}
        onClose={() => setShowPdfFiller(null)}
      />
    )}

    {/* ── Form Filler Modal ──────────────────────────────────────────── */}
    {showFormFiller && (() => {
      const tmpl = showFormFiller;
      const client = clients.find(c => c.id === job.clientId);
      const site = client?.sites?.find(s => s.id === job.siteId);
      return <FormFillerModal template={tmpl} job={job} client={client} site={site}
        onSave={(formData, andPrint) => {
          const note = { id: Date.now(), text: `${tmpl.name} completed`, category: "form", formType: tmpl.id, formData, attachments: [], createdAt: new Date().toISOString(), createdBy: CURRENT_USER };
          setJobs(js => js.map(j => j.id === job.id ? { ...j, notes: [...(j.notes || []), note], activityLog: addLog(j.activityLog, `Completed ${tmpl.name} form`) } : j));
          setShowFormFiller(null);
          if (andPrint) printFormPdf(note, tmpl);
        }}
        onClose={() => setShowFormFiller(null)}
      />;
    })()}

    {/* ── Form Viewer Modal ──────────────────────────────────────────── */}
    {viewingForm && (() => {
      const tmpl = FORM_TEMPLATES.find(t => t.id === viewingForm.formType);
      const data = viewingForm.formData || {};
      return (
        <div className={pg.p2_45} onClick={() => setViewingForm(null)}>
          <div onClick={e => e.stopPropagation()} className={pg.p2_46}>
            <div className={pg.u268}>
              <span className={pg.p2_47}>{tmpl?.icon}</span>
              <h3 className={pg.p2_48}>{tmpl?.name || "Form"}</h3>
              <div className={pg.flex1} />
              <button className="btn btn-ghost btn-sm" onClick={() => { printFormPdf(viewingForm, tmpl); }}>🖨️ Print PDF</button>
              <button onClick={() => setViewingForm(null)} className={pg.plainBtn}>✕</button>
            </div>
            <div className={pg.u269}>Completed {new Date(viewingForm.createdAt).toLocaleString()} by {viewingForm.createdBy}</div>
            {(tmpl?.fields || []).map(field => {
              const val = data[field.key];
              return (
                <div key={field.key} className={pg.cardMb}>
                  <div className={pg.u270}>{field.label}</div>
                  {field.type === "checklist" ? (
                    <div className={pg.p2_44}>
                      {(field.options || []).map((opt, i) => (
                        <div key={i} className={pg.u271}>
                          <span className={(val || []).includes(opt) ? pg.checklistChecked : pg.checklistUnchecked}>{(val || []).includes(opt) ? "✓" : "✗"}</span>
                          <span className={(val || []).includes(opt) ? pg.checklistTextChecked : pg.checklistTextUnchecked}>{opt}</span>
                        </div>
                      ))}
                    </div>
                  ) : field.type === "signature" ? (
                    val ? <img src={val} alt="Signature" className={pg.u274} /> : <span className={pg.p2_32}>No signature</span>
                  ) : (
                    <div className={pg.u275}>{val || "—"}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    })()}

    {/* ── Inline Quote Drawer ─────────────────────────────────────────── */}
    {editingQuote && (() => {
      const qTotal = calcQuoteTotal(editingQuote);
      const qSub = (editingQuote.lineItems||[]).reduce((s,li) => s + (li.qty||0)*(li.rate||0), 0);
      const qGst = qSub * ((editingQuote.tax||0)/100);
      const qAccent = SECTION_COLORS.quotes.accent;
      return (
      <SectionDrawer
        accent={qAccent}
        icon={<Icon name="quotes" size={16} />}
        typeLabel="Quote"
        title={editingQuote.number || "New Quote"}
        statusBadge={<StatusBadge status={editingQuote.status} />}
        mode={inlineQuoteMode} setMode={setInlineQuoteMode}
        showToggle={true}
        statusStrip={inlineQuoteMode === "edit" ?
          <div className={pg.statusStripBarQuote} style={{ background: SECTION_COLORS.quotes.light }}>
            {["draft","sent","accepted","declined"].filter(s => s !== editingQuote.status).map(s => (
              <button key={s} className={`btn btn-xs ${pg.p2_49}`}
                onClick={() => setEditingQuote(q => ({ ...q, status: s }))}>{s.charAt(0).toUpperCase()+s.slice(1)}</button>
            ))}
          </div>
        : null}
        footer={inlineQuoteMode === "view" ? <>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditingQuote(null)}>Close</button>
          <button className={`btn btn-sm ${pg.sectionAccentBtn}`} style={{ background: qAccent }} onClick={() => setInlineQuoteMode("edit")}>
            <Icon name="edit" size={13} /> Edit
          </button>
        </> : <>
          <button className="btn btn-ghost btn-sm" onClick={() => setInlineQuoteMode("view")}>Cancel</button>
          <button className={`btn btn-sm ${pg.sectionAccentBtn}`} style={{ background: qAccent }} onClick={() => saveQuote(editingQuote)}>
            <Icon name="check" size={13} /> Save Quote
          </button>
        </>}
        onClose={() => setEditingQuote(null)}
        zIndex={1060}
      >
        {inlineQuoteMode === "view" ? (
        <div className={pg.drawerBody}>
          <div className={pg.p2_50}>
            <ViewField label="Status" value={editingQuote.status?.charAt(0).toUpperCase() + editingQuote.status?.slice(1)} />
            <ViewField label="GST" value={`${editingQuote.tax}%`} />
          </div>
          <div className={pg.mb20}>
            <div className={pg.textLabelMb8sq}>Line Items</div>
            <table className={pg.tableFullCollapse}>
              <thead><tr className={pg.borderBottom2}>
                <th className={pg.thLeft}>Description</th>
                <th className={pg.thRight}>Qty</th>
                <th className={pg.thLeft}>Unit</th>
                <th className={pg.thRight}>Rate</th>
                <th className={pg.thRight}>Amount</th>
              </tr></thead>
              <tbody>
                {(editingQuote.lineItems||[]).map((li, i) => (
                  <tr key={i} className={pg.borderBottom1}>
                    <td className={pg.tdPadFw500}>{li.desc || '—'}</td>
                    <td className={pg.tdRightAlt}>{li.qty}</td>
                    <td className={pg.tdPad}>{li.unit}</td>
                    <td className={pg.tdRightAlt}>{fmt(li.rate)}</td>
                    <td className={pg.tdPadRightFw600}>{fmt(li.qty * li.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={pg.grayRoundedBox}>
            <div className={pg.flexBetweenMb6}><span className={pg.color888}>Subtotal</span><span className={pg.fw600}>{fmt(qSub)}</span></div>
            <div className={pg.flexBetweenMb6}><span className={pg.color888}>GST ({editingQuote.tax}%)</span><span className={pg.fw600}>{fmt(qGst)}</span></div>
            <div className={pg.totalRow}><span className={pg.cellAmount}>Total</span><span className={pg.u276}>{fmt(qTotal)}</span></div>
          </div>
          {editingQuote.notes && <ViewField label="Notes / Terms" value={editingQuote.notes} />}
        </div>
        ) : (
        <div className={pg.drawerBody}>
          <div className={`grid-2 ${pg.mb16}`}>
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
          <div className={pg.p2_51}>
            <span className={pg.textMuted}>Subtotal <strong>{fmt(qSub)}</strong></span>
            <span className={pg.textMuted}>GST <strong>{fmt(qGst)}</strong></span>
            <span className={pg.fs14fw700}>Total {fmt(qTotal)}</span>
          </div>
          <div className={`form-group ${pg.mt16}`}>
            <label className="form-label">Notes / Terms</label>
            <textarea className="form-control" value={editingQuote.notes||""}
              onChange={e => setEditingQuote(q => ({ ...q, notes: e.target.value }))}
              placeholder="Payment terms, inclusions/exclusions, validity period…" />
          </div>
        </div>
        )}
      </SectionDrawer>
      );
    })()}

    {/* ── Inline Invoice Drawer ───────────────────────────────────────── */}
    {editingInvoice && (() => {
      const iSub = (editingInvoice.lineItems||[]).reduce((s,li) => s + (li.qty||0)*(li.rate||0), 0);
      const iGst = iSub * ((editingInvoice.tax||0)/100);
      const iTotal = iSub + iGst;
      const iAccent = SECTION_COLORS.invoices.accent;
      return (
      <SectionDrawer
        accent={iAccent}
        icon={<Icon name="invoices" size={16} />}
        typeLabel="Invoice"
        title={editingInvoice.number || "New Invoice"}
        statusBadge={<StatusBadge status={editingInvoice.status} />}
        mode={inlineInvMode} setMode={setInlineInvMode}
        showToggle={true}
        statusStrip={inlineInvMode === "edit" ?
          <div className={pg.statusStripBarQuote} style={{ background: SECTION_COLORS.invoices.light }}>
            {["draft","sent","paid","overdue","void"].filter(s => s !== editingInvoice.status).map(s => (
              <button key={s} className={`btn btn-xs ${pg.p2_49}`}
                onClick={() => setEditingInvoice(i => ({ ...i, status: s }))}>{s.charAt(0).toUpperCase()+s.slice(1)}</button>
            ))}
          </div>
        : null}
        footer={inlineInvMode === "view" ? <>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditingInvoice(null)}>Close</button>
          <button className={`btn btn-sm ${pg.sectionAccentBtn}`} style={{ background: iAccent }} onClick={() => setInlineInvMode("edit")}>
            <Icon name="edit" size={13} /> Edit
          </button>
        </> : <>
          <button className="btn btn-ghost btn-sm" onClick={() => setInlineInvMode("view")}>Cancel</button>
          <button className={`btn btn-sm ${pg.sectionAccentBtn}`} style={{ background: iAccent }} onClick={() => saveInvoice(editingInvoice)}>
            <Icon name="check" size={13} /> Save Invoice
          </button>
        </>}
        onClose={() => setEditingInvoice(null)}
        zIndex={1060}
      >
        {inlineInvMode === "view" ? (
        <div className={pg.drawerBody}>
          <div className={pg.u277}>
            <ViewField label="Status" value={editingInvoice.status?.charAt(0).toUpperCase() + editingInvoice.status?.slice(1)} />
            <ViewField label="Due Date" value={fmtDate(editingInvoice.dueDate)} />
            <ViewField label="GST" value={`${editingInvoice.tax}%`} />
          </div>
          <div className={pg.mb20}>
            <div className={pg.textLabelMb8sq}>Line Items</div>
            <table className={pg.tableFullCollapse}>
              <thead><tr className={pg.borderBottom2}>
                <th className={pg.thLeft}>Description</th>
                <th className={pg.thRight}>Qty</th>
                <th className={pg.thLeft}>Unit</th>
                <th className={pg.thRight}>Rate</th>
                <th className={pg.thRight}>Amount</th>
              </tr></thead>
              <tbody>
                {(editingInvoice.lineItems||[]).map((li, i) => (
                  <tr key={i} className={pg.borderBottom1}>
                    <td className={pg.tdPadFw500}>{li.desc || '—'}</td>
                    <td className={pg.tdRightAlt}>{li.qty}</td>
                    <td className={pg.tdPad}>{li.unit}</td>
                    <td className={pg.tdRightAlt}>{fmt(li.rate)}</td>
                    <td className={pg.tdPadRightFw600}>{fmt(li.qty * li.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={pg.grayRoundedBox}>
            <div className={pg.flexBetweenMb6}><span className={pg.color888}>Subtotal</span><span className={pg.fw600}>{fmt(iSub)}</span></div>
            <div className={pg.flexBetweenMb6}><span className={pg.color888}>GST ({editingInvoice.tax}%)</span><span className={pg.fw600}>{fmt(iGst)}</span></div>
            <div className={pg.totalRow}><span className={pg.cellAmount}>Total</span><span className={pg.u278}>{fmt(iTotal)}</span></div>
          </div>
          {editingInvoice.notes && <ViewField label="Notes" value={editingInvoice.notes} />}
        </div>
        ) : (
        <div className={pg.drawerBody}>
          <div className={`grid-3 ${pg.mb16}`}>
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
          <div className={pg.p2_51}>
            <span className={pg.textMuted}>Subtotal <strong>{fmt(iSub)}</strong></span>
            <span className={pg.textMuted}>GST <strong>{fmt(iGst)}</strong></span>
            <span className={pg.fs14fw700}>Total {fmt(iTotal)}</span>
          </div>
          <div className={`form-group ${pg.mt16}`}>
            <label className="form-label">Notes</label>
            <textarea className="form-control" value={editingInvoice.notes||""}
              onChange={e => setEditingInvoice(i => ({ ...i, notes: e.target.value }))}
              placeholder="Payment instructions, bank details, thank you note…" />
          </div>
        </div>
        )}
      </SectionDrawer>
      );
    })()}

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

// ── Form Filler Modal ────────────────────────────────────────────────────────
const FormFillerModal = ({ template, job, client, site, onSave, onClose }) => {
  const canvasRef = useRef(null);
  const [formData, setFormData] = useState(() => {
    const defaults = {};
    template.fields.forEach(f => {
      if (f.type === "checklist") defaults[f.key] = [];
      else if (f.type === "date") defaults[f.key] = new Date().toISOString().slice(0, 10);
      else if (f.type === "time") defaults[f.key] = "";
      else if (f.key === "jobDescription" || f.key === "workPerformed") defaults[f.key] = job?.description || "";
      else if (f.key === "location" || f.key === "site") defaults[f.key] = site?.name || site?.address || "";
      else if (f.key === "client") defaults[f.key] = client?.name || "";
      else if (f.key === "supervisor" || f.key === "technician" || f.key === "worker") defaults[f.key] = (job?.assignedTo || [])[0] || "";
      else defaults[f.key] = "";
    });
    return defaults;
  });
  const [sigField, setSigField] = useState(null);
  const [drawing, setDrawing] = useState(false);

  const startDraw = (e) => {
    setDrawing(true);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const draw = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
  };
  const endDraw = () => {
    if (!drawing) return;
    setDrawing(false);
    if (sigField && canvasRef.current) {
      setFormData(d => ({ ...d, [sigField]: canvasRef.current.toDataURL() }));
    }
  };
  const clearSig = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (sigField) setFormData(d => ({ ...d, [sigField]: "" }));
    }
  };

  const toggleChecklist = (key, opt) => {
    setFormData(d => {
      const arr = d[key] || [];
      return { ...d, [key]: arr.includes(opt) ? arr.filter(x => x !== opt) : [...arr, opt] };
    });
  };

  return (
    <div className={pg.p2_45} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className={pg.p2_46}>
        <div className={pg.p2_66}>
          <span className={pg.p2_47}>{template.icon}</span>
          <h3 className={pg.p2_48}>{template.name}</h3>
          <div className={pg.flex1} />
          <button onClick={onClose} className={pg.plainBtn}>✕</button>
        </div>

        {template.fields.map(field => (
          <div key={field.key} className={pg.mb16}>
            <label className={pg.u353}>{field.label}</label>
            {field.type === "text" && (
              <input className="form-control" value={formData[field.key] || ""} onChange={e => setFormData(d => ({ ...d, [field.key]: e.target.value }))} />
            )}
            {field.type === "date" && (
              <input type="date" className="form-control" value={formData[field.key] || ""} onChange={e => setFormData(d => ({ ...d, [field.key]: e.target.value }))} />
            )}
            {field.type === "time" && (
              <input type="time" className="form-control" value={formData[field.key] || ""} onChange={e => setFormData(d => ({ ...d, [field.key]: e.target.value }))} />
            )}
            {field.type === "textarea" && (
              <textarea className={`form-control ${pg.u354}`} rows={3} value={formData[field.key] || ""} onChange={e => setFormData(d => ({ ...d, [field.key]: e.target.value }))} />
            )}
            {field.type === "checklist" && (
              <div className={pg.u355}>
                {(field.options || []).map((opt, i) => (
                  <label key={i} className={pg.u356}>
                    <input type="checkbox" checked={(formData[field.key] || []).includes(opt)} onChange={() => toggleChecklist(field.key, opt)} className={pg.checklistCheckbox} />
                    {opt}
                  </label>
                ))}
              </div>
            )}
            {field.type === "signature" && (
              <div>
                {formData[field.key] && sigField !== field.key ? (
                  <div>
                    <img src={formData[field.key]} alt="Signature" className={pg.u358} />
                    <button className="btn btn-ghost btn-xs" onClick={() => { setSigField(field.key); setFormData(d => ({ ...d, [field.key]: "" })); }}>Re-sign</button>
                  </div>
                ) : (
                  <div>
                    <canvas ref={sigField === field.key ? canvasRef : undefined} width={400} height={120}
                      className={pg.u359}
                      onMouseDown={e => { setSigField(field.key); startDraw(e); }}
                      onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
                      onTouchStart={e => { setSigField(field.key); startDraw(e); }}
                      onTouchMove={draw} onTouchEnd={endDraw}
                      onClick={() => setSigField(field.key)}
                    />
                    <button className={`btn btn-ghost btn-xs ${pg.u360}`} onClick={clearSig}>Clear</button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        <div className={pg.u361}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className={`btn btn-sm ${pg.bluePrimaryBtn}`} onClick={() => onSave(formData, false)}>Save to Notes</button>
          <button className={`btn btn-sm ${pg.u362}`} onClick={() => onSave(formData, true)}>Save & Print PDF</button>
        </div>
      </div>
    </div>
  );
};

// ── Quotes ────────────────────────────────────────────────────────────────────
const QUOTE_STATUSES = ["all", "draft", "sent", "accepted", "declined"];

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
  const auth = useAuth();
  const staffNames = (staff && staff.length > 0) ? staff.map(s => s.name) : TEAM;
  const isStaffRole = !auth.isAdmin && !auth.isLocalDev;
  const defaultWorker = isStaffRole ? auth.currentUserName : (staffNames[0] || "");
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
    return { jobId: String(jobs[0]?.id || ""), worker: defaultWorker, date: today, startTime: "", endTime: "", description: "", billable: true };
  });
  const isNewTime = !editEntry;
  const [mode, setMode] = useState(isNewTime ? "edit" : "view");
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
    if (!isNewTime) setMode("view");
  };

  const jobName = jobs.find(j => String(j.id) === String(form.jobId))?.title || "Time Entry";

  return (
    <SectionDrawer
      accent={SECTION_COLORS.time.accent}
      icon={<Icon name="time" size={16} />}
      typeLabel="Time Entry"
      title={editEntry ? `${fmtDate(form.date)} · ${jobName}` : "Log Time"}
      mode={mode} setMode={setMode}
      showToggle={!isNewTime}
      isNew={isNewTime}
      footer={mode === "view" ? <>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        <button className={`btn btn-sm ${pg.sectionAccentBtn}`} style={{ background: SECTION_COLORS.time.accent }} onClick={() => setMode("edit")}>
          <Icon name="edit" size={13} /> Edit
        </button>
      </> : <>
        <button className="btn btn-ghost btn-sm" onClick={() => editEntry ? setMode("view") : onClose()}>{editEntry ? "Cancel" : "Cancel"}</button>
        <button className={`btn btn-sm ${pg.sectionAccentBtn}`} style={{ background: SECTION_COLORS.time.accent }} onClick={save} disabled={hours <= 0 || !form.jobId}>
          <Icon name="check" size={13} /> {isNewTime ? "Log Time" : "Save Changes"}
        </button>
      </>}
      onClose={onClose}
    >
      {mode === "view" ? (
        <div className={jb.drawerBody}>
          <div className="grid-2">
            <ViewField label="Job" value={jobName} />
            <ViewField label="Worker" value={form.worker} />
          </div>
          <ViewField label="Date" value={fmtDate(form.date)} />
          <div className="grid-2">
            <ViewField label="Start Time" value={form.startTime} />
            <ViewField label="End Time" value={form.endTime} />
          </div>
          <div className={tm.hoursDisplay} style={{ background: SECTION_COLORS.time.light }}>
            <div className={tm.hoursValue} style={{ color: SECTION_COLORS.time.accent }}>
              {hours > 0 ? `${hours.toFixed(1)}h` : "0.0h"}
            </div>
            <div className={tm.hoursLabel}>hours logged</div>
          </div>
          {form.description && <ViewField label="Description" value={form.description} />}
          <div className={tm.billableTag} style={{ background: form.billable ? "#ecfdf5" : "#f5f5f5", color: form.billable ? "#059669" : "#888" }}>
            {form.billable ? "Billable" : "Non-billable"}
          </div>
        </div>
      ) : (
      <div className={jb.drawerBody}>
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
            {isStaffRole ? (
              <input className={`form-control ${pg.u370}`} value={auth.currentUserName} disabled />
            ) : (
              <select className="form-control" value={form.worker} onChange={e => setForm(f => ({ ...f, worker: e.target.value }))}>
                {staffNames.map(t => <option key={t}>{t}</option>)}
              </select>
            )}
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
        <div className={tm.hoursDisplay} style={{ background: SECTION_COLORS.time.light }}>
          <div className={tm.hoursValue} style={{ color: hours > 0 ? SECTION_COLORS.time.accent : "#ccc" }}>
            {hours > 0 ? `${hours.toFixed(1)}h` : "0.0h"}
          </div>
          <div className={tm.hoursLabel}>hours logged</div>
        </div>

        {/* Quick-select presets */}
        <div className={tm.quickSelectLabel}>Quick Select</div>
        <div className={tm.presetGrid}>
          {TIME_PRESETS.map(p => (
            <button key={p.label}
              onClick={() => applyPreset(p.mins, p.label)}
              style={{
                padding: "7px 4px", borderRadius: 20, fontSize: 12, fontWeight: 600, textAlign: "center",
                border: activePreset === p.label ? `2px solid ${SECTION_COLORS.time.accent}` : "2px solid #e0e0e0",
                background: activePreset === p.label ? SECTION_COLORS.time.accent : "#f5f5f5",
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
      )}
    </SectionDrawer>
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
        className={tm.calDay} style={{
          boxShadow: isToday ? "0 0 0 2px #111" : "0 1px 4px rgba(0,0,0,0.06)",
          opacity: isFuture ? 0.4 : 1,
          cursor: hrs > 0 ? "pointer" : "default",
        }}>
        <div className={tm.calDayNum}>{d}</div>
        <div className={tm.calDayHours} style={{ color: hrs > 0 ? clr : "#ddd" }}>
          {hrs > 0 ? `${hrs.toFixed(1)}h` : "·"}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className={tm.calHeader}>
        <button className={`btn btn-ghost btn-sm ${tm.calNavBtn}`} onClick={() => setCalMonth(m => m - 1)}>‹</button>
        <span className={tm.calMonthLabel}>{monthLabel}</span>
        <button className={`btn btn-ghost btn-sm ${tm.calNavBtn}`} onClick={() => setCalMonth(m => m + 1)}>›</button>
      </div>
      <div className={tm.calGrid}>
        {DOW.map(d => <div key={d} className={tm.calDow}>{d}</div>)}
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
    <div className={tm.weekStripWrap}>
      <div className={tm.weekStripHeader}>
        <button className={`btn btn-ghost btn-sm ${tm.weekStripNavBtn}`} onClick={() => setWeekOffset(w => w - 1)}>‹</button>
        <span className={tm.weekStripLabel}>{weekLabel}</span>
        <button className={`btn btn-ghost btn-sm ${tm.weekStripNavBtn}`} onClick={() => setWeekOffset(w => w + 1)}>›</button>
      </div>
      <div className={tm.weekStripDays}>
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
              className={tm.weekDay} style={{
                background: isActive ? "#f5f5f5" : "transparent",
                borderBottom: isActive ? "3px solid #111" : "3px solid transparent",
              }}>
              <div className={tm.weekDayName} style={{ color: isActive ? "#111" : "#aaa" }}>
                {DAYS[d.getDay()]}
              </div>
              <div className={tm.weekDayDate} style={{ color: isToday ? "#111" : "#444" }}>{d.getDate()}</div>
              <div className={tm.weekDayHours} style={{ color: hrs > 0 || isPast ? clr : "transparent" }}>
                {hrs > 0 ? `${hrs.toFixed(1)}h` : isPast ? "" : ""}
              </div>
            </div>
          );
        })}
      </div>
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
  const isNew = !bill;
  const [form, setForm] = useState(bill ? { ...bill } : blank);
  const [mode, setMode] = useState(isNew ? "edit" : "view");
  const [imagePreview, setImagePreview] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState(null);
  const [extracted, setExtracted] = useState(false);
  const [lineItems, setLineItems] = useState([]);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);

  const exGst = form.hasGst ? (parseFloat(form.amount) || 0) / 1.1 : (parseFloat(form.amount) || 0);
  const gst   = form.hasGst ? (parseFloat(form.amount) || 0) - exGst : 0;
  const withMarkup = exGst * (1 + (parseFloat(form.markup) || 0) / 100);

  const handleFile = async (file) => {
    if (!file) return;
    setExtractError(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      setImagePreview(dataUrl);
      const base64 = dataUrl.split(",")[1];
      const mimeType = file.type || "image/jpeg";
      setExtracting(true);
      try {
        const data = await extractBillFromImage(base64, mimeType);
        if (data) {
          setForm(f => ({
            ...f,
            supplier: data.supplier || f.supplier,
            invoiceNo: data.invoiceNo || f.invoiceNo,
            date: data.date || f.date,
            amount: data.amount != null ? data.amount : f.amount,
            hasGst: data.hasGst != null ? data.hasGst : f.hasGst,
            category: data.category || f.category,
            description: data.description || f.description,
            notes: data.notes || f.notes,
          }));
          if (Array.isArray(data.lineItems) && data.lineItems.length > 0) {
            setLineItems(data.lineItems);
          }
          setExtracted(true);
        } else {
          setExtractError("AI extraction not available — fill in manually.");
        }
      } catch (err) {
        setExtractError(err.message || "Extraction failed — fill in manually.");
      } finally {
        setExtracting(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) handleFile(file);
  };

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

  const handleSaveAndView = () => { handleSave(); setMode("view"); };
  const linkedJob = jobs.find(j => String(j.id) === String(form.jobId));

  return (
    <SectionDrawer
      accent={SECTION_COLORS.bills.accent}
      icon={<Icon name="bills" size={16} />}
      typeLabel="Bill"
      title={bill ? (bill.invoiceNo || bill.supplier || "Edit Bill") : "Capture Receipt"}
      statusBadge={bill ? <StatusBadge status={form.status} /> : null}
      mode={mode} setMode={setMode}
      showToggle={!isNew}
      isNew={isNew}
      footer={mode === "view" ? <>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        <button className={`btn btn-sm ${pg.sectionAccentBtn}`} style={{ background: SECTION_COLORS.bills.accent }} onClick={() => setMode("edit")}>
          <Icon name="edit" size={13} /> Edit
        </button>
      </> : <>
        <button className="btn btn-ghost btn-sm" onClick={() => bill ? setMode("view") : onClose()}>{bill ? "Cancel" : "Cancel"}</button>
        <button className={`btn btn-sm ${pg.sectionAccentBtn}`} style={{ background: SECTION_COLORS.bills.accent }} onClick={isNew ? handleSave : handleSaveAndView} disabled={!form.supplier || !form.amount}>
          <Icon name="check" size={13} /> {isNew ? "Capture Bill" : "Save Changes"}
        </button>
      </>}
      onClose={onClose}
      zIndex={1060}
    >
      {mode === "view" ? (
        <div className={pg.drawerBody}>
          <div className={bl.sectionDivider}>Supplier Details</div>
          <div className="grid-2">
            <ViewField label="Supplier" value={form.supplier} />
            <ViewField label="Invoice / Receipt #" value={form.invoiceNo} />
          </div>
          <div className="grid-2">
            <ViewField label="Date" value={fmtDate(form.date)} />
            <ViewField label="Category" value={form.category} />
          </div>
          <ViewField label="Description" value={form.description} />

          <div className={bl.sectionBorder}>
            <div className={bl.sectionDivider}>Amount & Tax</div>
            <div className={bl.bigAmount} style={{ color: SECTION_COLORS.bills.accent }}>{fmt(parseFloat(form.amount) || 0)}</div>
            {parseFloat(form.amount) > 0 && (
              <div className={bl.gstBreakdown} style={{ background: SECTION_COLORS.bills.light }}>
                <div><span className={bl.gstLabel}>Ex-GST </span><strong>{fmt(exGst)}</strong></div>
                <div><span className={pg.color999}>GST </span><strong>{fmt(gst)}</strong></div>
                <div className={pg.p2_72}><span className={pg.color999}>Total </span><strong>{fmt(parseFloat(form.amount)||0)}</strong></div>
              </div>
            )}
          </div>

          <div className={bl.sectionBorderOnly}>
            <div className={bl.sectionDivider}>Job Allocation</div>
            <ViewField label="Linked Job" value={linkedJob?.title || "Unallocated"} />
            {parseFloat(form.markup) > 0 && <ViewField label="Markup" value={`${form.markup}% → ${fmt(withMarkup)} ex-GST`} />}
          </div>

          {form.notes && (
            <div className={bl.sectionBorderOnly}>
              <ViewField label="Internal Notes" value={form.notes} />
            </div>
          )}
        </div>
      ) : (
      <div className={jb.drawerBody}>

          {/* AI Image Upload — only for new bills */}
          {isNew && (
            <div className={bl.uploadSection}>
              {!imagePreview ? (
                <div
                  className={`bill-upload-zone${dragging ? " dragging" : ""}`}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif"
                    capture="environment"
                    className={pg.hidden}
                    onChange={e => handleFile(e.target.files?.[0])}
                  />
                  <Icon name="camera" size={28} />
                  <div className={bl.uploadPromptTitle}>Upload receipt or invoice</div>
                  <div className={bl.uploadPromptSub}>Take a photo or drag & drop an image — AI will extract the details</div>
                </div>
              ) : (
                <div className="bill-preview-wrap">
                  <img src={imagePreview} alt="Receipt preview" className="bill-preview-img" />
                  <div className="bill-preview-info">
                    {extracting && (
                      <div className="bill-extracting">
                        <div className="bill-spinner" />
                        <span>Analysing receipt with AI...</span>
                      </div>
                    )}
                    {extracted && !extracting && (
                      <div className={bl.extractSuccess}>
                        <Icon name="check" size={14} /> Data extracted — review below
                      </div>
                    )}
                    {extractError && !extracting && (
                      <div className={bl.extractError}>{extractError}</div>
                    )}
                    <button className={`btn btn-secondary btn-sm ${pg.p2_30}`} onClick={() => { setImagePreview(null); setExtracted(false); setExtractError(null); setLineItems([]); }}>
                      Remove image
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Extracted Line Items */}
          {lineItems.length > 0 && (
            <div className={bl.lineItemsSection}>
              <div className={bl.sectionDivider}>Extracted Line Items</div>
              <table className="line-items-table">
                <thead>
                  <tr>
                    <th className={pg.u387}>Item</th>
                    <th className={pg.textRight}>Qty</th>
                    <th className={pg.textRight}>Unit Price</th>
                    <th className={pg.textRight}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, i) => (
                    <tr key={i}>
                      <td>{item.description}</td>
                      <td className={pg.textRight}>{item.qty ?? "—"}</td>
                      <td className={pg.textRight}>{item.unitPrice != null ? fmt(item.unitPrice) : "—"}</td>
                      <td className={pg.u388}>{item.total != null ? fmt(item.total) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Supplier & Reference */}
          <div className={bl.sectionDivider}>Supplier Details</div>
          <div className={`grid-2 ${pg.mb0}`}>
            <div className="form-group">
              <label className="form-label">Supplier Name *</label>
              <input className="form-control" value={form.supplier} onChange={e => setForm(f=>({...f, supplier: e.target.value}))} placeholder="e.g. Bunnings, ElecPro…" />
            </div>
            <div className="form-group">
              <label className="form-label">Invoice / Receipt #</label>
              <input className="form-control" value={form.invoiceNo} onChange={e => setForm(f=>({...f, invoiceNo: e.target.value}))} placeholder="e.g. INV-1234" />
            </div>
          </div>
          <div className={`grid-2 ${pg.mb0}`}>
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
          <div className={bl.sectionBorder}>
            <div className={bl.sectionDivider}>Amount & Tax</div>
            <div className={`grid-2 ${pg.mb0}`}>
              <div className="form-group">
                <label className="form-label">Total Amount (as on receipt)</label>
                <div className={bl.inputWrap}>
                  <span className={bl.inputPrefix}>$</span>
                  <input type="number" className={`form-control ${bl.inputPrefixed}`} value={form.amount} onChange={e => setForm(f=>({...f, amount: e.target.value}))} placeholder="0.00" min="0" step="0.01" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">GST</label>
                <div className={bl.gstCheckRow}>
                  <label className={`checkbox-label ${bl.gstCheckLabel}`}>
                    <input type="checkbox" checked={form.hasGst} onChange={e => setForm(f=>({...f, hasGst: e.target.checked}))} />
                    Includes GST (10%)
                  </label>
                </div>
              </div>
            </div>
            {/* GST breakdown */}
            {parseFloat(form.amount) > 0 && (
              <div className={`${bl.gstBreakdown} ${pg.p2_35}`}>
                <div><span className={bl.gstLabel}>Ex-GST </span><strong>{fmt(exGst)}</strong></div>
                <div><span className={pg.color999}>GST </span><strong>{fmt(gst)}</strong></div>
                <div className={pg.p2_72}><span className={pg.color999}>Total (inc.) </span><strong>{fmt(parseFloat(form.amount)||0)}</strong></div>
              </div>
            )}
          </div>

          {/* Link to job & markup */}
          <div className={bl.sectionBorderOnly}>
            <div className={bl.sectionDivider}>Job Allocation & Markup</div>
            <div className={`grid-2 ${pg.mb0}`}>
              <div className="form-group">
                <label className="form-label">Link to Job</label>
                <select className="form-control" value={form.jobId || ""} onChange={e => setForm(f=>({...f, jobId: e.target.value || null}))}>
                  <option value="">— Unallocated (Inbox) —</option>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Markup % (on-charge to client)</label>
                <div className={bl.inputWrap}>
                  <input type="number" className={`form-control ${bl.inputSuffixed}`} value={form.markup} onChange={e => setForm(f=>({...f, markup: e.target.value}))} placeholder="0" min="0" max="200" />
                  <span className={bl.inputSuffix}>%</span>
                </div>
                {parseFloat(form.markup) > 0 && parseFloat(form.amount) > 0 && (
                  <div className={bl.markupHint}>
                    On-charge: <strong className={pg.color111}>{fmt(withMarkup)}</strong> (ex-GST + {form.markup}%)
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className={bl.sectionBorderOnly}>
            <div className={`form-group ${jb.formGroupNoMb}`}>
              <label className="form-label">Internal Notes</label>
              <textarea className="form-control" value={form.notes} onChange={e => setForm(f=>({...f, notes: e.target.value}))} placeholder="Any notes for approver, discrepancies, receipt condition…" />
            </div>
          </div>

      </div>
      )}
    </SectionDrawer>
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
    <SectionDrawer
      accent={SECTION_COLORS.bills.accent}
      icon={<Icon name="bills" size={16} />}
      typeLabel="Post to Job"
      title={bill.supplier}
      mode="edit" setMode={() => {}}
      showToggle={false}
      footer={<>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        <button className={`btn btn-sm ${pg.sectionAccentBtn}`} style={{ background: SECTION_COLORS.bills.accent }} onClick={() => onPost(jobId, category, parseFloat(markup)||0)} disabled={!jobId}>
          <Icon name="check" size={13} /> Post to Job
        </button>
      </>}
      onClose={onClose}
      zIndex={1060}
    >
      <div className={jb.drawerBody}>
        <div className={bl.postSummaryBox}>
          <div className={bl.postSupplier}>{bill.supplier}</div>
          <div className={bl.postDetail}>{bill.invoiceNo && `${bill.invoiceNo} · `}{bill.description}</div>
          <div className={bl.postAmount}>{fmt(bill.amount)} <span className={bl.postAmountSuffix}>inc. GST</span></div>
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
          <div className={bl.inputWrap}>
            <input type="number" className={`form-control ${bl.inputSuffixed}`} value={markup}
              onChange={e => setMarkup(e.target.value)} min="0" max="200" placeholder="0" />
            <span className={bl.inputSuffix}>%</span>
          </div>
        </div>

        {/* Cost summary */}
        <div className={bl.costSummaryBox}>
          <div className={bl.costSummaryTitle}>Cost Summary</div>
          <div className={bl.costRows}>
            <div className={bl.costRow}>
              <span className={bl.costRowLabel}>Ex-GST cost</span><span>{fmt(exGst)}</span>
            </div>
            {parseFloat(markup) > 0 && (
              <div className={bl.costRow}>
                <span className={bl.costRowLabel}>Markup ({markup}%)</span><span>+ {fmt(exGst * (parseFloat(markup)||0) / 100)}</span>
              </div>
            )}
            <div className={bl.costRowTotal}>
              <span>On-charge to client</span><span>{fmt(withMarkup)}</span>
            </div>
          </div>
        </div>
      </div>
    </SectionDrawer>
  );
};

// ── Invoices ──────────────────────────────────────────────────────────────────
const INV_STATUSES = ["all", "draft", "sent", "paid", "overdue", "void"];

// ══════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ══════════════════════════════════════════════════════════════════════════════
// ── Hamburger Icon ────────────────────────────────────────────────────────────
const ChangePasswordModal = ({ onClose }) => {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setError(null);
    if (pw.length < 6) { setError("Password must be at least 6 characters"); return; }
    if (pw !== confirm) { setError("Passwords do not match"); return; }
    setSaving(true);
    try {
      await changePassword(pw);
      setSuccess(true);
    } catch (err) { setError(err.message); }
    setSaving(false);
  };

  return (
    <div className={pg.u664} onClick={onClose}>
      <div className={pg.u665} onClick={e => e.stopPropagation()}>
        <div className={pg.p2_101}>Change Password</div>
        <div className={pg.fs12c888mb20}>Enter a new password for your account</div>
        {success ? (
          <>
            <div className={pg.u666}>Password updated successfully.</div>
            <button className={`btn btn-ghost btn-sm ${pg.p2_43}`} onClick={onClose}>Close</button>
          </>
        ) : (
          <form onSubmit={save}>
            {error && <div className={pg.u667}>{error}</div>}
            <label className={pg.fieldLabelAlt}>New Password</label>
            <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••" required autoFocus
              className={pg.formInputLg14mb12} />
            <label className={pg.fieldLabelAlt}>Confirm Password</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="••••••••" required
              className={pg.u668} />
            <div className={pg.flexEndGap8}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
              <button type="submit" className={`btn btn-sm ${pg.blackAccentBtn}`} style={{ opacity: saving ? 0.6 : 1 }} disabled={saving}>
                {saving ? "Saving…" : "Update Password"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

// ── Hamburger Icon ────────────────────────────────────────────────────────────
const HamburgerIcon = ({ open }) => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    {open
      ? <><line x1="4" y1="4" x2="16" y2="16"/><line x1="16" y1="4" x2="4" y2="16"/></>
      : <><line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="15" x2="17" y2="15"/></>
    }
  </svg>
);

// ── Error Boundary ───────────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("ErrorBoundary caught:", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className={pg.errorBoundary}>
          <div className={pg.errorBoundaryTitle}>Something went wrong</div>
          <div className={pg.errorBoundaryMsg}>{this.state.error.message}</div>
          <button className="btn btn-primary" onClick={() => this.setState({ error: null })}>Try Again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Page Loading Fallback ────────────────────────────────────────────────────
const PageLoader = () => (
  <div className={pg.pageLoader}>
    <div className={pg.pageLoaderSpinner} />
    <div className={pg.pageLoaderText}>Loading…</div>
  </div>
);

const ROUTE_MAP = {
  dashboard: "/",
  jobs: "/jobs",
  orders: "/orders",
  clients: "/clients",
  contractors: "/contractors",
  suppliers: "/suppliers",
  schedule: "/schedule",
  quotes: "/quotes",
  time: "/time",
  bills: "/bills",
  invoices: "/invoices",
  actions: "/actions",
  reminders: "/reminders",
  activity: "/activity",
  status: "/status",
  settings: "/settings",
  files: "/files",
  calllog: "/call-log",
  assistant: "/my-assistant",
  memory: "/caller-memory",
  account: "/account",
};
const PATH_TO_ID = Object.fromEntries(
  Object.entries(ROUTE_MAP).map(([id, path]) => [path, id])
);

export default function App() {
  const auth = useAuth();
  // Update module-level CURRENT_USER from auth context
  if (auth.staff) setCURRENT_USER(auth.staff.name);

  const location = useLocation();
  const routerNavigate = useNavigate();
  const page = PATH_TO_ID[location.pathname] || "dashboard";
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile overlay
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return sessionStorage.getItem('fieldops_sidebar_collapsed') === 'true'; } catch { return false; }
  }); // desktop collapse
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth > 1024);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1025px)');
    const handler = (e) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  const collapsed = sidebarCollapsed && isDesktop;
  const [showQuickNote, setShowQuickNote] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [topbarTime, setTopbarTime] = useState(getFormattedDateTime());
  useEffect(() => {
    const id = setInterval(() => setTopbarTime(getFormattedDateTime()), 60000);
    return () => clearInterval(id);
  }, []);

  // ── Store: only what App itself needs (badge counts + loading state) ────
  const { jobs, bills, invoices, quotes, workOrders, purchaseOrders, contractors, reminders, loading, dbError, init: storeInit } = useAppStore();

  // ── Initialise store on mount ───────────────────────────────────────────
  useEffect(() => {
    const initTemplates = SEED_TEMPLATES;
    const initCompanyInfo = { ...DEFAULT_COMPANY };

    storeInit({
      clients: SEED_CLIENTS,
      jobs: SEED_JOBS,
      quotes: SEED_QUOTES,
      invoices: SEED_INVOICES,
      timeEntries: SEED_TIME,
      bills: SEED_BILLS,
      schedule: SEED_SCHEDULE,
      futureSchedule: SEED_FUTURE_SCHEDULE,
      contractors: SEED_CONTRACTORS,
      suppliers: SEED_SUPPLIERS,
      staff: TEAM_DATA.map((t, i) => ({ id: i + 1, name: t.name, costRate: t.costRate, chargeRate: t.chargeRate })),
      reminders: SEED_REMINDERS,
      callLog: SEED_CALL_LOG,
      templates: initTemplates,
      companyInfo: initCompanyInfo,
      workOrders: SEED_WO,
      purchaseOrders: SEED_PO,
    });
  }, []);

  const pendingBillsCount = bills.filter(b => b.status === "inbox" || b.status === "linked" || b.status === "approved").length;
  const unpaidInvCount = invoices.filter(i => i.status !== "paid" && i.status !== "void").length;
  const activeJobsCount = jobs.filter(j => j.status === "in_progress").length;
  const ordersOverdueCount = [...workOrders, ...purchaseOrders].filter(o => !ORDER_TERMINAL.includes(o.status) && daysUntil(o.dueDate) < 0).length;
  const contractorComplianceIssues = contractors.reduce((sum, c) => sum + getContractorComplianceCount(c), 0);
  const overdueRemindersCount = reminders.filter(r => r.status === "pending" && r.dueDate < new Date().toISOString().split("T")[0]).length;
  const overdueJobsCount = jobs.filter(j => j.dueDate && daysUntil(j.dueDate) < 0 && j.status !== "completed" && j.status !== "cancelled").length;
  const draftQuotesCount = quotes.filter(q => q.status === "draft").length;
  const woAwaitingCount = workOrders.filter(wo => wo.status === "Sent").length;
  const totalActionsCount = overdueRemindersCount + ordersOverdueCount + pendingBillsCount + unpaidInvCount + contractorComplianceIssues + overdueJobsCount + draftQuotesCount + woAwaitingCount;

  const navItems = [
    // Top (no section header) — 0..3
    { id: "dashboard", label: "Dashboard", icon: "dashboard" },
    { id: "actions", label: "Actions", icon: "notification", badge: totalActionsCount || null, badgeColor: "#dc2626" },
    { id: "schedule", label: "Schedule", icon: "schedule" },
    { id: "reminders", label: "Reminders", icon: "notification", badge: overdueRemindersCount || null, badgeColor: "#dc2626" },
    // Main — 4..5
    { id: "jobs", label: "Jobs", icon: "jobs", badge: activeJobsCount || null },
    { id: "orders", label: "Orders", icon: "orders", badge: ordersOverdueCount || null },
    // Finance — 6..9
    { id: "time", label: "Time", icon: "time" },
    { id: "bills", label: "Bills", icon: "bills", badge: pendingBillsCount || null },
    { id: "quotes", label: "Quotes", icon: "quotes" },
    { id: "invoices", label: "Invoices", icon: "invoices", badge: unpaidInvCount || null },
    // Partners — 10..12
    { id: "clients", label: "Clients", icon: "clients" },
    { id: "contractors", label: "Contractors", icon: "contractors", badge: contractorComplianceIssues || null, badgeColor: "#dc2626" },
    { id: "suppliers", label: "Suppliers", icon: "suppliers" },
    // System — 13+
    ...((auth.isAdmin || auth.isLocalDev) ? [{ id: "settings", label: "Settings", icon: "settings" }] : []),
    { id: "files", label: "Files", icon: "quotes" },
    { id: "calllog", label: "Call Log", icon: "send" },
    { id: "memory", label: "Caller Memory", icon: "clients" },
    { id: "activity", label: "Activity", icon: "notification" },
    { id: "status", label: "System Status", icon: "activity" },
  ];

  // Bottom nav: fixed set of field-worker shortcuts
  const bottomNavIds = ["schedule", "time", "notes", "reminders"];
  const bottomNavItems = [
    { id: "schedule", label: "Schedule", icon: "schedule" },
    { id: "time", label: "Time", icon: "time" },
    { id: "notes", label: "Notes", icon: "quotes" },
    { id: "reminders", label: "Reminders", icon: "notification", badge: overdueRemindersCount || null, badgeColor: "#dc2626" },
  ];

  const pageTitles = { dashboard: "Dashboard", jobs: "Jobs", orders: "Orders", clients: "Clients", contractors: "Contractors", suppliers: "Suppliers", schedule: "Schedule", quotes: "Quotes", time: "Time Tracking", bills: "Bills & Costs", invoices: "Invoices", actions: "Actions", reminders: "Reminders", activity: "Activity Log", status: "System Status", settings: "Settings", files: "Files", calllog: "Call Log", assistant: "My Assistant", memory: "Caller Memory", account: "Account" };

  const navigate = (id) => {
    routerNavigate(ROUTE_MAP[id] || "/");
    setSidebarOpen(false);
  };

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try { sessionStorage.setItem('fieldops_sidebar_collapsed', String(next)); } catch {}
      return next;
    });
  };

  const routeElements = (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Dashboard onNav={navigate} />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/contractors" element={<Contractors />} />
          <Route path="/suppliers" element={<Suppliers />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/quotes" element={<Quotes />} />
          <Route path="/time" element={<TimeTracking />} />
          <Route path="/bills" element={<Bills />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/actions" element={<Actions onNav={navigate} />} />
          <Route path="/reminders" element={<Reminders />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/status" element={<SystemStatus />} />
          <Route path="/settings" element={(auth.isAdmin || auth.isLocalDev) ? <Settings /> : <Navigate to="/" replace />} />
          <Route path="/my-assistant" element={<MyAssistant />} />
          <Route path="/account" element={<Account />} />
          <Route path="/caller-memory" element={<CallerMemory />} />
          <Route path="/call-log" element={<CallLog onNav={navigate} />} />
          <Route path="/files" element={<FilesPage />} />
          <Route path="/display/schedule" element={<DisplaySchedule />} />
          <Route path="/display/overview" element={<DisplayOverview />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );

  // Display routes render without nav shell
  const isDisplay = location.pathname.startsWith("/display/");
  if (isDisplay) {
    return (
      <div>
        {loading ? (
          <div className={sh.displayLoading}>Loading…</div>
        ) : routeElements}
      </div>
    );
  }

  return (
    <div className="jm-root">
      {loading && (
        <div className={sh.fullScreenOverlay}>
          <div className={sh.spinner} />
          <div className={sh.loadingText}>Loading…</div>
        </div>
      )}
      {dbError && (
        <div className={sh.fullScreenOverlay}>
          <div className={sh.errorTitle}>Failed to connect to database</div>
          <div className={sh.errorDetail}>{dbError}</div>
        </div>
      )}
      {!loading && !dbError && (
      <>
      {/* Overlay for mobile sidebar */}
      <div className={`jm-sidebar-overlay ${sidebarOpen ? "open" : ""}`} onClick={() => setSidebarOpen(false)} />

      {/* Sidebar */}
      <nav className={`jm-sidebar ${sidebarOpen ? "open" : ""} ${collapsed ? "collapsed" : ""}`}>
        <div className={`jm-logo ${sh.logoRow}`}>
          <div className={collapsed ? "jm-logo-collapsed" : ""}>
            <div className="jm-logo-mark">{collapsed ? "FO" : "FieldOps"}</div>
            {!collapsed && <div className="jm-logo-sub">Job Management</div>}
          </div>
          {/* Close btn visible only on mobile */}
          <button
            onClick={() => setSidebarOpen(false)}
            className={`jm-sidebar-close ${sh.sidebarCloseBtn}`}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="3" x2="15" y2="15"/><line x1="15" y1="3" x2="3" y2="15"/>
            </svg>
          </button>
        </div>
        <div className="jm-nav">
          {/* Top — Dashboard, Actions, Schedule, Reminders (no section header) */}
          {navItems.slice(0, 4).map(n => {
            const accent = (SECTION_COLORS[n.id] || SECTION_COLORS.wo)?.accent;
            return (
            <div key={n.id} className={`jm-nav-item ${page === n.id ? "active" : ""}`} onClick={() => navigate(n.id)}
              style={page === n.id ? { borderLeftColor: accent, background: hexToRgba(accent, 0.12) } : undefined}>
              <Icon name={n.icon} size={15} />{!collapsed && n.label}
              {n.badge && !collapsed ? <span className="badge" style={n.badgeColor ? { background: n.badgeColor, color: "#fff" } : undefined}>{n.badge}</span> : null}
            </div>
            );
          })}
          {!collapsed && <div className="jm-nav-section">Main</div>}{collapsed && <div className="jm-nav-divider" />}
          {navItems.slice(4, 6).map(n => {
            const accent = (SECTION_COLORS[n.id] || SECTION_COLORS.wo)?.accent;
            return (
            <div key={n.id} className={`jm-nav-item ${page === n.id ? "active" : ""}`} onClick={() => navigate(n.id)}
              style={page === n.id ? { borderLeftColor: accent, background: hexToRgba(accent, 0.12) } : undefined}>
              <Icon name={n.icon} size={15} />{!collapsed && n.label}
              {n.badge && !collapsed ? <span className="badge" style={n.badgeColor ? { background: n.badgeColor, color: "#fff" } : undefined}>{n.badge}</span> : null}
            </div>
            );
          })}
          {!collapsed && <div className="jm-nav-section">Finance</div>}{collapsed && <div className="jm-nav-divider" />}
          {navItems.slice(6, 10).map(n => {
            const accent = (SECTION_COLORS[n.id] || SECTION_COLORS.wo)?.accent;
            return (
            <div key={n.id} className={`jm-nav-item ${page === n.id ? "active" : ""}`} onClick={() => navigate(n.id)}
              style={page === n.id ? { borderLeftColor: accent, background: hexToRgba(accent, 0.12) } : undefined}>
              <Icon name={n.icon} size={15} />{!collapsed && n.label}
              {n.badge && !collapsed ? <span className="badge" style={n.badgeColor ? { background: n.badgeColor, color: "#fff" } : undefined}>{n.badge}</span> : null}
            </div>
            );
          })}
          {!collapsed && <div className="jm-nav-section">Partners</div>}{collapsed && <div className="jm-nav-divider" />}
          {navItems.slice(10, 13).map(n => {
            const accent = (SECTION_COLORS[n.id] || SECTION_COLORS.wo)?.accent;
            return (
            <div key={n.id} className={`jm-nav-item ${page === n.id ? "active" : ""}`} onClick={() => navigate(n.id)}
              style={page === n.id ? { borderLeftColor: accent, background: hexToRgba(accent, 0.12) } : undefined}>
              <Icon name={n.icon} size={15} />{!collapsed && n.label}
              {n.badge && !collapsed ? <span className="badge" style={n.badgeColor ? { background: n.badgeColor, color: "#fff" } : undefined}>{n.badge}</span> : null}
            </div>
            );
          })}
          {!collapsed && <div className="jm-nav-section">System</div>}{collapsed && <div className="jm-nav-divider" />}
          {navItems.slice(13).map(n => {
            const accent = (SECTION_COLORS[n.id] || SECTION_COLORS.activity)?.accent;
            return (
            <div key={n.id} className={`jm-nav-item ${page === n.id ? "active" : ""}`} onClick={() => navigate(n.id)}
              style={page === n.id ? { borderLeftColor: accent, background: hexToRgba(accent, 0.12) } : undefined}>
              <Icon name={n.icon} size={15} />{!collapsed && n.label}
              {n.badge && !collapsed ? <span className="badge" style={n.badgeColor ? { background: n.badgeColor, color: "#fff" } : undefined}>{n.badge}</span> : null}
            </div>
            );
          })}
        </div>
        <div className={sh.sidebarFooter}>
          {/* User menu popover */}
          {showUserMenu && !auth.isLocalDev && (
            <div className={sh.userMenuPopover}>
              <button onClick={() => { navigate("account"); setShowUserMenu(false); }} className={sh.userMenuBtn}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 10-16 0"/></svg>
                Account
              </button>
              <button onClick={() => { navigate("assistant"); setShowUserMenu(false); }} className={sh.userMenuBtn}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 00-3 3v4a3 3 0 006 0V5a3 3 0 00-3-3z"/><path d="M19 10v1a7 7 0 01-14 0v-1m7 8v4m-4 0h8"/></svg>
                My Assistant
              </button>
              <div className={sh.userMenuDivider} />
              <button onClick={() => { auth.signOut(); setShowUserMenu(false); }} className={sh.userMenuBtnDanger}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4m7 14l5-5-5-5m5 5H9"/></svg>
                Sign Out
              </button>
            </div>
          )}
          <div className={auth.isLocalDev ? sh.userRow : sh.userRowClickable} onClick={() => !auth.isLocalDev && setShowUserMenu(v => !v)}>
            <div className={sh.userAvatar}>
              {(auth.staff?.name || "AJ").split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            {!collapsed && (
              <>
                <div className={sh.userInfo}>
                  <div className={sh.userName}>{auth.staff?.name || "Alex Jones"}</div>
                  <div className={sh.userRole}>{auth.staff?.role || "Admin"}</div>
                </div>
                {!auth.isLocalDev && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={showUserMenu ? "#fff" : "#555"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={pg.sidebarChevron} style={{ transform: showUserMenu ? "rotate(180deg)" : "rotate(0)" }}>
                    <polyline points="18 15 12 9 6 15"/>
                  </svg>
                )}
              </>
            )}
          </div>
        </div>
        {/* Desktop collapse toggle */}
        <button className="jm-sidebar-collapse-btn" onClick={toggleSidebarCollapse} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: collapsed ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          {!collapsed && <span>Collapse</span>}
        </button>
      </nav>

      {/* Main content */}
      <div className={`jm-main ${sidebarCollapsed ? "jm-main-collapsed" : ""}`}>
        {/* Top bar */}
        <div className="jm-topbar">
          <div className={sh.topbarLeft}>
            <button className="jm-hamburger" onClick={() => setSidebarOpen(o => !o)} aria-label="Toggle menu">
              <HamburgerIcon open={sidebarOpen} />
            </button>
            <span className="jm-page-title">{pageTitles[page]}</span>
          </div>
          <div className="jm-topbar-actions">
            <button className={`btn btn-ghost btn-sm ${sh.topbarNotifBtn}`}><Icon name="notification" size={16} /></button>
            <div className={`topbar-actions-hide ${sh.topbarDivider}`} />
            <span className={`topbar-actions-hide jm-topbar-date ${sh.topbarDate}`}>{topbarTime}</span>
          </div>
        </div>

        {/* Page content */}
        <div className="jm-content" style={{ '--section-accent': (SECTION_COLORS[page] || SECTION_COLORS.dashboard).accent }}>
          {routeElements}
        </div>
      </div>

      {/* Bottom navigation (mobile only) */}
      <div className="jm-bottom-nav">
        <div className="jm-bottom-nav-inner">
          {bottomNavItems.map(n => {
            const accent = (SECTION_COLORS[n.id] || SECTION_COLORS.dashboard)?.accent;
            const isNotes = n.id === "notes";
            const isActive = isNotes ? showQuickNote : page === n.id;
            return (
            <button key={n.id} className={`jm-bottom-nav-item ${isActive ? "active" : ""}`}
              onClick={() => isNotes ? setShowQuickNote(true) : navigate(n.id)}
              style={isActive ? { color: accent || "#111", boxShadow: `inset 0 2px 0 ${accent || "#111"}` } : undefined}>
              {n.badge ? <span className="bnav-badge" style={n.badgeColor ? { background: n.badgeColor, color: "#fff" } : undefined}>{n.badge}</span> : null}
              <Icon name={n.icon} size={20} />
              <span>{n.label}</span>
            </button>
            );
          })}
        </div>
      </div>
      </>
      )}

      {/* Change Password Modal */}
      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
      {/* Quick Add Note Modal (from bottom nav) */}
      {showQuickNote && <QuickAddNoteModal onClose={() => setShowQuickNote(false)} />}
    </div>
  );
}
