import { useState } from "react";
import { useAppStore } from "../lib/store";
import { useAuth } from "../lib/AuthContext";
import {
  createQuote, updateQuote, deleteQuote,
  createInvoice, updateInvoice, deleteInvoice,
  createTimeEntry, deleteTimeEntry,
  createBill, updateBill, deleteBill,
  updateJob,
  createScheduleEntry, updateScheduleEntry, deleteScheduleEntry,
  uploadFile, createAttachment, deleteAttachment,
  createPhase, updatePhase, deletePhase,
  createTask, updateTask, deleteTask,
  createNote, updateNote, deleteNote,
  createWorkOrder, updateWorkOrder, deleteWorkOrder,
  createPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder,
  createAuditEntry,
} from "../lib/db";
import { supabase, xeroSyncInvoice, xeroSyncBill, sendEmail } from "../lib/supabase";
import { buildQuotePdfHtml, buildInvoicePdfHtml, htmlToPdfBase64 } from "../lib/pdf";
import { Icon } from "../components/Icon";
import {
  StatusBadge, XeroSyncBadge, AvatarGroup,
  OrderIcon, OrderStatusBadge, DueDateChip, OrderProgressBar,
  SectionProgressBar, BillStatusBadge, BILL_CATEGORIES,
  SectionLabel, SectionDrawer, LineItemsEditor, ActivityLog,
} from "../components/shared";
import { BillModal } from "../components/BillModal";
import { OrderCard } from "../components/OrderCard";
import {
  TEAM, SECTION_COLORS, ViewField,
  ORDER_CONTRACTORS, ORDER_SUPPLIERS, ORDER_UNITS,
  ORDER_STATUSES, ORDER_TRANSITIONS, ORDER_TERMINAL,
} from "../fixtures/seedData.jsx";
import {
  fmt, calcQuoteTotal, uid, addLog,
  genId, makeLogEntry, orderAddDays, orderToday, orderFmtDate,
  orderFmtTs, orderAddLog, applyTransition, orderJobDisplay,
  daysUntil, calcHoursFromTimes, addMinsToTime, hexToRgba,
  COMPLIANCE_DOC_TYPES, COMPLIANCE_STATUS_COLORS,
  getComplianceStatus, getDaysUntilExpiry, getContractorComplianceCount,
  ORDER_STATUS_TRIGGERS,
} from "../utils/helpers";

import JobPnL from './JobDetail/JobPnL';
import JobGantt from './JobDetail/JobGantt';
import JobTasks from './JobDetail/JobTasks';
import JobNotes from './JobDetail/JobNotes';

// ── Job Detail Drawer ─────────────────────────────────────────────────────────
const JobDetail = ({ job, onClose, onEdit }) => {
  const { clients, quotes, setQuotes, invoices, setInvoices, timeEntries, setTimeEntries, bills, setBills, schedule, setSchedule, jobs, setJobs, staff, workOrders, setWorkOrders, purchaseOrders, setPurchaseOrders } = useAppStore();
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
    <div style={{ flexShrink: 0 }}>
      <div style={{ padding: "10px 20px", background: jobLight, display: "flex", alignItems: "center", gap: 6, overflowX: "auto", overflowY: "hidden" }}>
        {["draft","scheduled","in_progress","completed","cancelled"].filter(s => s !== job.status).map(s => (
          <button key={s} className="btn btn-xs" style={{ background: "#fff", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, whiteSpace: "nowrap", flexShrink: 0 }} onClick={() => {
            const updated = { ...job, status: s, activityLog: addLog(job.activityLog, `Status → ${s.replace("_"," ")}`) };
            setJobs(js => js.map(j => j.id === job.id ? updated : j));
          }}>{s.replace("_"," ").replace(/\b\w/g, c => c.toUpperCase())}</button>
        ))}
      </div>
      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 0, padding: "0 20px", overflowX: "auto", flexShrink: 0 }}>
        {tabs.map(t => <div key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)} style={{ whiteSpace: "nowrap", borderBottomColor: tab === t.id ? jobAccent : "transparent" }}>{t.label}</div>)}
      </div>
    </div>
  ) : null;

  const jobFooter = detailMode === "view" ? <>
    <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
    <button className="btn btn-sm" style={{ background: jobAccent, color: "#fff", border: "none" }} onClick={() => { setDetailForm({ title: job.title, clientId: job.clientId, siteId: job.siteId || null, status: job.status, priority: job.priority, description: job.description || "", startDate: job.startDate || "", dueDate: job.dueDate || "", assignedTo: job.assignedTo || [], tags: (job.tags || []).join(", "), estimate: job.estimate || { labour: 0, materials: 0, subcontractors: 0, other: 0 } }); setDetailMode("edit"); }}>
      <Icon name="edit" size={13} /> Edit
    </button>
  </> : <>
    <button className="btn btn-ghost btn-sm" onClick={() => setDetailMode("view")}>Cancel</button>
    <button className="btn btn-sm" style={{ background: jobAccent, color: "#fff", border: "none" }} onClick={saveDetailForm} disabled={!detailForm.title}>
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
        <div style={{ padding: "20px 24px" }}>
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
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: 8 }}>Estimate</div>
            <div style={{ background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", padding: 14 }}>
              <div className="grid-2" style={{ marginBottom: 8 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: 11 }}>Labour ($)</label>
                  <input type="number" className="form-control" min="0" step="100" value={detailForm.estimate?.labour || ""} onChange={e => setDetailForm(f => ({ ...f, estimate: { ...f.estimate, labour: Number(e.target.value) || 0 } }))} placeholder="0" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: 11 }}>Materials ($)</label>
                  <input type="number" className="form-control" min="0" step="100" value={detailForm.estimate?.materials || ""} onChange={e => setDetailForm(f => ({ ...f, estimate: { ...f.estimate, materials: Number(e.target.value) || 0 } }))} placeholder="0" />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: 11 }}>Subcontractors ($)</label>
                  <input type="number" className="form-control" min="0" step="100" value={detailForm.estimate?.subcontractors || ""} onChange={e => setDetailForm(f => ({ ...f, estimate: { ...f.estimate, subcontractors: Number(e.target.value) || 0 } }))} placeholder="0" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: 11 }}>Other ($)</label>
                  <input type="number" className="form-control" min="0" step="100" value={detailForm.estimate?.other || ""} onChange={e => setDetailForm(f => ({ ...f, estimate: { ...f.estimate, other: Number(e.target.value) || 0 } }))} placeholder="0" />
                </div>
              </div>
              {(() => {
                const t = (detailForm.estimate?.labour || 0) + (detailForm.estimate?.materials || 0) + (detailForm.estimate?.subcontractors || 0) + (detailForm.estimate?.other || 0);
                return <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #e2e8f0", fontSize: 13, fontWeight: 800 }}>Total: {fmt(t)}</div>;
              })()}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-control" value={detailForm.description} onChange={e => setDetailForm(f => ({ ...f, description: e.target.value }))} placeholder="Job details, scope of work..." />
          </div>
        </div>
        ) : (
        <div style={{ padding: "20px 24px" }}>

          {/* ── Overview ── */}
          {tab === "overview" && (
            <div>
              {job.description && <p style={{ fontSize: 13, color: "#555", lineHeight: 1.6, marginBottom: 20 }}>{job.description}</p>}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px,1fr))", gap: 12, marginBottom: 20 }}>
                {[
                  { label: "Estimate", val: (() => { const e = job.estimate || {}; const t = (e.labour||0)+(e.materials||0)+(e.subcontractors||0)+(e.other||0); return t > 0 ? fmt(t) : "—"; })(), sub: (() => { const e = job.estimate || {}; const t = (e.labour||0)+(e.materials||0)+(e.subcontractors||0)+(e.other||0); return t > 0 ? "Budget set" : "Not set"; })() },
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
                <button className="btn btn-primary btn-sm" style={{ background: SECTION_COLORS.quotes.accent }} onClick={async () => {
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
                            <button className="btn btn-primary btn-xs" style={{ background: SECTION_COLORS.invoices.accent }} onClick={() => { quoteToInvoice(q); setTab("invoices"); }}>
                              <Icon name="invoices" size={11} />→ Invoice
                            </button>
                          )}
                          {alreadyInvoiced && <span style={{ fontSize: 11, color: "#aaa" }}>Invoiced ✓</span>}
                          <button className="btn btn-ghost btn-xs" onClick={() => { setEditingQuote(q); setInlineQuoteMode("view"); }}><Icon name="edit" size={11} /></button>
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
                <button className="btn btn-primary btn-sm" style={{ background: SECTION_COLORS.invoices.accent }} onClick={async () => {
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
                          <XeroSyncBadge syncStatus={inv.xeroSyncStatus} xeroId={inv.xeroInvoiceId} />
                          {inv.status !== "paid" && inv.status !== "void" && (
                            <button className="btn btn-primary btn-xs" style={{ background: SECTION_COLORS.invoices.accent }} onClick={() => markInvPaid(inv.id)}>Mark Paid</button>
                          )}
                          {!inv.xeroInvoiceId && inv.status !== "draft" && (
                            <button className="btn btn-ghost btn-xs" style={{ color: "#0369a1" }} onClick={() => xeroSyncInvoice("push", inv.id)} title="Send to Xero"><Icon name="send" size={11} /> Xero</button>
                          )}
                          <button className="btn btn-ghost btn-xs" onClick={() => { setEditingInvoice(inv); setInlineInvMode("view"); }}><Icon name="edit" size={11} /></button>
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
                <button className="btn btn-primary btn-sm" style={{ background: SECTION_COLORS.time.accent }} onClick={() => setShowTimeForm(v => !v)}><Icon name="plus" size={12} />Log Time</button>
              </div>
              {showTimeForm && (
                <div style={{ background: "#f8f8f8", borderRadius: 10, padding: 16, marginBottom: 16, border: "1px solid #e8e8e8" }}>
                  <div className="grid-3" style={{ marginBottom: 10 }}>
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
                  <div className="grid-2" style={{ marginBottom: 10 }}>
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
                      <button className="btn btn-primary btn-sm" style={{ background: SECTION_COLORS.time.accent }} onClick={saveTime} disabled={quickHours <= 0}><Icon name="check" size={12} />Save</button>
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
                <button className="btn btn-primary btn-sm" style={{ background: SECTION_COLORS.bills.accent }} onClick={() => setEditingBill({})}><Icon name="plus" size={12} />Capture Bill</button>
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
                            <td><BillStatusBadge status={b.status} /> <XeroSyncBadge syncStatus={b.xeroSyncStatus} xeroId={b.xeroBillId} /></td>
                            <td>
                              <div style={{ display: "flex", gap: 4 }}>
                                {!b.xeroBillId && (b.status === "approved" || b.status === "posted") && (
                                  <button className="btn btn-ghost btn-xs" style={{ color: "#0369a1" }} title="Send to Xero" onClick={() => xeroSyncBill("push", b.id)}><Icon name="send" size={11} /></button>
                                )}
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
          {tab === "orders" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: "#888" }}>
                  {jobWOs.length + jobPOs.length > 0
                    ? <span><strong style={{ color: "#111" }}>{jobWOs.length}</strong> WO{jobWOs.length !== 1 ? "s" : ""} · <strong style={{ color: "#111" }}>{jobPOs.length}</strong> PO{jobPOs.length !== 1 ? "s" : ""}</span>
                    : "No orders yet"}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-primary btn-sm" style={{ background: "#2563eb" }} onClick={() => {
                    const newWo = { id: genId(), ref: "WO-" + String((workOrders || []).length + 1).padStart(3,"0"), status: "Draft", jobId: job.id, issueDate: orderToday(), dueDate: orderAddDays(14), poLimit: "", contractorId: "", contractorName: "", contractorContact: "", contractorEmail: "", contractorPhone: "", trade: "", scopeOfWork: "", notes: "", internalNotes: "", attachments: [], auditLog: [makeLogEntry("Created","Work order created")] };
                    setWorkOrders(prev => [...prev, newWo]);
                  }}><Icon name="plus" size={12} />New WO</button>
                  <button className="btn btn-primary btn-sm" style={{ background: "#16a34a" }} onClick={() => {
                    const newPo = { id: genId(), ref: "PO-" + String((purchaseOrders || []).length + 1).padStart(3,"0"), status: "Draft", jobId: job.id, issueDate: orderToday(), dueDate: orderAddDays(14), poLimit: "", supplierId: "", supplierName: "", supplierContact: "", supplierEmail: "", supplierAbn: "", deliveryAddress: "", lines: [{ id: genId(), desc: "", qty: 1, unit: "ea" }], notes: "", internalNotes: "", attachments: [], auditLog: [makeLogEntry("Created","Purchase order created")] };
                    setPurchaseOrders(prev => [...prev, newPo]);
                  }}><Icon name="plus" size={12} />New PO</button>
                </div>
              </div>
              {jobWOs.length + jobPOs.length === 0
                ? <div style={{ textAlign: "center", padding: "40px 0", color: "#999", fontSize: 13 }}>No work orders or purchase orders linked to this job yet.</div>
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

          {tab === "pnl" && <JobPnL job={job} client={client} />}

          {/* ── Gantt Tab ── */}
          {tab === "gantt" && <JobGantt job={job} />}

          {/* ── Tasks Tab ── */}
          {tab === "tasks" && <JobTasks job={job} />}

          {tab === "notes" && <JobNotes job={job} />}


          {tab === "activity" && (
            <div>
              <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 13, color: "#888" }}>{(job.activityLog||[]).length} event{(job.activityLog||[]).length !== 1 ? "s" : ""} recorded</div>
              </div>
              <ActivityLog entries={job.activityLog || []} />
            </div>
          )}

        </div>
        )}
    </SectionDrawer>

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
          <div style={{ padding: "8px 20px", background: SECTION_COLORS.quotes.light, display: "flex", alignItems: "center", gap: 6, overflowX: "auto", overflowY: "hidden" }}>
            {["draft","sent","accepted","declined"].filter(s => s !== editingQuote.status).map(s => (
              <button key={s} className="btn btn-xs" style={{ background: "#fff", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8 }}
                onClick={() => setEditingQuote(q => ({ ...q, status: s }))}>{s.charAt(0).toUpperCase()+s.slice(1)}</button>
            ))}
          </div>
        : null}
        footer={inlineQuoteMode === "view" ? <>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditingQuote(null)}>Close</button>
          <button className="btn btn-sm" style={{ background: qAccent, color: "#fff", border: "none" }} onClick={() => setInlineQuoteMode("edit")}>
            <Icon name="edit" size={13} /> Edit
          </button>
        </> : <>
          <button className="btn btn-ghost btn-sm" onClick={() => setInlineQuoteMode("view")}>Cancel</button>
          <button className="btn btn-sm" style={{ background: qAccent, color: "#fff", border: "none" }} onClick={() => saveQuote(editingQuote)}>
            <Icon name="check" size={13} /> Save Quote
          </button>
        </>}
        onClose={() => setEditingQuote(null)}
        zIndex={1060}
      >
        {inlineQuoteMode === "view" ? (
        <div style={{ padding: "20px 24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <ViewField label="Status" value={editingQuote.status?.charAt(0).toUpperCase() + editingQuote.status?.slice(1)} />
            <ViewField label="GST" value={`${editingQuote.tax}%`} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888', marginBottom: 8 }}>Line Items</div>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead><tr style={{ borderBottom: '2px solid #eee' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: '#888', fontWeight: 600, fontSize: 11 }}>Description</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: '#888', fontWeight: 600, fontSize: 11 }}>Qty</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: '#888', fontWeight: 600, fontSize: 11 }}>Unit</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: '#888', fontWeight: 600, fontSize: 11 }}>Rate</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: '#888', fontWeight: 600, fontSize: 11 }}>Amount</th>
              </tr></thead>
              <tbody>
                {(editingQuote.lineItems||[]).map((li, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '8px 8px', fontWeight: 500 }}>{li.desc || '—'}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right' }}>{li.qty}</td>
                    <td style={{ padding: '8px 8px' }}>{li.unit}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right' }}>{fmt(li.rate)}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 600 }}>{fmt(li.qty * li.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ background: '#f9fafb', borderRadius: 8, padding: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}><span style={{ color: '#888' }}>Subtotal</span><span style={{ fontWeight: 600 }}>{fmt(qSub)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}><span style={{ color: '#888' }}>GST ({editingQuote.tax}%)</span><span style={{ fontWeight: 600 }}>{fmt(qGst)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '2px solid #e5e7eb', fontSize: 15 }}><span style={{ fontWeight: 700 }}>Total</span><span style={{ fontWeight: 800, color: qAccent }}>{fmt(qTotal)}</span></div>
          </div>
          {editingQuote.notes && <ViewField label="Notes / Terms" value={editingQuote.notes} />}
        </div>
        ) : (
        <div style={{ padding: "20px 24px" }}>
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
          <div style={{ marginTop: 12, padding: "12px 16px", background: "#f8f8f8", borderRadius: 8, display: "flex", justifyContent: "flex-end", gap: 16 }}>
            <span style={{ fontSize: 12, color: "#888" }}>Subtotal <strong>{fmt(qSub)}</strong></span>
            <span style={{ fontSize: 12, color: "#888" }}>GST <strong>{fmt(qGst)}</strong></span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Total {fmt(qTotal)}</span>
          </div>
          <div className="form-group" style={{ marginTop: 16 }}>
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
          <div style={{ padding: "8px 20px", background: SECTION_COLORS.invoices.light, display: "flex", alignItems: "center", gap: 6, overflowX: "auto", overflowY: "hidden" }}>
            {["draft","sent","paid","overdue","void"].filter(s => s !== editingInvoice.status).map(s => (
              <button key={s} className="btn btn-xs" style={{ background: "#fff", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8 }}
                onClick={() => setEditingInvoice(i => ({ ...i, status: s }))}>{s.charAt(0).toUpperCase()+s.slice(1)}</button>
            ))}
          </div>
        : null}
        footer={inlineInvMode === "view" ? <>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditingInvoice(null)}>Close</button>
          <button className="btn btn-sm" style={{ background: iAccent, color: "#fff", border: "none" }} onClick={() => setInlineInvMode("edit")}>
            <Icon name="edit" size={13} /> Edit
          </button>
        </> : <>
          <button className="btn btn-ghost btn-sm" onClick={() => setInlineInvMode("view")}>Cancel</button>
          <button className="btn btn-sm" style={{ background: iAccent, color: "#fff", border: "none" }} onClick={() => saveInvoice(editingInvoice)}>
            <Icon name="check" size={13} /> Save Invoice
          </button>
        </>}
        onClose={() => setEditingInvoice(null)}
        zIndex={1060}
      >
        {inlineInvMode === "view" ? (
        <div style={{ padding: "20px 24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
            <ViewField label="Status" value={editingInvoice.status?.charAt(0).toUpperCase() + editingInvoice.status?.slice(1)} />
            <ViewField label="Due Date" value={editingInvoice.dueDate || "—"} />
            <ViewField label="GST" value={`${editingInvoice.tax}%`} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888', marginBottom: 8 }}>Line Items</div>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead><tr style={{ borderBottom: '2px solid #eee' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: '#888', fontWeight: 600, fontSize: 11 }}>Description</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: '#888', fontWeight: 600, fontSize: 11 }}>Qty</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: '#888', fontWeight: 600, fontSize: 11 }}>Unit</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: '#888', fontWeight: 600, fontSize: 11 }}>Rate</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: '#888', fontWeight: 600, fontSize: 11 }}>Amount</th>
              </tr></thead>
              <tbody>
                {(editingInvoice.lineItems||[]).map((li, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '8px 8px', fontWeight: 500 }}>{li.desc || '—'}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right' }}>{li.qty}</td>
                    <td style={{ padding: '8px 8px' }}>{li.unit}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right' }}>{fmt(li.rate)}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 600 }}>{fmt(li.qty * li.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ background: '#f9fafb', borderRadius: 8, padding: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}><span style={{ color: '#888' }}>Subtotal</span><span style={{ fontWeight: 600 }}>{fmt(iSub)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}><span style={{ color: '#888' }}>GST ({editingInvoice.tax}%)</span><span style={{ fontWeight: 600 }}>{fmt(iGst)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '2px solid #e5e7eb', fontSize: 15 }}><span style={{ fontWeight: 700 }}>Total</span><span style={{ fontWeight: 800, color: iAccent }}>{fmt(iTotal)}</span></div>
          </div>
          {editingInvoice.notes && <ViewField label="Notes" value={editingInvoice.notes} />}
        </div>
        ) : (
        <div style={{ padding: "20px 24px" }}>
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
          <div style={{ marginTop: 12, padding: "12px 16px", background: "#f8f8f8", borderRadius: 8, display: "flex", justifyContent: "flex-end", gap: 16 }}>
            <span style={{ fontSize: 12, color: "#888" }}>Subtotal <strong>{fmt(iSub)}</strong></span>
            <span style={{ fontSize: 12, color: "#888" }}>GST <strong>{fmt(iGst)}</strong></span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Total {fmt(iTotal)}</span>
          </div>
          <div className="form-group" style={{ marginTop: 16 }}>
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

export default JobDetail;
