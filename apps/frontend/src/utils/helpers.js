// ── Formatting & IDs ────────────────────────────────────────────────────────
export const fmt = (n) => `$${Number(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const calcQuoteTotal = (q) => {
  const sub = q.lineItems.reduce((s, l) => s + l.qty * l.rate, 0);
  return sub * (1 + q.tax / 100);
};
export const uid = () => Date.now() + Math.random();

// ── Activity Log Helpers ────────────────────────────────────────────────────
// Set dynamically from auth context inside App — defaults to seed data name
export let CURRENT_USER = "Alex Jones";
export const setCURRENT_USER = (name) => { CURRENT_USER = name; };
export const nowTs = () => {
  const d = new Date();
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) + " " +
    d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false });
};
export const mkLog = (action, user = CURRENT_USER) => ({ ts: nowTs(), user, action });
export const addLog = (prev, action, user = CURRENT_USER) => [...(prev || []), mkLog(action, user)];

// ── Date / Order Helpers ────────────────────────────────────────────────────
export const genId = () => Math.random().toString(36).slice(2, 9).toUpperCase();
export const orderToday = () => new Date().toISOString().slice(0, 10);
export const orderAddDays = (dateStr, n) => { const d = new Date(dateStr); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
export const orderFmtDate = (d) => { if (!d) return "—"; const [y, m, day] = d.split("-"); return `${day}/${m}/${y}`; };
export const daysUntil = (dateStr) => { if (!dateStr) return null; return Math.ceil((new Date(dateStr) - new Date(orderToday())) / (1000 * 60 * 60 * 24)); };
export const fmtFileSize = (bytes) => { if (bytes < 1024) return bytes + " B"; if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"; return (bytes / (1024 * 1024)).toFixed(1) + " MB"; };
export const orderFmtTs = (ts) => {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) + " " +
    d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: true });
};
export const makeLogEntry = (action, detail = "", auto = false) => ({ id: genId(), ts: new Date().toISOString(), action, detail, auto });
export const orderAddLog = (order, action, detail = "", auto = false) => ({ ...order, auditLog: [...(order.auditLog || []), makeLogEntry(action, detail, auto)] });

// ── Order Status Config (used by applyTransition) ───────────────────────────
export const ORDER_STATUS_TRIGGERS = {
  Sent: "Triggered automatically when document is emailed",
  Viewed: "Triggered when recipient opens the document link",
  Billed: "Triggered when matched to a bill in Job Management",
};

export const applyTransition = (order, newStatus, extraDetail = "") => {
  const old = order.status;
  const detail = extraDetail || (ORDER_STATUS_TRIGGERS[newStatus] ? ORDER_STATUS_TRIGGERS[newStatus] : "");
  const auto = !!ORDER_STATUS_TRIGGERS[newStatus];
  return orderAddLog({ ...order, status: newStatus }, `Status changed: ${old} → ${newStatus}`, detail, auto);
};
export const orderJobDisplay = (job) => {
  if (!job) return null;
  const ref = job.jobNumber || ("J-" + String(job.id).padStart(4, "0"));
  return { ref, name: job.title, client: job.clientName || "" };
};

// ── Compliance Config & Helpers ─────────────────────────────────────────────
export const COMPLIANCE_DOC_TYPES = [
  { id: "workers_comp", label: "Workers Compensation", icon: "shield", reminderDays: [30, 14, 7], fields: ["policyNumber", "insurer", "expiryDate"] },
  { id: "public_liability", label: "Public Liability", icon: "shield", reminderDays: [30, 14, 7], fields: ["policyNumber", "insurer", "coverAmount", "expiryDate"] },
  { id: "white_card", label: "White Card", icon: "badge", reminderDays: [30, 14], fields: ["cardNumber", "holderName", "issueDate"] },
  { id: "trade_license", label: "Trade License", icon: "badge", reminderDays: [30, 14, 7], fields: ["licenseNumber", "licenseClass", "issuingBody", "expiryDate"] },
  { id: "subcontractor_statement", label: "Subcontractor Statement", icon: "file", reminderDays: [14, 7], fields: ["periodFrom", "periodTo", "abn"] },
  { id: "swms", label: "SWMS", icon: "file", reminderDays: [14, 7], fields: ["title", "revision", "approvedBy", "approvalDate"] },
];

export const COMPLIANCE_STATUS_COLORS = {
  current: { bg: "#ecfdf5", text: "#059669", label: "Current" },
  expiring_soon: { bg: "#fffbeb", text: "#d97706", label: "Expiring Soon" },
  expired: { bg: "#fef2f2", text: "#dc2626", label: "Expired" },
  missing: { bg: "#f0f0f0", text: "#888", label: "Missing" },
  no_expiry: { bg: "#ecfdf5", text: "#059669", label: "Current" },
};

export const getComplianceStatus = (doc) => {
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

export const getDaysUntilExpiry = (expiryDate) => {
  if (!expiryDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate + "T00:00:00");
  return Math.ceil((expiry - today) / 86400000);
};

export const getContractorComplianceCount = (contractor) => {
  const docs = contractor.documents || [];
  let issues = 0;
  COMPLIANCE_DOC_TYPES.forEach(dt => {
    const doc = docs.find(d => d.type === dt.id);
    const status = getComplianceStatus(doc);
    if (status === "expired" || status === "missing") issues++;
  });
  return issues;
};

// ── Time Helpers ────────────────────────────────────────────────────────────
export function addMinsToTime(timeStr, mins) {
  const [h, m] = (timeStr || "09:00").split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2,"0")}:${String(total % 60).padStart(2,"0")}`;
}

export function calcHoursFromTimes(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60;
  return Math.round(diff / 60 * 10) / 10;
}

// ── Hex to RGBA ─────────────────────────────────────────────────────────────
export const hexToRgba = (hex, a) => {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
};
