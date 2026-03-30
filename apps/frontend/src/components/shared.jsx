import { Icon } from './Icon';
import { STATUS_BG, STATUS_TEXT, ORDER_STATUS_COLORS, ORDER_STATUS_PROGRESS, ORDER_BAR_COLORS } from '../fixtures/seedData.jsx';
import { daysUntil, orderFmtDate, fmt } from '../utils/helpers';
import { subtotal, lineItemTotal } from '../utils/calcEngine';
import s from './shared.module.css';

// ── Status Badge ─────────────────────────────────────────────────────────────
export const StatusBadge = ({ status }) => {
  const labels = { draft: "Draft", scheduled: "Scheduled", quoted: "Quoted", in_progress: "In Progress", completed: "Completed", cancelled: "Cancelled", sent: "Sent", accepted: "Accepted", declined: "Declined", pending: "Pending", approved: "Approved", paid: "Paid", overdue: "Overdue", void: "Void" };
  return (
    <span className="badge" style={{ background: STATUS_BG[status] || "#f0f0f0", color: STATUS_TEXT[status] || "#666" }}>
      {labels[status] || status}
    </span>
  );
};

// ── Xero Sync Badge ─────────────────────────────────────────────────────────
export const XeroSyncBadge = ({ syncStatus, xeroId }) => {
  if (!syncStatus && !xeroId) return null;
  const colors = {
    synced: { bg: "#ecfdf5", text: "#16a34a", label: "Synced" },
    pending: { bg: "#fffbeb", text: "#d97706", label: "Pending" },
    error: { bg: "#fef2f2", text: "#dc2626", label: "Error" },
  };
  const c = colors[syncStatus] || (xeroId ? colors.synced : { bg: "#f5f5f5", text: "#888", label: "Not synced" });
  return (
    <span className={s.xeroSyncBadge} style={{ background: c.bg, color: c.text }}>
      <span className={s.xeroSyncDot} style={{ background: c.text }} />
      Xero
    </span>
  );
};

// ── Avatar Group ─────────────────────────────────────────────────────────────
export const AvatarGroup = ({ names = [], max = 3 }) => {
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
export const CloseBtn = ({ onClick }) => (
  <button onClick={onClick} className={`btn btn-ghost ${s.closeBtn}`}><Icon name="close" size={16} /></button>
);

// ── Order Icon ───────────────────────────────────────────────────────────────
export const OrderIcon = ({ name, size = 16, cls = "" }) => {
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
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls} style={{ flexShrink: 0 }}>
      {icons[name]}
    </svg>
  );
};

// ── Order Status Badge ───────────────────────────────────────────────────────
export const OrderStatusBadge = ({ status }) => {
  const c = ORDER_STATUS_COLORS[status] || { bg: "#f0f0f0", text: "#666" };
  return <span className="order-badge" style={{ background: c.bg, color: c.text }}>{status}</span>;
};

// ── Due Date Chip ────────────────────────────────────────────────────────────
export const DueDateChip = ({ dateStr, isTerminal }) => {
  if (!dateStr) return null;
  const days = daysUntil(dateStr);
  if (isTerminal) return <span className={s.dueDateTerminal}><OrderIcon name="calendar" size={11} /> {orderFmtDate(dateStr)}</span>;
  if (days < 0) return <span className={s.dueDateOverdue}><OrderIcon name="warning" size={11} /> {Math.abs(days)}d overdue</span>;
  if (days === 0) return <span className={s.dueDateToday}><OrderIcon name="clock" size={11} /> Due today</span>;
  if (days <= 3) return <span className={s.dueDateSoon}><OrderIcon name="clock" size={11} /> {days}d left</span>;
  return <span className={s.dueDateNormal}><OrderIcon name="calendar" size={11} /> {orderFmtDate(dateStr)}</span>;
};

// ── Order Progress Bar ───────────────────────────────────────────────────────
export const OrderProgressBar = ({ status }) => {
  const pct = ORDER_STATUS_PROGRESS[status] ?? 0;
  const color = ORDER_BAR_COLORS[status] || "#cbd5e1";
  if (status === "Cancelled") return <div className="order-progress-track" />;
  return <div className="order-progress-track"><div className="order-progress-fill" style={{ width: pct + "%", background: color }} /></div>;
};

// ── Section Progress Bar ─────────────────────────────────────────────────────
export const SectionProgressBar = ({ status, section }) => {
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

// ── File Icon Badge ──────────────────────────────────────────────────────────
export const FileIconBadge = ({ name }) => {
  const ext = (name || "").split(".").pop().toLowerCase();
  let icon = "FILE", color = "#64748b", bg = "#f1f5f9";
  if (ext === "pdf") { icon = "PDF"; color = "#ef4444"; bg = "#fef2f2"; }
  else if (["jpg","jpeg","png","gif","webp","heic"].includes(ext)) { icon = "IMG"; color = "#8b5cf6"; bg = "#f5f3ff"; }
  else if (["doc","docx"].includes(ext)) { icon = "DOC"; color = "#2563eb"; bg = "#eff6ff"; }
  else if (["xls","xlsx","csv"].includes(ext)) { icon = "XLS"; color = "#059669"; bg = "#ecfdf5"; }
  return <span className={s.fileIconBadge} style={{ color, background: bg }}>{icon}</span>;
};

// ── Bill Status Badge ────────────────────────────────────────────────────────
export const BILL_STATUS_LABELS = { inbox: "Inbox", linked: "Linked", approved: "Approved", posted: "Posted to Job" };
export const BILL_STATUSES = ["inbox", "linked", "approved", "posted"];
const BILL_STATUS_COLORS = {
  inbox:    { bg: "#f5f5f5", text: "#777" },
  linked:   { bg: "#e8f0fe", text: "#2c5fa8" },
  approved: { bg: "#e6f4ea", text: "#1e7e34" },
  posted:   { bg: "#111",    text: "#fff" },
};
export const BILL_CATEGORIES = ["Materials", "Subcontractor", "Plant & Equipment", "Labour", "Other"];

export const BillStatusBadge = ({ status }) => {
  const c = BILL_STATUS_COLORS[status] || { bg: "#f0f0f0", text: "#666" };
  return (
    <span className="badge" style={{ background: c.bg, color: c.text }}>
      {BILL_STATUS_LABELS[status] || status}
    </span>
  );
};

// ── Section Label ────────────────────────────────────────────────────────────
export const SectionLabel = ({ children }) => (
  <div className={s.sectionLabel}>{children}</div>
);

// ── Section Drawer ───────────────────────────────────────────────────────────
export const SectionDrawer = ({ accent, icon, typeLabel, title, statusBadge, mode, setMode, showToggle = true, isNew, statusStrip, children, footer, onClose, headerRight, zIndex = 1050 }) => (
  <div className="section-drawer-overlay" style={{ zIndex }}>
    <div className="section-drawer-backdrop" onClick={onClose} />
    <div className="section-drawer">
      {/* Header */}
      <div className={s.drawerHeader} style={{ background: accent }}>
        <div className={s.drawerHeaderLeft}>
          {icon && <div className={s.drawerHeaderIcon}>{icon}</div>}
          <div className={s.drawerHeaderTitleWrap}>
            {typeLabel && <div className={s.drawerTypeLabel}>{typeLabel}</div>}
            <div className={s.drawerTitle}>{title}</div>
          </div>
          {statusBadge}
        </div>
        <div className={s.drawerHeaderRight}>{headerRight}</div>
      </div>
      {/* Status strip */}
      {statusStrip}
      {/* Body */}
      <div className={s.drawerBody}>{children}</div>
      {/* Footer */}
      {footer && <div className={s.drawerFooter}>{footer}</div>}
    </div>
  </div>
);

// ── Line Items Editor ────────────────────────────────────────────────────────
export const LineItemsEditor = ({ items, onChange }) => {
  const update = (i, field, val) => {
    const next = items.map((it, idx) => idx === i ? { ...it, [field]: field === "qty" || field === "rate" ? parseFloat(val) || 0 : val } : it);
    onChange(next);
  };
  const add = () => onChange([...items, { desc: "", qty: 1, unit: "hrs", rate: 0 }]);
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));
  const sub = subtotal(items);
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
                <select className={s.lineItemSelect} value={it.unit} onChange={e => update(i, "unit", e.target.value)}>
                  {["hrs","ea","m²","lm","lot","day","m³","kg"].map(u => <option key={u}>{u}</option>)}
                </select>
              </td>
              <td><input type="number" value={it.rate} onChange={e => update(i, "rate", e.target.value)} min="0" /></td>
              <td className={s.lineItemTotal}>{fmt(lineItemTotal(it.qty, it.rate))}</td>
              <td><button onClick={() => remove(i)} className={`btn btn-ghost btn-xs ${s.lineItemDeleteBtn}`}><Icon name="trash" size={12} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={add} className="btn btn-secondary btn-sm"><Icon name="plus" size={12} />Add Line</button>
      <div className={s.totalsWrap}>
        <div className="totals-box">
          <div className="totals-row"><span>Subtotal</span><span>{fmt(sub)}</span></div>
          <div className="totals-row"><span>GST (10%)</span><span>{fmt(sub * 0.1)}</span></div>
          <div className="totals-row total"><span>Total</span><span>{fmt(sub * 1.1)}</span></div>
        </div>
      </div>
    </div>
  );
};

// ── Activity Log ─────────────────────────────────────────────────────────────
export const ActivityLog = ({ entries = [] }) => {
  if (!entries.length) return <div className={s.activityEmpty}>No activity recorded yet.</div>;
  return (
    <div className="timeline">
      {[...entries].reverse().map((e, i) => (
        <div key={i} className="timeline-item">
          <div className="timeline-dot" />
          <div className={s.activityText}>
            <span className={s.activityAction}>{e.action}</span>
            <div className={s.activityMeta}>
              <span className={s.activityUser}>{e.user}</span> · {e.ts}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
